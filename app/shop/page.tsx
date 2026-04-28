"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "@/app/components/AuthProvider";
import Avatar, {
  AvatarData,
  isBodyType,
  useAvatarData,
} from "@/app/components/Avatar";
import { db } from "@/src/lib/firebase";
import { avatarUrl, partUrl } from "@/src/lib/avatarAssets";
import {
  FASHION_CATEGORY_TABS,
  FASHION_FIELD,
  FASHION_ITEMS,
  FASHION_SUB_TABS,
  type FashionCategoryKey,
  type FashionItem,
  type FashionSubTab,
  fashionPreviewFilename,
  isOwned,
  ownedKey,
} from "@/src/lib/fashion";
import { logActivity } from "@/src/lib/activity";
import {
  BACK_WORDS,
  FRONT_WORDS,
  TitleType,
  TitleWord,
  TitleWordDoc,
  currentMonthKey,
  ensureMonthlyReset,
  formatTitlePrefix,
  getWordByText,
  migrateRenamedTitles,
  purchaseTitle,
  seedTitleWords,
} from "@/src/lib/titles";

type WordStatus = {
  owner: string;
  purchasedMonth: string;
};

type AvatarSubTab = "eyes" | "cheeks" | "mouth" | "hair" | "fashion";
type HairSubTab = "male" | "female";

const AVATAR_SUB_TABS: { value: AvatarSubTab; label: string }[] = [
  { value: "eyes", label: "눈" },
  { value: "cheeks", label: "볼터치" },
  { value: "mouth", label: "입" },
  { value: "hair", label: "헤어" },
  { value: "fashion", label: "패션" },
];

const HAIR_SUB_TABS: { value: HairSubTab; label: string }[] = [
  { value: "male", label: "남" },
  { value: "female", label: "여" },
];

const MOUTH_ITEMS: { id: string; src: string; price: number }[] = Array.from(
  { length: 17 },
  (_, i) => {
    const n = i + 1;
    const id = `mouth${n}`;
    return { id, src: avatarUrl("mouths", id), price: 30 };
  },
);

const EYE_PRICE = 35;
const EYE_GROUPS: {
  group: number;
  price: number;
  items: { id: string; src: string }[];
}[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map((group) => ({
    group,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye${group}_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  })),
  {
    group: 8,
    price: EYE_PRICE,
    items: [{ id: "eye8", src: avatarUrl("eyes", "eye8") }],
  },
  {
    group: 9,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye9_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  },
  {
    group: 10,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye10_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  },
  {
    group: 11,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye11_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  },
  {
    group: 12,
    price: EYE_PRICE,
    items: [{ id: "eye12", src: avatarUrl("eyes", "eye12") }],
  },
  {
    group: 14,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye14_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  },
  {
    group: 15,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => {
      const id = `eye15_${v}`;
      return { id, src: avatarUrl("eyes", id) };
    }),
  },
];

const CHEEK_PRICE = 20;
const CHEEK_ITEMS: { id: string; src: string; price: number }[] = [
  { id: "none", src: "", price: 0 },
  ...[1, 2, 3].map((n) => {
    const id = `cheek${n}`;
    return { id, src: avatarUrl("cheeks", id), price: CHEEK_PRICE };
  }),
];

// Hair tab data. avatarHair stores the gender-agnostic stem
// `hair<group>_<color>` (e.g. "hair1_2"); the Avatar component appends
// the user's gender + age suffix at render time so the same value
// works on any body. Each group ships a preview PNG per gender plus 3
// color variants × 2 ages.
const HAIR_PRICE = 40;
const HAIR_GROUPS: {
  group: number;
  price: number;
  colors: number[];
  names: Record<HairSubTab, string>;
}[] = [
  {
    group: 1,
    price: HAIR_PRICE,
    colors: [1, 2, 3],
    names: { male: "내추럴 쉐도우 컷", female: "시스루 웨이브 단발" },
  },
];


export default function ShopPage() {
  const { nickname, ready } = useAuth();
  const [mainTab, setMainTab] = useState<"title" | "avatar">("title");
  const [avatarSubTab, setAvatarSubTab] = useState<AvatarSubTab>("eyes");
  const [hairSubTab, setHairSubTab] = useState<HairSubTab>("male");
  const [fashionSubTab, setFashionSubTab] =
    useState<FashionSubTab>("adult_male");
  const [tab, setTab] = useState<TitleType>("front");
  const [points, setPoints] = useState(0);
  const [frontTitle, setFrontTitle] = useState("");
  const [backTitle, setBackTitle] = useState("");
  const [avatarMouth, setAvatarMouth] = useState("");
  const [avatarEyes, setAvatarEyes] = useState("");
  const [avatarCheeks, setAvatarCheeks] = useState("");
  const [avatarHair, setAvatarHair] = useState("");
  const [avatarTop, setAvatarTop] = useState("");
  const [avatarBottom, setAvatarBottom] = useState("");
  const [avatarShoes, setAvatarShoes] = useState("");
  const [avatarAccessories, setAvatarAccessories] = useState("");
  const [ownedFashion, setOwnedFashion] = useState<string[]>([]);
  const [fashionCatTab, setFashionCatTab] =
    useState<FashionCategoryKey>("tops");
  const [statuses, setStatuses] = useState<Record<string, WordStatus>>({});
  const [busyWordId, setBusyWordId] = useState<string | null>(null);
  const [busyMouthId, setBusyMouthId] = useState<string | null>(null);
  const [busyEyesId, setBusyEyesId] = useState<string | null>(null);
  const [busyCheeksId, setBusyCheeksId] = useState<string | null>(null);
  const [busyHairId, setBusyHairId] = useState<string | null>(null);
  const [busyFashionId, setBusyFashionId] = useState<string | null>(null);
  const [previewEyes, setPreviewEyes] = useState<string | null>(null);
  const [previewMouth, setPreviewMouth] = useState<string | null>(null);
  const [previewCheeks, setPreviewCheeks] = useState<string | null>(null);
  const [previewHair, setPreviewHair] = useState<string | null>(null);
  const [previewTop, setPreviewTop] = useState<string | null>(null);
  const [previewBottom, setPreviewBottom] = useState<string | null>(null);
  const [previewShoes, setPreviewShoes] = useState<string | null>(null);
  const [previewAccessories, setPreviewAccessories] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const avatarData = useAvatarData(nickname);
  const monthKey = currentMonthKey();

  useEffect(() => {
    void ensureMonthlyReset();
    void seedTitleWords();
    void migrateRenamedTitles();
  }, []);

  useEffect(() => {
    if (!nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const data = snap.data();
      setPoints(typeof data?.points === "number" ? data.points : 0);
      setFrontTitle((data?.frontTitle as string | undefined) ?? "");
      setBackTitle((data?.backTitle as string | undefined) ?? "");
      setAvatarMouth((data?.avatarMouth as string | undefined) ?? "");
      setAvatarEyes((data?.avatarEyes as string | undefined) ?? "");
      setAvatarCheeks((data?.avatarCheeks as string | undefined) ?? "");
      setAvatarHair((data?.avatarHair as string | undefined) ?? "");
      setAvatarTop((data?.avatarTop as string | undefined) ?? "");
      setAvatarBottom((data?.avatarBottom as string | undefined) ?? "");
      setAvatarShoes((data?.avatarShoes as string | undefined) ?? "");
      setAvatarAccessories(
        (data?.avatarAccessories as string | undefined) ?? "",
      );
      const owned = data?.ownedFashion;
      setOwnedFashion(
        Array.isArray(owned)
          ? owned.filter((s): s is string => typeof s === "string")
          : [],
      );
    });
    return () => unsub();
  }, [nickname]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "titleWords"), (snap) => {
      const next: Record<string, WordStatus> = {};
      snap.forEach((d) => {
        const data = d.data() as Partial<TitleWordDoc>;
        next[d.id] = {
          owner: data.owner ?? "",
          purchasedMonth: data.purchasedMonth ?? "",
        };
      });
      setStatuses(next);
    });
    return () => unsub();
  }, []);

  const words = tab === "front" ? FRONT_WORDS : BACK_WORDS;

  const equippedFrontId = useMemo(() => {
    if (!frontTitle) return "";
    const w = getWordByText("front", frontTitle);
    return w?.id ?? "";
  }, [frontTitle]);

  const equippedBackId = useMemo(() => {
    if (!backTitle) return "";
    const w = getWordByText("back", backTitle);
    return w?.id ?? "";
  }, [backTitle]);

  const handleBuy = async (w: TitleWord) => {
    if (!nickname) return;
    const status = statuses[w.id];
    const takenByOther =
      !!status &&
      !!status.owner &&
      status.owner !== nickname &&
      status.purchasedMonth === monthKey;
    if (takenByOther) {
      setMessage("이미 다른 사람이 사용 중인 단어입니다.");
      return;
    }
    if (points < w.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    const prevText = w.type === "front" ? frontTitle : backTitle;
    if (prevText === w.word) {
      setMessage("이미 장착 중인 단어입니다.");
      return;
    }
    if (
      !confirm(
        `「${w.word}」 단어를 ${w.price} 별빛에 구매하시겠습니까?\n(기존 ${
          w.type === "front" ? "앞" : "뒤"
        } 단어는 해제됩니다.)`,
      )
    ) {
      return;
    }
    setBusyWordId(w.id);
    setMessage(null);
    try {
      const result = await purchaseTitle(nickname, w.id);
      if (result.ok) {
        const newFront = w.type === "front" ? w.word : frontTitle;
        const newBack = w.type === "back" ? w.word : backTitle;
        const combined = formatTitlePrefix(newFront, newBack);
        if (combined) {
          await logActivity(
            "title",
            nickname,
            `${nickname}님이 새 칭호를 장착했습니다: ${combined}`,
          );
          setMessage(`「${w.word}」 구매 완료! 칭호 조합이 완성되었습니다.`);
        } else {
          const remaining = w.type === "front" ? "뒤 단어" : "앞 단어";
          setMessage(`「${w.word}」 구매 완료! ${remaining}도 구매하면 칭호가 장착됩니다.`);
        }
      } else if (result.reason === "taken") {
        setMessage("방금 다른 사람이 선점했습니다.");
      } else if (result.reason === "no_points") {
        setMessage("별빛이 부족합니다.");
      } else {
        setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setBusyWordId(null);
    }
  };

  const handleBuyEyes = async (item: { id: string; price: number }) => {
    if (!nickname) return;
    if (avatarEyes === item.id) return;
    if (points < item.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    if (!confirm(`이 눈을 ${item.price} 별빛에 구매하시겠습니까?`)) return;
    setBusyEyesId(item.id);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "users", nickname),
        { avatarEyes: item.id, points: increment(-item.price) },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "아바타",
        points: -item.price,
        description: `눈 변경 (${item.id})`,
        createdAt: serverTimestamp(),
      });
      setMessage("구매 완료! 눈이 변경되었습니다.");
      setPreviewEyes(null);
    } catch (e) {
      console.error(e);
      setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
    }
    setBusyEyesId(null);
  };

  const handleBuyCheeks = async (item: { id: string; price: number }) => {
    if (!nickname) return;
    const currentCheekKey = avatarCheeks || "none";
    if (currentCheekKey === item.id) return;
    if (item.price > 0 && points < item.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    const confirmMsg =
      item.id === "none"
        ? "볼터치를 제거하시겠습니까?"
        : `이 볼터치를 ${item.price} 별빛에 구매하시겠습니까?`;
    if (!confirm(confirmMsg)) return;
    setBusyCheeksId(item.id);
    setMessage(null);
    try {
      const storedValue = item.id === "none" ? "" : item.id;
      const patch: Record<string, unknown> = { avatarCheeks: storedValue };
      if (item.price > 0) patch.points = increment(-item.price);
      await setDoc(doc(db, "users", nickname), patch, { merge: true });
      if (item.price > 0) {
        await addDoc(collection(db, "users", nickname, "pointHistory"), {
          type: "아바타",
          points: -item.price,
          description: `볼터치 변경 (${item.id})`,
          createdAt: serverTimestamp(),
        });
      }
      setMessage(
        item.id === "none"
          ? "볼터치가 제거되었습니다."
          : "구매 완료! 볼터치가 변경되었습니다.",
      );
      setPreviewCheeks(null);
    } catch (e) {
      console.error(e);
      setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
    }
    setBusyCheeksId(null);
  };

  const handleBuyHair = async (item: { id: string; price: number }) => {
    if (!nickname) return;
    if (!hairTabMatchesUser) {
      const lbl = hairSubTab === "male" ? "남자" : "여자";
      setMessage(`${lbl} 캐릭터 전용입니다.`);
      return;
    }
    if (avatarHair === item.id) return;
    if (points < item.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    if (!confirm(`이 헤어를 ${item.price} 별빛에 구매하시겠습니까?`)) return;
    setBusyHairId(item.id);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "users", nickname),
        { avatarHair: item.id, points: increment(-item.price) },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "아바타",
        points: -item.price,
        description: `헤어 변경 (${item.id})`,
        createdAt: serverTimestamp(),
      });
      setMessage("구매 완료! 헤어가 변경되었습니다.");
      setPreviewHair(null);
    } catch (e) {
      console.error(e);
      setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
    }
    setBusyHairId(null);
  };

  const handleBuyFashion = async (
    cat: FashionCategoryKey,
    currentValue: string,
    setPreview: (id: string | null) => void,
    item: FashionItem,
  ) => {
    if (!nickname) return;
    if (!fashionTabMatchesUser) {
      setMessage(`${fashionTabLabel} 캐릭터 전용입니다.`);
      return;
    }
    if (currentValue === item.id) return;
    if (isOwned(ownedFashion, fashionSubTab, cat, item.id)) {
      setMessage("이미 보유한 아이템입니다. 옷장에서 착용하세요.");
      return;
    }
    if (points < item.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    if (!confirm(`${item.name}을(를) ${item.price} 별빛에 구매하시겠습니까?`))
      return;
    setBusyFashionId(item.id);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "users", nickname),
        {
          [FASHION_FIELD[cat]]: item.id,
          ownedFashion: arrayUnion(ownedKey(fashionSubTab, cat, item.id)),
          points: increment(-item.price),
        },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "아바타",
        points: -item.price,
        description: `${item.name} 구매 (${item.id})`,
        createdAt: serverTimestamp(),
      });
      setMessage(`구매 완료! ${item.name}을(를) 장착했습니다.`);
      setPreview(null);
    } catch (e) {
      console.error(e);
      setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
    }
    setBusyFashionId(null);
  };

  const handleBuyMouth = async (item: (typeof MOUTH_ITEMS)[number]) => {
    if (!nickname) return;
    if (avatarMouth === item.id) return;
    if (points < item.price) {
      setMessage("별빛이 부족합니다.");
      return;
    }
    if (!confirm(`이 입을 ${item.price} 별빛에 구매하시겠습니까?`)) return;
    setBusyMouthId(item.id);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "users", nickname),
        { avatarMouth: item.id, points: increment(-item.price) },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "아바타",
        points: -item.price,
        description: `입 변경 (${item.id})`,
        createdAt: serverTimestamp(),
      });
      setMessage("구매 완료! 입이 변경되었습니다.");
      setPreviewMouth(null);
    } catch (e) {
      console.error(e);
      setMessage("구매 실패. 잠시 후 다시 시도해주세요.");
    }
    setBusyMouthId(null);
  };

  if (!ready) {
    return (
      <div className="shop-page">
        <p className="shop-hint">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="shop-page">
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  const previewText = formatTitlePrefix(frontTitle, backTitle);

  const hasBody = isBodyType(avatarData?.avatarBody);
  const userHairGender: HairSubTab | null = isBodyType(avatarData?.avatarBody)
    ? avatarData!.avatarBody!.endsWith("female")
      ? "female"
      : "male"
    : null;
  const hairTabMatchesUser =
    userHairGender !== null && hairSubTab === userHairGender;
  const fashionTabMatchesUser =
    isBodyType(avatarData?.avatarBody) &&
    avatarData!.avatarBody === fashionSubTab;
  const fashionTabLabel =
    FASHION_SUB_TABS.find((t) => t.value === fashionSubTab)?.label ?? "";
  const resolvedPreviewCheeks =
    previewCheeks === null
      ? (avatarData?.avatarCheeks ?? "")
      : previewCheeks === "none"
        ? ""
        : previewCheeks;
  const previewAvatarData: AvatarData | null =
    hasBody && avatarData
      ? {
          ...avatarData,
          avatarEyes: previewEyes ?? avatarData.avatarEyes ?? "",
          avatarMouth: previewMouth ?? avatarData.avatarMouth ?? "",
          avatarCheeks: resolvedPreviewCheeks,
          avatarHair:
            previewHair && hairTabMatchesUser
              ? previewHair
              : (avatarData.avatarHair ?? ""),
          avatarTop:
            previewTop && fashionTabMatchesUser
              ? previewTop
              : (avatarData.avatarTop ?? ""),
          avatarBottom:
            previewBottom && fashionTabMatchesUser
              ? previewBottom
              : (avatarData.avatarBottom ?? ""),
          avatarShoes:
            previewShoes && fashionTabMatchesUser
              ? previewShoes
              : (avatarData.avatarShoes ?? ""),
          avatarAccessories:
            previewAccessories && fashionTabMatchesUser
              ? previewAccessories
              : (avatarData.avatarAccessories ?? ""),
        }
      : null;

  const fashionCatPreviewId =
    fashionCatTab === "tops"
      ? previewTop
      : fashionCatTab === "bottoms"
        ? previewBottom
        : fashionCatTab === "shoes"
          ? previewShoes
          : previewAccessories;
  const fashionCatItems =
    FASHION_ITEMS[fashionSubTab][fashionCatTab] ?? [];

  const activePreview:
    | {
        kind:
          | "eyes"
          | "mouth"
          | "cheeks"
          | "hair"
          | "tops"
          | "bottoms"
          | "shoes"
          | "accessories";
        id: string;
        price: number;
      }
    | null = (() => {
    if (avatarSubTab === "eyes" && previewEyes) {
      return { kind: "eyes", id: previewEyes, price: 35 };
    }
    if (avatarSubTab === "mouth" && previewMouth) {
      return { kind: "mouth", id: previewMouth, price: 30 };
    }
    if (avatarSubTab === "cheeks" && previewCheeks) {
      return {
        kind: "cheeks",
        id: previewCheeks,
        price: previewCheeks === "none" ? 0 : CHEEK_PRICE,
      };
    }
    if (avatarSubTab === "hair" && previewHair && hairTabMatchesUser) {
      return { kind: "hair", id: previewHair, price: HAIR_PRICE };
    }
    if (
      avatarSubTab === "fashion" &&
      fashionTabMatchesUser &&
      fashionCatPreviewId
    ) {
      const item = fashionCatItems.find((i) => i.id === fashionCatPreviewId);
      if (item) {
        return { kind: fashionCatTab, id: item.id, price: item.price };
      }
    }
    return null;
  })();

  const buyingPreview =
    (activePreview?.kind === "eyes" && busyEyesId === activePreview.id) ||
    (activePreview?.kind === "mouth" && busyMouthId === activePreview.id) ||
    (activePreview?.kind === "cheeks" && busyCheeksId === activePreview.id) ||
    (activePreview?.kind === "hair" && busyHairId === activePreview.id) ||
    ((activePreview?.kind === "tops" ||
      activePreview?.kind === "bottoms" ||
      activePreview?.kind === "shoes" ||
      activePreview?.kind === "accessories") &&
      busyFashionId === activePreview.id);

  const handleBuyPreview = async () => {
    if (!activePreview) return;
    if (activePreview.kind === "eyes") {
      await handleBuyEyes({ id: activePreview.id, price: activePreview.price });
    } else if (activePreview.kind === "mouth") {
      await handleBuyMouth({
        id: activePreview.id,
        src: avatarUrl("mouths", activePreview.id),
        price: activePreview.price,
      });
    } else if (activePreview.kind === "cheeks") {
      await handleBuyCheeks({
        id: activePreview.id,
        price: activePreview.price,
      });
    } else if (activePreview.kind === "hair") {
      await handleBuyHair({
        id: activePreview.id,
        price: activePreview.price,
      });
    } else {
      const cat: FashionCategoryKey = activePreview.kind;
      const item = FASHION_ITEMS[fashionSubTab][cat].find(
        (i) => i.id === activePreview.id,
      );
      if (!item) return;
      const currentValue =
        cat === "tops"
          ? avatarTop
          : cat === "bottoms"
            ? avatarBottom
            : cat === "shoes"
              ? avatarShoes
              : avatarAccessories;
      const setPreview =
        cat === "tops"
          ? setPreviewTop
          : cat === "bottoms"
            ? setPreviewBottom
            : cat === "shoes"
              ? setPreviewShoes
              : setPreviewAccessories;
      await handleBuyFashion(cat, currentValue, setPreview, item);
    }
  };

  return (
    <div className="shop-page">
      <div className="shop-container">
        <header className="shop-header">
          <h1 className="shop-title">상점</h1>
        </header>

        <div className="shop-tabs shop-main-tabs">
          <button
            type="button"
            className={"shop-tab" + (mainTab === "title" ? " shop-tab-active" : "")}
            onClick={() => setMainTab("title")}
          >
            칭호
          </button>
          <button
            type="button"
            className={"shop-tab" + (mainTab === "avatar" ? " shop-tab-active" : "")}
            onClick={() => setMainTab("avatar")}
          >
            아바타
          </button>
        </div>

        {mainTab === "avatar" ? (
          <>
            <section className="shop-avatar-preview">
              {hasBody && previewAvatarData ? (
                <Avatar
                  data={previewAvatarData}
                  className="shop-avatar-preview-img"
                />
              ) : (
                <p className="shop-avatar-warn">체형을 먼저 선택해주세요</p>
              )}
              {activePreview && (
                <div className="shop-avatar-actions">
                  <button
                    type="button"
                    className="minihome-btn"
                    onClick={handleBuyPreview}
                    disabled={
                      buyingPreview ||
                      points < activePreview.price ||
                      (activePreview.kind === "eyes" &&
                        avatarEyes === activePreview.id) ||
                      (activePreview.kind === "mouth" &&
                        avatarMouth === activePreview.id) ||
                      (activePreview.kind === "cheeks" &&
                        (avatarCheeks || "none") === activePreview.id) ||
                      (activePreview.kind === "hair" &&
                        avatarHair === activePreview.id) ||
                      (activePreview.kind === "tops" &&
                        avatarTop === activePreview.id) ||
                      (activePreview.kind === "bottoms" &&
                        avatarBottom === activePreview.id) ||
                      (activePreview.kind === "shoes" &&
                        avatarShoes === activePreview.id) ||
                      (activePreview.kind === "accessories" &&
                        avatarAccessories === activePreview.id)
                    }
                  >
                    {buyingPreview
                      ? "구매 중..."
                      : activePreview.price === 0
                        ? "적용"
                        : `구매 (${activePreview.price} 별빛)`}
                  </button>
                  <button
                    type="button"
                    className="minihome-btn minihome-btn-cancel"
                    onClick={() => {
                      if (activePreview.kind === "eyes") setPreviewEyes(null);
                      else if (activePreview.kind === "mouth")
                        setPreviewMouth(null);
                      else if (activePreview.kind === "cheeks")
                        setPreviewCheeks(null);
                      else if (activePreview.kind === "hair")
                        setPreviewHair(null);
                      else if (activePreview.kind === "tops")
                        setPreviewTop(null);
                      else if (activePreview.kind === "bottoms")
                        setPreviewBottom(null);
                      else if (activePreview.kind === "shoes")
                        setPreviewShoes(null);
                      else setPreviewAccessories(null);
                    }}
                    disabled={buyingPreview}
                  >
                    취소
                  </button>
                </div>
              )}
            </section>

            <section className="shop-status">
              <div className="shop-status-row">
                <span className="shop-status-label">내 별빛</span>
                <span className="shop-status-value shop-status-points">
                  {points.toLocaleString()} 별빛
                </span>
              </div>
            </section>

            <div className="shop-tabs">
              {AVATAR_SUB_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={
                    "shop-tab" +
                    (avatarSubTab === t.value ? " shop-tab-active" : "")
                  }
                  onClick={() => setAvatarSubTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {avatarSubTab === "hair" && (
              <div className="shop-tabs shop-subtabs">
                {HAIR_SUB_TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={
                      "shop-tab" +
                      (hairSubTab === t.value ? " shop-tab-active" : "")
                    }
                    onClick={() => setHairSubTab(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {avatarSubTab === "fashion" && (
              <>
                <div className="shop-tabs shop-subtabs">
                  {FASHION_SUB_TABS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={
                        "shop-tab" +
                        (fashionSubTab === t.value ? " shop-tab-active" : "")
                      }
                      onClick={() => setFashionSubTab(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="shop-tabs shop-subtabs">
                  {FASHION_CATEGORY_TABS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={
                        "shop-tab" +
                        (fashionCatTab === t.value ? " shop-tab-active" : "")
                      }
                      onClick={() => setFashionCatTab(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {message && <p className="shop-message">{message}</p>}

            {avatarSubTab === "eyes" ? (
              <div className="shop-grid">
                {EYE_GROUPS.map((grp) => {
                  const isMulti = grp.items.length > 1;
                  const itemFromGroup = (id: string) =>
                    grp.items.find((i) => i.id === id);
                  // Card thumbnail follows current selection within the
                  // group — preview wins over equipped, falls back to
                  // color 1 so each group has a stable default.
                  const displayedItem =
                    (previewEyes ? itemFromGroup(previewEyes) : null) ??
                    (avatarEyes ? itemFromGroup(avatarEyes) : null) ??
                    grp.items[0];

                  if (!isMulti) {
                    const item = grp.items[0];
                    const equipped = avatarEyes === item.id;
                    const previewed = previewEyes === item.id;
                    const cardClass = [
                      "shop-card",
                      "shop-card-clickable",
                      equipped ? "shop-card-equipped" : "",
                      previewed ? "shop-card-previewed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const toggle = () => {
                      if (equipped) return;
                      setPreviewEyes(previewed ? null : item.id);
                    };
                    return (
                      <div
                        key={grp.group}
                        className={cardClass}
                        role="button"
                        tabIndex={equipped ? -1 : 0}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                      >
                        <div className="shop-card-preview-wrap">
                          <img
                            src={item.src}
                            alt=""
                            className="shop-card-preview"
                            draggable={false}
                          />
                        </div>
                        <div className="shop-card-price">
                          {grp.price} 별빛
                        </div>
                        <div className="shop-card-status">
                          {equipped ? "장착 중" : ""}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={grp.group} className="shop-card">
                      <div className="shop-card-preview-wrap">
                        <img
                          src={displayedItem.src}
                          alt=""
                          className="shop-card-preview"
                          draggable={false}
                        />
                      </div>
                      <div className="shop-card-price">{grp.price} 별빛</div>
                      <div className="shop-eye-colors">
                        {grp.items.map((item, i) => {
                          const equipped = avatarEyes === item.id;
                          const previewed = previewEyes === item.id;
                          const cls = [
                            "shop-eye-color",
                            equipped ? "shop-eye-color-equipped" : "",
                            previewed ? "shop-eye-color-previewed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cls}
                              onClick={() => {
                                if (equipped) return;
                                setPreviewEyes(previewed ? null : item.id);
                              }}
                              disabled={equipped}
                            >
                              색상 {i + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : avatarSubTab === "cheeks" ? (
              <div className="shop-grid">
                {CHEEK_ITEMS.map((item) => {
                  const currentCheekKey = avatarCheeks || "none";
                  const equipped = currentCheekKey === item.id;
                  const previewed = previewCheeks === item.id;
                  const cardClass = [
                    "shop-card",
                    "shop-card-clickable",
                    equipped ? "shop-card-equipped" : "",
                    previewed ? "shop-card-previewed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const toggle = () => {
                    if (equipped) return;
                    setPreviewCheeks(previewed ? null : item.id);
                  };
                  return (
                    <div
                      key={item.id}
                      className={cardClass}
                      role="button"
                      tabIndex={equipped ? -1 : 0}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <div className="shop-card-preview-wrap">
                        {item.id === "none" ? (
                          <span className="shop-card-none">없음</span>
                        ) : (
                          <img
                            src={item.src}
                            alt=""
                            className="shop-card-preview"
                            draggable={false}
                          />
                        )}
                      </div>
                      <div className="shop-card-price">
                        {item.price === 0 ? "무료" : `${item.price} 별빛`}
                      </div>
                      <div className="shop-card-status">
                        {equipped ? "장착 중" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : avatarSubTab === "mouth" ? (
              <div className="shop-grid">
                {MOUTH_ITEMS.map((item) => {
                  const equipped = avatarMouth === item.id;
                  const previewed = previewMouth === item.id;
                  const cardClass = [
                    "shop-card",
                    "shop-card-clickable",
                    equipped ? "shop-card-equipped" : "",
                    previewed ? "shop-card-previewed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const toggle = () => {
                    if (equipped) return;
                    setPreviewMouth(previewed ? null : item.id);
                  };
                  return (
                    <div
                      key={item.id}
                      className={cardClass}
                      role="button"
                      tabIndex={equipped ? -1 : 0}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <div className="shop-card-preview-wrap">
                        <img
                          src={item.src}
                          alt=""
                          className="shop-card-preview"
                          draggable={false}
                        />
                      </div>
                      <div className="shop-card-price">{item.price} 별빛</div>
                      <div className="shop-card-status">
                        {equipped ? "장착 중" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : avatarSubTab === "hair" ? (
              <div className="shop-hair-groups">
                {HAIR_GROUPS.map((grp) => {
                  const tabGenderLabel =
                    hairSubTab === "male" ? "남자" : "여자";
                  return (
                    <section key={grp.group} className="shop-hair-group">
                      <div className="shop-hair-preview-wrap">
                        <img
                          src={avatarUrl(
                            "hair_back",
                            `${hairSubTab}_hair${grp.group}_preview`,
                          )}
                          alt=""
                          className="shop-hair-preview"
                          draggable={false}
                        />
                        <img
                          src={avatarUrl(
                            "hair_front",
                            `${hairSubTab}_hair${grp.group}_preview`,
                          )}
                          alt=""
                          className="shop-hair-preview-front"
                          draggable={false}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      </div>
                      <div className="shop-hair-name">
                        {grp.names[hairSubTab]}
                      </div>
                      <div className="shop-hair-group-price">
                        {grp.price} 별빛
                      </div>
                      {!hairTabMatchesUser ? (
                        <p className="shop-hair-locked">
                          {tabGenderLabel} 캐릭터 전용입니다
                        </p>
                      ) : (
                        <div className="shop-hair-colors">
                          {grp.colors.map((color) => {
                            const id = `hair${grp.group}_${color}`;
                            const equipped = avatarHair === id;
                            const previewed = previewHair === id;
                            const cls = [
                              "shop-hair-color",
                              equipped ? "shop-hair-color-equipped" : "",
                              previewed ? "shop-hair-color-previewed" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <button
                                key={color}
                                type="button"
                                className={cls}
                                onClick={() => {
                                  if (equipped) return;
                                  setPreviewHair(previewed ? null : id);
                                }}
                                disabled={equipped}
                              >
                                <span className="shop-hair-color-label">
                                  색상 {color}
                                </span>
                                {equipped && (
                                  <span className="shop-hair-color-status">
                                    장착 중
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : avatarSubTab === "fashion" ? (
              fashionCatItems.length === 0 ? (
                <p className="avatar-shop-hint">아직 아이템이 없습니다.</p>
              ) : (
                <div className="shop-grid">
                  {fashionCatItems.map((item) => {
                    const currentValue =
                      fashionCatTab === "tops"
                        ? avatarTop
                        : fashionCatTab === "bottoms"
                          ? avatarBottom
                          : fashionCatTab === "shoes"
                            ? avatarShoes
                            : avatarAccessories;
                    const setPreview =
                      fashionCatTab === "tops"
                        ? setPreviewTop
                        : fashionCatTab === "bottoms"
                          ? setPreviewBottom
                          : fashionCatTab === "shoes"
                            ? setPreviewShoes
                            : setPreviewAccessories;
                    const equipped = currentValue === item.id;
                    const previewed = fashionCatPreviewId === item.id;
                    const owned = isOwned(
                      ownedFashion,
                      fashionSubTab,
                      fashionCatTab,
                      item.id,
                    );
                    const interactable =
                      fashionTabMatchesUser && !equipped && !owned;
                    const cardClass = [
                      "shop-card",
                      interactable ? "shop-card-clickable" : "",
                      equipped ? "shop-card-equipped" : "",
                      previewed && fashionTabMatchesUser
                        ? "shop-card-previewed"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const toggle = () => {
                      if (!interactable) return;
                      setPreview(previewed ? null : item.id);
                    };
                    return (
                      <div
                        key={item.id}
                        className={cardClass}
                        role="button"
                        tabIndex={interactable ? 0 : -1}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                      >
                        <div className="shop-fashion-preview-wrap">
                          <img
                            src={partUrl(
                              fashionSubTab,
                              fashionCatTab,
                              fashionPreviewFilename(
                                fashionSubTab,
                                fashionCatTab,
                                item.id,
                              ),
                            )}
                            alt=""
                            className="shop-fashion-preview"
                            draggable={false}
                          />
                        </div>
                        <div className="shop-card-word">{item.name}</div>
                        <div className="shop-card-price">
                          {item.price} 별빛
                        </div>
                        <div className="shop-card-status">
                          {!fashionTabMatchesUser
                            ? `${fashionTabLabel} 전용`
                            : equipped
                              ? "장착 중"
                              : owned
                                ? "보유중"
                                : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <p className="avatar-shop-hint">준비 중입니다.</p>
            )}
          </>
        ) : (
        <>
        <p className="shop-subtitle">
          앞 단어와 뒤 단어를 <strong>둘 다</strong> 구매해야 칭호가 완성되어 닉네임에 표시됩니다
        </p>

        <section className="shop-status">
          <div className="shop-status-row">
            <span className="shop-status-label">내 별빛</span>
            <span className="shop-status-value shop-status-points">
              {points.toLocaleString()} 별빛
            </span>
          </div>
          <div className="shop-status-row">
            <span className="shop-status-label">현재 장착</span>
            <span className="shop-status-preview">
              {previewText ? (
                <>
                  <span className="title-prefix shop-preview-title">{previewText}</span>
                  <span className="shop-preview-nick">{nickname}</span>
                </>
              ) : frontTitle || backTitle ? (
                <span className="shop-status-partial">
                  {frontTitle && `앞: ${frontTitle}`}
                  {frontTitle && backTitle && " / "}
                  {backTitle && `뒤: ${backTitle}`}
                  <span className="shop-status-partial-note">
                    · {frontTitle ? "뒤" : "앞"} 단어를 구매하면 칭호가 완성됩니다
                  </span>
                </span>
              ) : (
                <span className="shop-status-empty">아직 구매한 단어가 없습니다</span>
              )}
            </span>
          </div>
          <p className="shop-status-reset">매월 1일 자정에 모든 칭호가 리셋됩니다 (환불 없음)</p>
        </section>

        <div className="shop-tabs">
          <button
            type="button"
            className={"shop-tab" + (tab === "front" ? " shop-tab-active" : "")}
            onClick={() => setTab("front")}
          >
            앞 단어
          </button>
          <button
            type="button"
            className={"shop-tab" + (tab === "back" ? " shop-tab-active" : "")}
            onClick={() => setTab("back")}
          >
            뒤 단어
          </button>
        </div>

        {message && <p className="shop-message">{message}</p>}

        <div className="shop-grid">
          {words.map((w) => {
            const status = statuses[w.id];
            const owner = status?.owner ?? "";
            const isCurrent = status?.purchasedMonth === monthKey && !!owner;
            const mine = isCurrent && owner === nickname;
            const takenByOther = isCurrent && !mine;
            const equipped =
              (w.type === "front" && equippedFrontId === w.id) ||
              (w.type === "back" && equippedBackId === w.id);
            const notEnoughPoints = points < w.price;
            const disabled =
              !!busyWordId ||
              takenByOther ||
              equipped ||
              notEnoughPoints;

            const cardClass = [
              "shop-card",
              mine && equipped ? "shop-card-equipped" : "",
              takenByOther ? "shop-card-taken" : "",
            ]
              .filter(Boolean)
              .join(" ");

            let btnLabel = "구매";
            if (busyWordId === w.id) btnLabel = "구매 중...";
            else if (equipped) btnLabel = "장착 중";
            else if (takenByOther) btnLabel = "사용 중";
            else if (notEnoughPoints) btnLabel = "별빛 부족";

            return (
              <div key={w.id} className={cardClass}>
                <div className="shop-card-word">{w.word}</div>
                <div className="shop-card-price">{w.price} 별빛</div>
                {takenByOther && (
                  <div className="shop-card-taken-text">
                    사용 중 ({owner})
                  </div>
                )}
                <button
                  type="button"
                  className="minihome-btn shop-card-btn"
                  onClick={() => handleBuy(w)}
                  disabled={disabled}
                >
                  {btnLabel}
                </button>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
