"use client";

import type { CSSProperties, JSX, ReactElement } from "react";
import { parseMentions } from "@/src/lib/mentions";

// Tailwind v4 layer cascade 함정 회피 — inline style 로만 강조.
export type MentionTextProps = {
  text: string;
  dl2?: boolean;
  mentionColor?: string;
  onSelectMention?: (nickname: string) => void;
  onSelectAll?: () => void;
  knownNicknames?: ReadonlySet<string>;
  // 호출자가 wrapping element 결정 (기본 inline span — <p> 안에 넣어도 안전).
  as?: "span" | "p" | "div";
  style?: CSSProperties;
  className?: string;
};

export function MentionText({
  text,
  dl2 = true,
  mentionColor,
  onSelectMention,
  onSelectAll,
  knownNicknames,
  as = "span",
  style,
  className,
}: MentionTextProps): ReactElement {
  const { tokens } = parseMentions(text, { knownNicknames });
  const color = mentionColor ?? (dl2 ? "#2a4570" : "#ffb5a7");
  const allColor = dl2 ? "#b85420" : "#ffb5a7";
  const Tag = as as keyof JSX.IntrinsicElements;
  return (
    <Tag style={style} className={className}>
      {tokens.map((tok, i) => {
        if (tok.type === "text") {
          return <span key={i}>{tok.value}</span>;
        }
        const tokColor = tok.type === "all" ? allColor : color;
        const onClick =
          tok.type === "all"
            ? onSelectAll
            : onSelectMention
              ? () => onSelectMention(tok.nickname)
              : undefined;
        return (
          <span
            key={i}
            onClick={onClick}
            style={{
              color: tokColor,
              fontWeight: 700,
              cursor: onClick ? "pointer" : "default",
            }}
          >
            {tok.value}
          </span>
        );
      })}
    </Tag>
  );
}
