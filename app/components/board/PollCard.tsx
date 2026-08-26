"use client";

// PollCard.tsx (홈피)
// 게시글 상세에서 투표 게시글 표시 + 참여. usePollVotes hook 사용.
//
// 정책:
//   - allowMultiple=false: 단일 토글 (radio, 기존). true: 다중 토글 (checkbox).
//   - 결과 즉시 공개 (카운트 + % 바)
//   - 본인 선택 강조 — myVotes.includes(opt.id)
//   - 마감 후: 클릭 차단, "마감됨" 표시
//   - 마감 1일 이내: 임박 표시 (빨강 톤)
//   - 익명: hook 이 votersByOption 본인만 노출 + "익명 투표" 배지. 투표자
//     목록 UI 자체를 노출 안 함 (익명성 유지).
//   - 실명 투표: 옵션별 표 수를 클릭하면 투표자 닉네임 인라인 펼침.
//
// 디자인 토큰 신규 0 — dl2 cream/잉크 + cosmic abyss/별빛 옅게 재사용.

import { useState } from "react";
import type React from "react";
import {
  usePollVotes,
  type PollMeta,
} from "@/src/lib/usePollVotes";

type Props = {
  boardId: string;
  pollMeta: PollMeta;
  loginNick: string;
  isDawnlight2?: boolean;
};

function formatDeadlineLabel(meta: PollMeta): {
  text: string;
  state: "none" | "future" | "imminent" | "closed";
} {
  const dl = meta.deadline;
  if (!dl) return { text: "", state: "none" };
  const ms = dl.toMillis();
  const now = Date.now();
  const date = dl.toDate();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  if (ms < now) return { text: "마감됨", state: "closed" };
  if (ms - now < 24 * 60 * 60 * 1000)
    return { text: `마감 임박: ${iso}`, state: "imminent" };
  return { text: `마감: ${iso}`, state: "future" };
}

export function PollCard({
  boardId,
  pollMeta,
  loginNick,
  isDawnlight2 = false,
}: Props) {
  const {
    counts,
    myVotes,
    totalVotes,
    isClosed,
    isAnonymous,
    votersByOption,
    vote,
  } = usePollVotes(boardId, pollMeta, loginNick);

  // 실명 투표에서만 사용 — 클릭한 옵션의 투표자 닉네임 인라인 펼침.
  const [expandedOption, setExpandedOption] = useState<string | null>(null);

  const handleClick = async (optionId: string) => {
    if (isClosed) return;
    if (!loginNick) return;
    try {
      await vote(optionId);
    } catch (e) {
      console.error("[Poll vote] failed", e);
    }
  };

  const deadlineInfo = formatDeadlineLabel(pollMeta);

  const wrapStyle: React.CSSProperties = isDawnlight2
    ? {
        background: "rgba(254,245,230,0.7)",
        border: "1px solid rgba(92,58,31,0.2)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        margin: "12px 0",
      }
    : {
        background: "rgba(26,15,61,0.6)",
        border: "1px solid rgba(216,150,200,0.28)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        margin: "12px 0",
      };

  const titleColor = isDawnlight2 ? "#5c3a1f" : "#FFE5C4";
  const subColor = isDawnlight2
    ? "rgba(92,58,31,0.7)"
    : "rgba(244,239,255,0.75)";
  const barTrackColor = isDawnlight2
    ? "rgba(92,58,31,0.12)"
    : "rgba(216,150,200,0.15)";
  const barFillColor = isDawnlight2 ? "#ffd4b8" : "rgba(255,181,167,0.7)";
  const barFillMineColor = isDawnlight2
    ? "#ffb88a"
    : "rgba(255,181,167,0.95)";

  return (
    <div style={wrapStyle} className="board-poll-card">
      {/* 질문 + 메타 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: titleColor,
            lineHeight: 1.4,
          }}
        >
          📊 {pollMeta.question}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: subColor,
          }}
        >
          {isAnonymous && (
            <span
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                background: isDawnlight2
                  ? "rgba(92,58,31,0.1)"
                  : "rgba(216,150,200,0.15)",
              }}
            >
              익명
            </span>
          )}
          {!pollMeta.allowChange && <span>· 변경 불가</span>}
          {pollMeta.allowChange && !isClosed && <span>· 변경 가능</span>}
        </div>
      </div>

      {/* 옵션 리스트 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {pollMeta.options.map((opt) => {
          const count = counts.get(opt.id) ?? 0;
          const pct =
            totalVotes > 0 ? Math.round((count * 100) / totalVotes) : 0;
          const isMine = myVotes.includes(opt.id);
          const disabled = isClosed || !loginNick;
          const voters = votersByOption.get(opt.id) ?? [];
          // 투표자 목록은 실명 투표 + 1명 이상일 때만 클릭 가능.
          const canExpand = !isAnonymous && count > 0;
          const isExpanded = expandedOption === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleClick(opt.id)}
              disabled={disabled}
              style={{
                position: "relative",
                width: "100%",
                padding: "10px 12px",
                background: "transparent",
                border: isMine
                  ? `1.5px solid ${barFillMineColor}`
                  : isDawnlight2
                    ? "1px solid rgba(92,58,31,0.18)"
                    : "1px solid rgba(216,150,200,0.25)",
                borderRadius: 8,
                cursor: disabled ? "default" : "pointer",
                textAlign: "left",
                color: titleColor,
                opacity: disabled && !isMine ? 0.7 : 1,
                overflow: "hidden",
              }}
            >
              {/* % 바 (background) */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: isMine ? barFillMineColor : barFillColor,
                  opacity: 0.45,
                  transition: "width 240ms ease",
                  pointerEvents: "none",
                }}
              />
              {/* 텍스트 (foreground) */}
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  zIndex: 1,
                  fontSize: 14,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                  >
                    {pollMeta.allowMultiple
                      ? isMine
                        ? "☑"
                        : "☐"
                      : isMine
                        ? "●"
                        : "○"}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {opt.text}
                  </span>
                </span>
                {canExpand ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedOption(isExpanded ? null : opt.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        setExpandedOption(isExpanded ? null : opt.id);
                      }
                    }}
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      color: subColor,
                      cursor: "pointer",
                    }}
                    title="투표자 보기"
                  >
                    {count}표 {pct}% {isExpanded ? "▲" : "▼"}
                  </span>
                ) : (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      color: subColor,
                    }}
                  >
                    {count}표 {pct}%
                  </span>
                )}
              </span>
              {/* 투표자 목록 — 실명 투표에서 클릭한 옵션만 인라인 펼침. */}
              {canExpand && isExpanded && (
                <span
                  style={{
                    position: "relative",
                    display: "block",
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: isDawnlight2
                      ? "1px solid rgba(92,58,31,0.12)"
                      : "1px solid rgba(216,150,200,0.18)",
                    fontSize: 11,
                    color: subColor,
                    lineHeight: 1.5,
                    zIndex: 1,
                    textAlign: "left",
                  }}
                >
                  {voters.join(", ")}
                </span>
              )}
              {/* % 바 (background) */}
            </button>
          );
        })}
      </div>

      {/* 푸터 — 참여자 수 + 마감 표시 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: subColor,
        }}
      >
        <span>총 {totalVotes}명 참여</span>
        {deadlineInfo.state !== "none" && (
          <span
            style={{
              color:
                deadlineInfo.state === "imminent"
                  ? "#c44545"
                  : deadlineInfo.state === "closed"
                    ? isDawnlight2
                      ? "rgba(92,58,31,0.5)"
                      : "rgba(244,239,255,0.5)"
                    : subColor,
              fontWeight: deadlineInfo.state === "imminent" ? 600 : 400,
            }}
          >
            {deadlineInfo.text}
          </span>
        )}
      </div>
    </div>
  );
}
