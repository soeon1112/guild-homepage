// Pet system — shared data + logic. Mirrored verbatim in
// dawnlight-app/src/lib/pets.ts (keep in sync; see
// memory/feedback_auto_dual_deploy.md).
//
// Theme-independent palette: every color used here is a literal hex
// chosen to read on both light and dark backgrounds. Do not pull from
// the cosmic theme tokens — pet UI is intentionally portable.

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Admin gate ────────────────────────────────────────────────
// Pet system was soft-launched gated to this nickname; full release
// flipped `PET_ADMIN_NICKNAME` to `null` so every signed-in member
// can see the pet UI. The debug controls (성장 단계 / 펫 종류 강제 변경)
// stay limited to `PET_DEBUG_ADMIN_NICKNAME` so they don't bleed into
// regular gameplay.
export const PET_ADMIN_NICKNAME: string | null = null;
export const PET_DEBUG_ADMIN_NICKNAME = "언쏘";

export function canSeePets(nickname: string | null | undefined): boolean {
  if (!nickname) return false;
  if (PET_ADMIN_NICKNAME === null) return true;
  return nickname === PET_ADMIN_NICKNAME;
}

export function canDebugPet(nickname: string | null | undefined): boolean {
  if (!nickname) return false;
  return nickname === PET_DEBUG_ADMIN_NICKNAME;
}

// ── Pet types ─────────────────────────────────────────────────
export type PetType =
  | "cat"
  | "dog"
  | "rabbit"
  | "fox"
  | "hamster"
  | "owl"
  | "bear"
  | "wolf"
  | "panda";

export const PET_TYPES: { id: PetType; label: string; emoji: string }[] = [
  { id: "cat", label: "고양이", emoji: "고양이" },
  { id: "dog", label: "강아지", emoji: "강아지" },
  { id: "rabbit", label: "토끼", emoji: "토끼" },
  { id: "fox", label: "여우", emoji: "여우" },
  { id: "hamster", label: "햄스터", emoji: "햄스터" },
  { id: "owl", label: "올빼미", emoji: "올빼미" },
  { id: "bear", label: "곰", emoji: "곰" },
  { id: "wolf", label: "늑대", emoji: "늑대" },
  { id: "panda", label: "판다", emoji: "판다" },
];

// ── Growth stages ─────────────────────────────────────────────
//   1. 알       (0~3일)
//   2. 아기     (3~10일)   stage = 7일
//   3. 어린이   (10~20일)  stage = 10일
//   4. 청소년   (20~35일)  stage = 15일
//   5. 성체     (35일~)
//
// 레벨 = 성장 단계 (Lv.1=알, Lv.2=아기, Lv.3=어린이, Lv.4=청소년, Lv.5=성체).
// 경험치바는 "다음 단계까지 남은 경험치"를 보여준다.
//
// `dayMin` are the minimums for "best-case, well-managed" growth.
// They are NOT shortcut-able — the pet must wait the full calendar
// time before each transition.
//
// `expMin` calibration (현실치 ~300 EXP/day, 8~10시간 접속 기준):
//   각 상호작용 하루 이론 최대 — feed 120, play 120, wash 20, walk 120,
//   pet 144, treat 60, sleep 15, train 120 → 합계 719/day.
//   현실(쿨타임 70~80%만 활용) ≈ 300/day. 이를 최소 일수와 곱한 누적값:
//     baby  : 3일  × 300 =   900
//     child : 10일 × 300 =  3000
//     teen  : 20일 × 300 =  6000
//     adult : 35일 × 300 = 10500
//   "잘 키우면" 최소 일수에 정확히 경험치도 차게 설계됨. 게으르면
//   dayMin 먼저 도달 → 경험치 채워질 때까지 며칠 더 걸림.
//
// On top of that, `doInteraction` halves the exp gain if ANY current
// status (hunger/happiness/clean) has decayed to 30% or below — so
// poor management both delays interactions (cooldown) AND throttles
// each one's reward. 특별 케이크(유료, 1시간 EXP ×2)는 보너스 가속용
// 이며 위 baseline에는 포함되지 않음.
export type PetStage = "egg" | "baby" | "child" | "teen" | "adult";

export const PET_STAGES: {
  id: PetStage;
  label: string;
  dayMin: number;
  expMin: number;
}[] = [
  { id: "egg",   label: "알",     dayMin: 0,  expMin: 0     },
  { id: "baby",  label: "아기",   dayMin: 3,  expMin: 900   },
  { id: "child", label: "어린이", dayMin: 10, expMin: 3000  },
  { id: "teen",  label: "청소년", dayMin: 20, expMin: 6000  },
  { id: "adult", label: "성체",   dayMin: 35, expMin: 10500 },
];

export function computeStage(createdAtMs: number, exp: number, nowMs: number): PetStage {
  const days = Math.max(0, (nowMs - createdAtMs) / (1000 * 60 * 60 * 24));
  // Walk from highest to lowest. Both day AND exp must be met — no
  // exp fast-track that lets a player skip calendar time.
  for (let i = PET_STAGES.length - 1; i >= 0; i--) {
    const s = PET_STAGES[i];
    if (days >= s.dayMin && exp >= s.expMin) return s.id;
  }
  return "egg";
}

// Progress 0..1 toward the next stage (for UI bar). Returns 1 at adult.
//
// Purely EXP-based so that percent / gauge / "got/span XP" 표기가 모두
// 일치한다. 실제 단계 advance는 `computeStage`에서 days ≥ dayMin AND
// exp ≥ expMin 둘 다 충족해야 하므로, EXP 바가 100%여도 dayMin 미만
// 이면 단계는 안 올라간다(이건 의도된 동작).
export function computeStageProgress(
  createdAtMs: number,
  exp: number,
  nowMs: number,
): number {
  const stage = computeStage(createdAtMs, exp, nowMs);
  const idx = PET_STAGES.findIndex((s) => s.id === stage);
  if (idx === PET_STAGES.length - 1) return 1;
  const cur = PET_STAGES[idx];
  const next = PET_STAGES[idx + 1];
  if (next.expMin <= cur.expMin) return 1;
  const expProg = (exp - cur.expMin) / (next.expMin - cur.expMin);
  return Math.max(0, Math.min(1, expProg));
}

// ── Decay rates ───────────────────────────────────────────────
// Per spec: hunger -10% per 3h, happiness -10% per 6h, clean -10% per 12h.
// Stored as percent-points lost per millisecond. Status is bounded to [0, 100].
const DECAY_PER_MS = {
  hunger: 10 / (3 * 60 * 60 * 1000),
  happiness: 10 / (6 * 60 * 60 * 1000),
  clean: 10 / (12 * 60 * 60 * 1000),
};

export type PetStatus = "hunger" | "happiness" | "clean";
export const STATUS_LABELS: Record<PetStatus, string> = {
  hunger: "포만감",
  happiness: "행복",
  clean: "청결",
};

// Compute live status values from the last-decay snapshot.
// Pet docs store the decaying values + a `lastDecayAt` timestamp;
// callers project forward from there.
export function projectStatus(
  base: { hunger: number; happiness: number; clean: number },
  baseAtMs: number,
  nowMs: number,
): { hunger: number; happiness: number; clean: number } {
  const dt = Math.max(0, nowMs - baseAtMs);
  return {
    hunger: clamp(base.hunger - DECAY_PER_MS.hunger * dt),
    happiness: clamp(base.happiness - DECAY_PER_MS.happiness * dt),
    clean: clamp(base.clean - DECAY_PER_MS.clean * dt),
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ── Mood ──────────────────────────────────────────────────────
// Four-level mood drives the egg-stage overlay (sparkle / sweat / crack
// + dark aura) and the bubble. Thresholds (per user spec):
//   - severe: 0–10   (any status ≤ 10)
//   - sad:    11–30  (any status ≤ 30, but min > 10)
//   - normal: 31–95
//   - happy:  96–100 (ALL statuses ≥ 96)
//
// Baby/child/teen/adult rendering continues to use only `severe` for the
// frown — adding richer faces for baby+ is a later pass; for now only
// the egg overlays differentiate happy/sad/severe.
export type PetMood = "happy" | "normal" | "sad" | "severe";

export function computeMood(s: { hunger: number; happiness: number; clean: number }): PetMood {
  if (s.hunger <= 10 || s.happiness <= 10 || s.clean <= 10) return "severe";
  if (s.hunger <= 30 || s.happiness <= 30 || s.clean <= 30) return "sad";
  if (s.hunger >= 91 && s.happiness >= 91 && s.clean >= 91) return "happy";
  return "normal";
}

export type PetBubble = {
  status: PetStatus;
  message: string;
} | null;

export function computeBubble(s: { hunger: number; happiness: number; clean: number }): PetBubble {
  const entries: { status: PetStatus; value: number; message: string }[] = [
    { status: "hunger", value: s.hunger, message: "배고파요..." },
    { status: "happiness", value: s.happiness, message: "놀아줘요..." },
    { status: "clean", value: s.clean, message: "씻겨줘요..." },
  ];
  const low = entries.filter((e) => e.value <= 30).sort((a, b) => a.value - b.value);
  if (!low.length) return null;
  return { status: low[0].status, message: low[0].message };
}

// ── Interactions ──────────────────────────────────────────────
export type InteractionId =
  | "feed"
  | "play"
  | "wash"
  | "walk"
  | "pet"
  | "treat"
  | "sleep"
  | "train";

export type Interaction = {
  id: InteractionId;
  label: string;
  cooldownMs: number;
  effects: { hunger?: number; happiness?: number; clean?: number; expGain: number };
  consumesItem?: ItemId;
};

const HOUR = 60 * 60 * 1000;

export const INTERACTIONS: Interaction[] = [
  { id: "feed",  label: "밥주기",    cooldownMs: 1 * HOUR,        effects: { hunger: 30, expGain: 5 } },
  { id: "play",  label: "놀아주기",  cooldownMs: 2 * HOUR,        effects: { happiness: 20, expGain: 10 } },
  { id: "wash",  label: "씻기기",    cooldownMs: 6 * HOUR,        effects: { clean: 50, expGain: 5 } },
  { id: "walk",  label: "산책",      cooldownMs: 3 * HOUR,        effects: { happiness: 15, expGain: 15 } },
  { id: "pet",   label: "쓰다듬기",  cooldownMs: 0.5 * HOUR,      effects: { happiness: 10, expGain: 3 } },
  { id: "treat", label: "간식주기",  cooldownMs: 2 * HOUR,        effects: { hunger: 15, happiness: 10, expGain: 5 }, consumesItem: "treat" },
  { id: "sleep", label: "잠재우기",  cooldownMs: 8 * HOUR,        effects: { hunger: 5, happiness: 5, clean: 5, expGain: 5 } },
  { id: "train", label: "훈련",      cooldownMs: 4 * HOUR,        effects: { expGain: 20 } },
];

// ── Items ─────────────────────────────────────────────────────
export type ItemCategory = "consumable" | "accessory" | "furniture" | "special";

export type ItemId =
  // consumables
  | "food" | "treat" | "cake"
  // accessories
  | "ribbon" | "scarf" | "hat" | "glasses" | "necklace" | "bell" | "crown" | "cape" | "wings"
  // furniture
  | "cushion" | "bed" | "house" | "toyBall" | "toyYarn" | "toyBone" | "bowlBasic" | "bowlPremium" | "bgForest" | "bgOcean" | "bgSpace"
  // special
  | "nameTag" | "sparkle" | "dye";

export type Item = {
  id: ItemId;
  category: ItemCategory;
  name: string;
  price: number;
  desc: string;
  // For consumables this is the immediate effect when used directly.
  // - hunger / happiness: status restore (food, treat).
  // - expBoostCount: charges of "next N interactions get 2× EXP" (cake).
  consumeEffect?: { hunger?: number; happiness?: number; expBoostCount?: number };
};

export const ITEMS: Item[] = [
  // consumables
  { id: "food",  category: "consumable", name: "일반 사료", price: 2,  desc: "포만감 +30%", consumeEffect: { hunger: 30 } },
  { id: "treat", category: "consumable", name: "고급 간식", price: 5,  desc: "포만감 +15%, 행복도 +10%", consumeEffect: { hunger: 15, happiness: 10 } },
  { id: "cake",  category: "consumable", name: "특별 케이크", price: 20, desc: "상호작용 5회 경험치 2배", consumeEffect: { expBoostCount: 5 } },
  // accessories
  { id: "ribbon",   category: "accessory", name: "리본",   price: 15, desc: "패션 — 리본" },
  { id: "scarf",    category: "accessory", name: "스카프", price: 15, desc: "패션 — 스카프" },
  { id: "hat",      category: "accessory", name: "모자",   price: 20, desc: "패션 — 모자" },
  { id: "glasses",  category: "accessory", name: "안경",   price: 20, desc: "패션 — 안경" },
  { id: "necklace", category: "accessory", name: "목걸이", price: 25, desc: "패션 — 목걸이" },
  { id: "bell",     category: "accessory", name: "방울",   price: 15, desc: "패션 — 방울" },
  { id: "crown",    category: "accessory", name: "왕관",   price: 50, desc: "패션 — 왕관" },
  { id: "cape",     category: "accessory", name: "망토",   price: 30, desc: "패션 — 망토" },
  { id: "wings",    category: "accessory", name: "날개",   price: 40, desc: "패션 — 날개" },
  // furniture
  { id: "cushion",      category: "furniture", name: "쿠션",          price: 10, desc: "공간 꾸미기" },
  { id: "bed",          category: "furniture", name: "침대",          price: 20, desc: "공간 꾸미기" },
  { id: "house",        category: "furniture", name: "집",            price: 30, desc: "공간 꾸미기" },
  { id: "toyBall",      category: "furniture", name: "장난감 (공)",   price: 8,  desc: "공간 꾸미기" },
  { id: "toyYarn",      category: "furniture", name: "장난감 (실타래)", price: 8, desc: "공간 꾸미기" },
  { id: "toyBone",      category: "furniture", name: "장난감 (뼈다귀)", price: 8, desc: "공간 꾸미기" },
  { id: "bowlBasic",    category: "furniture", name: "밥그릇 (일반)", price: 5,  desc: "공간 꾸미기" },
  { id: "bowlPremium",  category: "furniture", name: "밥그릇 (고급)", price: 15, desc: "공간 꾸미기" },
  { id: "bgForest",     category: "furniture", name: "배경 (숲)",     price: 20, desc: "배경 변경" },
  { id: "bgOcean",      category: "furniture", name: "배경 (바다)",   price: 20, desc: "배경 변경" },
  { id: "bgSpace",      category: "furniture", name: "배경 (우주)",   price: 30, desc: "배경 변경" },
  // special
  { id: "nameTag", category: "special", name: "이름표",       price: 10, desc: "펫 이름 변경" },
  { id: "sparkle", category: "special", name: "반짝이 효과", price: 25, desc: "펫 주변 글로우 이펙트" },
  { id: "dye",     category: "special", name: "펫 염색약",   price: 30, desc: "펫 색상 변경" },
];

export function findItem(id: ItemId): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

// Items that count as "treats" for gifting to other guild members.
export const GIFTABLE_TREAT_IDS: ItemId[] = ["treat", "cake"];

// Background ids consumed by the SVG renderer.
export type BackgroundId = "none" | "bgForest" | "bgOcean" | "bgSpace";

// User-placed furniture position. x ∈ [0,100] horizontal (% of room
// width), y ∈ [0,100] depth on the floor (0 = back near wall, 100 =
// front near viewer). Used for both placement and z-sorting against
// the pet (greater y = drawn in front).
export type FurnitureUserPosition = { x: number; y: number };

// Dye palette — only applied to the pet's *body* (the primary color
// in PET_PALETTE). Eyes/nose/mouth/cheek/inner-ear pixels are coded
// 'B', 'w', 'p', 'y', etc. and stay untouched.
export const PET_DYE_COLORS: { id: string; label: string; color: string | null }[] = [
  { id: "default", label: "기본색", color: null },
  { id: "red",     label: "빨강",   color: "#E76A6A" },
  { id: "blue",    label: "파랑",   color: "#7AAEE0" },
  { id: "green",   label: "초록",   color: "#7BC472" },
  { id: "purple",  label: "보라",   color: "#A878D0" },
  { id: "pink",    label: "분홍",   color: "#F4A6BC" },
  { id: "gold",    label: "금색",   color: "#F2C84B" },
];

// ── Firestore types ───────────────────────────────────────────
export type PetDoc = {
  type: PetType;
  name: string;
  // Decay-snapshot values + the time they were recorded. Live status
  // = projectStatus(snapshot, lastDecayAt, now).
  hunger: number;
  happiness: number;
  clean: number;
  exp: number;
  createdAt: Timestamp;
  lastDecayAt: Timestamp;
  // Per-interaction last-use timestamps for cooldown calc.
  cooldowns: Partial<Record<InteractionId, Timestamp>>;
  // Wardrobe state.
  accessories: ItemId[];   // currently equipped
  furniture: ItemId[];     // currently placed
  background: BackgroundId;
  // Per-furniture custom placement (set in 꾸미기 mode). When absent
  // for a given item, the renderer falls back to FURNITURE_PLACEMENTS
  // from petArt.ts.
  furniturePositions?: Partial<Record<ItemId, FurnitureUserPosition>>;
  // Special effects.
  // 특별 케이크 사용 시 5로 세팅 → 상호작용마다 1씩 차감 + 2× EXP. 0이면 효과 없음.
  expBoostRemaining?: number;
  glow?: boolean;          // sparkle item ever applied
  hue?: number;            // legacy hueRotate (kept for compatibility)
  // Body-only dye color from PET_DYE_COLORS. When set, overrides the
  // pet's primary palette color while leaving all other detail
  // pixels (eyes, nose, mouth, cheek, etc.) untouched.
  petBodyColor?: string | null;
  // Whether this pet is currently visiting the shared playground.
  // Other guild members' playground views render only pets with
  // inPlayground === true. Toggled by the entry/exit buttons.
  inPlayground?: boolean;
};

export type PetItemsDoc = {
  // Inventory: count per item id. Only consumables really need counts;
  // accessories/furniture are "owned or not" (presence with count >= 1).
  inventory: Partial<Record<ItemId, number>>;
};

// ── Firestore helpers ────────────────────────────────────────
const petDocRef = (nickname: string) => doc(db, "users", nickname, "pet", "current");
const itemsDocRef = (nickname: string) => doc(db, "users", nickname, "pet", "items");

export async function loadPet(nickname: string): Promise<PetDoc | null> {
  const snap = await getDoc(petDocRef(nickname));
  if (!snap.exists()) return null;
  return snap.data() as PetDoc;
}

export async function loadPetItems(nickname: string): Promise<PetItemsDoc> {
  const snap = await getDoc(itemsDocRef(nickname));
  if (!snap.exists()) return { inventory: {} };
  return snap.data() as PetItemsDoc;
}

export async function createPet(
  nickname: string,
  type: PetType,
  name: string,
): Promise<void> {
  const now = Timestamp.now();
  const initial: PetDoc = {
    type,
    name: name.trim() || PET_TYPES.find((p) => p.id === type)?.label || "내 펫",
    hunger: 100,
    happiness: 100,
    clean: 100,
    exp: 0,
    createdAt: now,
    lastDecayAt: now,
    cooldowns: {},
    accessories: [],
    furniture: [],
    background: "none",
  };
  await setDoc(petDocRef(nickname), initial);
  // Seed inventory with one starter food so brand-new owners can feed once.
  await setDoc(itemsDocRef(nickname), { inventory: { food: 3 } } as PetItemsDoc, { merge: true });
}

export async function renamePet(nickname: string, newName: string): Promise<void> {
  await setDoc(petDocRef(nickname), { name: newName.trim() }, { merge: true });
}

// Release (파양) the current pet. Wipes EVERYTHING pet-related:
//   - users/{nickname}/pet/current  (the pet itself — type, name,
//     stage, exp, status, accessories, furniture, furniturePositions,
//     background, petBodyColor, glow, expBoost…)
//   - users/{nickname}/pet/items    (every consumable, accessory,
//     furniture, special item the user owned)
// Re-adopting after release starts completely fresh (egg stage, no
// items, default room).
export async function releasePet(nickname: string): Promise<void> {
  await deleteDoc(petDocRef(nickname));
  await deleteDoc(itemsDocRef(nickname));
}

// Persist a fresh decay snapshot. Call this opportunistically whenever
// the user opens the pet UI so the stored values track reality.
export async function refreshDecaySnapshot(nickname: string, pet: PetDoc): Promise<PetDoc> {
  const now = Date.now();
  const baseAt = pet.lastDecayAt?.toMillis?.() ?? now;
  const projected = projectStatus(
    { hunger: pet.hunger, happiness: pet.happiness, clean: pet.clean },
    baseAt,
    now,
  );
  // Only write if any value drifted by >= 1 percent — avoids needless writes.
  const drift =
    Math.abs(projected.hunger - pet.hunger) +
    Math.abs(projected.happiness - pet.happiness) +
    Math.abs(projected.clean - pet.clean);
  if (drift < 1) return pet;
  const ts = Timestamp.fromMillis(now);
  await setDoc(
    petDocRef(nickname),
    {
      hunger: projected.hunger,
      happiness: projected.happiness,
      clean: projected.clean,
      lastDecayAt: ts,
    },
    { merge: true },
  );
  return { ...pet, ...projected, lastDecayAt: ts };
}

export type DoInteractionResult =
  | { ok: true }
  | { ok: false; reason: "cooldown" | "no_item" | "no_pet" };

export async function doInteraction(
  nickname: string,
  pet: PetDoc,
  id: InteractionId,
): Promise<DoInteractionResult> {
  const inter = INTERACTIONS.find((i) => i.id === id);
  if (!inter) return { ok: false, reason: "no_pet" };

  const now = Date.now();
  const last = pet.cooldowns?.[id]?.toMillis?.() ?? 0;
  if (now - last < inter.cooldownMs) return { ok: false, reason: "cooldown" };

  // Item-consuming interactions (treat) need inventory.
  if (inter.consumesItem) {
    const items = await loadPetItems(nickname);
    const have = items.inventory?.[inter.consumesItem] ?? 0;
    if (have < 1) return { ok: false, reason: "no_item" };
    await setDoc(
      itemsDocRef(nickname),
      { inventory: { [inter.consumesItem]: have - 1 } } as Partial<PetItemsDoc>,
      { merge: true },
    );
  }

  // Project current status forward, then apply effect.
  const baseAt = pet.lastDecayAt?.toMillis?.() ?? now;
  const projected = projectStatus(
    { hunger: pet.hunger, happiness: pet.happiness, clean: pet.clean },
    baseAt,
    now,
  );
  const next = {
    hunger: clamp(projected.hunger + (inter.effects.hunger ?? 0)),
    happiness: clamp(projected.happiness + (inter.effects.happiness ?? 0)),
    clean: clamp(projected.clean + (inter.effects.clean ?? 0)),
  };

  // Compute exp gain. 0 EXP 상호작용(현재는 없음, 미래 안전망)에서는
  // 페널티/부스터 모두 미적용 — 부스터 횟수도 차감 안 됨.
  const baseExp = inter.effects.expGain;
  let gain = baseExp;
  if (baseExp > 0) {
    // Penalty: if any current status (PROJECTED, before this action's
    // boost is applied) has decayed to 30% or less, exp gain is halved.
    // Encourages keeping the pet healthy as a prerequisite for growth.
    if (projected.hunger <= 30 || projected.happiness <= 30 || projected.clean <= 30) {
      gain = Math.max(1, Math.floor(gain / 2));
    }
  }
  const boostRemaining = pet.expBoostRemaining ?? 0;
  const usedBoost = baseExp > 0 && boostRemaining > 0;
  if (usedBoost) {
    gain = gain * 2;
  }

  const patch: Record<string, unknown> = {
    ...next,
    lastDecayAt: Timestamp.fromMillis(now),
    exp: increment(gain),
    cooldowns: { ...(pet.cooldowns ?? {}), [id]: Timestamp.fromMillis(now) },
  };
  if (usedBoost) patch.expBoostRemaining = increment(-1);

  await setDoc(petDocRef(nickname), patch, { merge: true });
  return { ok: true };
}

// Use a consumable directly from inventory (food / cake). Treat is
// applied via the `treat` interaction so it's gated by cooldown too.
export async function consumeItem(
  nickname: string,
  pet: PetDoc,
  itemId: ItemId,
): Promise<{ ok: boolean; reason?: string }> {
  const item = findItem(itemId);
  if (!item || item.category !== "consumable") return { ok: false, reason: "not_consumable" };
  const items = await loadPetItems(nickname);
  const have = items.inventory?.[itemId] ?? 0;
  if (have < 1) return { ok: false, reason: "no_item" };

  const now = Date.now();
  const baseAt = pet.lastDecayAt?.toMillis?.() ?? now;
  const projected = projectStatus(
    { hunger: pet.hunger, happiness: pet.happiness, clean: pet.clean },
    baseAt,
    now,
  );
  const fx = item.consumeEffect ?? {};
  const next = {
    hunger: clamp(projected.hunger + (fx.hunger ?? 0)),
    happiness: clamp(projected.happiness + (fx.happiness ?? 0)),
    clean: projected.clean,
  };
  const patch: Partial<PetDoc> = {
    ...next,
    lastDecayAt: Timestamp.fromMillis(now),
  };
  if (fx.expBoostCount && fx.expBoostCount > 0) {
    // Set (not increment) — matches prior behavior of using a fresh
    // cake giving you a full new boost rather than topping up.
    patch.expBoostRemaining = fx.expBoostCount;
  }
  await setDoc(petDocRef(nickname), patch, { merge: true });
  await setDoc(
    itemsDocRef(nickname),
    { inventory: { [itemId]: have - 1 } } as Partial<PetItemsDoc>,
    { merge: true },
  );
  return { ok: true };
}

// Pay points and grant an item. Accessories/furniture/special items
// are unique — buying twice still increments count but UI treats >=1 as "owned".
export async function buyItem(
  nickname: string,
  itemId: ItemId,
  currentPoints: number,
): Promise<{ ok: boolean; reason?: string }> {
  const item = findItem(itemId);
  if (!item) return { ok: false, reason: "no_item" };
  if (currentPoints < item.price) return { ok: false, reason: "no_points" };

  // Deduct points + increment inventory + log to pointHistory (mirrors
  // the existing avatar/title shop behavior).
  await setDoc(
    doc(db, "users", nickname),
    { points: increment(-item.price) },
    { merge: true },
  );
  await setDoc(
    itemsDocRef(nickname),
    { inventory: { [itemId]: increment(1) } } as unknown as Partial<PetItemsDoc>,
    { merge: true },
  );
  await addDoc(collection(db, "users", nickname, "pointHistory"), {
    type: "펫",
    points: -item.price,
    description: `펫 상점 — ${item.name} 구매`,
    createdAt: serverTimestamp(),
  });
  return { ok: true };
}

// Equip / unequip an accessory or place / remove a furniture item.
export async function setAccessoryEquipped(
  nickname: string,
  itemId: ItemId,
  equipped: boolean,
): Promise<void> {
  await setDoc(
    petDocRef(nickname),
    { accessories: equipped ? arrayUnion(itemId) : arrayRemove(itemId) },
    { merge: true },
  );
}

export async function setFurniturePlaced(
  nickname: string,
  itemId: ItemId,
  placed: boolean,
): Promise<void> {
  await setDoc(
    petDocRef(nickname),
    { furniture: placed ? arrayUnion(itemId) : arrayRemove(itemId) },
    { merge: true },
  );
}

export async function setBackground(
  nickname: string,
  bg: BackgroundId,
): Promise<void> {
  await setDoc(petDocRef(nickname), { background: bg }, { merge: true });
}

// Save a single furniture's placed position. Both axes are clamped
// to [0, 100] before write so we never persist out-of-bounds values.
export async function setFurniturePosition(
  nickname: string,
  itemId: ItemId,
  pos: FurnitureUserPosition,
): Promise<void> {
  const x = Math.max(0, Math.min(100, pos.x));
  const y = Math.max(0, Math.min(100, pos.y));
  await setDoc(
    petDocRef(nickname),
    { furniturePositions: { [itemId]: { x, y } } },
    { merge: true },
  );
}

export async function applyDye(nickname: string, hue: number): Promise<void> {
  await setDoc(petDocRef(nickname), { hue }, { merge: true });
}

// Set the playground presence flag.
export async function setInPlayground(
  nickname: string,
  value: boolean,
): Promise<void> {
  await setDoc(petDocRef(nickname), { inPlayground: value }, { merge: true });
}

// Top-level `playgroundPets/{nickname}` collection. Mirrors a subset of
// the pet doc + adds synced position so all clients show pets in the
// same place (and live-update entries / exits via onSnapshot, no need
// to iterate users).
//
// Why a separate collection rather than collectionGroup query on
// `pet` with `where inPlayground == true`: that would need a composite
// index this project doesn't have. A flat collection keyed by nickname
// is cheap to subscribe to and trivial to clean up.
export type PlaygroundPet = {
  nickname: string;
  petName: string;
  petType: PetType;
  petStage: PetStage;
  exp: number;
  happiness: number;
  petBodyColor?: string | null;
  glow?: boolean;
  hue?: number;
  accessories: ItemId[];
  posX: number; // 0–100 (% of field width)
  posY: number; // 0–100 (% of field height)
};

const playgroundPetRef = (nickname: string) => doc(db, "playgroundPets", nickname);

// Initial anchor on entry. Range matches the wander tick (X 8–92, full
// visual width; Y 50–85, grass band so feet stay on grass).
function randomFieldPosition(): { posX: number; posY: number } {
  return {
    posX: 8 + Math.random() * 84,
    posY: 50 + Math.random() * 35,
  };
}

// Enter the playground. Writes a fresh `playgroundPets/{nick}` doc with
// random initial position, and flips `inPlayground=true` on the pet doc
// (kept for the auto-exit useEffect's legacy gate).
export async function enterPlayground(
  nickname: string,
  pet: PetDoc,
): Promise<void> {
  const now = Date.now();
  const stage = computeStage(pet.createdAt?.toMillis?.() ?? now, pet.exp ?? 0, now);
  const { posX, posY } = randomFieldPosition();
  await setDoc(playgroundPetRef(nickname), {
    nickname,
    petName: pet.name,
    petType: pet.type,
    petStage: stage,
    exp: pet.exp ?? 0,
    happiness: pet.happiness ?? 0,
    petBodyColor: pet.petBodyColor ?? null,
    glow: !!pet.glow,
    hue: pet.hue ?? 0,
    accessories: pet.accessories ?? [],
    posX,
    posY,
    enteredAt: serverTimestamp(),
    posUpdatedAt: serverTimestamp(),
  });
  await setDoc(petDocRef(nickname), { inPlayground: true }, { merge: true });
}

// Exit the playground. Deletes the playgroundPets doc + clears flag.
export async function exitPlayground(nickname: string): Promise<void> {
  await deleteDoc(playgroundPetRef(nickname)).catch(() => {});
  await setDoc(petDocRef(nickname), { inPlayground: false }, { merge: true });
}

// Update only the position fields. Called periodically (~every 4 s)
// while in the playground; merge-write keeps the rest of the doc intact.
export async function updatePlaygroundPosition(
  nickname: string,
  posX: number,
  posY: number,
): Promise<void> {
  await setDoc(
    playgroundPetRef(nickname),
    { posX, posY, posUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

// Realtime subscription — fires immediately with the current snapshot
// and again whenever any pet enters / leaves / moves.
export function subscribePlaygroundPets(
  cb: (pets: PlaygroundPet[]) => void,
): () => void {
  return onSnapshot(collection(db, "playgroundPets"), (snap) => {
    const list: PlaygroundPet[] = [];
    for (const d of snap.docs) {
      const data = d.data() as Partial<PlaygroundPet>;
      if (!data.petType || !data.petName) continue;
      list.push({
        nickname: data.nickname ?? d.id,
        petName: data.petName,
        petType: data.petType as PetType,
        petStage: (data.petStage as PetStage) ?? "egg",
        exp: data.exp ?? 0,
        happiness: data.happiness ?? 0,
        petBodyColor: data.petBodyColor ?? null,
        glow: !!data.glow,
        hue: data.hue ?? 0,
        accessories: (data.accessories as ItemId[]) ?? [],
        posX: typeof data.posX === "number" ? data.posX : 50,
        posY: typeof data.posY === "number" ? data.posY : 65,
      });
    }
    cb(list);
  });
}

// ── Playground social interactions ────────────────────────────
// Players can greet / play with / give a treat to another pet in the
// playground. Each interaction:
//   - awards +3 ★ to BOTH parties (the gift-treat path also uses up a
//     consumable for the giver and applies pet-status effects)
//   - is rate-limited per pair per day (one of each kind per pair) so
//     spamming the same friend can't farm points
//   - is capped at 30 ★ earned per playground per day TOTAL for the
//     initiator (the receiver isn't capped — they passively receive)
//
// Schema:
//   users/{nickname}/playgroundLog/{YYYY-MM-DD KST}
//     {
//       totalEarned: number,        // points I earned today via playground
//       greetedWith:  { [other]: ts },
//       playedWith:   { [other]: ts },
//       treatedWith:  { [other]: ts },
//     }
//
// Date key uses Asia/Seoul-equivalent rollover (start of day at UTC+9)
// computed client-side; see `playgroundLogDateKey()`.
export type PlaygroundInteractionKind = "greet" | "play" | "treat";

const PLAYGROUND_DAILY_CAP = 30;
const PLAYGROUND_REWARD_PER_INTERACTION = 3;

const KIND_LABEL: Record<PlaygroundInteractionKind, string> = {
  greet: "인사",
  play: "같이 놀기",
  treat: "간식 선물",
};

export type PlaygroundLog = {
  totalEarned: number;
  greetedWith: Record<string, unknown>;
  playedWith: Record<string, unknown>;
  treatedWith: Record<string, unknown>;
};

// Today's date key in KST (UTC+9). Server timestamps in Firestore are
// UTC; bucketing into a Korean-local day matches when users see "today
// reset" at midnight KST.
export function playgroundLogDateKey(nowMs: number = Date.now()): string {
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function loadPlaygroundLogToday(
  nickname: string,
): Promise<PlaygroundLog> {
  const key = playgroundLogDateKey();
  const snap = await getDoc(doc(db, "users", nickname, "playgroundLog", key));
  if (!snap.exists()) {
    return { totalEarned: 0, greetedWith: {}, playedWith: {}, treatedWith: {} };
  }
  const data = snap.data() as Partial<PlaygroundLog>;
  return {
    totalEarned: data.totalEarned ?? 0,
    greetedWith: data.greetedWith ?? {},
    playedWith: data.playedWith ?? {},
    treatedWith: data.treatedWith ?? {},
  };
}

export type PlaygroundInteractResult =
  | { ok: true; gainedFromMe: number; gainedTo: number }
  | { ok: false; reason: "self" | "no_target" | "already_today" | "daily_cap" | "no_item" | "not_giftable" };

// ── Playground interaction requests (consent flow) ────────────
// Greet / play interactions require the target to opt in. The
// initiator writes a `playgroundRequests/{id}` doc; the target sees it
// via the incoming-request subscription, accepts or rejects, and on
// accept the reward (points + history + log) is written for BOTH
// parties by the accepter's client. Treat gifting bypasses this flow
// (treats are unilateral) — see `playgroundTreat` below.
export type PlaygroundRequestKind = "greet" | "play";
export type PlaygroundRequestStatus = "pending" | "accepted" | "rejected" | "expired";
export type PlaygroundRequest = {
  id: string;
  from: string;
  fromPetName: string;
  to: string;
  toPetName: string;
  kind: PlaygroundRequestKind;
  status: PlaygroundRequestStatus;
  createdAtMs: number;
};

export const PLAYGROUND_REQUEST_TIMEOUT_MS = 30_000;

export type SendPlaygroundRequestResult =
  | { ok: true; id: string }
  | { ok: false; reason: "self" | "no_target" | "already_today" | "daily_cap" };

export async function sendPlaygroundRequest(
  from: string,
  fromPetName: string,
  to: string,
  toPetName: string,
  kind: PlaygroundRequestKind,
): Promise<SendPlaygroundRequestResult> {
  if (!from || !to) return { ok: false, reason: "no_target" };
  if (from === to) return { ok: false, reason: "self" };
  const log = await loadPlaygroundLogToday(from);
  const fieldByKind: Record<PlaygroundRequestKind, keyof PlaygroundLog> = {
    greet: "greetedWith",
    play: "playedWith",
  };
  if ((log[fieldByKind[kind]] as Record<string, unknown>)[to]) {
    return { ok: false, reason: "already_today" };
  }
  if (log.totalEarned + PLAYGROUND_REWARD_PER_INTERACTION > PLAYGROUND_DAILY_CAP) {
    return { ok: false, reason: "daily_cap" };
  }
  const ref = await addDoc(collection(db, "playgroundRequests"), {
    from,
    fromPetName,
    to,
    toPetName,
    kind,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

export type RespondPlaygroundRequestResult =
  | { ok: true }
  | { ok: false; reason: "not_yours" | "not_pending" | "already_today" | "daily_cap" };

export async function respondPlaygroundRequest(
  req: PlaygroundRequest,
  accept: boolean,
  me: string,
): Promise<RespondPlaygroundRequestResult> {
  if (req.to !== me) return { ok: false, reason: "not_yours" };
  if (req.status !== "pending") return { ok: false, reason: "not_pending" };
  const reqRef = doc(db, "playgroundRequests", req.id);
  if (!accept) {
    await updateDoc(reqRef, { status: "rejected", resolvedAt: serverTimestamp() });
    return { ok: true };
  }
  const myLog = await loadPlaygroundLogToday(me);
  const fieldByKind: Record<PlaygroundRequestKind, keyof PlaygroundLog> = {
    greet: "greetedWith",
    play: "playedWith",
  };
  const field = fieldByKind[req.kind];
  if ((myLog[field] as Record<string, unknown>)[req.from]) {
    await updateDoc(reqRef, { status: "rejected", resolvedAt: serverTimestamp() });
    return { ok: false, reason: "already_today" };
  }
  if (myLog.totalEarned + PLAYGROUND_REWARD_PER_INTERACTION > PLAYGROUND_DAILY_CAP) {
    await updateDoc(reqRef, { status: "rejected", resolvedAt: serverTimestamp() });
    return { ok: false, reason: "daily_cap" };
  }
  await updateDoc(reqRef, { status: "accepted", resolvedAt: serverTimestamp() });

  // Descriptions include the OTHER party's nickname + pet name so the
  // MY page entry reads naturally ("놀이터 인사 (상대: 언쏘의 별이)").
  const reward = PLAYGROUND_REWARD_PER_INTERACTION;
  const action = KIND_LABEL[req.kind];
  const reasonMine = `놀이터 ${action} (상대: ${req.from}의 ${req.fromPetName || "펫"})`;
  const reasonOther = `놀이터 ${action} (상대: ${me}의 ${req.toPetName || "펫"})`;
  const today = playgroundLogDateKey();
  await Promise.all([
    setDoc(doc(db, "users", me), { points: increment(reward) }, { merge: true }),
    setDoc(doc(db, "users", req.from), { points: increment(reward) }, { merge: true }),
    addDoc(collection(db, "users", me, "pointHistory"), {
      type: "펫",
      points: reward,
      description: reasonMine,
      createdAt: serverTimestamp(),
    }),
    addDoc(collection(db, "users", req.from, "pointHistory"), {
      type: "펫",
      points: reward,
      description: reasonOther,
      createdAt: serverTimestamp(),
    }),
    setDoc(
      doc(db, "users", me, "playgroundLog", today),
      { totalEarned: increment(reward), [field]: { [req.from]: serverTimestamp() } },
      { merge: true },
    ),
    setDoc(
      doc(db, "users", req.from, "playgroundLog", today),
      { totalEarned: increment(reward), [field]: { [me]: serverTimestamp() } },
      { merge: true },
    ),
  ]);
  return { ok: true };
}

export async function expirePlaygroundRequest(req: PlaygroundRequest): Promise<void> {
  if (req.status !== "pending") return;
  await updateDoc(doc(db, "playgroundRequests", req.id), {
    status: "expired",
    resolvedAt: serverTimestamp(),
  });
}

// Treat is unilateral — no consent, no 별빛 reward, no daily/per-pair
// limit. Just consumes one of sender's items and applies that item's
// effect to the recipient pet. (fromPetName/toPetName retained for
// signature stability with prior callers; unused now.)
export async function playgroundTreat(
  from: string,
  _fromPetName: string,
  to: string,
  _toPetName: string,
  treatItem: ItemId,
): Promise<PlaygroundInteractResult> {
  if (!from || !to) return { ok: false, reason: "no_target" };
  if (from === to) return { ok: false, reason: "self" };
  const giftRes = await giftTreat(from, to, treatItem);
  if (!giftRes.ok) {
    if (giftRes.reason === "not_giftable") return { ok: false, reason: "not_giftable" };
    if (giftRes.reason === "no_target_pet") return { ok: false, reason: "no_target" };
    return { ok: false, reason: "no_item" };
  }
  return { ok: true, gainedFromMe: 0, gainedTo: 0 };
}

function snapToRequest(d: { id: string; data: () => unknown }): PlaygroundRequest {
  const data = d.data() as {
    from?: string;
    fromPetName?: string;
    to?: string;
    toPetName?: string;
    kind?: PlaygroundRequestKind;
    status?: PlaygroundRequestStatus;
    createdAt?: { toMillis?: () => number };
  };
  return {
    id: d.id,
    from: data.from ?? "",
    fromPetName: data.fromPetName ?? "",
    to: data.to ?? "",
    toPetName: data.toPetName ?? "",
    kind: (data.kind as PlaygroundRequestKind) ?? "greet",
    status: (data.status as PlaygroundRequestStatus) ?? "pending",
    createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
  };
}

export function subscribeIncomingPlaygroundRequests(
  me: string,
  cb: (reqs: PlaygroundRequest[]) => void,
): () => void {
  // Single-field where uses Firestore's auto-index — no composite
  // index needed. We sort + filter client-side.
  const q = query(
    collection(db, "playgroundRequests"),
    where("to", "==", me),
    fsLimit(50),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map(snapToRequest)
      .filter((r) => r.status === "pending")
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    cb(list);
  });
}

export function subscribeOutgoingPlaygroundRequests(
  me: string,
  cb: (reqs: PlaygroundRequest[]) => void,
): () => void {
  const q = query(
    collection(db, "playgroundRequests"),
    where("from", "==", me),
    fsLimit(50),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map(snapToRequest)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    cb(list);
  });
}

// ── Playground chat ───────────────────────────────────────────
// Realtime, transient — messages are written to a flat
// `playgroundChat` collection and rendered as bubbles above each pet
// for ~5 s. Old documents are NOT cleaned up here (a tiny accumulation
// is fine; client subscriptions only look at the recent window).
export type PlaygroundChatMessage = {
  id: string;
  nickname: string;
  message: string;
  ts: number; // millis since epoch
};

export async function sendPlaygroundChat(
  nickname: string,
  message: string,
): Promise<{ ok: boolean; reason?: string }> {
  const trimmed = message.trim().slice(0, 80);
  if (!trimmed) return { ok: false, reason: "empty" };
  await addDoc(collection(db, "playgroundChat"), {
    nickname,
    message: trimmed,
    createdAt: serverTimestamp(),
  });
  return { ok: true };
}

// Subscribe to the most recent ~30 chat messages. The renderer maps
// them to the latest message per nickname and shows that nickname's
// bubble for ~5 s after the message lands.
export function subscribePlaygroundChat(
  cb: (messages: PlaygroundChatMessage[]) => void,
): () => void {
  const q = query(
    collection(db, "playgroundChat"),
    orderBy("createdAt", "desc"),
    fsLimit(30),
  );
  return onSnapshot(q, (snap) => {
    const list: PlaygroundChatMessage[] = [];
    snap.docs.forEach((d) => {
      const data = d.data() as {
        nickname?: string;
        message?: string;
        createdAt?: { toMillis?: () => number };
      };
      if (!data.nickname || !data.message) return;
      list.push({
        id: d.id,
        nickname: data.nickname,
        message: data.message,
        ts: data.createdAt?.toMillis?.() ?? Date.now(),
      });
    });
    cb(list);
  });
}

// Body-only dye. Pass `null` to reset to the pet type's natural color.
export async function setPetBodyColor(
  nickname: string,
  color: string | null,
): Promise<void> {
  await setDoc(petDocRef(nickname), { petBodyColor: color }, { merge: true });
}

// Apply a body color and consume one dye item. Free reset (color=null)
// does NOT consume — just clears the override.
export async function applyDyeColor(
  nickname: string,
  color: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (color === null) {
    await setPetBodyColor(nickname, null);
    return { ok: true };
  }
  const items = await loadPetItems(nickname);
  const have = items.inventory?.dye ?? 0;
  if (have < 1) return { ok: false, reason: "no_item" };
  await setPetBodyColor(nickname, color);
  await setDoc(
    itemsDocRef(nickname),
    { inventory: { dye: have - 1 } } as Partial<PetItemsDoc>,
    { merge: true },
  );
  return { ok: true };
}

export async function applySparkle(nickname: string): Promise<void> {
  await setDoc(petDocRef(nickname), { glow: true }, { merge: true });
}

// Send a treat or cake from `from` to `to`'s pet. Consumes one of
// `from`'s items and applies that item's `consumeEffect` to the
// recipient's pet directly:
//   - 고급 간식 (treat) → recipient hunger +15, happiness +10
//   - 특별 케이크 (cake) → recipient expBoostRemaining = 5
// No 별빛/points are exchanged; this is a pure gift mechanic gated only
// by sender's inventory (no daily/per-pair limit).
export async function giftTreat(
  from: string,
  to: string,
  itemId: ItemId,
): Promise<{ ok: boolean; reason?: string }> {
  if (!GIFTABLE_TREAT_IDS.includes(itemId)) return { ok: false, reason: "not_giftable" };
  const myItems = await loadPetItems(from);
  const have = myItems.inventory?.[itemId] ?? 0;
  if (have < 1) return { ok: false, reason: "no_item" };
  const target = await loadPet(to);
  if (!target) return { ok: false, reason: "no_target_pet" };

  const item = findItem(itemId)!;
  const fx = item.consumeEffect ?? {};
  const now = Date.now();
  const baseAt = target.lastDecayAt?.toMillis?.() ?? now;
  const projected = projectStatus(
    { hunger: target.hunger, happiness: target.happiness, clean: target.clean },
    baseAt,
    now,
  );
  const patch: Record<string, unknown> = {
    lastDecayAt: Timestamp.fromMillis(now),
  };
  // Apply hunger/happiness restore (treat). For cake these are absent,
  // so projected status is preserved as-is via the snapshot.
  if (typeof fx.hunger === "number" || typeof fx.happiness === "number") {
    patch.hunger = clamp(projected.hunger + (fx.hunger ?? 0));
    patch.happiness = clamp(projected.happiness + (fx.happiness ?? 0));
    patch.clean = projected.clean;
  }
  // Apply EXP boost charges (cake). Set, not increment — a fresh cake
  // gives a full new boost rather than topping up.
  if (fx.expBoostCount && fx.expBoostCount > 0) {
    patch.expBoostRemaining = fx.expBoostCount;
  }
  await setDoc(petDocRef(to), patch, { merge: true });
  await setDoc(
    itemsDocRef(from),
    { inventory: { [itemId]: have - 1 } } as Partial<PetItemsDoc>,
    { merge: true },
  );
  // Log a gift activity into the recipient's notification queue (read
  // by the pet push trigger).
  await addDoc(collection(db, "users", to, "petGifts"), {
    from,
    itemId,
    createdAt: serverTimestamp(),
  });
  return { ok: true };
}

// ── UI helpers ────────────────────────────────────────────────
export function cooldownRemainingMs(
  pet: PetDoc | null | undefined,
  id: InteractionId,
  nowMs: number,
): number {
  if (!pet) return 0;
  const inter = INTERACTIONS.find((i) => i.id === id);
  if (!inter) return 0;
  const last = pet.cooldowns?.[id]?.toMillis?.() ?? 0;
  return Math.max(0, inter.cooldownMs - (nowMs - last));
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "지금";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}분`;
  const hr = Math.floor(min / 60);
  const rm = min % 60;
  if (rm === 0) return `${hr}시간`;
  return `${hr}시간 ${rm}분`;
}

// Inventory helper: is this collectible owned (>=1) by the current user?
export function isOwned(inv: PetItemsDoc["inventory"] | undefined, id: ItemId): boolean {
  return (inv?.[id] ?? 0) >= 1;
}

// Pet base color palette — used by both the SVG renderer and a few UI
// accent strokes. Hex literals only (no theme tokens).
export const PET_PALETTE: Record<PetType, { primary: string; secondary: string; accent: string }> = {
  cat:     { primary: "#F4C07A", secondary: "#FFE3B0", accent: "#5B3A1F" },
  dog:     { primary: "#D9A37B", secondary: "#F2D2AB", accent: "#4A2C18" },
  rabbit:  { primary: "#F2EFE6", secondary: "#FFFFFF", accent: "#E89BB0" },
  fox:     { primary: "#E07A3C", secondary: "#FFD6AF", accent: "#3A1B0A" },
  hamster: { primary: "#E2A968", secondary: "#FFE8C8", accent: "#523019" },
  owl:     { primary: "#8C7A6B", secondary: "#D8C9B6", accent: "#2A1F17" },
  bear:    { primary: "#7A5236", secondary: "#B58A65", accent: "#2D1A0E" },
  wolf:    { primary: "#7E8895", secondary: "#BCC5D1", accent: "#1F2630" },
  panda:   { primary: "#FFFFFF", secondary: "#E6E6E6", accent: "#1A1A1A" },
};
