"use client";

import type { ReactElement } from "react";
import { MentionText, type MentionTextProps } from "@/app/components/mention/MentionText";
import { splitTextWithUrls } from "@/src/lib/linkDetection";

// 채팅 링크 프리뷰 Phase 1 — MentionText를 밖에서 감싸 URL만 파란
// 밑줄 + 클릭 가능하게 만든다. MentionText 자체는 미접촉(재사용만).
// 링크가 없는 메시지는 이전과 동일하게 MentionText를 그대로 반환해
// 회귀 위험 없음.
export type MessageTextProps = MentionTextProps;

export function MessageText({
  text,
  dl2 = true,
  style,
  ...rest
}: MessageTextProps): ReactElement {
  const parts = splitTextWithUrls(text);
  if (parts.length === 1 && parts[0].type === "text") {
    return <MentionText text={text} dl2={dl2} style={style} {...rest} />;
  }
  const linkClassName = dl2
    ? "underline text-[#1a73e8] hover:text-[#1557b0]"
    : "underline text-[#7ec8ff] hover:text-[#a7d8ff]";
  return (
    <span style={style}>
      {parts.map((part, i) =>
        part.type === "url" ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            {part.value}
          </a>
        ) : (
          <MentionText key={i} text={part.value} dl2={dl2} {...rest} />
        ),
      )}
    </span>
  );
}
