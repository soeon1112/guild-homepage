"use client";

import { useState, type MouseEvent } from "react";
import { Play } from "lucide-react";

// 채팅 링크 프리뷰 Phase 3. Phase 2가 chat.linkPreview 에 채워 넣는
// 4가지 타입(youtube/vimeo/image/opengraph)을 카드로 렌더. 발신자(mine)
// 나 dl2/cosmic 테마와 무관하게 톤 하나로 통일 — 기존 dl2 크림 팔레트
// (#f0e4cc/#5c3a1f) 그대로 재사용, 신규 토큰 0.
type LinkPreviewType = "youtube" | "vimeo" | "image" | "opengraph";

type LinkPreview = {
  type: LinkPreviewType;
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoId?: string;
};

type Props = { preview: LinkPreview };

const CARD_WIDTH = 220;

export function LinkPreviewCard({ preview }: Props) {
  const { type, url, title, description, thumbnail, videoId } = preview;

  const openLink = (e: MouseEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Phase 4 — youtube 전용 고해상도 썸네일 + 강화된 재생 버튼.
  if (type === "youtube") {
    return (
      <button
        onClick={openLink}
        className="block overflow-hidden rounded-xl text-left"
        style={{
          width: CARD_WIDTH,
          background: "#f0e4cc",
          border: "1px solid rgba(92,58,31,0.10)",
        }}
      >
        <YoutubeThumbnail videoId={videoId} fallback={thumbnail} />
        {title && (
          <div
            className="line-clamp-2 px-2 py-1.5 font-serif text-[11px]"
            style={{ color: "#5c3a1f" }}
          >
            {title}
          </div>
        )}
      </button>
    );
  }

  // Vimeo — Phase 4 미접촉, Phase 3 그대로.
  if (type === "vimeo") {
    return (
      <button
        onClick={openLink}
        className="block overflow-hidden rounded-xl text-left"
        style={{
          width: CARD_WIDTH,
          background: "#f0e4cc",
          border: "1px solid rgba(92,58,31,0.10)",
        }}
      >
        <div
          className="relative"
          style={{
            width: CARD_WIDTH,
            aspectRatio: "16/9",
            background: "rgba(92,58,31,0.15)",
          }}
        >
          {/* Vimeo는 Phase 4 전까지 썸네일이 없다 — 빈 박스로 높이만 예약. */}
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 32 }}>▶</span>
          </div>
        </div>
        {title && (
          <div
            className="line-clamp-2 px-2 py-1.5 font-serif text-[11px]"
            style={{ color: "#5c3a1f" }}
          >
            {title}
          </div>
        )}
      </button>
    );
  }

  if (type === "image") {
    return (
      <button
        onClick={openLink}
        className="block overflow-hidden rounded-xl"
        style={{ width: CARD_WIDTH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="block w-full object-cover"
          style={{ width: CARD_WIDTH, height: CARD_WIDTH }}
        />
      </button>
    );
  }

  // opengraph
  return (
    <button
      onClick={openLink}
      className="block overflow-hidden rounded-xl text-left"
      style={{
        width: CARD_WIDTH,
        background: "#f0e4cc",
        border: "1px solid rgba(92,58,31,0.10)",
      }}
    >
      {thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt=""
          className="w-full object-cover"
          style={{ width: CARD_WIDTH, aspectRatio: "16/9" }}
        />
      )}
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        {title && (
          <div
            className="line-clamp-2 font-serif text-[11px] font-semibold"
            style={{ color: "#5c3a1f" }}
          >
            {title}
          </div>
        )}
        {description && (
          <div
            className="line-clamp-3 font-serif text-[10px]"
            style={{ color: "rgba(92,58,31,0.75)" }}
          >
            {description}
          </div>
        )}
        <div
          className="truncate font-serif text-[9px]"
          style={{ color: "rgba(92,58,31,0.55)" }}
        >
          {hostnameOf(url)}
        </div>
      </div>
    </button>
  );
}

// Phase 4 — maxresdefault(1280x720) 우선 시도, 없는 비디오(404)는
// onError 로 Phase 2가 저장해둔 hqdefault 로 전환. videoId 없으면(이론상
// buildLinkPreview가 항상 채우지만 방어적으로) fallback만 사용.
function YoutubeThumbnail({
  videoId,
  fallback,
}: {
  videoId?: string;
  fallback?: string;
}) {
  const maxres = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : undefined;
  const [src, setSrc] = useState(maxres ?? fallback);

  return (
    <div
      className="relative"
      style={{
        width: CARD_WIDTH,
        aspectRatio: "16/9",
        background: "rgba(92,58,31,0.15)",
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (fallback && src !== fallback) setSrc(fallback);
          }}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full transition-colors hover:bg-black/70"
          style={{ width: 48, height: 48, background: "rgba(0,0,0,0.55)" }}
        >
          <Play size={24} color="#fff" fill="#fff" />
        </div>
      </div>
      <span
        className="absolute bottom-1.5 right-1.5 rounded font-serif text-[9px] font-semibold text-white"
        style={{ background: "rgba(0,0,0,0.6)", padding: "2px 6px" }}
      >
        YouTube
      </span>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
