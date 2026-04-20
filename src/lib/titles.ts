import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type TitleType = "front" | "back";

export type TitleWord = {
  id: string;
  word: string;
  type: TitleType;
  price: number;
};

export type TitleWordDoc = {
  word: string;
  type: TitleType;
  price: number;
  owner: string;
  purchasedMonth: string;
};

export const FRONT_WORDS: TitleWord[] = [
  { id: "front_sturdy", word: "튼튼한", type: "front", price: 10 },
  { id: "front_strong", word: "강한", type: "front", price: 10 },
  { id: "front_diligent", word: "근면한", type: "front", price: 10 },
  { id: "front_sleepless", word: "잠이 부족한", type: "front", price: 10 },
  { id: "front_bored", word: "심심한", type: "front", price: 10 },
  { id: "front_charging", word: "충전 중인", type: "front", price: 10 },
  { id: "front_drained", word: "방전된", type: "front", price: 10 },
  { id: "front_relaxed", word: "느긋한", type: "front", price: 10 },
  { id: "front_hungry", word: "배고픈", type: "front", price: 10 },
  { id: "front_sleepy", word: "졸린", type: "front", price: 10 },
  { id: "front_broke", word: "돈이 없는", type: "front", price: 10 },
  { id: "front_quiet", word: "조용한", type: "front", price: 10 },
  { id: "front_urgent", word: "급한", type: "front", price: 10 },

  { id: "front_skillful", word: "솜씨 좋은", type: "front", price: 20 },
  { id: "front_wise", word: "현명한", type: "front", price: 20 },
  { id: "front_clear_eyes", word: "맑은 눈의", type: "front", price: 20 },
  { id: "front_curious", word: "호기심 많은", type: "front", price: 20 },
  { id: "front_fearless", word: "겁이 없는", type: "front", price: 20 },
  { id: "front_vibes", word: "갬성 있는", type: "front", price: 20 },
  { id: "front_high_standard", word: "눈이 높은", type: "front", price: 20 },
  { id: "front_talkative", word: "할 말 많은", type: "front", price: 20 },
  { id: "front_trusted", word: "신뢰받는", type: "front", price: 20 },
  { id: "front_just", word: "정의로운", type: "front", price: 20 },
  { id: "front_heavy", word: "묵직한", type: "front", price: 20 },
  { id: "front_agile", word: "날렵한", type: "front", price: 20 },
  { id: "front_gentle", word: "다정한", type: "front", price: 20 },
  { id: "front_passionate", word: "열정의", type: "front", price: 20 },
  { id: "front_free", word: "자유로운", type: "front", price: 20 },
  { id: "front_lonely", word: "외로운", type: "front", price: 20 },
  { id: "front_just_woke", word: "막 깨어난", type: "front", price: 20 },
  { id: "front_diet", word: "다이어트 중인", type: "front", price: 20 },
  { id: "front_diet_quit", word: "다이어트 포기한", type: "front", price: 20 },
  { id: "front_parcel", word: "택배 기다리는", type: "front", price: 20 },
  { id: "front_lunch", word: "점심시간만 기다리는", type: "front", price: 20 },
  { id: "front_friday", word: "금요일을 기다리는", type: "front", price: 20 },
  { id: "front_monday_hate", word: "월요일이 싫은", type: "front", price: 20 },

  { id: "front_luxury", word: "럭셔리한", type: "front", price: 35 },
  { id: "front_dawnlight", word: "새벽빛의", type: "front", price: 35 },
  { id: "front_lucky", word: "운이 좋은", type: "front", price: 35 },
  { id: "front_temptation", word: "유혹을 이겨낸", type: "front", price: 35 },
  { id: "front_indomitable", word: "불굴의", type: "front", price: 35 },
  { id: "front_fashionable", word: "꾸밀 줄 아는", type: "front", price: 35 },
  { id: "front_leading", word: "앞서가는", type: "front", price: 35 },
  { id: "front_wind_run", word: "바람을 달리는", type: "front", price: 35 },
  { id: "front_faster", word: "빛보다 빠른", type: "front", price: 35 },
  { id: "front_caffeine", word: "카페인에 찌든", type: "front", price: 35 },
  { id: "front_legendary", word: "전설의", type: "front", price: 35 },
  { id: "front_solitary", word: "고독한", type: "front", price: 35 },
  { id: "front_radiant", word: "찬란한", type: "front", price: 35 },
  { id: "front_eternal", word: "영원한", type: "front", price: 35 },
  { id: "front_secret", word: "비밀의", type: "front", price: 35 },
  { id: "front_stealthy", word: "은밀한", type: "front", price: 35 },
  { id: "front_lethal", word: "치명적인", type: "front", price: 35 },
  { id: "front_suspicious", word: "수상한", type: "front", price: 35 },
  { id: "front_chaos", word: "혼돈의", type: "front", price: 35 },
  { id: "front_cold_blood", word: "냉혈의", type: "front", price: 35 },
  { id: "front_clock_out", word: "칼퇴하는", type: "front", price: 35 },
  { id: "front_overtime", word: "야근하는", type: "front", price: 35 },
  { id: "front_quit_dream", word: "퇴사 꿈꾸는", type: "front", price: 35 },
  { id: "front_lotto", word: "로또 꿈꾸는", type: "front", price: 35 },
];

export const BACK_WORDS: TitleWord[] = [
  { id: "back_wanderer", word: "떠돌이", type: "back", price: 10 },
  { id: "back_citizen", word: "시민", type: "back", price: 10 },
  { id: "back_friend", word: "친구", type: "back", price: 10 },
  { id: "back_dreamer", word: "몽상가", type: "back", price: 10 },
  { id: "back_drifter", word: "방랑자", type: "back", price: 10 },
  { id: "back_worker", word: "직장인", type: "back", price: 10 },
  { id: "back_unemployed", word: "백수", type: "back", price: 10 },
  { id: "back_intern", word: "인턴", type: "back", price: 10 },
  { id: "back_parttime", word: "알바생", type: "back", price: 10 },
  { id: "back_slave", word: "노비", type: "back", price: 10 },
  { id: "back_commoner", word: "평민", type: "back", price: 10 },
  { id: "back_tenant", word: "세입자", type: "back", price: 10 },

  { id: "back_beauty", word: "미소녀", type: "back", price: 20 },
  { id: "back_gourmet", word: "미식가", type: "back", price: 20 },
  { id: "back_climber", word: "등반가", type: "back", price: 20 },
  { id: "back_adventurer", word: "모험가", type: "back", price: 20 },
  { id: "back_hunter", word: "사냥꾼", type: "back", price: 20 },
  { id: "back_butler", word: "집사", type: "back", price: 20 },
  { id: "back_solver", word: "해결사", type: "back", price: 20 },
  { id: "back_destroyer", word: "파괴자", type: "back", price: 20 },
  { id: "back_hero", word: "용사", type: "back", price: 20 },
  { id: "back_princess", word: "공주", type: "back", price: 20 },
  { id: "back_prince", word: "왕자", type: "back", price: 20 },
  { id: "back_landlord", word: "집주인", type: "back", price: 20 },
  { id: "back_noble", word: "귀족", type: "back", price: 20 },
  { id: "back_lord", word: "영주", type: "back", price: 20 },
  { id: "back_addict", word: "중독자", type: "back", price: 20 },
  { id: "back_star", word: "별", type: "back", price: 20 },

  { id: "back_greatsword", word: "대검전사", type: "back", price: 35 },
  { id: "back_mage", word: "마법사", type: "back", price: 35 },
  { id: "back_king", word: "왕", type: "back", price: 35 },
  { id: "back_knight", word: "기사", type: "back", price: 35 },
  { id: "back_guardian", word: "수호자", type: "back", price: 35 },
  { id: "back_healer", word: "힐러", type: "back", price: 35 },
  { id: "back_warrior", word: "전사", type: "back", price: 35 },
  { id: "back_archer", word: "궁수", type: "back", price: 35 },
  { id: "back_thief", word: "도적", type: "back", price: 35 },
  { id: "back_dancer", word: "댄서", type: "back", price: 35 },
  { id: "back_musician", word: "악사", type: "back", price: 35 },
  { id: "back_fighter", word: "격투가", type: "back", price: 35 },
  { id: "back_bard", word: "음유시인", type: "back", price: 35 },
  { id: "back_crossbow", word: "석궁사수", type: "back", price: 35 },
  { id: "back_longbow", word: "장궁병", type: "back", price: 35 },
  { id: "back_priest", word: "사제", type: "back", price: 35 },
  { id: "back_dark_mage", word: "암흑술사", type: "back", price: 35 },
  { id: "back_ice_mage", word: "빙결술사", type: "back", price: 35 },
  { id: "back_fire_mage", word: "화염술사", type: "back", price: 35 },
  { id: "back_lightning", word: "전격술사", type: "back", price: 35 },
  { id: "back_dual_blade", word: "듀얼블레이더", type: "back", price: 35 },
  { id: "back_ceo", word: "대표님", type: "back", price: 35 },
  { id: "back_boss", word: "사장님", type: "back", price: 35 },
  { id: "back_tycoon", word: "건물주", type: "back", price: 35 },
  { id: "back_chaebol", word: "재벌2세", type: "back", price: 35 },

  { id: "back_owner", word: "주인", type: "back", price: 50 },
  { id: "back_teto_m", word: "테토남", type: "back", price: 50 },
  { id: "back_egen_m", word: "에겐남", type: "back", price: 50 },
  { id: "back_teto_f", word: "테토녀", type: "back", price: 50 },
  { id: "back_egen_f", word: "에겐녀", type: "back", price: 50 },
];

export const ALL_WORDS: TitleWord[] = [...FRONT_WORDS, ...BACK_WORDS];

const wordById = new Map(ALL_WORDS.map((w) => [w.id, w]));

export function getWordById(id: string): TitleWord | undefined {
  return wordById.get(id);
}

export function getWordByText(type: TitleType, text: string): TitleWord | undefined {
  const list = type === "front" ? FRONT_WORDS : BACK_WORDS;
  return list.find((w) => w.word === text);
}

export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatTitlePrefix(front?: string, back?: string): string {
  const f = (front ?? "").trim();
  const b = (back ?? "").trim();
  if (!f || !b) return "";
  return `「${f} ${b}」`;
}

export async function seedTitleWords(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, "titleWords"));
    const existing = new Set(snap.docs.map((d) => d.id));
    const missing = ALL_WORDS.filter((w) => !existing.has(w.id));
    if (missing.length === 0) return;
    const batch = writeBatch(db);
    for (const w of missing) {
      batch.set(doc(db, "titleWords", w.id), {
        word: w.word,
        type: w.type,
        price: w.price,
        owner: "",
        purchasedMonth: "",
      });
    }
    await batch.commit();
  } catch (e) {
    console.error("seedTitleWords failed", e);
  }
}

export async function ensureMonthlyReset(): Promise<void> {
  const key = currentMonthKey();
  try {
    const metaRef = doc(db, "titleMeta", "reset");
    const meta = await getDoc(metaRef);
    if (meta.exists() && meta.data()?.month === key) return;

    const wordsSnap = await getDocs(collection(db, "titleWords"));
    const batch = writeBatch(db);
    let touched = 0;
    wordsSnap.forEach((d) => {
      const data = d.data() as Partial<TitleWordDoc>;
      if (data.owner && data.purchasedMonth !== key) {
        batch.update(d.ref, { owner: "", purchasedMonth: "" });
        touched++;
      }
    });

    const usersSnap = await getDocs(collection(db, "users"));
    usersSnap.forEach((u) => {
      const data = u.data() as { frontTitle?: string; backTitle?: string };
      if (data.frontTitle || data.backTitle) {
        batch.set(u.ref, { frontTitle: "", backTitle: "" }, { merge: true });
        touched++;
      }
    });

    batch.set(metaRef, { month: key, resetAt: serverTimestamp() });
    if (touched > 0 || !meta.exists()) {
      await batch.commit();
    } else {
      await setDoc(metaRef, { month: key, resetAt: serverTimestamp() });
    }
  } catch (e) {
    console.error("ensureMonthlyReset failed", e);
  }
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "no_points" | "unknown" | "error" };

export async function purchaseTitle(
  nickname: string,
  wordId: string,
): Promise<PurchaseResult> {
  const word = getWordById(wordId);
  if (!word) return { ok: false, reason: "unknown" };
  const monthKey = currentMonthKey();

  try {
    const wordRef = doc(db, "titleWords", wordId);
    const userRef = doc(db, "users", nickname);

    const previouslyOwnedId = await runTransaction(db, async (tx) => {
      const wordSnap = await tx.get(wordRef);
      const userSnap = await tx.get(userRef);
      const userData = (userSnap.exists() ? userSnap.data() : {}) as {
        points?: number;
        frontTitle?: string;
        backTitle?: string;
      };
      const userPoints = typeof userData.points === "number" ? userData.points : 0;

      const existing = (wordSnap.exists() ? wordSnap.data() : null) as
        | Partial<TitleWordDoc>
        | null;
      const takenBySomeoneElse =
        !!existing &&
        !!existing.owner &&
        existing.owner !== nickname &&
        existing.purchasedMonth === monthKey;
      if (takenBySomeoneElse) {
        throw new Error("TAKEN");
      }

      if (userPoints < word.price) {
        throw new Error("NO_POINTS");
      }

      const prevField = word.type === "front" ? "frontTitle" : "backTitle";
      const prevWordText = (userData[prevField] || "") as string;
      let prevWordId = "";
      if (prevWordText) {
        const prev = getWordByText(word.type, prevWordText);
        if (prev) prevWordId = prev.id;
      }

      if (prevWordId && prevWordId !== wordId) {
        const prevRef = doc(db, "titleWords", prevWordId);
        tx.set(
          prevRef,
          { owner: "", purchasedMonth: "", word: getWordById(prevWordId)?.word ?? "", type: word.type, price: getWordById(prevWordId)?.price ?? 0 },
          { merge: true },
        );
      }

      tx.set(
        wordRef,
        {
          word: word.word,
          type: word.type,
          price: word.price,
          owner: nickname,
          purchasedMonth: monthKey,
        },
        { merge: true },
      );

      tx.set(
        userRef,
        {
          points: increment(-word.price),
          [prevField]: word.word,
        },
        { merge: true },
      );

      return prevWordId;
    });

    void previouslyOwnedId;
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "TAKEN") return { ok: false, reason: "taken" };
    if (msg === "NO_POINTS") return { ok: false, reason: "no_points" };
    console.error("purchaseTitle failed", e);
    return { ok: false, reason: "error" };
  }
}
