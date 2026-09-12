"use client";

import type { MouseEvent } from "react";

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
  const { type, url, title, description, thumbnail } = preview;

  const openLink = (e: MouseEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (type === "youtube" || type === "vimeo") {
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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
