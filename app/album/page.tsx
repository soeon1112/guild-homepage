"use client";

import { useEffect, useRef, useState } from "react";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { handleEvent } from "@/src/lib/badgeCheck";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";
import { useBackdropClose } from "@/src/lib/useBackdropClose";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import {
  AlbumPhotoViewer,
  formatPhotoDate,
  photoSortKey,
  resolveFileType,
  todayISO,
  type AlbumPhoto,
  type MediaKind,
} from "@/app/components/shared/AlbumPhotoViewer";
import { MemberPickerModal } from "@/app/components/shared/MemberPickerModal";

// Dawnlight 2 ink-blue paper palette — same tokens used by
// PaperPlaneLetters / CabinLogs / NoteToTheSky so the album cards read
// as part of the same paper-stationery family.
const DL2_NAVY = "#2a4570";
const DL2_NAVY_SOFT = "#5a7090";
const DL2_CREAM = "#fef5e6";
const DL2_INK_BROWN = "#5c3a1f";
const DL2_CORAL = "#b85420";
const DL2_PAPER_BG = "rgba(205, 216, 224, 0.65)";
const DL2_PAPER_BORDER = "rgba(42, 69, 112, 0.18)";
// Album card — cream-tint translucent surface (matches the 길드원
// member card pattern) so the photo + meta read as one cream-on-
// twilight family rather than the paper-plane navy pair below.
const DL2_GRID_CARD_BG = "rgba(254, 245, 230, 0.12)";
const DL2_GRID_CARD_BORDER = "rgba(254, 245, 230, 0.25)";
// Album meta hierarchy (used by both grid + modal so they read as
// the same surface):
//   · 날짜       — cream 0.7  regular
//   · photo by   — #ffd9a6 (옅은 황금빛) italic semibold
//   · 출연자 칩  — cream bg + ink-brown text, NO border
//   · 본문 / 제목 — cream weight 700 (가장 또렷)
//   · 댓글 카운트 — cream 0.6  regular
const DL2_META_DATE = "rgba(254, 245, 230, 0.7)";
const DL2_META_PHOTOG = "#ffd9a6";
const DL2_META_TITLE = DL2_CREAM;
const DL2_META_COMMENT = "rgba(254, 245, 230, 0.6)";
// Person chip — cream pill, ink-brown text, no border.
const DL2_CHIP_BG = DL2_CREAM;
const DL2_CHIP_TEXT = DL2_INK_BROWN;

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

export default function AlbumPage() {
  const { nickname: loginNick } = useAuth();
  // Step 4-G: 언쏘만 dl2 앨범 — page size + grid layout + card surface
  // + upload button + title all branch on this. Cosmic users keep the
  // existing 4-col / 20-per-page layout byte-identical.
  const isDawnlight2 = useDawnlight2();
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [viewer, setViewer] = useState<AlbumPhoto | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  // 멘션 자동완성용 cursor 추적.
  const [captionMentionCursor, setCaptionMentionCursor] = useState<
    number | null
  >(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [photoDate, setPhotoDate] = useState<string>(todayISO());
  const [uploading, setUploading] = useState(false);
  const uploadBackdropHandlers = useBackdropClose(
    () => setUploadOpen(false),
    !uploading,
  );
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
  // GuestbookSection / AdventureLogSection. Cosmic shows 20 / page;
  // dl2 shows 12 (3 × 4 grid). User-scoped via isDawnlight2 so every
  // 우주 사용자 still gets the 5-row layout.
  const PAGE_SIZE = isDawnlight2 ? 12 : 20;
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
  // form doesn't double-restore.
  useModalBodyLock(!!viewer);
  useModalBodyLock(uploadOpen);
  useModalBodyLock(pickerOpen);

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
        loginNick ?? "",
        loginNick
          ? `${loginNick}님이 앨범에 사진을 올렸어요`
          : "앨범에 사진이 올라왔어요",
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

  // Modals (upload, picker, viewer) are mounted identically for cosmic
  // and dl2. The dl2 surface re-skin for them is the next step (separate
  // commit) — for now both branches mount the existing markup so the
  // upload flow + Firestore writes stay byte-identical.
  const renderModals = () => (
    <>
      {uploadOpen && typeof document !== "undefined" && createPortal(
        <div
          className={isDawnlight2 ? "minihome-modal dl2-album-upload" : "minihome-modal"}
          {...uploadBackdropHandlers}
        >
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
            {/* @-mention 자동완성 — 캡션 input 위 sibling. */}
            <MentionPicker
              text={caption}
              cursor={captionMentionCursor}
              onSelect={(nickname, range) => {
                const result = applyMentionInsert(
                  caption,
                  range.start,
                  range.end,
                  nickname,
                );
                setCaption(result.text);
                setCaptionMentionCursor(result.cursor);
                requestAnimationFrame(() => {
                  if (captionInputRef.current) {
                    captionInputRef.current.focus();
                    captionInputRef.current.setSelectionRange(
                      result.cursor,
                      result.cursor,
                    );
                  }
                });
              }}
              dl2
            />
            <input
              ref={captionInputRef}
              className="minihome-input"
              placeholder="설명 (선택)"
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setCaptionMentionCursor(e.target.selectionStart);
              }}
              onSelect={(e) =>
                setCaptionMentionCursor(e.currentTarget.selectionStart)
              }
              onClick={(e) =>
                setCaptionMentionCursor(e.currentTarget.selectionStart)
              }
              onKeyUp={(e) =>
                setCaptionMentionCursor(e.currentTarget.selectionStart)
              }
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
          dl2={isDawnlight2}
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
    </>
  );

  if (isDawnlight2) {
    return (
      <div className="dl2-album mx-auto w-full max-w-3xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16">
        {/* Header row — title + subtitle on the left, navy 사진 올리기
            pill on the right. Title sizing matches .dl2-notice-page-
            title (Pretendard 20 px semibold cream) so 앨범 / 공지
            게시판 / 게시판 read as a consistent family. */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <header className="min-w-0">
            <h1
              className="text-xl font-semibold leading-tight text-cream"
              style={{
                fontFamily:
                  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
                letterSpacing: "0.02em",
              }}
            >
              앨범
            </h1>
            <p
              className="mt-1 text-[10px] font-medium uppercase tracking-[0.32em] text-mist-lavender"
              style={{
                fontFamily:
                  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              }}
            >
              ALBUM
            </p>
          </header>
          <button
            type="button"
            onClick={openUpload}
            className="shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity active:scale-95 hover:opacity-90"
            style={{ background: DL2_NAVY, color: DL2_CREAM }}
          >
            ✦ 사진 올리기
          </button>
        </div>

        {photos.length === 0 ? (
          <p
            className="py-8 text-center text-sm italic"
            style={{ color: DL2_NAVY_SOFT }}
          >
            아직 사진이 없습니다.
          </p>
        ) : (
          // PC: 3 columns · 4 rows = 12 / page (PAGE_SIZE=12).
          // Mobile: 2 columns. Grid gap 16 px so cards breathe but
          // still feel grouped.
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {paged.map((p) => {
              const count = commentCounts[p.id] ?? 0;
              return (
                <div key={p.id} className="flex flex-col gap-2">
                  {/* Photo tile — no surrounding paper bg/border so
                      the image reads as the card's "front face". The
                      meta panel below carries the paper surface.
                      `p-0` resets the user-agent default button
                      padding (~1px 6px). Without it, the inner
                      `<img class="h-full w-full">` lands inside a
                      padded box and renders shorter than the
                      aspect-square outer button → reads as a
                      letterbox stripe at the top/bottom or
                      left/right edges. Cosmic's `.minihome-photo-
                      item` sets `padding: 0` explicitly for the same
                      reason; the dl2 button missed it. */}
                  <button
                    type="button"
                    onClick={() => setViewer(p)}
                    className="group relative block aspect-square overflow-hidden rounded-2xl border-0 bg-transparent p-0"
                  >
                    {/* Inline `width / height / object-fit` because the
                        Tailwind v4 `@layer utilities` rules (.h-full,
                        .w-full, .object-cover) lose the cascade to the
                        unlayered `img, video { max-width:100%; height:
                        auto }` rule at globals.css:202. Unlayered
                        styles come AFTER all @layer styles in the
                        cascade, so the Tailwind class for height
                        loses despite higher specificity. Inline
                        styles (specificity 1,0,0,0) beat both
                        layered and unlayered rules — bulletproof
                        equivalent of cosmic's `.minihome-photo-item
                        img` rule which is itself unlayered with
                        higher specificity. */}
                    {resolveFileType(p) === "video" ? (
                      <video
                        src={p.imageUrl}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={p.caption || "photo"}
                        className="transition-transform group-hover:scale-[1.02]"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    )}
                  </button>
                  <div
                    className="flex flex-col gap-1.5 rounded-2xl px-3 py-3"
                    style={{
                      background: DL2_GRID_CARD_BG,
                      border: `1px solid ${DL2_GRID_CARD_BORDER}`,
                    }}
                  >
                    {/* Hierarchy (cream-on-twilight family):
                        · 날짜 — cream 0.7 regular
                        · photo by — #ffd9a6 (옅은 황금빛) italic semibold
                        · 출연자 칩 — cream bg + ink-brown text, NO border
                        · 본문 제목 — cream weight 700 (가장 또렷)
                        · 댓글 카운트 — cream 0.6 regular */}
                    {p.photoDate && (
                      <div
                        className="text-[11px] tracking-wider"
                        style={{ color: DL2_META_DATE }}
                      >
                        {formatPhotoDate(p.photoDate)}
                      </div>
                    )}
                    {p.photographer && (
                      <div
                        className="text-[11px] font-semibold italic"
                        style={{ color: DL2_META_PHOTOG }}
                      >
                        photo by {p.photographer}
                      </div>
                    )}
                    {p.people && p.people.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.people.map((person) => (
                          <span
                            key={person}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: DL2_CHIP_BG,
                              color: DL2_CHIP_TEXT,
                            }}
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.caption && (
                      <div
                        className="text-[12.5px] leading-relaxed"
                        style={{ color: DL2_META_TITLE, fontWeight: 700 }}
                      >
                        {p.caption}
                      </div>
                    )}
                    {count > 0 && (
                      <div
                        className="text-[11px] tracking-wider"
                        style={{ color: DL2_META_COMMENT }}
                      >
                        댓글 {count}개
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div
            className="mt-6 flex items-center justify-center gap-5 text-[11px] tracking-wider"
            style={{ color: DL2_NAVY_SOFT }}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="이전 페이지"
              style={{ color: DL2_NAVY_SOFT }}
            >
              ← 이전
            </button>
            <span style={{ color: DL2_NAVY, fontWeight: 600 }}>
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="다음 페이지"
              style={{ color: DL2_NAVY_SOFT }}
            >
              다음 →
            </button>
          </div>
        )}

        {/* Modals (upload, picker, viewer) reuse the cosmic markup
            below so the data flow + Firestore writes stay identical.
            Surface re-skin for them is the next step. */}
        {renderModals()}
      </div>
    );
  }

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

      {renderModals()}
    </div>
  );
}

// Member picker — see `app/components/shared/MemberPickerModal.tsx`.
// Originally defined here as an inline private component; extracted on
// 2026-05-08 so the album viewer's edit form can mount the same picker
// (single source of truth for "add 출연자" UX in album).

