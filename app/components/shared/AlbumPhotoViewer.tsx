"use client";

// Shared album photo viewer modal — extracted from
// `app/album/page.tsx` so cosmic's album page AND dawnlight2's
// CabinLogs can mount the same component (single source of truth).
// Mechanical extraction: function bodies / props / state / DOM are
// unchanged from the original inline definitions, only `export`
// added to publicly used members. Companions (AlbumCommentsSection,
// AlbumCommentItem) stay private — implementation details of
// AlbumPhotoViewer.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import {
  deleteActivitiesByLink,
  deleteActivitiesByTargetPath,
  logActivity,
} from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { uploadCommentImage } from "@/src/lib/commentImage";
import {
  CommentImageAttach,
  CommentImageView,
} from "@/app/components/CommentImage";
import NicknameLink from "@/app/components/NicknameLink";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";
import { josa, truncate } from "@/src/lib/text";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { MentionText } from "@/app/components/mention/MentionText";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import { MemberPickerModal } from "@/app/components/shared/MemberPickerModal";

// `uploadBytes` and `getDownloadURL` are not used by the modal stack
// itself — they're used by the album upload flow which lives in the
// page. Re-exported for parity in case future callers need them.
void uploadBytes;
void getDownloadURL;

export type MediaKind = "image" | "video" | "gif";

export type AlbumPhoto = {
  id: string;
  imageUrl: string;
  caption: string;
  photographer: string;
  people: string[];
  photoDate: string;
  fileType?: MediaKind;
  createdAt: Timestamp | null;
};

export type AlbumComment = {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

export function resolveFileType(p: { fileType?: MediaKind; imageUrl?: string }): MediaKind {
  if (p.fileType === "video" || p.fileType === "gif" || p.fileType === "image") {
    return p.fileType;
  }
  const url = (p.imageUrl || "").toLowerCase();
  if (url.includes(".mp4")) return "video";
  if (url.includes(".gif")) return "gif";
  return "image";
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatPhotoDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

export function photoSortKey(p: AlbumPhoto): string {
  if (p.photoDate) return p.photoDate;
  if (p.createdAt) {
    const d = p.createdAt.toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

export function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

export function AlbumPhotoViewer({
  photo,
  loginNick,
  onClose,
  targetCommentId,
}: {
  photo: AlbumPhoto;
  loginNick: string | null;
  onClose: () => void;
  targetCommentId?: string | null;
}) {
  // Step 4-G: 언쏘만 dl2 viewer surface. Adds the `dl2-album-viewer`
  // class to the outermost .minihome-modal so a single CSS block in
  // globals.css can re-skin every cosmic class inside (paper bg, navy
  // text, cream chips, navy pill buttons). Cosmic users keep
  // isDawnlight2=false → byte-identical markup + cosmic CSS.
  const dl2 = useDawnlight2();
  // Scroll container = .minihome-modal (position:fixed, overflow-y:auto).
  // The card .minihome-photo-viewer has no overflow of its own — entire
  // card scrolls together. Comments compute their absolute y relative
  // to this modalRef.
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Hide the card while we jump to the deep-link target so the user
  // doesn't see the modal flash at the top before the comment appears.
  // Mirrors the app-side `scrollPending` pattern in PhotoViewerModal:
  //   - init true if a target exists at mount
  //   - re-set true when targetCommentId changes (in-place re-deep-link)
  //   - flipped false by markScrollResolved after the scroll resolves
  //   - 1.5 s safety timeout in case the scroll never resolves
  const [scrollPending, setScrollPending] = useState<boolean>(
    !!targetCommentId,
  );
  useEffect(() => {
    if (targetCommentId) setScrollPending(true);
  }, [targetCommentId]);
  useEffect(() => {
    if (!scrollPending) return;
    const t = setTimeout(() => setScrollPending(false), 1500);
    return () => clearTimeout(t);
  }, [scrollPending]);

  const markScrollResolved = useCallback(() => {
    setScrollPending(false);
  }, []);

  // Card height + image-loaded tracker drive the deep-link scroll
  // effect's retry loop in AlbumCommentsSection: when a t+100 ms first
  // attempt falls into the fits branch (sH ≤ cH because the photo
  // hasn't decoded and firestore hasn't replied yet), we want to
  // re-run after the card actually grows. ResizeObserver fires on every
  // height change; img.onLoad provides a dedicated "content stream
  // settled" signal that lets the fits branch tell a true short-card
  // case from a still-loading one.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = Math.round(e.contentRect.height);
        setCardHeight((prev) => (prev === h ? prev : h));
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  const [editPhotographer, setEditPhotographer] = useState(photo.photographer);
  const [editPeople, setEditPeople] = useState<string[]>(photo.people ?? []);
  const [editPhotoDate, setEditPhotoDate] = useState<string>(
    photo.photoDate || todayISO(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 출연자 선택 모달 — 작성 UI(album/page.tsx)와 동일한 MemberPickerModal
  // 을 재사용. 옛날 텍스트 input + Enter 패턴은 닉네임 오타가 들어가서
  // 뱃지 매칭이 깨지는 문제 + 작성 UI 와 톤이 안 맞아 2026-05-08 통일.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Owner check — edit/delete only available to the original uploader.
  // Admins can still delete via the Firebase console; the in-app
  // password gate has been retired (2026-04-29).
  const isOwner = !!loginNick && photo.photographer === loginNick;

  const startEdit = () => {
    setEditCaption(photo.caption);
    setEditPhotographer(photo.photographer);
    setEditPeople(photo.people ?? []);
    setEditPhotoDate(photo.photoDate || todayISO());
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
  };

  const removeEditPerson = (v: string) => {
    setEditPeople((p) => p.filter((n) => n !== v));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "album", photo.id), {
        caption: editCaption.trim(),
        photographer: editPhotographer.trim(),
        people: editPeople,
        photoDate: editPhotoDate || todayISO(),
      });
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      try {
        await deleteObject(ref(storage, photo.imageUrl));
      } catch (e) {
        console.warn("storage delete failed", e);
      }
      await deleteDoc(doc(db, "album", photo.id));
      await deleteActivitiesByLink(`/album?photo=${photo.id}`);
      onClose();
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
      setDeleting(false);
    }
  };

  // Portal-mount to document.body so the modal escapes the
  // <main z-10> / .album-content z-10 stacking-context trap — without
  // this, .minihome-modal's z-index:100 is interpreted inside main's
  // z-10 context and TopHeader/BottomNav (z-40) bleed through.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={modalRef}
      className={dl2 ? "minihome-modal dl2-album-viewer" : "minihome-modal"}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="minihome-photo-viewer"
        onClick={(e) => e.stopPropagation()}
        style={scrollPending ? { opacity: 0 } : undefined}
      >
        <button
          type="button"
          className="minihome-photo-close"
          onClick={onClose}
          aria-label="닫기"
          disabled={saving || deleting}
        >
          ×
        </button>
        {resolveFileType(photo) === "video" ? (
          <video
            src={photo.imageUrl}
            controls
            autoPlay
            playsInline
            onLoadedData={() => setImgLoaded(true)}
          />
        ) : (
          <img
            src={photo.imageUrl}
            alt={photo.caption || "photo"}
            onLoad={() => setImgLoaded(true)}
          />
        )}
        {/* Meta block — wrapped in `.dl2-album-meta-card` when dl2 so
            CSS can paint a paper surface around it. Cosmic keeps the
            naked layout (text on the modal backdrop). The wrapper is
            a simple <div> with no other change to inner markup. */}
        {dl2 ? (
          <div className="dl2-album-meta-card">
            <AlbumViewerMetaInner
              photo={photo}
              editMode={editMode}
              editPhotoDate={editPhotoDate}
              setEditPhotoDate={setEditPhotoDate}
              editCaption={editCaption}
              setEditCaption={setEditCaption}
              editPhotographer={editPhotographer}
              setEditPhotographer={setEditPhotographer}
              editPeople={editPeople}
              onPickerOpen={() => setPickerOpen(true)}
              removeEditPerson={removeEditPerson}
              handleSave={handleSave}
              cancelEdit={cancelEdit}
              saving={saving}
              isOwner={isOwner}
              startEdit={startEdit}
              handleDelete={handleDelete}
              deleting={deleting}
            />
          </div>
        ) : (
          <AlbumViewerMetaInner
            photo={photo}
            editMode={editMode}
            editPhotoDate={editPhotoDate}
            setEditPhotoDate={setEditPhotoDate}
            editCaption={editCaption}
            setEditCaption={setEditCaption}
            editPhotographer={editPhotographer}
            setEditPhotographer={setEditPhotographer}
            editPeople={editPeople}
            onPickerOpen={() => setPickerOpen(true)}
            removeEditPerson={removeEditPerson}
            handleSave={handleSave}
            cancelEdit={cancelEdit}
            saving={saving}
            isOwner={isOwner}
            startEdit={startEdit}
            handleDelete={handleDelete}
            deleting={deleting}
          />
        )}

        <AlbumCommentsSection
          photoId={photo.id}
          loginNick={loginNick}
          targetCommentId={targetCommentId}
          modalRef={modalRef}
          markScrollResolved={markScrollResolved}
          cardHeight={cardHeight}
          imgLoaded={imgLoaded}
        />
      </div>
      {pickerOpen && (
        <MemberPickerModal
          initial={editPeople}
          dl2={dl2}
          onClose={() => setPickerOpen(false)}
          onDone={(sel) => {
            setEditPeople(sel);
            setPickerOpen(false);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// Inner meta block — extracted so the dl2 / cosmic branches at the
// call site can wrap (or not wrap) it in `.dl2-album-meta-card`
// without duplicating ~80 lines of edit-form / display-mode JSX.
function AlbumViewerMetaInner({
  photo,
  editMode,
  editPhotoDate,
  setEditPhotoDate,
  editCaption,
  setEditCaption,
  editPhotographer,
  setEditPhotographer,
  editPeople,
  onPickerOpen,
  removeEditPerson,
  handleSave,
  cancelEdit,
  saving,
  isOwner,
  startEdit,
  handleDelete,
  deleting,
}: {
  photo: AlbumPhoto;
  editMode: boolean;
  editPhotoDate: string;
  setEditPhotoDate: (v: string) => void;
  editCaption: string;
  setEditCaption: (v: string) => void;
  editPhotographer: string;
  setEditPhotographer: (v: string) => void;
  editPeople: string[];
  onPickerOpen: () => void;
  removeEditPerson: (v: string) => void;
  handleSave: () => void;
  cancelEdit: () => void;
  saving: boolean;
  isOwner: boolean;
  startEdit: () => void;
  handleDelete: () => void;
  deleting: boolean;
}) {
  // 멘션 자동완성용 cursor 추적 (캡션 편집). AlbumViewerMetaInner 내부 state.
  const [editCaptionMentionCursor, setEditCaptionMentionCursor] = useState<
    number | null
  >(null);
  const editCaptionInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      {editMode ? (
        <>
          <label className="album-date-label">
            <span className="album-date-label-text">촬영 날짜</span>
            <input
              type="date"
              className="minihome-input"
              value={editPhotoDate}
              onChange={(e) => setEditPhotoDate(e.target.value)}
              max={todayISO()}
            />
          </label>
          {/* @-mention 자동완성 — 캡션 편집 input 위 sibling. */}
          <MentionPicker
            text={editCaption}
            cursor={editCaptionMentionCursor}
            onSelect={(nickname, range) => {
              const result = applyMentionInsert(
                editCaption,
                range.start,
                range.end,
                nickname,
              );
              setEditCaption(result.text);
              setEditCaptionMentionCursor(result.cursor);
              requestAnimationFrame(() => {
                if (editCaptionInputRef.current) {
                  editCaptionInputRef.current.focus();
                  editCaptionInputRef.current.setSelectionRange(
                    result.cursor,
                    result.cursor,
                  );
                }
              });
            }}
            dl2
          />
          <input
            ref={editCaptionInputRef}
            className="minihome-input"
            placeholder="설명"
            value={editCaption}
            onChange={(e) => {
              setEditCaption(e.target.value);
              setEditCaptionMentionCursor(e.target.selectionStart);
            }}
            onSelect={(e) =>
              setEditCaptionMentionCursor(e.currentTarget.selectionStart)
            }
            onClick={(e) =>
              setEditCaptionMentionCursor(e.currentTarget.selectionStart)
            }
            onKeyUp={(e) =>
              setEditCaptionMentionCursor(e.currentTarget.selectionStart)
            }
            maxLength={120}
          />
          <input
            className="minihome-input"
            placeholder="촬영자"
            value={editPhotographer}
            onChange={(e) => setEditPhotographer(e.target.value)}
            maxLength={30}
          />
          <div className="album-people-input">
            {editPeople.length > 0 && (
              <div className="album-tags">
                {editPeople.map((p) => (
                  <span key={p} className="album-tag">
                    {p}
                    <button
                      type="button"
                      className="album-tag-remove"
                      onClick={() => removeEditPerson(p)}
                      aria-label={`${p} 제거`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="minihome-btn minihome-btn-cancel"
              onClick={onPickerOpen}
            >
              + 출연자 추가
            </button>
          </div>
          <div className="minihome-modal-actions">
            <button
              className="minihome-btn minihome-btn-small"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              className="minihome-btn minihome-btn-small minihome-btn-cancel"
              onClick={cancelEdit}
              disabled={saving}
            >
              취소
            </button>
          </div>
        </>
      ) : (
        <>
          {photo.photoDate && (
            <p className="album-viewer-date">{formatPhotoDate(photo.photoDate)}</p>
          )}
          {photo.caption && (
            <MentionText
              as="p"
              className="minihome-photo-caption"
              text={photo.caption}
              dl2={true}
            />
          )}
          {photo.photographer && (
            <p className="album-photographer">photo by {photo.photographer}</p>
          )}
          {photo.people && photo.people.length > 0 && (
            <div className="album-tags">
              {photo.people.map((p) => (
                <span key={p} className="album-tag album-tag-readonly">
                  {p}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {!editMode && isOwner && (
        <div className="minihome-modal-actions">
          <button
            className="minihome-btn minihome-btn-small"
            onClick={startEdit}
            disabled={deleting}
          >
            수정
          </button>
          <button
            className="minihome-btn minihome-btn-small minihome-btn-cancel"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      )}
    </>
  );
}

function AlbumCommentsSection({
  photoId,
  loginNick,
  targetCommentId,
  modalRef,
  markScrollResolved,
  cardHeight,
  imgLoaded,
}: {
  photoId: string;
  loginNick: string | null;
  targetCommentId?: string | null;
  modalRef?: React.RefObject<HTMLDivElement | null>;
  markScrollResolved?: () => void;
  // Drives effect re-runs as the card grows (firestore comments arrive,
  // photo finishes decoding, fonts swap). Without these, a t+100 ms
  // tryScroll falls into the fits branch — modal.scrollHeight ≤
  // clientHeight because the photo hasn't loaded — and never retries.
  cardHeight?: number;
  imgLoaded?: boolean;
}) {
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [content, setContent] = useState("");
  // 멘션 자동완성용 cursor 추적 (댓글 입력).
  const [commentMentionCursor, setCommentMentionCursor] = useState<
    number | null
  >(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});

  // Deep-link scroll target: each AlbumCommentItem registers its root
  // <div> via setItemRef into this map keyed by comment id. After the
  // comments load we look up the target and use getBoundingClientRect
  // to compute its absolute y inside the modal scroll container, then
  // assign modal.scrollTop. lastHandledRef prevents duplicate scrolls
  // (e.g. when a snapshot replays the same comment list).
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const setItemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    [],
  );
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetCommentId) return;
    if (lastHandledRef.current === targetCommentId) return;
    if (comments.length === 0) return;
    if (!comments.some((c) => c.id === targetCommentId)) return;

    let retryHandle: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const target = itemRefs.current.get(targetCommentId);
      const modal = modalRef?.current;
      if (!target || !modal) {
        if (attempt >= 5) {
          lastHandledRef.current = targetCommentId;
          markScrollResolved?.();
          return;
        }
        retryHandle = setTimeout(() => tryScroll(attempt + 1), 50);
        return;
      }
      // Fits-everything branch: photo + comments shorter than viewport.
      // Two sub-cases:
      //   A) "true fits" — image decoded AND first firestore snapshot
      //      back AND content still fits. Genuinely a no-scroll case
      //      (short photo + few comments). Mark handled and reveal the
      //      card now; further deps changes won't help.
      //   B) "deferred" — content still arriving. Keep card hidden
      //      (scrollPending stays true → opacity:0) so the user does
      //      not see a flash at scrollTop=0 only to jump after the
      //      photo loads. Effect re-runs on `comments` / `cardHeight`
      //      / `imgLoaded` and we'll try again. The 1.5 s safety
      //      timeout in the parent reveals the card if all retries
      //      silently fail.
      if (modal.scrollHeight <= modal.clientHeight) {
        const contentReady = !!imgLoaded && comments.length > 0;
        if (contentReady) {
          lastHandledRef.current = targetCommentId;
          markScrollResolved?.();
        }
        return;
      }
      // Real scroll — claim handled now so subsequent re-runs short-circuit.
      lastHandledRef.current = targetCommentId;
      const modalRect = modal.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetWithinModal =
        targetRect.top - modalRect.top + modal.scrollTop;
      // Land 100 px below the modal top to clear the close button.
      // Browser auto-clamps to the legal scroll range (no whitespace
      // past the bottom).
      modal.scrollTop = Math.max(0, offsetWithinModal - 100);
      markScrollResolved?.();
    };

    const t = setTimeout(() => tryScroll(1), 100);
    return () => {
      cancelled = true;
      if (retryHandle) clearTimeout(retryHandle);
      clearTimeout(t);
    };
  }, [
    targetCommentId,
    comments,
    modalRef,
    markScrollResolved,
    cardHeight,
    imgLoaded,
  ]);

  const reportReplyCount = useCallback((commentId: string, count: number) => {
    setReplyCounts((prev) =>
      prev[commentId] === count ? prev : { ...prev, [commentId]: count },
    );
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "album", photoId, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlbumComment[],
      );
    });
    return () => unsub();
  }, [photoId]);

  const totalCount =
    comments.length +
    comments.reduce((n, c) => n + (replyCounts[c.id] ?? 0), 0);

  const handleSubmit = async () => {
    if (!loginNick) return;
    if (!content.trim() && !image) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (image) {
        imageUrl = await uploadCommentImage(image);
      }
      const commentRef = await addDoc(collection(db, "album", photoId, "comments"), {
        nickname: loginNick,
        content: content.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
      });
      setContent("");
      setImage(null);
      {
        const trimmed = content.trim();
        await logActivity(
          "album_comment",
          loginNick,
          `앨범 댓글에 ${loginNick}님이 '${truncate(trimmed, 25)}'${josa(trimmed, "을/를")} 달았어요`,
          `/album?photo=${photoId}&comment=${commentRef.id}`,
          `album/${photoId}/comments/${commentRef.id}`,
        );
      }
      await addPoints(loginNick, "댓글", 1, "앨범에 댓글 작성");
      handleEvent({
        type: "comment",
        nickname: loginNick,
        content,
        when: new Date(),
      });
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="minihome-photo-comments">
      <h4 className="minihome-photo-comments-title">댓글 ({totalCount})</h4>
      <div className="minihome-photo-comments-list">
        {comments.length === 0 ? (
          <p className="minihome-hint">아직 댓글이 없습니다.</p>
        ) : (
          comments.map((c) => (
            <AlbumCommentItem
              key={c.id}
              photoId={photoId}
              comment={c}
              loginNick={loginNick}
              replyOpen={openReplyId === c.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === c.id ? null : c.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
              onReplyCountChange={reportReplyCount}
              setItemRef={setItemRef(c.id)}
            />
          ))
        )}
      </div>
      {loginNick ? (
        <>
        {/* @-mention 자동완성 — 댓글 cbar(row) 위 sibling. */}
        <MentionPicker
          text={content}
          cursor={commentMentionCursor}
          onSelect={(nickname, range) => {
            const result = applyMentionInsert(
              content,
              range.start,
              range.end,
              nickname,
            );
            setContent(result.text);
            setCommentMentionCursor(result.cursor);
            requestAnimationFrame(() => {
              if (commentInputRef.current) {
                commentInputRef.current.focus();
                commentInputRef.current.setSelectionRange(
                  result.cursor,
                  result.cursor,
                );
              }
            });
          }}
          dl2
        />
        <div className="minihome-form minihome-form-inline cbar">
          <input
            ref={commentInputRef}
            className="minihome-input"
            placeholder="댓글을 입력하세요"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setCommentMentionCursor(e.target.selectionStart);
            }}
            onSelect={(e) =>
              setCommentMentionCursor(e.currentTarget.selectionStart)
            }
            onClick={(e) =>
              setCommentMentionCursor(e.currentTarget.selectionStart)
            }
            onKeyUp={(e) =>
              setCommentMentionCursor(e.currentTarget.selectionStart)
            }
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            }}
          />
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
          />
          <button
            className="minihome-btn minihome-btn-small cbar-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            등록
          </button>
        </div>
        </>
      ) : (
        <p className="login-required login-required-sm">로그인이 필요합니다.</p>
      )}
    </div>
  );
}

function AlbumCommentItem({
  photoId,
  comment,
  loginNick,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
  setItemRef,
}: {
  photoId: string;
  comment: AlbumComment;
  loginNick: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
  setItemRef?: (el: HTMLDivElement | null) => void;
}) {
  // dl2 swap: render Dl2TitlePrefix beside the nick (`hideTitle` skips
  // the cosmic TitlePrefix that NicknameLink renders by default), and
  // tag the cosmic .minihome-gb-nick with the dl2 navy ink color via
  // the parent .dl2-album-viewer scope. cosmic users see the original
  // gold-stardust prefix-inside-nick layout.
  const dl2 = useDawnlight2();
  const [replies, setReplies] = useState<AlbumComment[]>([]);
  const [msg, setMsg] = useState("");
  // 멘션 자동완성용 cursor 추적 (per-item — AlbumCommentItem 안 별도 state).
  const [replyMentionCursor, setReplyMentionCursor] = useState<number | null>(
    null,
  );
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "album", photoId, "comments", comment.id, "replies"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlbumComment[],
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return () => unsub();
  }, [photoId, comment.id, onReplyCountChange]);

  const handleReply = async () => {
    if (!loginNick) return;
    if (!msg.trim() && !replyImage) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (replyImage) {
        imageUrl = await uploadCommentImage(replyImage);
      }
      const replyRef = await addDoc(
        collection(db, "album", photoId, "comments", comment.id, "replies"),
        {
          nickname: loginNick,
          content: msg.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setReplyImage(null);
      onCloseReply();
      {
        const trimmed = msg.trim();
        await logActivity(
          "album_comment",
          loginNick,
          `앨범 댓글에 ${loginNick}님이 '${truncate(trimmed, 25)}'${josa(trimmed, "을/를")} 달았어요`,
          `/album?photo=${photoId}&comment=${comment.id}`,
          `album/${photoId}/comments/${comment.id}/replies/${replyRef.id}`,
        );
      }
      await addPoints(loginNick, "대댓글", 1, "앨범 댓글에 대댓글 작성");
      handleEvent({
        type: "comment",
        nickname: loginNick,
        content: msg,
        when: new Date(),
      });
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "album", photoId, "comments", comment.id));
      await deleteActivitiesByTargetPath(
        `album/${photoId}/comments/${comment.id}`,
      );
    } catch (e) {
      console.error(e);
      alert("댓글 삭제에 실패했습니다.");
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(
        doc(db, "album", photoId, "comments", comment.id, "replies", replyId),
      );
      await deleteActivitiesByTargetPath(
        `album/${photoId}/comments/${comment.id}/replies/${replyId}`,
      );
    } catch (e) {
      console.error(e);
      alert("대댓글 삭제에 실패했습니다.");
    }
  };

  return (
    <div
      ref={setItemRef}
      className={
        "minihome-photo-comment-block" +
        (dl2 ? " dl2-photo-comment-block" : "")
      }
    >
      {dl2 ? (
        <div className="dl2-comment-row">
          <div className="dl2-comment-left">
            <span className="dl2-comment-nick-line">
              <NicknameLink
                nickname={comment.nickname}
                className="dl2-photo-comment-nick"
                hideTitle
              />
            </span>
            {!!comment.content && (
              <MentionText as="p" className="dl2-photo-comment-body" text={comment.content} dl2={true} />
            )}
          </div>
          <div className="dl2-comment-right">
            <span className="dl2-photo-comment-date">
              {formatTime(comment.createdAt)}
            </span>
            {loginNick && (
              <button
                type="button"
                className="dl2-photo-comment-action"
                onClick={onToggleReply}
              >
                답글
              </button>
            )}
            {loginNick === comment.nickname && (
              <button
                type="button"
                className="dl2-photo-comment-action"
                onClick={handleDeleteComment}
              >
                삭제
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="minihome-photo-comment">
          <span
            style={{
              float: "right",
              display: "inline-flex",
              alignItems: "baseline",
              gap: "0.25rem",
              whiteSpace: "nowrap",
              marginLeft: "0.5rem",
            }}
          >
            <span className="minihome-gb-time" style={{ marginLeft: 0 }}>
              {formatTime(comment.createdAt)}
            </span>
            {loginNick && (
              <button
                type="button"
                className="minihome-reply-btn"
                onClick={onToggleReply}
                style={{ marginLeft: 0 }}
              >
                답글
              </button>
            )}
            {loginNick === comment.nickname && (
              <button
                type="button"
                className="minihome-reply-btn"
                onClick={handleDeleteComment}
                style={{ marginLeft: 0 }}
              >
                삭제
              </button>
            )}
          </span>
          <NicknameLink
            nickname={comment.nickname}
            className="minihome-gb-nick"
          />
          <MentionText as="span" className="minihome-gb-msg" text={`: ${comment.content}`} dl2={true} />
        </div>
      )}
      {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
      {(replies.length > 0 || replyOpen) && (
        <div
          className={
            "minihome-gb-replies" + (dl2 ? " dl2-photo-comment-replies" : "")
          }
        >
          {replies.map((r, idx) => (
            <div
              key={r.id}
              className={
                "minihome-gb-reply" +
                (dl2 ? ` dl2-photo-comment-reply${idx > 0 ? " has-prev" : ""}` : "")
              }
            >
              {dl2 ? (
                <div className="dl2-reply-row">
                  <span className="dl2-reply-arrow">↳</span>
                  <div className="dl2-reply-content">
                    <div className="dl2-comment-row">
                      <div className="dl2-comment-left">
                        <span className="dl2-comment-nick-line">
                          <NicknameLink
                            nickname={r.nickname}
                            className="dl2-photo-comment-nick"
                            hideTitle
                          />
                        </span>
                        {!!r.content && (
                          <MentionText as="p" className="dl2-photo-comment-body" text={r.content} dl2={true} />
                        )}
                      </div>
                      <div className="dl2-comment-right">
                        <span className="dl2-photo-comment-date">
                          {formatTime(r.createdAt)}
                        </span>
                        {loginNick === r.nickname && (
                          <button
                            type="button"
                            className="dl2-photo-comment-action"
                            onClick={() => handleDeleteReply(r.id)}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span
                    style={{
                      float: "right",
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: "0.25rem",
                      whiteSpace: "nowrap",
                      marginLeft: "0.5rem",
                    }}
                  >
                    <span className="minihome-gb-time" style={{ marginLeft: 0 }}>
                      {formatTime(r.createdAt)}
                    </span>
                    {loginNick === r.nickname && (
                      <button
                        type="button"
                        className="minihome-reply-btn"
                        onClick={() => handleDeleteReply(r.id)}
                        style={{ marginLeft: 0 }}
                      >
                        삭제
                      </button>
                    )}
                  </span>
                  <NicknameLink
                    nickname={r.nickname}
                    className="minihome-gb-nick"
                    prefix="↳ "
                  />
                  <MentionText as="span" className="minihome-gb-msg" text={`: ${r.content}`} dl2={true} />
                </div>
              )}
              {r.imageUrl && <CommentImageView url={r.imageUrl} />}
            </div>
          ))}
          {replyOpen && loginNick && (
            <>
            {/* @-mention 자동완성 — 답글 cbar(row) 위 sibling. */}
            <MentionPicker
              text={msg}
              cursor={replyMentionCursor}
              onSelect={(nickname, range) => {
                const result = applyMentionInsert(
                  msg,
                  range.start,
                  range.end,
                  nickname,
                );
                setMsg(result.text);
                setReplyMentionCursor(result.cursor);
                requestAnimationFrame(() => {
                  if (replyInputRef.current) {
                    replyInputRef.current.focus();
                    replyInputRef.current.setSelectionRange(
                      result.cursor,
                      result.cursor,
                    );
                  }
                });
              }}
              dl2
            />
            <div className="minihome-form minihome-form-inline cbar">
              <input
                ref={replyInputRef}
                className="minihome-input"
                placeholder="대댓글"
                value={msg}
                onChange={(e) => {
                  setMsg(e.target.value);
                  setReplyMentionCursor(e.target.selectionStart);
                }}
                onSelect={(e) =>
                  setReplyMentionCursor(e.currentTarget.selectionStart)
                }
                onClick={(e) =>
                  setReplyMentionCursor(e.currentTarget.selectionStart)
                }
                onKeyUp={(e) =>
                  setReplyMentionCursor(e.currentTarget.selectionStart)
                }
                maxLength={200}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleReply();
                }}
              />
              <CommentImageAttach
                file={replyImage}
                setFile={setReplyImage}
                disabled={submitting}
              />
              <button
                className="minihome-btn minihome-btn-small cbar-submit"
                onClick={handleReply}
                disabled={submitting}
              >
                등록
              </button>
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
