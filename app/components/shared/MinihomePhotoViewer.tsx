"use client";

// Shared minihome photo viewer modal — extracted from
// `app/components/redesign/minihompi/PhotosSection.tsx` so that both
// cosmic's PhotosSection AND dawnlight2's CabinLogs can mount the
// same component (single source of truth, byte-identical UX). The
// extraction is mechanical: function bodies / props / state / DOM
// are unchanged from the original inline definitions, only `export`
// added to the publicly used members.
//
// Companions (PhotoComments, PhotoCommentItem) stay private — they
// are implementation details of PhotoViewerModal and not consumed
// directly by either caller.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
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
import { MentionText } from "@/app/components/mention/MentionText";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";
import { josa, truncate } from "@/src/lib/text";

export type MediaKind = "image" | "video" | "gif";

export type PhotoEntry = {
  id: string;
  imageUrl: string;
  caption: string;
  fileType?: MediaKind;
  createdAt: Timestamp | null;
};

export type PhotoCommentDoc = {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

export function resolveFileType(p: {
  fileType?: MediaKind;
  imageUrl?: string;
}): MediaKind {
  if (p.fileType === "video" || p.fileType === "gif" || p.fileType === "image") {
    return p.fileType;
  }
  const url = (p.imageUrl || "").toLowerCase();
  if (url.includes(".mp4")) return "video";
  if (url.includes(".gif")) return "gif";
  return "image";
}

export function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

export function PhotoViewerModal({
  memberId,
  photo,
  loginNick,
  isOwner,
  memberNickname,
  targetCommentId,
  onClose,
  dawnlight2 = false,
}: {
  memberId: string;
  photo: PhotoEntry;
  loginNick: string | null;
  isOwner: boolean;
  memberNickname: string | null;
  targetCommentId: string | null;
  onClose: () => void;
  // dawnlight2 = true일 때 외곽/닫기/사진 컨테이너/댓글 박스 색감을
  // cream 양피지 톤으로 분기. 텍스트 세부 색은 cosmic 그대로 (다음
  // 라운드에서 작업).
  dawnlight2?: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  // 멘션 자동완성용 cursor 추적 (캡션 편집).
  const [editCaptionMentionCursor, setEditCaptionMentionCursor] = useState<
    number | null
  >(null);
  const editCaptionInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Deep-link comment scroll plumbing — mirrors AlbumPhotoModal in
  // app/album/page.tsx. The outer .modal-safe-frame motion.div is the
  // scroll container (overflow-y:auto). PhotoComments computes each
  // comment's absolute y via getBoundingClientRect against this ref.
  const modalRef = useRef<HTMLDivElement | null>(null);
  // Card height tracker — ResizeObserver fires whenever the photo
  // decodes / firestore snapshot lands / fonts swap, letting the
  // deep-link effect re-attempt after the page actually grew.
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
  // Hide the card while we jump to the deep-link target so the user
  // doesn't see the modal flash at scrollTop=0 before the comment
  // appears. 1.5 s safety timeout reveals the card if the scroll never
  // resolves.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !deleting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, deleting]);

  const startEdit = () => {
    setEditCaption(photo.caption);
    setEditMode(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "members", memberId, "photos", photo.id), {
        caption: editCaption.trim(),
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
      await deleteDoc(doc(db, "members", memberId, "photos", photo.id));
      await deleteActivitiesByLink(`/members/${memberId}?photo=${photo.id}`);
      onClose();
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
      setDeleting(false);
    }
  };

  const kind = resolveFileType(photo);

  // Portal-mount — see UploadModal above. Same stacking-context trap.
  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      ref={modalRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={
        "modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center" +
        (dawnlight2 ? " dl2-minihome" : "")
      }
      onClick={saving || deleting ? undefined : onClose}
      style={{
        background: dawnlight2 ? "rgba(0,0,0,0.88)" : "rgba(11,8,33,0.85)",
        backdropFilter: "blur(10px)",
        // .modal-safe-frame { align-items: flex-start } cascade override
        // (배지 모달과 동일 처방). dl2 분기 시에만 중앙 정렬.
        ...(dawnlight2 ? { alignItems: "center" } : null),
      }}
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || "사진 보기"}
    >
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        // Match RN viewerContent: unframed container that lets the photo,
        // caption, and comments stack as separate boxes. No background /
        // border / shadow on the card itself — the photo gets its own
        // rounded box, the close button sits on its own row above it.
        className="my-4 flex w-full max-w-lg flex-col gap-3"
        style={{
          // Hide briefly so the deep-link jump doesn't flash at scrollTop=0
          // before resolving. The 1.5s safety timeout flips this back on.
          opacity: scrollPending ? 0 : 1,
          transition: "opacity 120ms ease-out",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving || deleting}
          aria-label="닫기"
          className="flex h-10 w-10 items-center justify-center self-end rounded-full transition-colors disabled:opacity-50"
          style={
            dawnlight2
              ? {
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(254,245,230,0.55)",
                  color: "#fef5e6",
                }
              : {
                  background: "rgba(11,8,33,0.6)",
                  border: "1px solid rgba(216,150,200,0.3)",
                  color: "var(--color-stardust, #FFE5C4)",
                }
          }
        >
          <X className="h-5 w-5" />
        </button>

        {/* Photo / video — dl2: 박스 X (백드랍 바로). cosmic: rounded box. */}
        <div
          className={
            "w-full flex-shrink-0 overflow-hidden" +
            (dawnlight2 ? "" : " rounded-xl bg-abyss-deep/45")
          }
        >
          {kind === "video" ? (
            <video
              src={photo.imageUrl}
              controls
              autoPlay
              playsInline
              onLoadedData={() => setImgLoaded(true)}
              className="block max-h-[60vh] w-full object-contain"
              style={dawnlight2 ? { background: "transparent" } : undefined}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.imageUrl}
              alt={photo.caption || "photo"}
              onLoad={() => setImgLoaded(true)}
              className="block max-h-[60vh] w-full object-contain"
              style={dawnlight2 ? { background: "transparent" } : undefined}
            />
          )}
        </div>

        {/* Caption + comments — no inner scroll. The whole modal scrolls
            as one block via the parent .modal-safe-frame.
            dl2: 본문 중앙 정렬 (앨범 모달 패턴). cosmic: 좌측 정렬 그대로. */}
        <div className="flex flex-col">
          <div
            className={
              dawnlight2
                ? "flex flex-col items-center gap-3 px-5 pb-3 pt-4"
                : "flex flex-wrap items-center gap-2 px-5 pb-3 pt-4"
            }
          >
            {editMode ? (
              <div className="flex w-full flex-col gap-2">
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
                  type="text"
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
                  placeholder="설명"
                  maxLength={120}
                  disabled={saving}
                  className={
                    dawnlight2
                      ? "w-full rounded-full px-3 py-2 text-[12px] focus:outline-none disabled:opacity-60"
                      : "w-full rounded-full border border-nebula-pink/25 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                  }
                  style={
                    dawnlight2
                      ? {
                          background: "#ffffff",
                          border: "1px solid rgba(92, 58, 31, 0.25)",
                          color: "#5c3a1f",
                        }
                      : undefined
                  }
                />
                <div className={dawnlight2 ? "flex justify-center gap-2" : "flex gap-2"}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className={
                      dawnlight2
                        ? "rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-wider transition-colors disabled:opacity-50"
                        : "rounded-full px-3 py-1 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
                    }
                    style={
                      dawnlight2
                        ? { background: "#2a4570", color: "#fef5e6" }
                        : { background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)" }
                    }
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    disabled={saving}
                    className={
                      dawnlight2
                        ? "rounded-full px-4 py-1.5 text-[11px] tracking-wider transition-colors disabled:opacity-50"
                        : "rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1 font-serif text-[11px] tracking-wider text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
                    }
                    style={
                      dawnlight2
                        ? {
                            background: "transparent",
                            border: "1px solid #2a4570",
                            color: "#2a4570",
                          }
                        : undefined
                    }
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p
                className={
                  dawnlight2
                    ? "wrap-anywhere w-full text-center text-[14px] italic leading-relaxed"
                    : "wrap-anywhere min-w-0 flex-1 font-serif text-[13px] italic leading-relaxed text-text-primary"
                }
                style={dawnlight2 ? { color: "#fef5e6" } : undefined}
              >
                {photo.caption ? (
                  <MentionText as="span" text={photo.caption} dl2={true} />
                ) : (
                  <span
                    className={
                      dawnlight2
                        ? "italic"
                        : "text-text-sub/60"
                    }
                    style={
                      dawnlight2
                        ? { color: "rgba(254, 245, 230, 0.6)" }
                        : undefined
                    }
                  >
                    설명 없음
                  </span>
                )}
              </p>
            )}
            {isOwner && !editMode && (
              <div
                className={
                  dawnlight2
                    ? "flex items-center justify-center gap-2 text-[11px]"
                    : "flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider"
                }
              >
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={deleting}
                  className={
                    dawnlight2
                      ? "rounded-full px-4 py-1.5 font-semibold tracking-wider transition-colors disabled:opacity-50"
                      : "text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
                  }
                  style={
                    dawnlight2
                      ? { background: "#2a4570", color: "#fef5e6" }
                      : undefined
                  }
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={
                    dawnlight2
                      ? "rounded-full px-4 py-1.5 font-semibold tracking-wider transition-colors disabled:opacity-50"
                      : "text-text-sub transition-colors hover:text-peach-accent disabled:opacity-50"
                  }
                  style={
                    dawnlight2
                      ? {
                          background: "transparent",
                          border: "1px solid #2a4570",
                          color: "#2a4570",
                        }
                      : undefined
                  }
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            )}
          </div>

          <div
            className="mx-5 h-px flex-shrink-0"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(216,150,200,0.25), transparent)",
            }}
          />

          <PhotoComments
            memberId={memberId}
            photoId={photo.id}
            loginNick={loginNick}
            memberNickname={memberNickname}
            targetCommentId={targetCommentId}
            modalRef={modalRef}
            markScrollResolved={markScrollResolved}
            cardHeight={cardHeight}
            imgLoaded={imgLoaded}
            dawnlight2={dawnlight2}
          />
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function PhotoComments({
  memberId,
  photoId,
  loginNick,
  memberNickname,
  targetCommentId,
  modalRef,
  markScrollResolved,
  cardHeight,
  imgLoaded,
  dawnlight2 = false,
}: {
  memberId: string;
  photoId: string;
  loginNick: string | null;
  memberNickname: string | null;
  // When non-null the deep-link effect tries to scroll the modal to
  // this comment id once the photo decodes + first firestore snapshot
  // lands. Mirrors AlbumCommentsSection.
  targetCommentId?: string | null;
  modalRef?: React.RefObject<HTMLDivElement | null>;
  markScrollResolved?: () => void;
  cardHeight?: number;
  imgLoaded?: boolean;
  dawnlight2?: boolean;
}) {
  const [comments, setComments] = useState<PhotoCommentDoc[]>([]);
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

  // Deep-link scroll target: each PhotoCommentItem registers its root
  // div via setItemRef into this map keyed by comment id. After the
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
      // Fits-everything branch (cf. AlbumCommentsSection): when the
      // modal hasn't yet grown past the viewport we either acknowledge
      // it as a true short case (image loaded + first snapshot back)
      // and reveal the card, or stay hidden and wait for the next
      // dependency change to retry.
      if (modal.scrollHeight <= modal.clientHeight) {
        const contentReady = !!imgLoaded && comments.length > 0;
        if (contentReady) {
          lastHandledRef.current = targetCommentId;
          markScrollResolved?.();
        }
        return;
      }
      lastHandledRef.current = targetCommentId;
      const modalRect = modal.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetWithinModal =
        targetRect.top - modalRect.top + modal.scrollTop;
      // Land 100 px below the modal top to clear the close button.
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
      collection(db, "members", memberId, "photos", photoId, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoCommentDoc[],
      );
    });
    return () => unsub();
  }, [memberId, photoId]);

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
      const commentRef = await addDoc(
        collection(db, "members", memberId, "photos", photoId, "comments"),
        {
          nickname: loginNick,
          content: content.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setContent("");
      setImage(null);
      if (memberNickname) {
        const trimmed = content.trim();
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 사진첩 댓글에 '${truncate(trimmed, 25)}'${josa(trimmed, "이/가")} 달렸어요`,
          `/members/${memberId}?photo=${photoId}&comment=${commentRef.id}`,
          `members/${memberId}/photos/${photoId}/comments/${commentRef.id}`,
        );
      }
      await addPoints(
        loginNick,
        "댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 사진에 댓글 작성`,
      );
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
    <div
      className={
        "flex flex-col gap-3 rounded-2xl p-4" +
        (dawnlight2
          ? ""
          : " border border-nebula-pink/15 bg-abyss-deep/70")
      }
      style={
        dawnlight2
          ? {
              // 옅은 양피지 #f0e4cc — cream 위 가독성 좋음. 닉네임
              // 잉크 갈색, 본문 잉크 남색 등 텍스트 색이 또렷.
              background: "rgba(240, 228, 204, 0.95)",
              border: "1px solid rgba(92, 58, 31, 0.25)",
            }
          : undefined
      }
    >
      <h4
        className={
          dawnlight2
            ? "text-[12px] font-semibold tracking-[0.2em] uppercase"
            : "font-serif text-[11px] tracking-[0.3em] text-text-sub uppercase"
        }
        style={dawnlight2 ? { color: "#5c3a1f" } : undefined}
      >
        댓글 ({totalCount})
      </h4>

      {/* Comment list */}
      {comments.length === 0 ? (
        <p
          className={
            dawnlight2
              ? "py-2 text-center text-[11px] italic"
              : "py-2 text-center font-serif text-[11px] italic text-text-sub/70"
          }
          style={dawnlight2 ? { color: "rgba(92, 58, 31, 0.6)" } : undefined}
        >
          첫 댓글을 남겨보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c, idx) => (
            <PhotoCommentItem
              key={c.id}
              memberId={memberId}
              photoId={photoId}
              comment={c}
              loginNick={loginNick}
              memberNickname={memberNickname}
              replyOpen={openReplyId === c.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === c.id ? null : c.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
              onReplyCountChange={reportReplyCount}
              registerRef={setItemRef(c.id)}
              dawnlight2={dawnlight2}
              isLast={idx === comments.length - 1}
            />
          ))}
        </div>
      )}

      {/* Input */}
      {loginNick ? (
        <>
        {/* @-mention 자동완성 — form(row) 위 sibling. */}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-2 rounded-full px-2 py-1.5"
          style={
            dawnlight2
              ? {
                  background: "#ffffff",
                  border: "1px solid rgba(42, 69, 112, 0.3)",
                }
              : {
                  background: "rgba(11,8,33,0.5)",
                  border: "1px solid rgba(216,150,200,0.2)",
                }
          }
        >
          <input
            ref={commentInputRef}
            type="text"
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
            placeholder="댓글을 남겨주세요"
            maxLength={200}
            disabled={submitting}
            aria-label="댓글 내용"
            className={
              dawnlight2
                ? "min-w-0 flex-1 border-none bg-transparent px-2 py-1 text-[12px] focus:outline-none disabled:opacity-60"
                : "min-w-0 flex-1 border-none bg-transparent px-2 py-1 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60"
            }
            style={dawnlight2 ? { color: "#2a4570" } : undefined}
          />
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || (!content.trim() && !image)}
            className={
              dawnlight2
                ? "shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                : "shrink-0 rounded-full px-3 py-1 font-serif text-[10px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            }
            style={
              dawnlight2
                ? { background: "#2a4570", color: "#fef5e6" }
                : { background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)" }
            }
          >
            {submitting ? "..." : "등록"}
          </button>
        </form>
        </>
      ) : (
        <p
          className={
            dawnlight2
              ? "text-center text-[11px] italic"
              : "text-center font-serif text-[11px] italic text-text-sub"
          }
          style={dawnlight2 ? { color: "rgba(92, 58, 31, 0.7)" } : undefined}
        >
          로그인이 필요합니다
        </p>
      )}
    </div>
  );
}

function PhotoCommentItem({
  memberId,
  photoId,
  comment,
  loginNick,
  memberNickname,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
  registerRef,
  dawnlight2 = false,
  isLast = false,
}: {
  memberId: string;
  photoId: string;
  comment: PhotoCommentDoc;
  loginNick: string | null;
  memberNickname: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
  // Deep-link target registration — outer div ref is registered with
  // PhotoComments via this callback so the modal can scroll to it.
  registerRef?: (el: HTMLDivElement | null) => void;
  dawnlight2?: boolean;
  isLast?: boolean;
}) {
  const [replies, setReplies] = useState<PhotoCommentDoc[]>([]);
  const [msg, setMsg] = useState("");
  // 멘션 자동완성용 cursor 추적 (per-item — PhotoCommentItem wrapper 안).
  const [replyMentionCursor, setReplyMentionCursor] = useState<
    number | null
  >(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(
        db,
        "members",
        memberId,
        "photos",
        photoId,
        "comments",
        comment.id,
        "replies",
      ),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoCommentDoc[],
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return () => unsub();
  }, [memberId, photoId, comment.id, onReplyCountChange]);

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
        collection(
          db,
          "members",
          memberId,
          "photos",
          photoId,
          "comments",
          comment.id,
          "replies",
        ),
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
      if (memberNickname) {
        const trimmed = msg.trim();
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 사진첩 댓글에 '${truncate(trimmed, 25)}'${josa(trimmed, "이/가")} 달렸어요`,
          `/members/${memberId}?photo=${photoId}&comment=${comment.id}`,
          `members/${memberId}/photos/${photoId}/comments/${comment.id}/replies/${replyRef.id}`,
        );
      }
      await addPoints(
        loginNick,
        "대댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 사진에 대댓글 작성`,
      );
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
      await deleteDoc(
        doc(
          db,
          "members",
          memberId,
          "photos",
          photoId,
          "comments",
          comment.id,
        ),
      );
      await deleteActivitiesByTargetPath(
        `members/${memberId}/photos/${photoId}/comments/${comment.id}`,
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
        doc(
          db,
          "members",
          memberId,
          "photos",
          photoId,
          "comments",
          comment.id,
          "replies",
          replyId,
        ),
      );
      await deleteActivitiesByTargetPath(
        `members/${memberId}/photos/${photoId}/comments/${comment.id}/replies/${replyId}`,
      );
    } catch (e) {
      console.error(e);
      alert("대댓글 삭제에 실패했습니다.");
    }
  };

  return (
    <div
      ref={registerRef}
      data-comment-id={comment.id}
      className={
        dawnlight2
          ? "dl2-photo-comment-block" + (isLast ? "" : "")
          : undefined
      }
    >
      {dawnlight2 ? (
        <div className="dl2-comment-row">
          <div className="dl2-comment-left">
            <span className="dl2-comment-nick-line">
              <NicknameLink
                nickname={comment.nickname}
                className="dl2-photo-comment-nick"
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
                {replyOpen ? "닫기" : "답글"}
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="wrap-anywhere min-w-0 flex-1 font-serif text-[12px] leading-relaxed text-text-primary">
            <NicknameLink
              nickname={comment.nickname}
              className="font-medium text-stardust"
            />
            <span className="text-text-sub"> : </span>
            <MentionText as="span" text={comment.content} dl2={true} />
          </p>
          <div className="flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider">
            <span className="text-[10px] tracking-wider text-text-sub">
              {formatTime(comment.createdAt)}
            </span>
            {loginNick && (
              <button
                type="button"
                onClick={onToggleReply}
                className="text-text-sub transition-colors hover:text-peach-accent"
              >
                {replyOpen ? "닫기" : "답글"}
              </button>
            )}
            {loginNick === comment.nickname && (
              <button
                type="button"
                onClick={handleDeleteComment}
                className="text-text-sub transition-colors hover:text-peach-accent"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      )}
      {comment.imageUrl && (
        <div className="mt-2">
          <CommentImageView url={comment.imageUrl} />
        </div>
      )}

      {(replies.length > 0 || replyOpen) && (
        <div
          className={
            dawnlight2
              ? "dl2-photo-comment-replies"
              : "mt-2 ml-5 flex flex-col gap-2"
          }
        >
          {replies.map((r, idx) =>
            dawnlight2 ? (
              <div
                key={r.id}
                className={
                  "dl2-photo-comment-reply" + (idx > 0 ? " has-prev" : "")
                }
              >
                <div className="dl2-reply-row">
                  <span className="dl2-reply-arrow">↳</span>
                  <div className="dl2-reply-content">
                    <div className="dl2-comment-row">
                      <div className="dl2-comment-left">
                        <span className="dl2-comment-nick-line">
                          <NicknameLink
                            nickname={r.nickname}
                            className="dl2-photo-comment-nick"
                          />
                        </span>
                        {!!r.content && (
                          <MentionText as="p" className="dl2-photo-comment-body" text={r.content} dl2={true} />
                        )}
                        {r.imageUrl && (
                          <div className="mt-2">
                            <CommentImageView url={r.imageUrl} />
                          </div>
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
              </div>
            ) : (
              <div key={r.id} className="flex items-start gap-2">
                <span
                  className="shrink-0 font-serif text-xs leading-relaxed text-text-sub/70"
                  aria-hidden
                >
                  └
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="wrap-anywhere min-w-0 flex-1 font-serif text-[11.5px] leading-relaxed text-text-primary">
                      <NicknameLink
                        nickname={r.nickname}
                        className="font-medium text-stardust"
                      />
                      <span className="text-text-sub"> : </span>
                      <MentionText as="span" text={r.content} dl2={true} />
                    </p>
                    <div className="flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider">
                      <span className="text-[10px] tracking-wider text-text-sub">
                        {formatTime(r.createdAt)}
                      </span>
                      {loginNick === r.nickname && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReply(r.id)}
                          className="text-text-sub transition-colors hover:text-peach-accent"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  {r.imageUrl && (
                    <div className="mt-2">
                      <CommentImageView url={r.imageUrl} />
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          <AnimatePresence>
            {replyOpen && loginNick && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                {/* @-mention 자동완성 — 답글 input row 위 sibling. */}
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
                <div
                  className="mt-1 flex items-center gap-2 rounded-full px-2 py-1.5"
                  style={
                    dawnlight2
                      ? {
                          background: "#ffffff",
                          border: "1px solid rgba(42, 69, 112, 0.3)",
                        }
                      : {
                          background: "rgba(11,8,33,0.45)",
                          border: "1px solid rgba(216,150,200,0.22)",
                          backdropFilter: "blur(14px)",
                        }
                  }
                >
                  <input
                    ref={replyInputRef}
                    type="text"
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                    placeholder="대댓글"
                    maxLength={200}
                    disabled={submitting}
                    autoFocus
                    className={
                      dawnlight2
                        ? "min-w-0 flex-1 border-none bg-transparent px-3 py-1 text-[12px] focus:outline-none disabled:opacity-60"
                        : "min-w-0 flex-1 border-none bg-transparent px-3 py-1 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60"
                    }
                    style={dawnlight2 ? { color: "#2a4570" } : undefined}
                  />
                  <CommentImageAttach
                    file={replyImage}
                    setFile={setReplyImage}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={submitting || (!msg.trim() && !replyImage)}
                    className={
                      dawnlight2
                        ? "shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        : "shrink-0 rounded-full px-3 py-1 font-serif text-[10px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                    }
                    style={
                      dawnlight2
                        ? { background: "#2a4570", color: "#fef5e6" }
                        : {
                            background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                            boxShadow: "0 0 10px rgba(255,181,167,0.5)",
                          }
                    }
                  >
                    {submitting ? "..." : "등록"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
