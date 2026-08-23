"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDeepLinkHash } from "@/src/lib/useDeepLinkParam";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  increment,
  query,
  where,
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
import { ProfileSection as ProfileSectionV2 } from "@/app/components/redesign/minihompi/ProfileSection";
import { ProfileSectionD2 } from "@/app/components/redesign/minihompi/ProfileSectionD2";
import { IslandHeroD2 } from "@/app/components/redesign/minihompi/IslandHeroD2";
import { AdventureLogSection } from "@/app/components/redesign/minihompi/AdventureLogSection";
import { AdventureLogSectionD2 } from "@/app/components/redesign/minihompi/AdventureLogSectionD2";
import { PhotosSection } from "@/app/components/redesign/minihompi/PhotosSection";
import { PhotosSectionD2 } from "@/app/components/redesign/minihompi/PhotosSectionD2";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { useBackdropClose } from "@/src/lib/useBackdropClose";

// `decodeURIComponent` throws on malformed input ("%E"). Be defensive —
// fall back to the raw value rather than crashing the page.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type MemberDoc = {
  nickname: string;
  statusMessage: string;
  profileImage: string;
  bgmUrl?: string;
  mood?: string;
};

const MOOD_OPTIONS: { value: string; emoji: string; label: string }[] = [
  { value: "happy", emoji: "😊", label: "좋음" },
  { value: "excited", emoji: "😆", label: "신남" },
  { value: "sad", emoji: "😢", label: "슬픔" },
  { value: "angry", emoji: "😡", label: "화남" },
  { value: "tired", emoji: "😴", label: "피곤" },
  { value: "thinking", emoji: "🤔", label: "고민중" },
  { value: "love", emoji: "🥰", label: "행복" },
  { value: "cool", emoji: "😎", label: "쿨" },
];

function getMoodEmoji(mood?: string): string {
  if (!mood) return "";
  return MOOD_OPTIONS.find((m) => m.value === mood)?.emoji ?? "";
}

type AdventureEntry = {
  id: string;
  date: string;
  content: string;
  createdAt: Timestamp | null;
};

type GuestbookEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

type ReplyEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

type MediaKind = "image" | "video" | "gif";

type PhotoEntry = {
  id: string;
  imageUrl: string;
  caption: string;
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

type PhotoComment = {
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

export default function MemberMiniHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  // Next.js 16 `use(params)` on client components hands us the raw URL
  // segment, which for non-ASCII (e.g. Korean) nicknames stays
  // percent-encoded — so for /members/나슈타 we receive
  // "%EB%82%98%EC%8A%88%ED%83%80" instead of "나슈타". Decode up front
  // so every downstream Firestore lookup compares against real text.
  const id = safeDecode(rawId);
  const { nickname: loginNick } = useAuth();
  // dawnlight2 톤은 "보는 사람" 기준 (현재 로그인 유저). 언쏘가 다른
  // 길드원 미니홈피를 봐도 양피지 톤, 다른 길드원은 누구 미니홈피든
  // cosmic 톤. ProfileSection / 떠있는 섬 / BGM 만 분기 — 배지·방명록·
  // 모험기록·사진첩 섹션은 1단계에서 cosmic 그대로 유지.
  const dawnlight2 = useDawnlight2();
  const [member, setMember] = useState<MemberDoc | null>(null);
  // Resolved members doc id (= URL slug for slot-keyed legacy docs, or
  // the matched doc id when the URL slug is a nickname but the actual
  // doc lives under a different id). All writes target this resolved
  // id so we never create a duplicate.
  const [resolvedId, setResolvedId] = useState<string>(id);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // iOS / some browsers can hand us an NFD-normalized URL param
      // even when the doc id is stored as NFC. Try both, plus a final
      // nickname-field query, before declaring the slot empty.
      const nfc = id.normalize("NFC");
      const nfd = id.normalize("NFD");
      for (const candidate of [id, nfc, nfd]) {
        const snap = await getDoc(doc(db, "members", candidate));
        if (cancelled) return;
        if (snap.exists()) {
          setMember(snap.data() as MemberDoc);
          setResolvedId(candidate);
          setLoading(false);
          return;
        }
      }
      // Fallback: `id` is a nickname (or near it) and the doc is
      // keyed by a slot id. Query by nickname field, trying both
      // normalization forms.
      for (const candidate of [nfc, nfd]) {
        const byNick = await getDocs(
          query(collection(db, "members"), where("nickname", "==", candidate)),
        );
        if (cancelled) return;
        if (!byNick.empty) {
          const hit = byNick.docs[0];
          setMember(hit.data() as MemberDoc);
          setResolvedId(hit.id);
          setLoading(false);
          return;
        }
      }
      setMember(null);
      setResolvedId(id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOwner = !!loginNick && !!member && member.nickname === loginNick;


  // Deep-link arrival pattern (NebulaWhispers / push tap):
  //   • #minihome-adventure / #minihome-guestbook → scroll to section
  //   • ?photo=<id>(&comment=<id>)                → scroll to #minihome-photos
  //     (PhotosSection handles the modal open + comment scroll itself)
  //   • ?guestbook=<entryId>                       → scroll to
  //     #minihome-guestbook + GuestbookSection flips to the entry's page
  //     and scrollIntoView the entry itself
  //
  // Naïve "scrollIntoView once at +50ms" lands at the WRONG y because
  // ProfileSection's Firestore snapshots arrive after the initial scroll,
  // growing the page and pushing the target down. The user ends up where
  // the section USED to be.
  // Mirror album/page.tsx's content-settle pattern: do an initial
  // instant scroll, then retry on every layout change (ResizeObserver
  // on the page wrapper) for ~1.5 s, comparing target y so we only
  // re-scroll if the section actually moved.
  // Page starts at opacity:0 if a deep-link is present so the
  // (possibly several) scroll attempts happen invisibly; we reveal
  // after the first attempt lands AND no further re-scrolls fire.
  // Deep-link readers — see src/lib/useDeepLinkParam.ts for why we
  // can't trust `useSearchParams` alone on mobile mount.
  const initialDeepLink = useDeepLinkHash();
  const hasDeepLink = !!initialDeepLink;
  const [scrollPending, setScrollPending] = useState<boolean>(hasDeepLink);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hashHandledRef = useRef(false);
  useEffect(() => {
    if (hashHandledRef.current) return;
    if (loading) return;
    if (typeof window === "undefined") return;
    // ?photo= falls back to "minihome-photos" so the page scrolls to
    // the photos section before PhotosSection's auto-open mounts the
    // modal. ?guestbook= falls back to "minihome-guestbook" —
    // GuestbookSection separately handles the entry-level scroll
    // once it's mounted.
    const liveHash = window.location.hash.slice(1).split("#")[0] || "";
    const params = new URLSearchParams(window.location.search);
    const targetId =
      liveHash ||
      initialDeepLink ||
      (params.get("photo") ? "minihome-photos" : "");
    if (!targetId) {
      setScrollPending(false);
      return;
    }
    hashHandledRef.current = true;

    const doScroll = () => {
      const el = document.getElementById(targetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const targetY = Math.max(0, Math.round(rect.top + window.scrollY));
      // Multiple methods for cross-browser/Mobile-Safari reliability —
      // smooth scrollTo silent-fails in some hash-navigation contexts.
      window.scrollTo(0, targetY);
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
    };

    const handles: ReturnType<typeof setTimeout>[] = [];
    for (const ms of [100, 500, 1500, 3000]) {
      handles.push(setTimeout(() => doScroll(), ms));
    }
    handles.push(setTimeout(() => setScrollPending(false), 700));

    return () => {
      for (const h of handles) clearTimeout(h);
    };
  }, [loading]);

  return (
    <div
      ref={wrapperRef}
      className={`minihome mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:gap-7${dawnlight2 ? " dl2-minihome" : ""}`}
      style={{
        opacity: scrollPending ? 0 : 1,
        transition: "opacity 150ms ease-out",
        // 마지막 섹션 deep-link scrollTo 가 maxScroll 로 clamp 되는
        // 회귀 봉인. 100vh 가 PC 에선 충분했지만 모바일은 URL bar
        // 펼침/접힘으로 viewport 가 동적 변동 (vh = 초기값 고정,
        // 실제 innerHeight 는 후에 더 커짐) → 100vh 만으론 부족했음.
        // 200vh 로 확대하면 URL bar 차이 (~150px 안팎) + 동적
        // viewport 변동 모두 흡수. 빈 buffer 는 BottomNav 가 가리는
        // 영역 + 일반 사용에서는 도달 X.
        paddingBottom: "300vh",
      }}
    >
      {loading ? (
        <p className="py-8 text-center font-serif italic text-text-sub">
          로딩 중...
        </p>
      ) : dawnlight2 ? (
        <>
          <IslandHeroD2 nickname={member?.nickname ?? "새벽"} />
          <ProfileSectionD2
            id={resolvedId}
            member={member}
            loginNick={loginNick}
            isOwner={isOwner}
            onChange={setMember}
          />
        </>
      ) : (
        <ProfileSectionV2
          id={resolvedId}
          member={member}
          loginNick={loginNick}
          isOwner={isOwner}
          onChange={setMember}
        />
      )}
      {/* dl2: 프로필 → 사진첩 → 모험. cosmic: 프로필 → 모험 → 사진첩. */}
      {dawnlight2 ? (
        <>
          <PhotosSectionD2
            id={resolvedId}
            isOwner={isOwner}
            loginNick={loginNick}
            memberNickname={member?.nickname ?? null}
          />
          <AdventureLogSectionD2
            id={resolvedId}
            isOwner={isOwner}
            memberNickname={member?.nickname ?? null}
          />
        </>
      ) : (
        <>
          <AdventureLogSection
            id={resolvedId}
            isOwner={isOwner}
            memberNickname={member?.nickname ?? null}
          />
          <div id="minihome-photos">
            <PhotosSection
              id={resolvedId}
              isOwner={isOwner}
              loginNick={loginNick}
              memberNickname={member?.nickname ?? null}
            />
          </div>
        </>
      )}
    </div>
  );
}
