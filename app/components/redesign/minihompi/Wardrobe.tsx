"use client";

import { doc, setDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { partUrl } from "@/src/lib/avatarAssets";
import {
  FASHION_CATEGORY_TABS,
  FASHION_FIELD,
  type FashionCategoryKey,
  type FashionSubTab,
  type OwnedEntry,
  getFashionItem,
  parseOwned,
} from "@/src/lib/fashion";
import { type AvatarData, isBodyType } from "@/app/components/Avatar";

// Renders the user's owned fashion (collection-based) — equipped items
// at the top, then categorized sections of all owned items. Click to
// toggle equip/unequip; non-fashion parts (eyes/mouth/cheeks/hair) are
// replacement-based and not shown here.

export default function Wardrobe({
  nickname,
  data,
}: {
  nickname: string;
  data: AvatarData;
}) {
  const rawBody = data.avatarBody;
  if (!isBodyType(rawBody)) return null;
  const body: FashionSubTab = rawBody;

  const owned: OwnedEntry[] = (data.ownedFashion ?? [])
    .map(parseOwned)
    .filter((e): e is OwnedEntry => e !== null)
    .filter((e) => e.body === body);

  const equippedByCat: Record<FashionCategoryKey, string> = {
    tops: data.avatarTop ?? "",
    bottoms: data.avatarBottom ?? "",
    shoes: data.avatarShoes ?? "",
    accessories: data.avatarAccessories ?? "",
  };

  const equippedEntries = (
    Object.keys(equippedByCat) as FashionCategoryKey[]
  )
    .map((cat) => ({ cat, id: equippedByCat[cat] }))
    .filter((e) => e.id);

  const toggle = async (cat: FashionCategoryKey, id: string) => {
    const current = equippedByCat[cat];
    const newValue = current === id ? "" : id;
    try {
      await setDoc(
        doc(db, "users", nickname),
        { [FASHION_FIELD[cat]]: newValue },
        { merge: true },
      );
    } catch (e) {
      console.error("wardrobe toggle failed", e);
    }
  };

  const itemsByCategory: Record<FashionCategoryKey, OwnedEntry[]> = {
    tops: owned.filter((e) => e.category === "tops"),
    bottoms: owned.filter((e) => e.category === "bottoms"),
    shoes: owned.filter((e) => e.category === "shoes"),
    accessories: owned.filter((e) => e.category === "accessories"),
  };

  return (
    <div className="wardrobe">
      <h3 className="wardrobe-title">옷장</h3>

      {equippedEntries.length > 0 && (
        <div className="wardrobe-equipped">
          <h4 className="wardrobe-section-title">현재 착용 중</h4>
          <div className="wardrobe-equipped-grid">
            {equippedEntries.map((e) => {
              const meta = getFashionItem(body, e.cat, e.id);
              const name = meta?.name ?? e.id;
              return (
                <div
                  key={`${e.cat}-${e.id}`}
                  className="wardrobe-equipped-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(e.cat, e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      toggle(e.cat, e.id);
                    }
                  }}
                >
                  <div className="wardrobe-equipped-thumb">
                    <img
                      src={partUrl(body, e.cat, `${e.id}_preview`)}
                      alt=""
                      draggable={false}
                    />
                  </div>
                  <div className="wardrobe-equipped-name">{name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="wardrobe-categories">
        {FASHION_CATEGORY_TABS.map((catTab) => {
          const items = itemsByCategory[catTab.value];
          return (
            <div key={catTab.value} className="wardrobe-category">
              <h4 className="wardrobe-section-title">{catTab.label}</h4>
              {items.length === 0 ? (
                <p className="wardrobe-empty">보유한 아이템이 없습니다</p>
              ) : (
                <div className="shop-grid">
                  {items.map((entry) => {
                    const meta = getFashionItem(
                      body,
                      entry.category,
                      entry.id,
                    );
                    const name = meta?.name ?? entry.id;
                    const equipped =
                      equippedByCat[entry.category] === entry.id;
                    const cardClass = [
                      "shop-card",
                      "shop-card-clickable",
                      equipped ? "shop-card-equipped" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={entry.id}
                        className={cardClass}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggle(entry.category, entry.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            toggle(entry.category, entry.id);
                          }
                        }}
                      >
                        <div className="shop-fashion-preview-wrap">
                          <img
                            src={partUrl(
                              body,
                              entry.category,
                              `${entry.id}_preview`,
                            )}
                            alt=""
                            className="shop-fashion-preview"
                            draggable={false}
                          />
                        </div>
                        <div className="shop-card-word">{name}</div>
                        <div className="shop-card-status">
                          {equipped ? "착용 중" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
