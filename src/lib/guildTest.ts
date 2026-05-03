// Shared question-tree + result definitions for the "나는 길드 정리
// 대상일까?" self-check. Mirrored verbatim in
// dawnlight-app/src/lib/guildTest.ts (keep in sync).
//
// Editing the tree: change BOTH copies. The path string saved to
// Firestore is human-readable (e.g. "Q1-A → Q2A-B → 결과:D") so the
// admin page can render walkthroughs even if the tree later diverges.

// ── Visibility gate ──────────────────────────────────────────
// Soft-launch like the original pet system: only this nickname sees
// the banner + can open /guild-test. Flip to `null` to release.
export const GUILD_TEST_ADMIN_NICKNAME: string | null = "언쏘";

export function canSeeGuildTest(
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  if (GUILD_TEST_ADMIN_NICKNAME === null) return true;
  return nickname === GUILD_TEST_ADMIN_NICKNAME;
}

// ── Tree ─────────────────────────────────────────────────────
export type ResultKey = "A" | "B" | "C" | "D" | "E";

export type QuestionId =
  | "Q1"
  | "Q2A"
  | "Q2B"
  | "Q3A"
  | "Q3B"
  | "Q3C"
  | "Q3D"
  | "Q4A"
  | "Q4B"
  | "Q4C"
  | "Q4D"
  | "Q4E"
  | "Q4F"
  | "Q4G"
  | "Q4H"
  | "Q5A"
  | "Q5B"
  | "Q5C"
  | "Q5D"
  | "Q5E"
  | "Q5F"
  | "Q6A";

export type NextStep =
  | { type: "question"; id: QuestionId }
  | { type: "result"; key: ResultKey };

export type Question = {
  id: QuestionId;
  text: string;
  options: { label: string; key: "A" | "B"; next: NextStep }[];
};

export const QUESTIONS: Record<QuestionId, Question> = {
  Q1: {
    id: "Q1",
    text: "모비노기에 잘 들어가시나요?",
    options: [
      { key: "A", label: "잘 못 들어간다", next: { type: "question", id: "Q2A" } },
      { key: "B", label: "잘 들어간다", next: { type: "question", id: "Q2B" } },
    ],
  },
  Q2A: {
    id: "Q2A",
    text: "어떤 이유인가요?",
    options: [
      { key: "A", label: "들어가는 게 싫다", next: { type: "question", id: "Q3A" } },
      { key: "B", label: "들어가고 싶어도 못 들어간다", next: { type: "question", id: "Q3B" } },
    ],
  },
  Q2B: {
    id: "Q2B",
    text: "어떤가요?",
    options: [
      { key: "A", label: "재미있게 하고 있다", next: { type: "question", id: "Q3C" } },
      { key: "B", label: "그치만 재미가 없고 할 게 없다", next: { type: "question", id: "Q3D" } },
    ],
  },
  Q3A: {
    id: "Q3A",
    text: "왜 그런가요?",
    options: [
      { key: "A", label: "모태기가 왔다", next: { type: "question", id: "Q4A" } },
      { key: "B", label: "재미가 없고 할 게 없다", next: { type: "question", id: "Q4B" } },
    ],
  },
  Q3B: {
    id: "Q3B",
    text: "왜 못 들어가시나요?",
    options: [
      { key: "A", label: "현생이 너무 바쁘다", next: { type: "question", id: "Q4C" } },
      { key: "B", label: "사정이 있다", next: { type: "question", id: "Q4D" } },
    ],
  },
  Q3C: {
    id: "Q3C",
    text: "길드 활동은?",
    options: [
      { key: "A", label: "길드 활동도 활발히 하고 있다", next: { type: "question", id: "Q4E" } },
      { key: "B", label: "길드 활동은 활발히 못 하고 있다", next: { type: "question", id: "Q4F" } },
    ],
  },
  Q3D: {
    id: "Q3D",
    text: "어떤가요?",
    options: [
      { key: "A", label: "그래도 길드에 계속 머물고 싶다", next: { type: "question", id: "Q4G" } },
      { key: "B", label: "길드 활동도 어려움을 느낀다", next: { type: "question", id: "Q4H" } },
    ],
  },
  Q4A: {
    id: "Q4A",
    text: "어떻게 할 생각인가요?",
    options: [
      { key: "A", label: "극복할 생각이다", next: { type: "question", id: "Q5A" } },
      { key: "B", label: "조만간 접을 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q4B: {
    id: "Q4B",
    text: "어떻게?",
    options: [
      { key: "A", label: "그렇지만 접을 생각은 없다", next: { type: "question", id: "Q5B" } },
      { key: "B", label: "조만간 접을 생각이다", next: { type: "result", key: "D" } },
    ],
  },
  Q4C: {
    id: "Q4C",
    text: "여유 생기면?",
    options: [
      { key: "A", label: "자주 접속할 생각", next: { type: "question", id: "Q5C" } },
      { key: "B", label: "여유 생겨도 자주 접속 못할 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q4D: {
    id: "Q4D",
    text: "사정 해결되면?",
    options: [
      { key: "A", label: "자주 접속할 생각", next: { type: "question", id: "Q5D" } },
      { key: "B", label: "사정 해결되도 자주 접속 못할 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q4E: {
    id: "Q4E",
    text: "앞으로는?",
    options: [
      { key: "A", label: "앞으로도 활발히 할 생각", next: { type: "result", key: "A" } },
      { key: "B", label: "앞으로는 활발히 하기 어려울 거 같다", next: { type: "question", id: "Q5E" } },
    ],
  },
  Q4F: {
    id: "Q4F",
    text: "활발히 못 하는 이유?",
    options: [
      { key: "A", label: "현생 바빠서 숙제만 해치우고 나간다", next: { type: "question", id: "Q5F" } },
      { key: "B", label: "길드 활동에 큰 의미를 두지 못 하겠다", next: { type: "result", key: "D" } },
    ],
  },
  Q4G: {
    id: "Q4G",
    text: "길드 활동은?",
    options: [
      { key: "A", label: "길드 활동은 활발히 할 생각", next: { type: "result", key: "A" } },
      { key: "B", label: "활발히 하기는 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q4H: {
    id: "Q4H",
    text: "어떤 어려움?",
    options: [
      { key: "A", label: "길드 활동에 적응하기가 어렵다", next: { type: "result", key: "E" } },
      { key: "B", label: "길드 활동을 활발히 할 의지가 없다", next: { type: "result", key: "D" } },
    ],
  },
  Q5A: {
    id: "Q5A",
    text: "극복까지 얼마나?",
    options: [
      { key: "A", label: "모태기 극복될 때까지 기다려달라", next: { type: "result", key: "B" } },
      { key: "B", label: "모태기 극복까지 오래 걸릴 거 같다", next: { type: "question", id: "Q6A" } },
    ],
  },
  Q5B: {
    id: "Q5B",
    text: "길드 활동은?",
    options: [
      { key: "A", label: "길드 활동은 계속 활발히 할 생각", next: { type: "result", key: "A" } },
      { key: "B", label: "길드 활동도 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q5C: {
    id: "Q5C",
    text: "여유 생기면 길드 활동?",
    options: [
      { key: "A", label: "그때 되면 다시 활발히", next: { type: "result", key: "B" } },
      { key: "B", label: "그때 되도 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q5D: {
    id: "Q5D",
    text: "사정 해결되면 길드 활동?",
    options: [
      { key: "A", label: "그때 되면 다시 활발히", next: { type: "result", key: "B" } },
      { key: "B", label: "그때 되도 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q5E: {
    id: "Q5E",
    text: "길드는?",
    options: [
      { key: "A", label: "길드는 나가고 싶지 않다", next: { type: "result", key: "C" } },
      { key: "B", label: "길드를 나갈 생각이다", next: { type: "result", key: "D" } },
    ],
  },
  Q5F: {
    id: "Q5F",
    text: "현생 여유 생기면?",
    options: [
      { key: "A", label: "다시 활발히 할 생각", next: { type: "result", key: "B" } },
      { key: "B", label: "여유 생겨도 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
  Q6A: {
    id: "Q6A",
    text: "오래 걸려도 길드 활동은?",
    options: [
      { key: "A", label: "그래도 극복하면 다시 활발히", next: { type: "result", key: "B" } },
      { key: "B", label: "아무래도 다시 하기 어려울 거 같다", next: { type: "result", key: "D" } },
    ],
  },
};

// ── Results ──────────────────────────────────────────────────
export type ResultDef = {
  name: string; // short label used in admin filters
  emoji: string; // hero emoji shown above the message
  body: string[]; // paragraphs (newline-separated within each)
};

export const RESULTS: Record<ResultKey, ResultDef> = {
  A: {
    name: "활발 응원",
    emoji: "✨",
    body: [
      "당신은 새벽빛의 빛나는 별이에요.",
      "언제나 활발하게 함께해주셔서\n정말 고맙습니다.\n앞으로도 우리 길드에서\n밝게 빛나주세요. 🌟",
      "오늘도 새벽빛에 머물러주셔서 감사해요.",
    ],
  },
  B: {
    name: "따뜻한 기다림",
    emoji: "🌙",
    body: [
      "지금은 잠시 멀어졌더라도,\n당신의 자리는 새벽빛에 그대로 있어요.",
      "서두르지 마세요.\n모비노기로 다시 돌아오는 그날까지,\n우리는 기다릴게요.",
      "다시 만나는 날, 따뜻하게 맞이할 준비가 되어있답니다. ✨",
    ],
  },
  C: {
    name: "면담 제안",
    emoji: "💬",
    body: [
      "당신의 마음이 어떤지 조금 더 듣고 싶어요.",
      "길마와 잠깐 이야기 나눠봐요.\n혼자 고민하지 말고,\n편하게 마음을 들려주세요.",
      "카카오톡 또는 인게임에서\n'언쏘'에게 귓속말 또는 1:1 톡 부탁드려요. 💛",
    ],
  },
  D: {
    name: "정중한 정리",
    emoji: "🌌",
    body: [
      "솔직하게 답해주셔서 감사합니다.",
      "당신의 선택을 존중해요.\n지금까지 새벽빛에서 함께해주신 시간,\n정말 소중했어요.",
      "준비되시면, 스스로 길드를 정리해주시면\n조용히 보내드릴게요.",
      "언제든 다시 길드에 돌아오고 싶어지신다면,\n문은 열려있을 거예요. 🌠",
      "그동안 고마웠습니다.",
    ],
  },
  E: {
    name: "적응 도움",
    emoji: "🤝",
    body: [
      "먼저, 그동안 충분히 신경 써드리지 못해 미안해요.",
      "새벽빛에 적응하는 게 어려우셨군요.\n혼자 끙끙 앓지 마시고,\n언쏘에게 편하게 1:1로 말씀해주세요.",
      "어떤 부분이 어려운지,\n어떻게 도와드릴 수 있을지\n함께 이야기 나눠봐요.",
      "당신이 새벽빛에 잘 머물 수 있도록\n도울게요. 💛",
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────
// answers is the user's selection list, e.g. [{q:"Q1",opt:"A"}, {q:"Q2A",opt:"B"}, ...].
// Returns an array of compact strings ["Q1-A", "Q2A-B", ...] used in
// Firestore + admin walkthrough rendering.
export function answersToPath(
  answers: { q: QuestionId; opt: "A" | "B" }[],
): string[] {
  return answers.map((a) => `${a.q}-${a.opt}`);
}

// Total possible question count is 17 (Q1..Q6A).  Progress shown in UI
// uses the longest path (6 questions) as the denominator so the bar
// fills monotonically; at most this slightly *over*-fills near the end
// when the user takes a shorter branch, which is fine.
export const MAX_QUESTIONS = 6;
