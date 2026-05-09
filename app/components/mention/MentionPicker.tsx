"use client";

import { useMentionCandidates } from "@/src/lib/useMentionCandidates";

// `@<query>` 입력 중인 cursor 꼬리를 감지. 멘션 모드 아니면 null.
// 트리거 `@` 는 입력 시작 또는 공백 뒤에 와야만 멘션으로 친다 (이메일 등 오인 방지).
export function detectMentionTail(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const before = i > 0 ? text[i - 1] : "";
      if (before === "" || /\s/.test(before)) {
        return { start: i, query: text.slice(i + 1, cursor).normalize("NFC") };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    if (!/[\p{L}\p{N}_]/u.test(ch)) return null;
    i--;
  }
  return null;
}

// 후보 선택 시 입력 텍스트 치환. 멘션 뒤에 공백 1개 자동 추가.
export function applyMentionInsert(
  text: string,
  mentionStart: number,
  cursor: number,
  nickname: string,
): { text: string; cursor: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(cursor);
  const inserted = `@${nickname} `;
  return {
    text: before + inserted + after,
    cursor: before.length + inserted.length,
  };
}

type Props = {
  text: string;
  cursor: number | null;
  onSelect: (
    nickname: string,
    range: { start: number; end: number },
  ) => void;
  dl2?: boolean;
  maxVisible?: number;
};

export function MentionPicker({
  text,
  cursor,
  onSelect,
  dl2 = true,
  maxVisible = 6,
}: Props) {
  const candidates = useMentionCandidates();
  if (cursor == null) return null;
  const tail = detectMentionTail(text, cursor);
  if (!tail) return null;
  const q = tail.query.toLowerCase();
  const filtered = candidates
    .filter((c) =>
      q === "" ? true : c.nickname.toLowerCase().normalize("NFC").includes(q),
    )
    .slice(0, maxVisible);
  if (filtered.length === 0) return null;

  const surface = dl2 ? "#fef5e6" : "rgba(26,15,61,0.96)";
  const labelColor = dl2 ? "#2a4570" : "#f4efff";
  const borderC = dl2 ? "rgba(42,69,112,0.18)" : "rgba(216,150,200,0.25)";
  const allColor = dl2 ? "#b85420" : "#ffb5a7";

  return (
    <ul
      role="listbox"
      style={{
        listStyle: "none",
        margin: 0,
        padding: "4px 0",
        background: surface,
        border: `1px solid ${borderC}`,
        borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
      }}
    >
      {filtered.map((c) => (
        <li key={c.nickname} style={{ margin: 0 }}>
          <button
            type="button"
            onMouseDown={(e) => {
              // mousedown 으로 잡아서 input blur 전에 선택 (blur 시 dropdown 사라지는 함정 회피).
              e.preventDefault();
              onSelect(c.nickname, { start: tail.start, end: cursor });
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 14px",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: c.isAll ? allColor : labelColor,
              fontWeight: c.isAll ? 700 : 500,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            @{c.nickname}
          </button>
        </li>
      ))}
    </ul>
  );
}
