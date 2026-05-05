// 활동 피드 / 푸시 메시지에서 텍스트를 잘라내거나 한국어 조사를 붙일 때
// 쓰는 작은 헬퍼들. 인앱 NebulaWhispers + 푸시 트리거에서 일관되게
// 호출하도록 한 곳에 모아둠.

export function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// 끝 글자에 받침이 있으면 true. 한국어 가-힣 외에는 매핑/휴리스틱.
//
// 입력의 trailing 부호(「」, ", ', !, ?, 괄호, 이모지 등)는 발음에 기여
// 하지 않으니 먼저 떼어내고 그 앞의 letter 로 판단한다. 예:
//   「카페인에 찌든 석궁사수」 → "수" → 받침 無 → "를"
//   "Hello!" → "o" → 모음 → 無 → "를"
function hasFinalConsonant(word: string): boolean {
  if (!word) return false;

  // letter 로 인정할 끝 위치 찾기.
  let i = word.length - 1;
  while (i >= 0) {
    const c = word[i];
    const code = c.charCodeAt(0);
    const isHangul = code >= 0xac00 && code <= 0xd7a3;
    const isCjk = code >= 0x3040 && code <= 0x9fff;
    const isDigit = c >= "0" && c <= "9";
    const lower = c.toLowerCase();
    const isAscii = lower >= "a" && lower <= "z";
    if (isHangul || isCjk || isDigit || isAscii) break;
    i--;
  }
  if (i < 0) return false;

  const last = word[i];
  const code = last.charCodeAt(0);

  // 한국어 음절 가(0xAC00) ~ 힣(0xD7A3) — (code - 0xAC00) % 28 !== 0 면 받침 有.
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }

  // 한자 / 일본어 가나 등은 가장 흔한 발음 가정으로 "받침 있음" fallback.
  if (code >= 0x3040) return true;

  // 숫자: 한국어 발음 기준. 1=일, 3=삼, 6=육, 7=칠, 8=팔, 0=영 → 받침 有 / 2=이, 4=사, 5=오, 9=구 → 無.
  if (last >= "0" && last <= "9") {
    return ["0", "1", "3", "6", "7", "8"].includes(last);
  }

  // 알파벳: 받침처럼 들리는 자음으로 끝나면 有. 모음 끝은 無.
  const lower = last.toLowerCase();
  if (lower >= "a" && lower <= "z") {
    return !["a", "e", "i", "o", "u", "w", "y"].includes(lower);
  }

  return true;
}

export type JosaType = "을/를" | "이/가" | "은/는";

export function josa(word: string, type: JosaType): string {
  const has = hasFinalConsonant(word);
  switch (type) {
    case "을/를":
      return has ? "을" : "를";
    case "이/가":
      return has ? "이" : "가";
    case "은/는":
      return has ? "은" : "는";
  }
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-05-08" → "5/8 (목)". 잘못된 형식이면 원본 그대로 반환.
export function formatScheduleDate(date: string): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return date;
  return `${month}/${day} (${WEEKDAY_KO[d.getDay()]})`;
}
