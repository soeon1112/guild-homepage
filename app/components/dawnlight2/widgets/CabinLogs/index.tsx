"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  PhotoViewerModal,
  type PhotoEntry,
} from "@/app/components/shared/MinihomePhotoViewer";
import {
  AlbumPhotoViewer,
  type AlbumPhoto as CosmicAlbumPhoto,
} from "@/app/components/shared/AlbumPhotoViewer";

// Cabin Logs — Dawnlight 2 daily-rotating photo spotlight.
//
// Visual is the v0 window-gallery layout 1:1: two polaroid cards
// pinned to the board, each with the cream mat (8/8/24 padding),
// 4:3 photo area, caption stack inside the mat, the same red
// thumbtack pin SVG sitting half-overlapping the mat top, the same
// ±2° tilt + 300 ms hover lift. Only the cork-board substrate
// changes — we drop the feTurbulence cork noise/dots and swap the
// beige (#dfc48a) for a deeper parchment (#e0cca8) so the surface
// reads as written-log paper, not pin-board.
//
// Data:
//   • "오늘의 풍경" (Today's Scenery) — random photo from any
//     member's `members/{id}/photos` sub-collection. Photos are
//     pooled across all members, then a KST + FNV-1a + mulberry32
//     + Fisher-Yates pick (same algorithm StarOfDay uses) selects
//     one for the day.
//   • "추억의 항해" (Voyages Past) — random photo from the root
//     `album` collection. Same KST pick on its own pool.
//
// Click either polaroid → cosmic's ORIGINAL post modal mounts:
// PhotoViewerModal for scenery (members minihome), AlbumPhotoViewer
// for voyage (album board). Both come from the share modules
// `app/components/shared/{MinihomePhotoViewer,AlbumPhotoViewer}`,
// so the dawnlight2 widget and the cosmic minihome / album pages
// render the literal same component (single source of truth).

type ScenePhoto = {
  // The plain photo doc id (NOT the composite key) — what cosmic's
  // PhotoViewerModal expects in `photo.id`.
  photoId: string;
  ownerId: string;
  ownerNickname: string;
  imageUrl: string;
  caption: string;
  fileType: PhotoEntry["fileType"];
  createdAt: Timestamp | null;
};

type AlbumPhoto = {
  id: string;
  imageUrl: string;
  caption: string;
  photographer: string;
  people: string[];
  photoDate: string;
  fileType: CosmicAlbumPhoto["fileType"];
  createdAt: Timestamp | null;
};

const INK = "#3a2a1a";
const INK_SOFT = "#7a5a3a";
const INK_FAINT = "#9a7a5a";
const PARCHMENT = "#e0cca8"; // deeper than NoteToTheSky's f0e4cc
const PARCHMENT_BORDER = "#b89660";
const MAT = "#f8f2e8";

// ── KST + deterministic shuffle (verbatim from StarOfDay) ──
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstDayNumber(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / 86400000);
}
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledIndices(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickIndex(poolSize: number, namespace: string, date = new Date()): number {
  if (poolSize <= 0) return -1;
  const day = kstDayNumber(date);
  const cycle = Math.floor(day / poolSize);
  const pos = ((day % poolSize) + poolSize) % poolSize;
  const seed = fnv1a(`${namespace}:${cycle}`);
  const order = shuffledIndices(poolSize, mulberry32(seed));
  return order[pos];
}

// Image-only filter so videos / non-image fileTypes don't break the
// polaroid (the mat is photo-shaped). cosmic stores fileType as
// "image" | "video" | "gif" — we keep gif since it renders as <img>.
function isImage(t?: string): boolean {
  return !t || t === "image" || t === "gif";
}

// "YYYY-MM-DD · {nick}" — unified meta format for both cards.
// `·` is U+00B7 (middle dot) wrapped in spaces. Date is derived from
// the photo's createdAt Timestamp (or the album's photoDate if it's
// already a YYYY-MM-DD string from the upload form).
function formatPostDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function buildMeta(date: string | null, nickname: string): string {
  const left = date ?? "—";
  const right = nickname || "—";
  return `${left} · ${right}`;
}

/* ─── Pin (verbatim from v0) ───────────────────────────────────── */
function Pin() {
  return (
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
  );
}

/* ─── Polaroid card (v0 structure, real image content) ─────────── */

function PhotoCard({
  imageUrl,
  title,
  subtitle,
  credit,
  rotate,
  onOpen,
}: {
  imageUrl: string | null;
  title: string;
  subtitle: string;
  credit: string;
  rotate: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!imageUrl}
      className="group flex flex-col items-center text-left disabled:cursor-default"
      style={{ background: "transparent", padding: 0, border: 0 }}
      aria-label={title}
    >
      <div className="w-full transition-transform duration-300 ease-out group-hover:-translate-y-2 group-disabled:translate-y-0">
        {/* Pin sits above the mat, half overlapping it */}
        <div
          className="relative z-10 flex justify-center"
          style={{
            marginBottom: -10,
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.32))",
          }}
        >
          <Pin />
        </div>

        {/* Tilted mat */}
        <div
          className="w-full"
          style={{ transform: `rotate(${rotate})`, transformOrigin: "50% 4px" }}
        >
          <div
            className="rounded-sm"
            style={{
              background: MAT,
              padding: "8px 8px 24px",
              boxShadow:
                "0 4px 18px rgba(42,20,10,0.28), 0 1px 4px rgba(42,20,10,0.16)",
            }}
          >
            {/* 4:3 photo area — object-cover so the photo fills the full
                width; non-4:3 photos crop on the long axis instead of
                letterboxing. Matches the RN port. */}
            <div
              className="relative w-full overflow-hidden rounded-[1px]"
              style={{ aspectRatio: "4/3", background: MAT }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={title}
                  className="absolute inset-0 h-full w-full"
                  style={{ objectFit: "cover", background: MAT }}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[10px] italic"
                  style={{ color: INK_FAINT }}
                >
                  사진을 불러오는 중…
                </div>
              )}
              {/* Glass sheen — same overlay v0 uses on the gradient */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.13) 0%, transparent 50%, rgba(0,0,0,0.07) 100%)",
                }}
              />
            </div>

            {/* Caption — title / subtitle / credit verbatim shape */}
            <div className="mt-2 px-0.5">
              <p className="text-[11px] font-semibold leading-tight tracking-wide" style={{ color: INK }}>
                {title}
              </p>
              <p
                className="mt-px text-[8px] font-medium uppercase tracking-[0.22em]"
                style={{ color: INK_SOFT }}
              >
                {subtitle}
              </p>
              <p className="mt-0.5 text-[9px] italic leading-tight" style={{ color: INK_FAINT }}>
                {credit}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─── Main widget ──────────────────────────────────────────────── */

// Click target carries enough context to mount cosmic's original
// modal exactly as it would mount on the source page (members
// minihome / album board). Deep-link `targetCommentId` is null —
// the widget never deep-links to a specific comment.
type OpenState =
  | {
      kind: "scene";
      memberId: string;
      memberNickname: string;
      photo: PhotoEntry;
    }
  | { kind: "voyage"; photo: CosmicAlbumPhoto };

export function CabinLogs() {
  const { nickname: loginNick } = useAuth();
  const [scenePool, setScenePool] = useState<ScenePhoto[]>([]);
  const [albumPool, setAlbumPool] = useState<AlbumPhoto[]>([]);
  const [open, setOpen] = useState<OpenState | null>(null);

  // 오늘의 풍경 — pool across every member's photos sub-collection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const memberSnap = await getDocs(collection(db, "members"));
        const acc: ScenePhoto[] = [];
        for (const m of memberSnap.docs) {
          const nick = (m.data().nickname as string) ?? m.id;
          try {
            const ps = await getDocs(collection(db, "members", m.id, "photos"));
            for (const p of ps.docs) {
              const d = p.data();
              if (!isImage(d.fileType as string)) continue;
              const url = (d.imageUrl as string) ?? "";
              if (!url) continue;
              acc.push({
                photoId: p.id,
                ownerId: m.id,
                ownerNickname: nick,
                imageUrl: url,
                caption: (d.caption as string) ?? "",
                fileType: (d.fileType as PhotoEntry["fileType"]) ?? "image",
                createdAt: (d.createdAt as Timestamp | null) ?? null,
              });
            }
          } catch {
            /* member photos closed by rules — skip */
          }
        }
        // Stable order so the daily index points at the same photo
        acc.sort((a, b) =>
          `${a.ownerId}/${a.photoId}`.localeCompare(`${b.ownerId}/${b.photoId}`),
        );
        if (!cancelled) setScenePool(acc);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 추억의 항해 — root `album` collection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "album"));
        const items: AlbumPhoto[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (!isImage(data.fileType as string)) continue;
          const url = (data.imageUrl as string) ?? "";
          if (!url) continue;
          items.push({
            id: d.id,
            imageUrl: url,
            caption: (data.caption as string) ?? "",
            photographer: (data.photographer as string) ?? "",
            people: (data.people as string[]) ?? [],
            photoDate: (data.photoDate as string) ?? "",
            fileType: (data.fileType as CosmicAlbumPhoto["fileType"]) ?? "image",
            createdAt: (data.createdAt as Timestamp | null) ?? null,
          });
        }
        items.sort((a, b) => a.id.localeCompare(b.id));
        if (!cancelled) setAlbumPool(items);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayScene = useMemo(() => {
    if (scenePool.length === 0) return null;
    return scenePool[pickIndex(scenePool.length, "cabin-logs:scenery")];
  }, [scenePool]);

  const todayVoyage = useMemo(() => {
    if (albumPool.length === 0) return null;
    return albumPool[pickIndex(albumPool.length, "cabin-logs:voyage")];
  }, [albumPool]);

  return (
    <>
      <section
        aria-labelledby="dl2-cabin-logs"
        className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
      >
        {/* Header outside the card — same rhythm as the other widgets */}
        <header className="mb-3 px-1">
          <h2
            id="dl2-cabin-logs"
            className="text-lg font-semibold leading-tight text-cream sm:text-xl"
          >
            선실의 기록
          </h2>
          <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
            Cabin Logs
          </p>
        </header>

        {/* Deep-parchment substrate — replaces v0's cork board.
            Solid color + ink hairline + soft drop shadow; the
            feTurbulence cork-grain / cork-dots SVG layers from v0
            are intentionally NOT ported (cork visual is what we
            wanted to leave behind). */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: PARCHMENT,
            border: `1px solid ${PARCHMENT_BORDER}`,
            boxShadow:
              "0 6px 28px rgba(42,20,10,0.30), 0 1px 4px rgba(42,20,10,0.18)",
          }}
        >
          {/* Four corner pins — pressed into the parchment.
              `inset` drop reads as the pin-head sinking; the outer
              shadow grounds it on the surface. Positioned 10 px in
              from each corner. */}
          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
            <span
              key={corner}
              aria-hidden
              className="pointer-events-none absolute h-3 w-3 rounded-full"
              style={{
                background: "rgba(120, 95, 65, 0.35)",
                boxShadow:
                  "inset -2px -2px 3px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.15)",
                top: corner.startsWith("t") ? 10 : "auto",
                bottom: corner.startsWith("b") ? 10 : "auto",
                left: corner.endsWith("l") ? 10 : "auto",
                right: corner.endsWith("r") ? 10 : "auto",
              }}
            />
          ))}
          <div className="grid grid-cols-2 gap-4 px-6 py-7 sm:gap-8 sm:px-8 sm:py-8">
            <PhotoCard
              imageUrl={todayScene?.imageUrl ?? null}
              title="오늘의 풍경"
              subtitle="TODAY'S SCENERY"
              credit={
                todayScene
                  ? buildMeta(
                      todayScene.createdAt
                        ? formatPostDate(todayScene.createdAt.toDate())
                        : null,
                      todayScene.ownerNickname,
                    )
                  : "오늘의 사진이 없어요"
              }
              rotate="-2deg"
              onOpen={() => {
                if (!todayScene) return;
                setOpen({
                  kind: "scene",
                  memberId: todayScene.ownerId,
                  memberNickname: todayScene.ownerNickname,
                  photo: {
                    id: todayScene.photoId,
                    imageUrl: todayScene.imageUrl,
                    caption: todayScene.caption,
                    fileType: todayScene.fileType,
                    createdAt: todayScene.createdAt,
                  },
                });
              }}
            />
            <PhotoCard
              imageUrl={todayVoyage?.imageUrl ?? null}
              title="추억의 항해"
              subtitle="VOYAGES PAST"
              credit={
                todayVoyage
                  ? buildMeta(
                      todayVoyage.photoDate ||
                        (todayVoyage.createdAt
                          ? formatPostDate(todayVoyage.createdAt.toDate())
                          : null),
                      todayVoyage.photographer,
                    )
                  : "지난 항해가 없어요"
              }
              rotate="2deg"
              onOpen={() => {
                if (!todayVoyage) return;
                setOpen({
                  kind: "voyage",
                  photo: {
                    id: todayVoyage.id,
                    imageUrl: todayVoyage.imageUrl,
                    caption: todayVoyage.caption,
                    photographer: todayVoyage.photographer,
                    people: todayVoyage.people,
                    photoDate: todayVoyage.photoDate,
                    fileType: todayVoyage.fileType,
                    createdAt: todayVoyage.createdAt,
                  },
                });
              }}
            />
          </div>
        </div>
      </section>

      {open?.kind === "scene" && (
        <PhotoViewerModal
          memberId={open.memberId}
          photo={open.photo}
          loginNick={loginNick}
          isOwner={loginNick === open.memberNickname}
          memberNickname={open.memberNickname}
          targetCommentId={null}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "voyage" && (
        <AlbumPhotoViewer
          photo={open.photo}
          loginNick={loginNick}
          targetCommentId={null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
