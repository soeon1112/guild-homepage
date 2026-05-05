"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
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
import { deleteActivitiesByLink, deleteActivitiesByTargetPath, logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { uploadCommentImage } from "@/src/lib/commentImage";
import {
  CommentImageAttach,
  CommentImageView,
} from "@/app/components/CommentImage";
import NicknameLink from "@/app/components/NicknameLink";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";
import {
  registerModalLockDebug,
  useModalBodyLock,
} from "@/src/lib/useModalBodyLock";

type MediaKind = "image" | "video" | "gif";

type AlbumPhoto = {
  id: string;
  imageUrl: string;
  caption: string;
  photographer: string;
  people: string[];
  photoDate: string;
  fileType?: MediaKind;
  createdAt: Timestamp | null;
};

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

function resolveFileType(p: { fileType?: MediaKind; imageUrl?: string }): MediaKind {
  if (p.fileType === "video" || p.fileType === "gif" || p.fileType === "image") {
    return p.fileType;
  }
  const url = (p.imageUrl || "").toLowerCase();
  if (url.includes(".mp4")) return "video";
  if (url.includes(".gif")) return "gif";
  return "image";
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPhotoDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

function photoSortKey(p: AlbumPhoto): string {
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

type AlbumComment = {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

export default function AlbumPage() {
  const { nickname: loginNick } = useAuth();
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [viewer, setViewer] = useState<AlbumPhoto | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [photoDate, setPhotoDate] = useState<string>(todayISO());
  const [uploading, setUploading] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const photoIdsKey = photos.map((p) => p.id).sort().join(",");
  const autoOpenedRef = useRef(false);
  // Captured at deep-link time so AlbumPhotoViewer can scroll to the
  // specific comment after opening. Cleared on close so direct grid
  // taps don't accidentally inherit a previous deep-link target.
  const [autoOpenCommentId, setAutoOpenCommentId] = useState<string | null>(
    null,
  );

  // Pagination — same prev/next + "current / total" pattern as
  // GuestbookSection / AdventureLogSection. 20 photos per page.
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = photos.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (photos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("photo");
    if (!pid) {
      autoOpenedRef.current = true;
      return;
    }
    const target = photos.find((p) => p.id === pid);
    if (target) {
      const cid = params.get("comment");
      setAutoOpenCommentId(cid && cid.length > 0 ? cid : null);
      setViewer(target);
      autoOpenedRef.current = true;
      // Strip the params so a back/forward / refresh doesn't re-trigger.
      // History API stays in the same Next.js route — no remount.
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/album");
      }
    }
  }, [photos]);

  useEffect(() => {
    const ids = photoIdsKey ? photoIdsKey.split(",") : [];
    if (ids.length === 0) {
      setCommentCounts({});
      return;
    }
    const commentsByPhoto: Record<string, string[]> = {};
    const replyCounts: Record<string, number> = {};
    const replyUnsubs: Record<string, () => void> = {};

    const recompute = () => {
      const totals: Record<string, number> = {};
      for (const pid of ids) {
        const cIds = commentsByPhoto[pid] ?? [];
        let n = cIds.length;
        for (const cid of cIds) n += replyCounts[`${pid}|${cid}`] ?? 0;
        totals[pid] = n;
      }
      setCommentCounts(totals);
    };

    const commentUnsubs = ids.map((pid) =>
      onSnapshot(collection(db, "album", pid, "comments"), (snap) => {
        const newIds = snap.docs.map((d) => d.id);
        const oldIds = commentsByPhoto[pid] ?? [];
        commentsByPhoto[pid] = newIds;
        for (const cid of oldIds) {
          if (!newIds.includes(cid)) {
            const key = `${pid}|${cid}`;
            replyUnsubs[key]?.();
            delete replyUnsubs[key];
            delete replyCounts[key];
          }
        }
        for (const cid of newIds) {
          const key = `${pid}|${cid}`;
          if (!replyUnsubs[key]) {
            replyUnsubs[key] = onSnapshot(
              collection(db, "album", pid, "comments", cid, "replies"),
              (rSnap) => {
                replyCounts[key] = rSnap.size;
                recompute();
              },
            );
          }
        }
        recompute();
      }),
    );

    return () => {
      commentUnsubs.forEach((u) => u());
      Object.values(replyUnsubs).forEach((u) => u());
    };
  }, [photoIdsKey]);

  useEffect(() => {
    if (!viewer) return;
    const match = photos.find((p) => p.id === viewer.id);
    if (match && match !== viewer) setViewer(match);
    if (!match) setViewer(null);
  }, [photos, viewer]);

  // iOS-compatible body scroll lock — covers all three modals on this
  // page (photo viewer, upload form, member picker). Counter inside the
  // hook handles overlap so opening the picker from inside the upload
  // form doesn't double-restore. The string tag surfaces in the debug
  // banner ('언쏘' only) so we can tell which call (de)activated the lock.
  useModalBodyLock(!!viewer, "viewer");
  useModalBodyLock(uploadOpen, "upload");
  useModalBodyLock(pickerOpen, "picker");

  useEffect(() => {
    const q = query(collection(db, "album"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AlbumPhoto,
      );
      list.sort((a, b) => {
        const ak = photoSortKey(a);
        const bk = photoSortKey(b);
        if (ak !== bk) return ak < bk ? 1 : -1;
        const at = a.createdAt?.toMillis() ?? 0;
        const bt = b.createdAt?.toMillis() ?? 0;
        return bt - at;
      });
      setPhotos(list);
    });
    return () => unsub();
  }, []);

  const openUpload = () => {
    if (!loginNick) {
      alert("로그인이 필요합니다.");
      return;
    }
    setUploadOpen(true);
    setFile(null);
    setCaption("");
    setPeople([]);
    setPhotoDate(todayISO());
  };

  const removePerson = (v: string) => {
    setPeople((p) => p.filter((n) => n !== v));
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!loginNick) {
      alert("로그인이 필요합니다.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".")
        ? file.name.substring(file.name.lastIndexOf("."))
        : "";
      const filename = `${Date.now()}${ext}`;
      const storageRef = ref(storage, `album/${filename}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // photographer auto-set to login nickname (per 2026-04-29 redesign).
      // Existing badge dispatch (`handleEvent` below) keys off this field
      // so the shape stays identical — just sourced from auth instead of
      // a manual input.
      const newRef = await addDoc(collection(db, "album"), {
        imageUrl: url,
        caption: caption.trim(),
        photographer: loginNick,
        people,
        photoDate: photoDate || todayISO(),
        fileType: detectFileType(file),
        createdAt: serverTimestamp(),
      });
      setUploadOpen(false);
      await logActivity(
        "album",
        "",
        "새 앨범 사진이 업로드되었습니다",
        `/album?photo=${newRef.id}`,
        `album/${newRef.id}`,
      );
      handleEvent({
        type: "photo",
        nickname: loginNick,
        people,
        photographer: loginNick,
        when: new Date(),
        source: "album",
      });
    } catch (e) {
      console.error(e);
      alert("업로드 실패");
    }
    setUploading(false);
  };

  return (
    <div className="album-content">
      <div className="album-head">
        <h1 className="album-title">앨범</h1>
        <button className="minihome-btn minihome-btn-small" onClick={openUpload}>
          사진 올리기
        </button>
      </div>

      {photos.length === 0 ? (
        <p className="minihome-hint">아직 사진이 없습니다.</p>
      ) : (
        <div className="album-grid">
          {paged.map((p) => {
            const count = commentCounts[p.id] ?? 0;
            return (
              <div key={p.id} className="album-photo-card">
                <button
                  type="button"
                  className="minihome-photo-item"
                  onClick={() => setViewer(p)}
                >
                  {resolveFileType(p) === "video" ? (
                    <video
                      src={p.imageUrl}
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={p.imageUrl} alt={p.caption || "photo"} />
                  )}
                </button>
                <div className="album-photo-info">
                  {p.photoDate && (
                    <div className="album-photo-date">{formatPhotoDate(p.photoDate)}</div>
                  )}
                  {p.photographer && (
                    <div className="album-photo-by">photo by {p.photographer}</div>
                  )}
                  {p.people && p.people.length > 0 && (
                    <div className="album-photo-people">
                      {p.people.map((person) => (
                        <span key={person} className="album-photo-person">
                          {person}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.caption && (
                    <div className="album-photo-caption-text">{p.caption}</div>
                  )}
                  {count > 0 && (
                    <div className="album-photo-comment-count">댓글 {count}개</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination — verbatim copy of Guestbook/AdventureLog. */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-5 font-serif text-[11px] tracking-wider text-text-sub">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-stardust">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="다음 페이지"
          >
            다음 →
          </button>
        </div>
      )}

      {uploadOpen && typeof document !== "undefined" && createPortal(
        <div className="minihome-modal" onClick={() => setUploadOpen(false)}>
          <div
            className="minihome-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="minihome-modal-title">사진 업로드</h3>
            <input
              type="file"
              accept="image/*,video/mp4,.gif"
              className="minihome-file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label className="album-date-label">
              <span className="album-date-label-text">촬영 날짜</span>
              <input
                type="date"
                className="minihome-input"
                value={photoDate}
                onChange={(e) => setPhotoDate(e.target.value)}
                max={todayISO()}
              />
            </label>
            <input
              className="minihome-input"
              placeholder="설명 (선택)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
            />
            <div className="album-people-input">
              {people.length > 0 && (
                <div className="album-tags">
                  {people.map((p) => (
                    <span key={p} className="album-tag">
                      {p}
                      <button
                        type="button"
                        className="album-tag-remove"
                        onClick={() => removePerson(p)}
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
                onClick={() => setPickerOpen(true)}
              >
                + 출연자 추가
              </button>
            </div>
            <div className="minihome-modal-actions">
              <button
                className="minihome-btn"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? "업로드 중..." : "업로드"}
              </button>
              <button
                className="minihome-btn minihome-btn-cancel"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
              >
                취소
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {pickerOpen && (
        <MemberPickerModal
          initial={people}
          onClose={() => setPickerOpen(false)}
          onDone={(sel) => {
            setPeople(sel);
            setPickerOpen(false);
          }}
        />
      )}

      {viewer && (
        <AlbumPhotoViewer
          photo={viewer}
          loginNick={loginNick}
          onClose={() => {
            setViewer(null);
            setAutoOpenCommentId(null);
          }}
          targetCommentId={autoOpenCommentId}
        />
      )}
    </div>
  );
}

// Member picker — search-filtered, multi-select list of guild member
// nicknames pulled from `users/*` (filter by `password` field per the
// users-schema convention: signups have a password, placeholders don't).
// Includes the special "우리 길원들" / "기타" entries so users can tag
// the whole guild or "other" without picking individual members.
const SPECIAL_TAGS = ["우리 길원들", "기타"];

function MemberPickerModal({
  initial,
  onClose,
  onDone,
}: {
  initial: string[];
  onClose: () => void;
  onDone: (selected: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const nicks = snap.docs
          .filter((d) => typeof d.data().password === "string")
          .map((d) => d.id);
        const all = [...nicks, ...SPECIAL_TAGS];
        // Sort: English block first (a-z), then Korean (가나다…). Within
        // each block we use the matching locale collator so case and
        // jamo composition follow standard alphabet order. "기타" /
        // "우리 길원들" fall into the Korean block at their natural
        // alphabetical positions.
        const isKorean = (s: string) => /^[ㄱ-ㆎ가-힯]/.test(s);
        all.sort((a, b) => {
          const aK = isKorean(a);
          const bK = isKorean(b);
          if (aK !== bK) return aK ? 1 : -1;
          return a.localeCompare(b, aK ? "ko-KR" : "en");
        });
        if (!cancelled) setMembers(all);
      } catch (e) {
        console.error(e);
        if (!cancelled) setMembers([...SPECIAL_TAGS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.toLowerCase().includes(q));
  }, [members, search]);

  const toggle = (n: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  // Portal-mount — see AlbumPhotoViewer above. Same trap.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="minihome-modal" onClick={onClose}>
      <div
        className="minihome-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <h3 className="minihome-modal-title">출연자 선택</h3>
        <input
          className="minihome-input"
          placeholder="닉네임 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            margin: "8px 0",
            border: "1px solid rgba(216,150,200,0.18)",
            borderRadius: 8,
          }}
        >
          {filtered.length === 0 ? (
            <p
              style={{
                padding: 24,
                textAlign: "center",
                fontStyle: "italic",
                fontSize: 12,
                color: "rgba(200,168,233,0.7)",
              }}
            >
              일치하는 닉네임이 없어요
            </p>
          ) : (
            filtered.map((n) => {
              const checked = selected.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggle(n)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    background: checked
                      ? "rgba(255,181,167,0.12)"
                      : "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(216,150,200,0.08)",
                    cursor: "pointer",
                    color: checked ? "#FFE5C4" : "rgba(200,168,233,0.85)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <span style={{ width: 18 }}>{checked ? "☑" : "☐"}</span>
                  <span style={{ flex: 1 }}>{n}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="minihome-modal-actions">
          <button
            className="minihome-btn"
            onClick={() => onDone(Array.from(selected))}
          >
            완료{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          <button className="minihome-btn minihome-btn-cancel" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AlbumPhotoViewer({
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

  // ── Debug banner ('언쏘' only) ──
  // Captures the timeline of deep-link comment scroll: effect entry,
  // tryScroll attempts, modal scroll events, and scrollTop snapshots
  // at +100/+300/+500/+1000/+2000 ms after mount. Goal is to catch what
  // is resetting modal.scrollTop back to 0 right after the scroll lands.
  const isDebug = loginNick === "언쏘";
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [debugMsgs, setDebugMsgs] = useState<string[]>([]);
  const addDebug = useCallback(
    (msg: string) => {
      if (!isDebug) return;
      const stamp =
        typeof performance !== "undefined"
          ? `+${Math.round(performance.now()) % 100000}`.padStart(7, " ")
          : new Date().toISOString().slice(14, 23);
      setDebugMsgs((prev) => [...prev, `${stamp} ${msg}`].slice(-80));
    },
    [isDebug],
  );

  // Subscribe to lock/unlock events from useModalBodyLock — surfaces
  // every counter transition + body inline-style snapshot to the banner.
  useEffect(() => {
    if (!isDebug) return;
    return registerModalLockDebug(addDebug);
  }, [isDebug, addDebug]);

  // Track viewer-component mount/unmount cycles. If lock is being unset
  // because the component remounts (and counter cycles 1→0→1), this
  // pair tells us how often.
  useEffect(() => {
    if (!isDebug) return;
    addDebug(`[viewer mount] photoId=${photo.id}`);
    return () => addDebug(`[viewer unmount] photoId=${photo.id}`);
  }, [isDebug, addDebug, photo.id]);

  const markScrollResolved = useCallback(() => {
    if (isDebug) {
      const m = modalRef.current;
      const stamp =
        typeof performance !== "undefined"
          ? `+${Math.round(performance.now()) % 100000}`.padStart(7, " ")
          : new Date().toISOString().slice(14, 23);
      setDebugMsgs((prev) =>
        [...prev, `${stamp} markScrollResolved sT=${m?.scrollTop}`].slice(-50),
      );
    }
    setScrollPending(false);
  }, [isDebug]);

  // Scroll listener — records every scrollTop change so we can spot
  // whoever resets it back to 0 after the deep-link jump.
  useEffect(() => {
    if (!isDebug) return;
    const modal = modalRef.current;
    if (!modal) return;
    const onModalScroll = () => addDebug(`MODAL scroll sT=${modal.scrollTop}`);
    const onWinScroll = () =>
      addDebug(`WIN scroll y=${window.scrollY}`);
    const onDocScroll = () => {
      const se = document.scrollingElement as HTMLElement | null;
      addDebug(
        `DOC scroll seTag=${se?.tagName ?? "?"} seSt=${se?.scrollTop ?? "?"}`,
      );
    };
    modal.addEventListener("scroll", onModalScroll, { passive: true });
    window.addEventListener("scroll", onWinScroll, { passive: true });
    document.addEventListener("scroll", onDocScroll, { passive: true });

    // One-shot structure dump: which element actually owns the scroll?
    const html = document.documentElement;
    const body = document.body;
    const se = document.scrollingElement as HTMLElement | null;
    const parent = modal.parentElement;
    addDebug(
      `mount sT=${modal.scrollTop} sH=${modal.scrollHeight} cH=${modal.clientHeight}`,
    );
    addDebug(
      `modal tag=${modal.tagName} class="${modal.className}" parent=${parent?.tagName} children=${modal.childElementCount}`,
    );
    Array.from(modal.children).forEach((child, i) => {
      const c = child as HTMLElement;
      addDebug(
        `  child[${i}] ${c.tagName}.${(c.className || "").slice(0, 40)} sH=${c.scrollHeight} cH=${c.clientHeight} oH=${c.offsetHeight}`,
      );
    });
    addDebug(
      `html sH=${html.scrollHeight} cH=${html.clientHeight} sT=${html.scrollTop}`,
    );
    addDebug(
      `body sH=${body.scrollHeight} cH=${body.clientHeight} sT=${body.scrollTop} pos=${getComputedStyle(body).position}`,
    );
    addDebug(
      `scrollingEl tag=${se?.tagName ?? "?"} sH=${se?.scrollHeight ?? "?"} cH=${se?.clientHeight ?? "?"} sT=${se?.scrollTop ?? "?"}`,
    );
    addDebug(
      `vw=${window.innerWidth} vh=${window.innerHeight} winScrollY=${window.scrollY}`,
    );
    const cs = getComputedStyle(modal);
    addDebug(
      `modal css: pos=${cs.position} top=${cs.top} bot=${cs.bottom} h=${cs.height} ovY=${cs.overflowY}`,
    );
    addDebug(
      `body inline pos="${body.style.position}" top="${body.style.top}" overflow="${body.style.overflow}"`,
    );

    // Card structure dump — explains why oH might be smaller than the
    // expected photo+caption+comments stack.
    const card = cardRef.current;
    if (card) {
      addDebug(
        `card oH=${card.offsetHeight} sH=${card.scrollHeight} cH=${card.clientHeight} children=${card.childElementCount}`,
      );
      Array.from(card.children).forEach((child, i) => {
        const c = child as HTMLElement;
        const cls = (c.className || "").toString().slice(0, 35);
        addDebug(
          `  card[${i}] ${c.tagName}.${cls} oH=${c.offsetHeight}`,
        );
      });
    } else {
      addDebug("card ref NOT bound at mount snapshot");
    }

    return () => {
      modal.removeEventListener("scroll", onModalScroll);
      window.removeEventListener("scroll", onWinScroll);
      document.removeEventListener("scroll", onDocScroll);
    };
  }, [isDebug, addDebug]);

  // Periodic snapshots — independent of any scroll handler, so we see
  // scrollTop drift even when no scroll event fires.
  useEffect(() => {
    if (!isDebug || !targetCommentId) return;
    const modal = modalRef.current;
    if (!modal) return;
    const stamps = [50, 150, 300, 500, 800, 1200, 2000, 3000];
    const handles = stamps.map((ms) =>
      setTimeout(() => {
        const html = document.documentElement;
        const body = document.body;
        const card = cardRef.current;
        addDebug(
          `t+${ms} mod[sT=${modal.scrollTop} sH=${modal.scrollHeight}] card[oH=${card?.offsetHeight ?? "?"}] body[pos="${body.style.position}" sH=${body.scrollHeight}] html[sT=${html.scrollTop}]`,
        );
      }, ms),
    );
    return () => handles.forEach((h) => clearTimeout(h));
  }, [isDebug, targetCommentId, addDebug]);

  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  const [editPhotographer, setEditPhotographer] = useState(photo.photographer);
  const [editPeople, setEditPeople] = useState<string[]>(photo.people ?? []);
  const [editPeopleInput, setEditPeopleInput] = useState("");
  const [editPhotoDate, setEditPhotoDate] = useState<string>(
    photo.photoDate || todayISO(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Owner check — edit/delete only available to the original uploader.
  // Admins can still delete via the Firebase console; the in-app
  // password gate has been retired (2026-04-29).
  const isOwner = !!loginNick && photo.photographer === loginNick;

  const startEdit = () => {
    setEditCaption(photo.caption);
    setEditPhotographer(photo.photographer);
    setEditPeople(photo.people ?? []);
    setEditPeopleInput("");
    setEditPhotoDate(photo.photoDate || todayISO());
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditPeopleInput("");
  };

  const addEditPerson = () => {
    const v = editPeopleInput.trim();
    if (!v) return;
    if (editPeople.includes(v)) {
      setEditPeopleInput("");
      return;
    }
    setEditPeople((p) => [...p, v]);
    setEditPeopleInput("");
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
      className="minihome-modal"
      onClick={onClose}
    >
      {isDebug && (
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            maxHeight: "75vh",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background: "rgba(0,0,0,0.92)",
            color: "#FFE5C4",
            fontSize: 8,
            fontFamily: "ui-monospace, monospace",
            padding: "3px 4px",
            zIndex: 99999,
            lineHeight: 1.2,
            border: "1px solid rgba(216,150,200,0.5)",
            borderRadius: 0,
            whiteSpace: "pre-wrap",
            pointerEvents: "auto",
          }}
        >
          <div style={{ color: "#FFB5A7", marginBottom: 1, fontSize: 9 }}>
            [debug {debugMsgs.length}] target={String(targetCommentId)}
          </div>
          {debugMsgs.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
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
            onLoadedData={() =>
              addDebug(`video loadedData sT=${modalRef.current?.scrollTop}`)
            }
          />
        ) : (
          <img
            src={photo.imageUrl}
            alt={photo.caption || "photo"}
            onLoad={() =>
              addDebug(`img onLoad sT=${modalRef.current?.scrollTop}`)
            }
          />
        )}
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
            <input
              className="minihome-input"
              placeholder="설명"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
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
              <input
                className="minihome-input"
                placeholder="출연자 (엔터로 추가)"
                value={editPeopleInput}
                onChange={(e) => setEditPeopleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addEditPerson();
                  }
                }}
                maxLength={30}
              />
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
              <p className="minihome-photo-caption">{photo.caption}</p>
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

        <AlbumCommentsSection
          photoId={photo.id}
          loginNick={loginNick}
          targetCommentId={targetCommentId}
          modalRef={modalRef}
          markScrollResolved={markScrollResolved}
          addDebug={addDebug}
        />
      </div>
    </div>,
    document.body,
  );
}

function AlbumCommentsSection({
  photoId,
  loginNick,
  targetCommentId,
  modalRef,
  markScrollResolved,
  addDebug,
}: {
  photoId: string;
  loginNick: string | null;
  targetCommentId?: string | null;
  modalRef?: React.RefObject<HTMLDivElement | null>;
  markScrollResolved?: () => void;
  addDebug?: (msg: string) => void;
}) {
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});

  // Debug: comments-section mount/unmount + every length change. Helps
  // distinguish "card is short because comments haven't arrived yet"
  // from "comments arrived but card still measures 396 px".
  useEffect(() => {
    addDebug?.(`[comments mount] initial length=${comments.length}`);
    return () => addDebug?.(`[comments unmount]`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDebug]);
  useEffect(() => {
    addDebug?.(`[comments] length=${comments.length}`);
  }, [comments, addDebug]);

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
    addDebug?.(
      `effect entry: target=${targetCommentId} comments=${comments.length} lastHandled=${lastHandledRef.current}`,
    );
    if (lastHandledRef.current === targetCommentId) {
      addDebug?.("  skip: already handled");
      return;
    }
    if (comments.length === 0) {
      addDebug?.("  skip: comments empty (waits for snapshot)");
      return;
    }
    if (!comments.some((c) => c.id === targetCommentId)) {
      addDebug?.("  skip: target not in list");
      return;
    }

    let retryHandle: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const target = itemRefs.current.get(targetCommentId);
      const modal = modalRef?.current;
      addDebug?.(
        `tryScroll #${attempt} target=${!!target} modal=${!!modal}`,
      );
      if (!target || !modal) {
        if (attempt >= 5) {
          addDebug?.("  give up after 5 retries");
          lastHandledRef.current = targetCommentId;
          markScrollResolved?.();
          return;
        }
        retryHandle = setTimeout(() => tryScroll(attempt + 1), 50);
        return;
      }
      lastHandledRef.current = targetCommentId;
      // No scrollable space → nothing to scroll, no whitespace risk.
      // Covers the desktop / large-screen fits-everything case.
      if (modal.scrollHeight <= modal.clientHeight) {
        addDebug?.(
          `  fits: sH=${modal.scrollHeight} cH=${modal.clientHeight} — no scroll`,
        );
        markScrollResolved?.();
        return;
      }
      const modalRect = modal.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetWithinModal =
        targetRect.top - modalRect.top + modal.scrollTop;
      const newScrollTop = Math.max(0, offsetWithinModal - 100);
      addDebug?.(
        `  set sT ${modal.scrollTop}→${newScrollTop} (tgtTop=${Math.round(targetRect.top)} mdTop=${Math.round(modalRect.top)} sH=${modal.scrollHeight} cH=${modal.clientHeight})`,
      );
      // Land 100 px below the modal top to clear the close button.
      // Browser auto-clamps to the legal scroll range (no whitespace
      // past the bottom).
      modal.scrollTop = newScrollTop;
      addDebug?.(`  after assign: modal.scrollTop=${modal.scrollTop}`);
      markScrollResolved?.();
    };

    const t = setTimeout(() => tryScroll(1), 100);
    return () => {
      cancelled = true;
      if (retryHandle) clearTimeout(retryHandle);
      clearTimeout(t);
    };
  }, [targetCommentId, comments, modalRef, markScrollResolved, addDebug]);

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
      await logActivity(
        "album_comment",
        loginNick,
        "앨범에 새 댓글이 달렸습니다",
        `/album?photo=${photoId}&comment=${commentRef.id}`,
        `album/${photoId}/comments/${commentRef.id}`,
      );
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
        <div className="minihome-form minihome-form-inline cbar">
          <input
            className="minihome-input"
            placeholder="댓글을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
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
  const [replies, setReplies] = useState<AlbumComment[]>([]);
  const [msg, setMsg] = useState("");
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
      await logActivity(
        "album_comment",
        loginNick,
        "앨범에 새 댓글이 달렸습니다",
        `/album?photo=${photoId}&comment=${comment.id}`,
        `album/${photoId}/comments/${comment.id}/replies/${replyRef.id}`,
      );
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
    <div ref={setItemRef} className="minihome-photo-comment-block">
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
        <NicknameLink nickname={comment.nickname} className="minihome-gb-nick" />
        <span className="minihome-gb-msg">: {comment.content}</span>
      </div>
      {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
      {(replies.length > 0 || replyOpen) && (
        <div className="minihome-gb-replies">
          {replies.map((r) => (
            <div key={r.id} className="minihome-gb-reply">
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
                <NicknameLink nickname={r.nickname} className="minihome-gb-nick" prefix="↳ " />
                <span className="minihome-gb-msg">: {r.content}</span>
              </div>
              {r.imageUrl && <CommentImageView url={r.imageUrl} />}
            </div>
          ))}
          {replyOpen && loginNick && (
            <div className="minihome-form minihome-form-inline cbar">
              <input
                className="minihome-input"
                placeholder="대댓글"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
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
          )}
        </div>
      )}
    </div>
  );
}
