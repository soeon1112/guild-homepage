// sortMembers.ts
// 길드원 한 줄 목록 정렬 — 영어(a-z/A-Z로 시작) 먼저, 그 외(한글/숫자/
// 특수문자/이모지로 시작하는 닉네임)는 한글 로케일 정렬 그룹으로 묶는다.
// 기존 members 페이지의 nicknameCompare(app/members/page.tsx)와 결과는
// 동일하되, 그룹을 먼저 나눠 각각 정렬하는 형태로 작성했다.

export function sortMembers<T extends { nickname: string }>(members: T[]): T[] {
  const english: T[] = [];
  const korean: T[] = [];

  for (const m of members) {
    const firstChar = m.nickname.charAt(0);
    if (/[a-zA-Z]/.test(firstChar)) {
      english.push(m);
    } else {
      korean.push(m);
    }
  }

  english.sort((a, b) => a.nickname.localeCompare(b.nickname, "en"));
  korean.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));

  return [...english, ...korean];
}
