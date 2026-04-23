"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
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
type FashionSubTab =
  | "adult_male"
  | "adult_female"
  | "child_male"
  | "child_female";

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

const FASHION_SUB_TABS: { value: FashionSubTab; label: string }[] = [
  { value: "adult_male", label: "성인남" },
  { value: "adult_female", label: "성인여" },
  { value: "child_male", label: "어린이남" },
  { value: "child_female", label: "어린이여" },
];

const MOUTH_ITEMS: { id: string; src: string; price: number }[] = Array.from(
  { length: 17 },
  (_, i) => {
    const n = i + 1;
    return {
      id: `mouth${n}`,
      src: `/images/avatar/mouths/mouth${n}.png`,
      price: 30,
    };
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
    items: [1, 2, 3].map((v) => ({
      id: `eye${group}_${v}`,
      src: `/images/avatar/eyes/eye${group}_${v}.png`,
    })),
  })),
  {
    group: 8,
    price: EYE_PRICE,
    items: [{ id: "eye8", src: "/images/avatar/eyes/eye8.png" }],
  },
  {
    group: 9,
    price: EYE_PRICE,
    items: [1, 2, 3].map((v) => ({
      id: `eye9_${v}`,
      src: `/images/avatar/eyes/eye9_${v}.png`,
    })),
  },
];

const CHEEK_PRICE = 20;
const CHEEK_ITEMS: { id: string; src: string; price: number }[] = [
  { id: "none", src: "", price: 0 },
  ...[1, 2, 3].map((n) => ({
    id: `cheek${n}`,
    src: `/images/avatar/cheeks/cheek${n}.png`,
    price: CHEEK_PRICE,
  })),
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
  const [statuses, setStatuses] = useState<Record<string, WordStatus>>({});
  const [busyWordId, setBusyWordId] = useState<string | null>(null);
  const [busyMouthId, setBusyMouthId] = useState<string | null>(null);
  const [busyEyesId, setBusyEyesId] = useState<string | null>(null);
  const [busyCheeksId, setBusyCheeksId] = useState<string | null>(null);
  const [previewEyes, setPreviewEyes] = useState<string | null>(null);
  const [previewMouth, setPreviewMouth] = useState<string | null>(null);
  const [previewCheeks, setPreviewCheeks] = useState<string | null>(null);
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
      setMessage("포인트가 부족합니다.");
      return;
    }
    const prevText = w.type === "front" ? frontTitle : backTitle;
    if (prevText === w.word) {
      setMessage("이미 장착 중인 단어입니다.");
      return;
    }
    if (
      !confirm(
        `「${w.word}」 단어를 ${w.price}p에 구매하시겠습니까?\n(기존 ${
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
        setMessage("포인트가 부족합니다.");
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
      setMessage("포인트가 부족합니다.");
      return;
    }
    if (!confirm(`이 눈을 ${item.price}p에 구매하시겠습니까?`)) return;
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
      setMessage("포인트가 부족합니다.");
      return;
    }
    const confirmMsg =
      item.id === "none"
        ? "볼터치를 제거하시겠습니까?"
        : `이 볼터치를 ${item.price}p에 구매하시겠습니까?`;
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

  const handleBuyMouth = async (item: (typeof MOUTH_ITEMS)[number]) => {
    if (!nickname) return;
    if (avatarMouth === item.id) return;
    if (points < item.price) {
      setMessage("포인트가 부족합니다.");
      return;
    }
    if (!confirm(`이 입을 ${item.price}p에 구매하시겠습니까?`)) return;
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
        }
      : null;

  const activePreview:
    | { kind: "eyes" | "mouth" | "cheeks"; id: string; price: number }
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
    return null;
  })();

  const buyingPreview =
    (activePreview?.kind === "eyes" && busyEyesId === activePreview.id) ||
    (activePreview?.kind === "mouth" && busyMouthId === activePreview.id) ||
    (activePreview?.kind === "cheeks" && busyCheeksId === activePreview.id);

  const handleBuyPreview = async () => {
    if (!activePreview) return;
    if (activePreview.kind === "eyes") {
      await handleBuyEyes({ id: activePreview.id, price: activePreview.price });
    } else if (activePreview.kind === "mouth") {
      await handleBuyMouth({
        id: activePreview.id,
        src: `/images/avatar/mouths/${activePreview.id}.png`,
        price: activePreview.price,
      });
    } else {
      await handleBuyCheeks({
        id: activePreview.id,
        price: activePreview.price,
      });
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
                        (avatarCheeks || "none") === activePreview.id)
                    }
                  >
                    {buyingPreview
                      ? "구매 중..."
                      : activePreview.price === 0
                        ? "적용"
                        : `구매 (${activePreview.price}p)`}
                  </button>
                  <button
                    type="button"
                    className="minihome-btn minihome-btn-cancel"
                    onClick={() => {
                      if (activePreview.kind === "eyes") setPreviewEyes(null);
                      else if (activePreview.kind === "mouth")
                        setPreviewMouth(null);
                      else setPreviewCheeks(null);
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
                <span className="shop-status-label">내 포인트</span>
                <span className="shop-status-value shop-status-points">
                  {points.toLocaleString()}p
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
            )}

            {message && <p className="shop-message">{message}</p>}

            {avatarSubTab === "eyes" ? (
              <div className="shop-eye-groups">
                {EYE_GROUPS.map((grp) => (
                  <section key={grp.group} className="shop-eye-group">
                    <h3 className="shop-eye-group-title">
                      eye{grp.group}
                      {grp.items.length > 1 ? " 그룹" : ""}{" "}
                      <span className="shop-eye-group-price">
                        {grp.price}p
                      </span>
                    </h3>
                    <div className="shop-grid">
                      {grp.items.map((item) => {
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
                            <div className="shop-card-price">{grp.price}p</div>
                            <div className="shop-card-status">
                              {equipped
                                ? "장착 중"
                                : previewed
                                  ? "미리보기"
                                  : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
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
                        {item.price === 0 ? "무료" : `${item.price}p`}
                      </div>
                      <div className="shop-card-status">
                        {equipped ? "장착 중" : previewed ? "미리보기" : ""}
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
                      <div className="shop-card-price">{item.price}p</div>
                      <div className="shop-card-status">
                        {equipped ? "장착 중" : previewed ? "미리보기" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
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
            <span className="shop-status-label">내 포인트</span>
            <span className="shop-status-value shop-status-points">
              {points.toLocaleString()}p
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
            else if (notEnoughPoints) btnLabel = "포인트 부족";

            return (
              <div key={w.id} className={cardClass}>
                <div className="shop-card-word">{w.word}</div>
                <div className="shop-card-price">{w.price}p</div>
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
