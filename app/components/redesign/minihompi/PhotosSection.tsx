"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Upload, X } from "lucide-react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";
import { useBackdropClose } from "@/src/lib/useBackdropClose";
import { CollapsibleSection } from "./CollapsibleSection";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import {
  PhotoViewerModal,
  resolveFileType,
  type MediaKind,
  type PhotoEntry,
} from "@/app/components/shared/MinihomePhotoViewer";

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

export function PhotosSection({
  id,
  isOwner,
  loginNick,
  memberNickname,
}: {
  id: string;
  isOwner: boolean;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  // Belt-and-suspenders: page.tsx 가 dl2 일 때 PhotosSectionD2 로
  // 분기하지만, 어떤 사유 (SSR/CSR mismatch / hydration race / 사용자
  // 본 빌드 = 이전 commit) 로 cosmic PhotosSection 이 dl2 사용자에게
  // 렌더되는 케이스 발견. 이 경우에도 사진 올리기 버튼 색만이라도
  // dl2 톤으로 보장. cosmic 사용자 (useDawnlight2 false) 는 그대로.
  const dl2 = useDawnlight2();
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewer, setViewer] = useState<PhotoEntry | null>(null);
  // Deep-link target comment id. When the viewer is opened from a
  // /members/<id>?photo=<pid>&comment=<cid> link the modal forwards
  // this to PhotoComments which then scrolls to the comment after the
  // photo + first firestore snapshot land.
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const autoOpenedRef = useRef(false);

  // Pagination — 12 photos per page (3 cols × 4 rows on sm+, scales
  // 2 cols × 6 rows on mobile / 4 cols × 3 rows on lg). Same prev/next
  // pattern as Guestbook / AdventureLog.
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = photos.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    const q = query(
      collection(db, "members", id, "photos"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoEntry[],
      );
    });
    return () => unsub();
  }, [id]);

  // Auto-open modal from ?photo= URL param. Optionally pass through a
  // ?comment= target id which the viewer's PhotoComments will scroll to
  // after the photo decodes + first firestore snapshot lands.
  //
  // Order matters: the page scroll to #minihome-photos must commit
  // BEFORE setViewer mounts the modal. Otherwise useModalBodyLock's
  // `lock()` captures `window.scrollY = 0` and the page snaps back to
  // top on modal close. We scroll first, then defer setViewer to the
  // next animation frame so the browser has a chance to paint the new
  // scrollY before lock() reads it.
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
      autoOpenedRef.current = true;
      const sectionEl = document.getElementById("minihome-photos");
      if (sectionEl) {
        // Brute-force scroll with multiple methods (Mobile Safari
        // sometimes ignores scrollIntoView in deep-link timing).
        const rect = sectionEl.getBoundingClientRect();
        const targetY = Math.max(0, Math.round(rect.top + window.scrollY));
        window.scrollTo(0, targetY);
        document.documentElement.scrollTop = targetY;
        document.body.scrollTop = targetY;
      }
      const cid = params.get("comment");
      // 800 ms — 100 ms past the page-level 700 ms reveal so the
      // user perceives the photos section + modal arriving together.
      // Brute-force scrollTo above commits synchronously on every
      // browser we tested, so 800 ms is enough headroom for
      // useModalBodyLock to read the post-scroll scrollY without
      // making the modal feel late.
      setTimeout(() => {
        setViewer(target);
        setTargetCommentId(cid);
      }, 800);
    }
  }, [photos]);

  // Keep viewer in sync with latest photo data; close if deleted
  useEffect(() => {
    if (!viewer) return;
    const match = photos.find((p) => p.id === viewer.id);
    if (match && match !== viewer) setViewer(match);
    if (!match) setViewer(null);
  }, [photos, viewer]);

  // iOS-compatible body scroll lock for the viewer + upload modals.
  useModalBodyLock(!!viewer);
  useModalBodyLock(uploadOpen);

  // Nested onSnapshot for comment+reply counts per photo
  const photoIdsKey = useMemo(
    () => photos.map((p) => p.id).sort().join(","),
    [photos],
  );
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

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
      onSnapshot(
        collection(db, "members", id, "photos", pid, "comments"),
        (snap) => {
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
                collection(
                  db,
                  "members",
                  id,
                  "photos",
                  pid,
                  "comments",
                  cid,
                  "replies",
                ),
                (rSnap) => {
                  replyCounts[key] = rSnap.size;
                  recompute();
                },
              );
            }
          }
          recompute();
        },
      ),
    );

    return () => {
      commentUnsubs.forEach((u) => u());
      Object.values(replyUnsubs).forEach((u) => u());
    };
  }, [photoIdsKey, id]);

  return (
    <>
      <CollapsibleSection
        title="사진첩"
        rightSlot={
          <div className="flex items-center gap-3">
            <span>{photos.length}개</span>
            {isOwner && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUploadOpen(true);
                }}
                className={
                  dl2
                    ? "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors"
                    : "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02]"
                }
                style={
                  dl2
                    ? { background: "#ffd4b8", color: "#5c3a1f" }
                    : {
                        background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                        boxShadow: "0 0 10px rgba(255,181,167,0.5)",
                      }
                }
                onMouseEnter={
                  dl2
                    ? (e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background =
                          "#fef5e6")
                    : undefined
                }
                onMouseLeave={
                  dl2
                    ? (e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background =
                          "#ffd4b8")
                    : undefined
                }
              >
                <Upload className="h-3 w-3" />
                사진 올리기
              </button>
            )}
          </div>
        }
        defaultOpen
      >
        {photos.length === 0 ? (
          <p className="py-10 text-center font-serif text-xs italic text-text-sub/70">
            {isOwner
              ? "아직 사진이 없습니다. 첫 사진을 올려보세요."
              : "아직 사진이 없습니다."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {paged.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  index={i}
                  commentCount={commentCounts[p.id] ?? 0}
                  onOpen={() => setViewer(p)}
                />
              ))}
            </div>

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
          </>
        )}
      </CollapsibleSection>

      <AnimatePresence>
        {uploadOpen && (
          <UploadModal
            memberId={id}
            loginNick={loginNick}
            memberNickname={memberNickname}
            onClose={() => setUploadOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewer && (
          <PhotoViewerModal
            memberId={id}
            photo={viewer}
            loginNick={loginNick}
            isOwner={isOwner}
            memberNickname={memberNickname}
            targetCommentId={targetCommentId}
            onClose={() => {
              setViewer(null);
              setTargetCommentId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PhotoTile({
  photo,
  index,
  commentCount,
  onOpen,
}: {
  photo: PhotoEntry;
  index: number;
  commentCount: number;
  onOpen: () => void;
}) {
  const kind = resolveFileType(photo);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative aspect-square overflow-hidden rounded-xl bg-abyss-deep"
      style={{ border: "1px solid rgba(216,150,200,0.2)" }}
      aria-label={`사진: ${photo.caption || "제목 없음"}`}
    >
      {kind === "video" ? (
        <video
          src={photo.imageUrl}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.imageUrl}
          alt={photo.caption || "photo"}
          className="h-full w-full object-cover"
          draggable={false}
        />
      )}

      {/* Comment badge */}
      {commentCount > 0 && (
        <span
          className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 font-serif text-[10px] text-stardust backdrop-blur-md"
          style={{
            background: "rgba(11,8,33,0.6)",
            border: "1px solid rgba(216,150,200,0.25)",
          }}
        >
          <MessageCircle className="h-3 w-3" aria-hidden />
          {commentCount}
        </span>
      )}

      {/* Hover overlay */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "rgba(11,8,33,0.5)" }}
      >
        <span className="font-serif text-[11px] tracking-[0.3em] text-stardust uppercase">
          크게 보기
        </span>
      </span>
    </motion.button>
  );
}

function UploadModal({
  memberId,
  loginNick,
  memberNickname,
  onClose,
}: {
  memberId: string;
  loginNick: string | null;
  memberNickname: string | null;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const backdropHandlers = useBackdropClose(onClose, !uploading);
  const filePreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, uploading]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.includes(".")
        ? file.name.substring(file.name.lastIndexOf("."))
        : "";
      const filename = `${Date.now()}${ext}`;
      const storageRef = ref(storage, `members/${memberId}/photos/${filename}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newRef = await addDoc(
        collection(db, "members", memberId, "photos"),
        {
          imageUrl: url,
          caption: caption.trim(),
          fileType: detectFileType(file),
          createdAt: serverTimestamp(),
        },
      );
      const actor = memberNickname ?? loginNick ?? "";
      if (actor) {
        await logActivity(
          "photo",
          actor,
          `${actor}님의 사진첩에 사진이 올라왔어요`,
          `/members/${memberId}?photo=${newRef.id}`,
          `members/${memberId}/photos/${newRef.id}`,
        );
      }
      await addPoints(loginNick, "사진", 2, "미니홈피 사진첩에 사진 업로드");
      onClose();
    } catch (e) {
      console.error(e);
      alert("업로드 실패");
      setUploading(false);
    }
  };

  // Portal-mount so the modal escapes the parent .minihome z-10
  // stacking-context trap. AnimatePresence at the call site still
  // drives exit animations via presence context (Portal preserves
  // the React tree).
  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center"
      {...backdropHandlers}
      style={{
        background: "rgba(11,8,33,0.8)",
        backdropFilter: "blur(10px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="사진 업로드"
    >
      <motion.div
        initial={{ scale: 0.95, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 12, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl p-6"
        style={{
          background: "rgba(26, 15, 61, 0.92)",
          border: "1px solid rgba(216,150,200,0.3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(107,75,168,0.4)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20 disabled:opacity-50"
          style={{
            background: "rgba(11,8,33,0.6)",
            border: "1px solid rgba(216,150,200,0.3)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        <h3
          className="font-serif text-base tracking-wider"
          style={{
            backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          사진 업로드
        </h3>

        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-4 py-6 text-center transition-colors hover:border-nebula-pink/50"
          style={{
            background: "rgba(11,8,33,0.4)",
            border: "1px dashed rgba(216,150,200,0.3)",
          }}
        >
          {filePreview ? (
            detectFileType(file!) === "video" ? (
              <video
                src={filePreview}
                muted
                playsInline
                preload="metadata"
                className="max-h-48 w-full rounded-lg object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={filePreview}
                alt="미리보기"
                className="max-h-48 w-full rounded-lg object-contain"
              />
            )
          ) : (
            <>
              <Upload className="h-6 w-6 text-nebula-pink/80" aria-hidden />
              <span className="font-serif text-[12px] italic text-text-sub">
                클릭해서 파일 선택 (이미지 / GIF / MP4)
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*,video/mp4,.gif"
            className="hidden"
            disabled={uploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="설명 (선택)"
          maxLength={120}
          disabled={uploading}
          className="w-full rounded-full border border-nebula-pink/25 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 rounded-full px-4 py-2 font-serif text-[12px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 12px rgba(255,181,167,0.5)",
            }}
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-4 py-2 font-serif text-[12px] tracking-wider text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

