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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { handleEvent } from "@/src/lib/badgeCheck";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import {
  PhotoViewerModal,
  resolveFileType,
  type MediaKind,
  type PhotoEntry,
} from "@/app/components/shared/MinihomePhotoViewer";

// dawnlight2 미니홈피 3단계 — 사진첩 (캐러멜 코르크 보드 + 폴라로이드).
// logic은 cosmic PhotosSection 1:1 동일 (Firestore subscribe / 자동 열기
// 딥링크 / 댓글 카운트 nested onSnapshot / upload / viewer 열기).
// 디자인만 v0 photo-album 베이스 + 사용자 결정 (cover, 회전, 핀셋).

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Deterministic rotation per photo id, range -5° ~ 5°. Same id → same
// angle so photos don't jump on every render / pagination.
function photoRotation(id: string): number {
  return (hashCode(id) % 1000) / 100 - 5; // -5..5
}

const PAGE_SIZE = 6; // PC 3×2 / 모바일 2×3
const SECTION_ID = "minihome-photos";

export function PhotosSectionD2({
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
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const autoOpenedRef = useRef(false);

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

  // Deep-link auto-open — see cosmic PhotosSection comments. URLSearchParams
  // direct read (no prop). 800ms scroll → setViewer to keep useModalBodyLock
  // from snapping back to top.
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
      const sectionEl = document.getElementById(SECTION_ID);
      if (sectionEl) {
        const rect = sectionEl.getBoundingClientRect();
        const targetY = Math.max(0, Math.round(rect.top + window.scrollY));
        window.scrollTo(0, targetY);
        document.documentElement.scrollTop = targetY;
        document.body.scrollTop = targetY;
      }
      const cid = params.get("comment");
      setTimeout(() => {
        setViewer(target);
        setTargetCommentId(cid);
      }, 800);
    }
  }, [photos]);

  useEffect(() => {
    if (!viewer) return;
    const match = photos.find((p) => p.id === viewer.id);
    if (match && match !== viewer) setViewer(match);
    if (!match) setViewer(null);
  }, [photos, viewer]);

  useModalBodyLock(!!viewer);
  useModalBodyLock(uploadOpen);

  const photoIdsKey = useMemo(
    () => photos.map((p) => p.id).sort().join(","),
    [photos],
  );
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Nested onSnapshot for per-photo comment+reply counts. Verbatim from
  // cosmic — kept identical so badge counts match across themes.
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
      <section
        id={SECTION_ID}
        className="overflow-hidden rounded-2xl"
        style={{
          background: "rgba(184, 132, 90, 0.7)",
          boxShadow: "0 4px 18px rgba(80, 50, 10, 0.22)",
        }}
      >
        {/* Head — 같은 캐러멜 톤, 가벼운 구분선만 */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
            >
              <rect
                x="1"
                y="3"
                width="12"
                height="9"
                rx="1.5"
                stroke="#fef5e6"
                strokeWidth="1.2"
              />
              <circle cx="7" cy="7.5" r="2" stroke="#fef5e6" strokeWidth="1.1" />
              <path
                d="M4.5 3V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V3"
                stroke="#fef5e6"
                strokeWidth="1.1"
              />
            </svg>
            <span
              className="text-[15px] font-semibold tracking-wide"
              style={{ color: "#fef5e6" }}
            >
              사진첩
            </span>
            <span
              className="text-xs"
              style={{ color: "rgba(254,245,230,0.7)" }}
            >
              {photos.length}
            </span>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide"
              style={{
                background: "#fef5e6",
                color: "#5c3a1f",
              }}
            >
              <Upload className="h-3 w-3" />
              사진 올리기
            </button>
          )}
        </div>

        {/* Light divider between head + body (사용자: "가벼운 구분선만") */}
        <div style={{ borderTop: "1px solid rgba(92, 58, 31, 0.2)" }} />

        {/* Body — 같은 캐러멜 + 코르크 dot 패턴 overlay */}
        <div
          className="relative px-4 py-5 sm:px-5 sm:py-6"
          style={{
            backgroundImage:
              "radial-gradient(rgba(92, 58, 31, 0.18) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
            backgroundPosition: "0 0",
          }}
        >
          {photos.length === 0 ? (
            <p
              className="py-10 text-center text-xs italic"
              style={{ color: "rgba(254, 245, 230, 0.78)" }}
            >
              {isOwner
                ? "아직 사진이 없습니다. 첫 사진을 올려보세요."
                : "아직 사진이 없습니다."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8">
                {paged.map((p) => (
                  <PolaroidTile
                    key={p.id}
                    photo={p}
                    rotate={photoRotation(p.id)}
                    commentCount={commentCounts[p.id] ?? 0}
                    onOpen={() => setViewer(p)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div
                  className="mt-7 flex items-center justify-center gap-5 text-[12px] font-medium tracking-wider"
                  style={{ color: "rgba(254, 245, 230, 0.85)" }}
                >
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="이전 페이지"
                  >
                    ← 이전
                  </button>
                  <span style={{ color: "#fef5e6" }}>
                    {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={currentPage >= totalPages - 1}
                    className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="다음 페이지"
                  >
                    다음 →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <AnimatePresence>
        {uploadOpen && (
          <UploadModalD2
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
            dawnlight2
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

// ─── PolaroidTile ──────────────────────────────────────────────────
function PolaroidTile({
  photo,
  rotate,
  commentCount,
  onOpen,
}: {
  photo: PhotoEntry;
  rotate: number;
  commentCount: number;
  onOpen: () => void;
}) {
  const kind = resolveFileType(photo);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full flex-col items-center transition-transform duration-200 hover:-translate-y-1"
      style={{
        transform: `rotate(${rotate.toFixed(2)}deg)`,
        transformOrigin: "50% 0",
      }}
      aria-label={`사진: ${photo.caption || "제목 없음"}`}
    >
      {/* Pin — CabinLogs Pin() (app/components/dawnlight2/widgets/
          CabinLogs/index.tsx:163-179) verbatim 차용. 색·SVG 구조 동일. */}
      <span
        aria-hidden
        className="relative z-10"
        style={{
          marginBottom: -10,
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.32))",
        }}
      >
        <svg
          width="18"
          height="22"
          viewBox="0 0 18 22"
          aria-hidden
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none"
        >
          <circle cx="9" cy="8" r="7" fill="#c92a2a" />
          <ellipse cx="6.5" cy="5.5" rx="2.5" ry="1.8" fill="#f06060" opacity="0.55" />
          <ellipse cx="9" cy="12" rx="5.5" ry="1.8" fill="#6a1010" opacity="0.2" />
          <line x1="9" y1="14" x2="9" y2="21" stroke="#8a6840" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>

      {/* Polaroid mat — cover photo + caption */}
      <div
        className="w-full transition-shadow duration-200"
        style={{
          background: "#fef5e6",
          padding: "6px 6px 14px",
          borderRadius: "2px",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "1 / 1", background: "#3a2a1a" }}
        >
          {kind === "video" ? (
            <video
              src={photo.imageUrl}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              // Inline w/h+object-fit beats Tailwind v4 cascade trap on
              // unlayered img/video selectors (memory: tailwind layer
              // gotcha). Same recipe as album page.
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
              src={photo.imageUrl}
              alt={photo.caption || "photo"}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          )}

          {commentCount > 0 && (
            <span
              className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{
                background: "rgba(0,0,0,0.55)",
                color: "#fef5e6",
              }}
            >
              <MessageCircle className="h-2.5 w-2.5" aria-hidden />
              {commentCount}
            </span>
          )}
        </div>

        <p
          className="mt-2 truncate px-1 text-center text-[11px]"
          style={{ color: "#5c3a1f" }}
        >
          {photo.caption || " "}
        </p>
      </div>
    </button>
  );
}

// ─── UploadModalD2 ────────────────────────────────────────────────
// Same upload flow as cosmic — cream 양피지 디자인.
function UploadModalD2({
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
  // 멘션 자동완성용 cursor 추적 (캡션 신규).
  const [captionMentionCursor, setCaptionMentionCursor] = useState<
    number | null
  >(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);
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

  const handleUpload = useCallback(async () => {
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
    }
    setUploading(false);
  }, [file, caption, memberId, loginNick, memberNickname, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="dl2-minihome modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center"
      onClick={uploading ? undefined : onClose}
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        // .modal-safe-frame { align-items: flex-start } 가 unlayered 라
        // Tailwind items-center 를 cascade 에서 이김. inline override 로
        // 중앙 정렬 강제 (배지 모달과 동일 처방).
        alignItems: "center",
      }}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl p-6"
        style={{
          background: "#fef5e6",
          border: "1px solid rgba(92, 58, 31, 0.2)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ color: "#5c3a1f" }}
        >
          <X className="h-4 w-4" />
        </button>
        <h3
          className="mb-4 text-base font-bold tracking-wide"
          style={{ color: "#5c3a1f" }}
        >
          사진 올리기
        </h3>

        {filePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={filePreview}
            alt="미리보기"
            className="mb-3 w-full rounded-md"
            style={{
              maxHeight: 280,
              objectFit: "contain",
              border: "1px solid rgba(92,58,31,0.2)",
            }}
          />
        ) : (
          <label
            className="mb-3 flex h-32 w-full cursor-pointer items-center justify-center rounded-md text-sm"
            style={{
              border: "1px dashed rgba(92,58,31,0.4)",
              color: "#8a6a4a",
            }}
          >
            클릭해서 사진 / 영상 선택
            <input
              type="file"
              accept="image/*,video/mp4,.gif"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

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
          type="text"
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
          placeholder="설명 (선택)"
          maxLength={120}
          disabled={uploading}
          className="mb-4 w-full rounded-full px-3 py-2 text-[12px] focus:outline-none disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(92, 58, 31, 0.25)",
            color: "#3a2a1a",
          }}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "#ffd4b8",
              color: "#5c3a1f",
            }}
          >
            {uploading ? "업로드 중..." : "올리기"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-full px-4 py-2 text-[12px] tracking-wide transition-opacity disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.4)",
              border: "1px solid rgba(92, 58, 31, 0.28)",
              color: "rgba(92, 58, 31, 0.7)",
            }}
          >
            취소
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
