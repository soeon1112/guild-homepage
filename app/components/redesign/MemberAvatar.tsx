"use client";

import { useEffect, useId, useState } from "react";

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
};

/**
 * Shared circular member avatar for the redesigned surfaces.
 *
 * - When `imageUrl` is set (and loads), shows the profile picture in a
 *   circular crop with a stardust border.
 * - Otherwise falls back to the v0 neutral silhouette (head + shoulders +
 *   decorative stars) — no initial-letter disc (per design-fixes rule).
 * - Optional `ring` renders v0's rotating conic-gradient halo.
 */
export function MemberAvatar({
  imageUrl,
  nickname,
  size = 48,
  ring,
  className,
}: MemberAvatarProps) {
  const gradientId = `mavatar-${useId().replace(/:/g, "")}`;
  const [imgError, setImgError] = useState(false);

  // Reset error state when the source URL changes
  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  const showImage = !!imageUrl && !imgError;

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {ring && (
        <div
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, #FFE5C4, #D896C8, #6B4BA8, #FFB5A7, #FFE5C4)",
            filter: "blur(6px)",
            opacity: 0.7,
            animation: "orbit-rotate 12s linear infinite",
          }}
        />
      )}

      <div
        className="relative overflow-hidden rounded-full border-2 border-stardust/70 bg-abyss-deep"
        style={{ width: size, height: size }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={nickname ? `${nickname}의 프로필 사진` : "프로필 사진"}
            className="block h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
            <defs>
              <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6B4BA8" />
                <stop offset="100%" stopColor="#1A0F3D" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="32" fill={`url(#${gradientId})`} />
            {/* Neutral silhouette — head + shoulders + decorative stars */}
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
