"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

// 프사 클릭 → 개인 공간 이동 (중앙 집중): `nickname` prop 하나만 있으면
// 이 컴포넌트가 자체적으로 members 컬렉션을 nickname 으로 조회해 슬롯
// doc id 를 찾고 `/members/{id}` 로 이동한다 — 채팅/게시판/앨범/길드원
// 카드 등 호출부를 단 한 곳도 안 고쳐도 전부 자동으로 클릭 가능해진다.
// app/components/NicknameLink.tsx(이 라운드부터 dumb span) 가 쓰던 것과
// 같은 조회 패턴 — 닉네임에 해당하는 members 문서가 없으면(미등록/"잠든
// 별") alert 로 안내하고 이동하지 않는다.
type MemberAvatarProps = {
  /** Pre-fetched profile image URL. If absent or it fails to load, the
   *  neutral silhouette fallback is shown. */
  imageUrl?: string;
  /** Used for alt text / aria label. */
  nickname?: string;
  /** Size in px (default 48). */
  size?: number;
  /** Show rotating conic-gradient ring around the circle. */
  ring?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Dawnlight2 (cream surface) variant. */
  dl2?: boolean;
};

export function MemberAvatar({
  imageUrl,
  nickname,
  size = 48,
  ring,
  className,
  dl2 = false,
}: MemberAvatarProps) {
  const gradientId = `mavatar-${useId().replace(/:/g, "")}`;
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  // 닉네임별 lookup 결과 캐시 — 같은 아바타를 여러 번 눌러도 재조회 안
  // 함. nickname 이 바뀌면(리스트 재사용 등) 리셋.
  const [resolvedDocId, setResolvedDocId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  useEffect(() => {
    setResolvedDocId(null);
    setNotFound(false);
  }, [nickname]);

  const showImage = !!imageUrl && !imgError;

  const handleActivate = async () => {
    if (!nickname || looking) return;
    if (resolvedDocId) {
      router.push(`/members/${resolvedDocId}`);
      return;
    }
    if (notFound) {
      alert("아직 공간이 없어요");
      return;
    }
    setLooking(true);
    try {
      const q = query(
        collection(db, "members"),
        where("nickname", "==", nickname),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setNotFound(true);
        alert("아직 공간이 없어요");
      } else {
        const id = snap.docs[0].id;
        setResolvedDocId(id);
        router.push(`/members/${id}`);
      }
    } catch (e) {
      console.error("[MemberAvatar] lookup failed", e);
      alert("아직 공간이 없어요");
    } finally {
      setLooking(false);
    }
  };

  // Inline styles for the image fill bypass the Tailwind v4 layer cascade
  // — globals.css declares an unlayered `img { height: auto }` rule that
  // beats `.h-full` (which lives inside @layer utilities), causing the
  // photo to render at its natural height with the disc background
  // showing below it. Inline style sits at top of the cascade.
  const imgStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  return (
    <div
      role={nickname ? "button" : undefined}
      tabIndex={nickname ? 0 : undefined}
      onClick={nickname ? handleActivate : undefined}
      onKeyDown={
        nickname
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void handleActivate();
              }
            }
          : undefined
      }
      aria-label={nickname ? `${nickname} 프로필 보기` : undefined}
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size, cursor: nickname ? "pointer" : undefined }}
    >
      {ring && (
        <div
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{
            background: dl2
              ? "conic-gradient(from 0deg, #fef5e6, #ffd4b0, #ffc785, #f4a87a, #fef5e6)"
              : "conic-gradient(from 0deg, #FFE5C4, #D896C8, #6B4BA8, #FFB5A7, #FFE5C4)",
            filter: "blur(6px)",
            opacity: 0.7,
            animation: "orbit-rotate 12s linear infinite",
          }}
        />
      )}

      <div
        className={
          dl2
            ? "relative flex items-center justify-center overflow-hidden rounded-full"
            : "relative overflow-hidden rounded-full border-2 border-stardust/70 bg-abyss-deep"
        }
        style={
          dl2
            ? {
                width: size,
                height: size,
                background: "transparent",
                border: "1.5px solid rgba(254, 245, 230, 0.45)",
              }
            : { width: size, height: size }
        }
      >
        {showImage ? (
          dl2 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={nickname ? `${nickname}의 프로필 사진` : "프로필 사진"}
              style={imgStyle}
              onError={() => setImgError(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={nickname ? `${nickname}의 프로필 사진` : "프로필 사진"}
              className="block h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          )
        ) : dl2 ? (
          // minihompi/ProfileSectionD2.tsx 의 기본 프사 SVG verbatim(그
          // 파일은 미접촉) — 개인 공간과 채팅/댓글/게시판/앨범/길드원
          // 카드가 전부 같은 "탠 웃는 얼굴"을 쓰도록 통일.
          <svg viewBox="0 0 96 96" style={imgStyle} aria-hidden>
            <rect width="96" height="96" fill="#d4a870" />
            <circle cx="48" cy="36" r="18" fill="#b88850" opacity="0.8" />
            <path
              d="M 20 96 Q 20 64 48 64 Q 76 64 76 96 Z"
              fill="#a87840"
              opacity="0.7"
            />
            <circle cx="42" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
            <circle cx="54" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
            <path
              d="M 43 41 Q 48 46 53 41"
              stroke="#3a2a1a"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
            <defs>
              <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6B4BA8" />
                <stop offset="100%" stopColor="#1A0F3D" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="32" fill={`url(#${gradientId})`} />
            <circle cx="32" cy="24" r="9" fill="#FFE5C4" opacity="0.9" />
            <path
              d="M 14 54 Q 32 36 50 54 L 50 64 L 14 64 Z"
              fill="#FFE5C4"
              opacity="0.85"
            />
            <circle cx="18" cy="14" r="1" fill="#FFE5C4" />
            <circle cx="48" cy="20" r="1.2" fill="#FFB5A7" />
            <circle cx="52" cy="44" r="0.8" fill="#FFE5C4" />
          </svg>
        )}
      </div>
    </div>
  );
}
