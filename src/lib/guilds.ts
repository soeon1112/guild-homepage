// guilds.ts
// 서버(아이라/던컨) ↔ 길드 매핑 상수. Phase 1 신규 — 사용처는 Phase 2(가입 폼
// 서버 선택) 부터. "연합"은 실제 길드가 아니라 guilds/union(isUnion) 가상
// 문서로, 길드 4개 전체를 가리키는 통칭일 뿐이라 여기엔 포함하지 않는다.
//
// 각 서버 내 순서는 영어(a-z) → 한글(가나다) — sortMembers.ts 의 그룹 정렬
// 결과와 동일하게 맞춘 하드코딩. Firestore 조회 결과가 아니라 고정 상수이므로
// 새 서버/길드가 생기면 이 파일을 직접 수정한다.

export const SERVERS = ["duncan", "aira"] as const;
export type Server = (typeof SERVERS)[number];

export const SERVER_LABELS: Record<Server, string> = {
  duncan: "던컨",
  aira: "아이라",
};

export const GUILDS_BY_SERVER: Record<Server, string[]> = {
  duncan: ["아시겠어요"],
  aira: ["END", "새벽빛", "에린의수호자들", "평화"],
};

export const ALL_GUILDS: string[] = [
  ...GUILDS_BY_SERVER.duncan,
  ...GUILDS_BY_SERVER.aira,
];

export const GUILD_SERVER_MAP: Record<string, Server> = {
  아시겠어요: "duncan",
  END: "aira",
  새벽빛: "aira",
  에린의수호자들: "aira",
  평화: "aira",
};
