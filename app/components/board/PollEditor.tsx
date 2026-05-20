"use client";

// PollEditor.tsx (홈피)
// 게시판 투표 게시글 작성용 폼 — write/page + edit/page 에서 import.
//
// 구조:
//   - 질문 input
//   - 옵션 2~5개 (각 input + 삭제 버튼, 마지막에 추가 버튼)
//   - 익명 체크박스 (기본 OFF)
//   - 변경 가능 체크박스 (기본 ON)
//   - 마감일 옵셔널 (날짜 input "YYYY-MM-DD")
//
// 디자인 토큰 신규 0 — dl2 cream/잉크 / cosmic abyss/별빛 옅게 재사용.

import type React from "react";

export type PollFormOption = {
  id: string;
  text: string;
};

export type PollFormState = {
  question: string;
  options: PollFormOption[];
  // "YYYY-MM-DD" 형식 또는 빈 문자열. 빈 문자열 = 마감일 없음.
  deadline: string;
  anonymous: boolean;
  allowChange: boolean;
};

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 5;

export function createInitialPollState(): PollFormState {
  return {
    question: "",
    options: [
      { id: "1", text: "" },
      { id: "2", text: "" },
    ],
    deadline: "",
    anonymous: false,
    allowChange: true,
  };
}

// validation — submit 전 호출. 첫 에러 메시지 반환, OK 면 null.
export function validatePollForm(state: PollFormState): string | null {
  if (!state.question.trim()) return "투표 질문을 입력해주세요.";
  const filled = state.options.filter((o) => o.text.trim());
  if (filled.length < POLL_MIN_OPTIONS)
    return `옵션을 최소 ${POLL_MIN_OPTIONS}개 입력해주세요.`;
  if (filled.length > POLL_MAX_OPTIONS)
    return `옵션은 최대 ${POLL_MAX_OPTIONS}개까지 가능합니다.`;
  if (state.deadline) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.deadline);
    if (!m) return "마감일은 YYYY-MM-DD 형식으로 입력해주세요.";
    const d = new Date(`${state.deadline}T23:59:59`);
    if (Number.isNaN(d.getTime())) return "마감일이 올바르지 않습니다.";
    if (d.getTime() < Date.now()) return "마감일은 미래여야 합니다.";
  }
  return null;
}

type Props = {
  value: PollFormState;
  onChange: (next: PollFormState) => void;
  isDawnlight2?: boolean;
  // edit 모드에서 옵션 변경 잠금 (사용자 결정 #11: 시작된 투표 옵션 변경 불가).
  lockOptions?: boolean;
};

export function PollEditor({
  value,
  onChange,
  isDawnlight2 = false,
  lockOptions = false,
}: Props) {
  const setQuestion = (q: string) => onChange({ ...value, question: q });
  const setOptionText = (id: string, text: string) =>
    onChange({
      ...value,
      options: value.options.map((o) => (o.id === id ? { ...o, text } : o)),
    });
  const addOption = () => {
    if (lockOptions) return;
    if (value.options.length >= POLL_MAX_OPTIONS) return;
    const nextId = String(
      Math.max(0, ...value.options.map((o) => Number(o.id) || 0)) + 1,
    );
    onChange({
      ...value,
      options: [...value.options, { id: nextId, text: "" }],
    });
  };
  const removeOption = (id: string) => {
    if (lockOptions) return;
    if (value.options.length <= POLL_MIN_OPTIONS) return;
    onChange({
      ...value,
      options: value.options.filter((o) => o.id !== id),
    });
  };

  const wrapStyle: React.CSSProperties = isDawnlight2
    ? {
        background: "rgba(254,245,230,0.65)",
        border: "1px solid rgba(92,58,31,0.18)",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }
    : {
        background: "rgba(26,15,61,0.55)",
        border: "1px solid rgba(216,150,200,0.25)",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      };

  const labelColor = isDawnlight2 ? "#5c3a1f" : "#FFE5C4";
  const subColor = isDawnlight2
    ? "rgba(92,58,31,0.65)"
    : "rgba(244,239,255,0.7)";
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: 6,
    background: isDawnlight2 ? "rgba(255,255,255,0.7)" : "rgba(11,8,33,0.5)",
    border: isDawnlight2
      ? "1px solid rgba(92,58,31,0.22)"
      : "1px solid rgba(216,150,200,0.3)",
    color: labelColor,
    outline: "none",
  };

  return (
    <div style={wrapStyle}>
      {/* 질문 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, color: subColor }}>📊 투표 질문</label>
        <input
          type="text"
          value={value.question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="예: 이번 주말 미팅 시간"
          maxLength={120}
          style={inputStyle}
        />
      </div>

      {/* 옵션 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: subColor }}>
          선택지 ({POLL_MIN_OPTIONS}~{POLL_MAX_OPTIONS}개)
          {lockOptions && " — 시작된 투표는 선택지 변경 불가"}
        </label>
        {value.options.map((o, i) => (
          <div
            key={o.id}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span style={{ width: 18, color: subColor, fontSize: 13 }}>
              {i + 1}.
            </span>
            <input
              type="text"
              value={o.text}
              onChange={(e) => setOptionText(o.id, e.target.value)}
              placeholder={`옵션 ${i + 1}`}
              maxLength={80}
              disabled={lockOptions}
              style={{ ...inputStyle, flex: 1 }}
            />
            {value.options.length > POLL_MIN_OPTIONS && !lockOptions && (
              <button
                type="button"
                onClick={() => removeOption(o.id)}
                aria-label="옵션 삭제"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  color: subColor,
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {value.options.length < POLL_MAX_OPTIONS && !lockOptions && (
          <button
            type="button"
            onClick={addOption}
            style={{
              alignSelf: "flex-start",
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 999,
              border: isDawnlight2
                ? "1px dashed rgba(92,58,31,0.35)"
                : "1px dashed rgba(216,150,200,0.4)",
              background: "transparent",
              color: labelColor,
              cursor: "pointer",
            }}
          >
            + 옵션 추가
          </button>
        )}
      </div>

      {/* 익명 / 변경 가능 */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: labelColor,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={value.anonymous}
            onChange={(e) =>
              onChange({ ...value, anonymous: e.target.checked })
            }
          />
          익명 투표
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: labelColor,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={value.allowChange}
            onChange={(e) =>
              onChange({ ...value, allowChange: e.target.checked })
            }
          />
          마감 전 변경 가능
        </label>
      </div>

      {/* 마감일 — 옵셔널 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, color: subColor }}>
          마감일 (옵셔널, 비우면 영구)
        </label>
        <input
          type="date"
          value={value.deadline}
          onChange={(e) => onChange({ ...value, deadline: e.target.value })}
          style={{ ...inputStyle, maxWidth: 200 }}
        />
      </div>
    </div>
  );
}
