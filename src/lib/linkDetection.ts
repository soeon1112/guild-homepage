// 채팅 링크 프리뷰 Phase 1 — URL 감지. Phase 2 Cloud Function이 동일
// 정규식을 재사용하므로 여기서 바뀌면 서버 쪽도 맞춰 바꿔야 한다.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function detectUrls(text: string): string[] {
  return text.match(URL_REGEX) ?? [];
}

export type TextOrUrlPart = { type: "text" | "url"; value: string };

export function splitTextWithUrls(text: string): TextOrUrlPart[] {
  const parts: TextOrUrlPart[] = [];
  let lastIndex = 0;
  text.replace(URL_REGEX, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    if (offset > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, offset) });
    }
    parts.push({ type: "url", value: match });
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}
