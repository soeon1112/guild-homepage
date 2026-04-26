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
  fashionPreviewFilename,
  getFashionItem,
  parseOwned,
} from "@/src/lib/fashion";
import {
  BODY_TYPES,
  type AvatarData,
  isBodyType,
} from "@/app/components/Avatar";

// Renders the user's owned fashion (collection-based) — equipped items
// at the top, then categorized sections of all owned items. Click to
// toggle equip/unequip; non-fashion parts (eyes/mouth/cheeks/hair) are
// replacement-based and not shown here.
//
// Items bought for OTHER body types stay visible (clothes are a collection
// the user keeps across reincarnations) but render disabled with a body-type
// label so it's clear they can't be worn until the user changes back.

const BODY_LABEL: Record<FashionSubTab, string> = Object.fromEntries(
  BODY_TYPES.map((b) => [b.value, b.label]),
) as Record<FashionSubTab, string>;

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

  // Show ALL owned items regardless of body — clothes are a collection,
  // not gated by current silhouette. Wearability is decided per-card below.
  const owned: OwnedEntry[] = (data.ownedFashion ?? [])
    .map(parseOwned)
    .filter((e): e is OwnedEntry => e !== null);

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
                      src={partUrl(
                        body,
                        e.cat,
                        fashionPreviewFilename(body, e.cat, e.id),
                      )}
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
                <div className="wardrobe-grid">
                  {items.map((entry) => {
                    // Items bought for the user's current body are wearable;
                    // anything else stays in the collection but is disabled.
                    const wearable = entry.body === body;
                    const meta = getFashionItem(
                      entry.body,
                      entry.category,
                      entry.id,
                    );
                    const name = meta?.name ?? entry.id;
                    const equipped =
                      wearable && equippedByCat[entry.category] === entry.id;
                    const cardClass = [
                      "shop-card",
                      wearable ? "shop-card-clickable" : "shop-card-locked",
                      equipped ? "shop-card-equipped" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const previewSrc = partUrl(
                      entry.body,
                      entry.category,
                      fashionPreviewFilename(
                        entry.body,
                        entry.category,
                        entry.id,
                      ),
                    );
                    return (
                      <div
                        key={`${entry.body}/${entry.category}/${entry.id}`}
                        className={cardClass}
                        role={wearable ? "button" : undefined}
                        tabIndex={wearable ? 0 : -1}
                        aria-disabled={!wearable}
                        onClick={
                          wearable
                            ? () => toggle(entry.category, entry.id)
                            : undefined
                        }
                        onKeyDown={
                          wearable
                            ? (ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  toggle(entry.category, entry.id);
                                }
                              }
                            : undefined
                        }
                      >
                        <div className="shop-fashion-preview-wrap">
                          <img
                            src={previewSrc}
                            alt=""
                            className="shop-fashion-preview"
                            draggable={false}
                          />
                        </div>
                        <div className="shop-card-word">{name}</div>
                        <div className="shop-card-status">
                          {!wearable
                            ? `${BODY_LABEL[entry.body]} 전용`
                            : equipped
                              ? "착용 중"
                              : ""}
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
