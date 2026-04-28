"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Upload, X } from "lucide-react";
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
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
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
import { CollapsibleSection } from "./CollapsibleSection";

type MediaKind = "image" | "video" | "gif";

type PhotoEntry = {
  id: string;
  imageUrl: string;
  caption: string;
  fileType?: MediaKind;
  createdAt: Timestamp | null;
};

type PhotoCommentDoc = {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

function resolveFileType(p: {
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

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
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
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewer, setViewer] = useState<PhotoEntry | null>(null);
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

  // Auto-open modal from ?photo= URL param
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
      setViewer(target);
      autoOpenedRef.current = true;
    }
  }, [photos]);

  // Keep viewer in sync with latest photo data; close if deleted
  useEffect(() => {
    if (!viewer) return;
    const match = photos.find((p) => p.id === viewer.id);
    if (match && match !== viewer) setViewer(match);
    if (!match) setViewer(null);
  }, [photos, viewer]);

  // Body scroll lock while any modal is open
  useEffect(() => {
    if (!viewer && !uploadOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewer, uploadOpen]);

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
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                  boxShadow: "0 0 10px rgba(255,181,167,0.5)",
                }}
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
            onClose={() => setViewer(null)}
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
          `${actor}님의 공간이 업데이트되었습니다`,
          `/members/${memberId}?photo=${newRef.id}`,
          `members/${memberId}/photos/${newRef.id}`,
        );
      }
      await addPoints(loginNick, "사진", 2, "미니홈피 사진첩에 사진 업로드");
      if (loginNick) {
        handleEvent({
          type: "photo",
          nickname: loginNick,
          when: new Date(),
          source: "minihome",
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("업로드 실패");
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center"
      onClick={uploading ? undefined : onClose}
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
    </motion.div>
  );
}

function PhotoViewerModal({
  memberId,
  photo,
  loginNick,
  isOwner,
  memberNickname,
  onClose,
}: {
  memberId: string;
  photo: PhotoEntry;
  loginNick: string | null;
  isOwner: boolean;
  memberNickname: string | null;
  onClose: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center"
      onClick={saving || deleting ? undefined : onClose}
      style={{
        background: "rgba(11,8,33,0.85)",
        backdropFilter: "blur(10px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || "사진 보기"}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        // No max-h or overflow on the card — the parent .modal-safe-frame
        // owns scrolling. Photo + caption + comments scroll together as
        // one block, no inner scroll regions.
        className="relative my-4 flex w-full max-w-lg flex-col rounded-2xl"
        style={{
          background: "rgba(26, 15, 61, 0.95)",
          border: "1px solid rgba(216,150,200,0.3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(107,75,168,0.4)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving || deleting}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20 disabled:opacity-50"
          style={{
            background: "rgba(11,8,33,0.6)",
            border: "1px solid rgba(216,150,200,0.3)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Photo / video */}
        <div className="relative w-full flex-shrink-0 bg-abyss-deep">
          {kind === "video" ? (
            <video
              src={photo.imageUrl}
              controls
              autoPlay
              playsInline
              className="block max-h-[60vh] w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.imageUrl}
              alt={photo.caption || "photo"}
              className="block max-h-[60vh] w-full object-contain"
            />
          )}
        </div>

        {/* Caption + comments — no inner scroll. The whole modal scrolls
            as one block via the parent .modal-safe-frame. */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-4">
            {editMode ? (
              <div className="flex w-full flex-col gap-2">
                <input
                  type="text"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  placeholder="설명"
                  maxLength={120}
                  disabled={saving}
                  className="w-full rounded-full border border-nebula-pink/25 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-full px-3 py-1 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                    }}
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    disabled={saving}
                    className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1 font-serif text-[11px] tracking-wider text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="wrap-anywhere min-w-0 flex-1 font-serif text-[13px] italic leading-relaxed text-text-primary">
                {photo.caption || (
                  <span className="text-text-sub/60">설명 없음</span>
                )}
              </p>
            )}
            {isOwner && !editMode && (
              <div className="flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider">
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={deleting}
                  className="text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-text-sub transition-colors hover:text-peach-accent disabled:opacity-50"
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
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function PhotoComments({
  memberId,
  photoId,
  loginNick,
  memberNickname,
}: {
  memberId: string;
  photoId: string;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  const [comments, setComments] = useState<PhotoCommentDoc[]>([]);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});

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
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}?photo=${photoId}`,
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
    <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
      <h4 className="font-serif text-[11px] tracking-[0.3em] text-text-sub uppercase">
        댓글 ({totalCount})
      </h4>

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="py-2 text-center font-serif text-[11px] italic text-text-sub/70">
          첫 댓글을 남겨보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
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
            />
          ))}
        </div>
      )}

      {/* Input */}
      {loginNick ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-2 rounded-full px-2 py-1.5"
          style={{
            background: "rgba(11,8,33,0.5)",
            border: "1px solid rgba(216,150,200,0.2)",
          }}
        >
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 남겨주세요"
            maxLength={200}
            disabled={submitting}
            aria-label="댓글 내용"
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-1 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60"
          />
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || (!content.trim() && !image)}
            className="shrink-0 rounded-full px-3 py-1 font-serif text-[10px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
            }}
          >
            {submitting ? "..." : "등록"}
          </button>
        </form>
      ) : (
        <p className="text-center font-serif text-[11px] italic text-text-sub">
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
}) {
  const [replies, setReplies] = useState<PhotoCommentDoc[]>([]);
  const [msg, setMsg] = useState("");
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
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}?photo=${photoId}`,
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
    <div>
      <div className="font-serif text-[12px] leading-relaxed text-text-primary">
        <NicknameLink
          nickname={comment.nickname}
          className="font-medium text-stardust"
        />
      </div>
      <p className="wrap-anywhere mt-1 font-serif text-[12px] leading-relaxed text-text-primary">
        {comment.content}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-serif text-[10px] tracking-wider text-text-sub">
          {formatTime(comment.createdAt)}
        </span>
        {(loginNick || loginNick === comment.nickname) && (
          <div className="flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider">
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
        )}
      </div>
      {comment.imageUrl && (
        <div className="mt-2">
          <CommentImageView url={comment.imageUrl} />
        </div>
      )}

      {(replies.length > 0 || replyOpen) && (
        <div className="mt-2 ml-5 flex flex-col gap-2">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <span
                className="shrink-0 font-serif text-xs leading-relaxed text-text-sub/70"
                aria-hidden
              >
                └
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[11.5px] leading-relaxed text-text-primary">
                  <NicknameLink
                    nickname={r.nickname}
                    className="font-medium text-stardust"
                  />
                </div>
                <p className="wrap-anywhere mt-1 font-serif text-[11.5px] leading-relaxed text-text-primary">
                  {r.content}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-serif text-[10px] tracking-wider text-text-sub">
                    {formatTime(r.createdAt)}
                  </span>
                  {loginNick === r.nickname && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(r.id)}
                      className="shrink-0 font-serif text-[11px] tracking-wider text-text-sub transition-colors hover:text-peach-accent"
                    >
                      삭제
                    </button>
                  )}
                </div>
                {r.imageUrl && (
                  <div className="mt-2">
                    <CommentImageView url={r.imageUrl} />
                  </div>
                )}
              </div>
            </div>
          ))}

          <AnimatePresence>
            {replyOpen && loginNick && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="mt-1 flex items-center gap-2 rounded-full px-2 py-1.5"
                  style={{
                    background: "rgba(11,8,33,0.45)",
                    border: "1px solid rgba(216,150,200,0.22)",
                    backdropFilter: "blur(14px)",
                  }}
                >
                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
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
                    className="min-w-0 flex-1 border-none bg-transparent px-3 py-1 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60"
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
                    className="shrink-0 rounded-full px-3 py-1 font-serif text-[10px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                      boxShadow: "0 0 10px rgba(255,181,167,0.5)",
                    }}
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
