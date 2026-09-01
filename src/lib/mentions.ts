// 멘션 파서 — 앱/웹/functions 3곳에서 동일 동작.
// `@<nickname>` 패턴을 추출하고, `@연합원들` 은 별도 토큰으로 분리한다.
// 닉네임은 NFC 정규화한 뒤 매칭한다 (members doc id ASCII 함정과 같은 결).

// "연합원들"로 통일 전엔 "우리길원들"이었다 — 새 입력/자동완성 라벨은
// 항상 ALL_MENTION_KEYWORD(new) 를 쓰지만, 이미 저장된 과거 메시지의
// "@우리길원들" 도 계속 전체-멘션으로 인식해야 해서(마이그레이션 없음)
// LEGACY_ALL_MENTION_KEYWORDS 에 옛 키워드를 남겨두고 둘 다 검사한다.
export const ALL_MENTION_KEYWORD = "연합원들";
const LEGACY_ALL_MENTION_KEYWORDS: readonly string[] = ["우리길원들"];

function isAllMentionKeyword(target: string): boolean {
  return target === ALL_MENTION_KEYWORD || LEGACY_ALL_MENTION_KEYWORDS.includes(target);
}

export type MentionToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; nickname: string }
  | { type: "all"; value: string };

export interface ParseMentionsOptions {
  knownNicknames?: ReadonlySet<string>;
}

export interface ParsedMentions {
  tokens: MentionToken[];
  mentionedNicknames: string[];
  hasAllMention: boolean;
}

const MENTION_RE = /@([\p{L}\p{N}_]+)/gu;

export function normalizeNickname(nick: string): string {
  return (nick || "").normalize("NFC");
}

export function parseMentions(
  text: string,
  opts: ParseMentionsOptions = {},
): ParsedMentions {
  const known = opts.knownNicknames;
  const src = (text || "").normalize("NFC");
  const tokens: MentionToken[] = [];
  const mentioned = new Set<string>();
  let hasAll = false;
  let cursor = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(src)) !== null) {
    const matchStart = m.index;
    const matchEnd = matchStart + m[0].length;
    if (matchStart > cursor) {
      tokens.push({ type: "text", value: src.slice(cursor, matchStart) });
    }
    const target = m[1];
    if (isAllMentionKeyword(target)) {
      tokens.push({ type: "all", value: m[0] });
      hasAll = true;
    } else if (!known || known.has(target)) {
      tokens.push({ type: "mention", value: m[0], nickname: target });
      mentioned.add(target);
    } else {
      tokens.push({ type: "text", value: m[0] });
    }
    cursor = matchEnd;
  }
  if (cursor < src.length) {
    tokens.push({ type: "text", value: src.slice(cursor) });
  }
  return {
    tokens,
    mentionedNicknames: Array.from(mentioned),
    hasAllMention: hasAll,
  };
}

export function hasAnyMention(text: string): boolean {
  if (!text) return false;
  MENTION_RE.lastIndex = 0;
  return MENTION_RE.test(text.normalize("NFC"));
}
