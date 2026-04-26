// Shared fashion catalog + helpers for the shop and wardrobe.
// Items live at avatars/parts/<body>/<category>/<id>.png on Storage.
// `ownedFashion` on the user doc stores entries as `<body>/<category>/<id>`
// strings — the body is included so the wardrobe can filter to items
// that match the user's current silhouette (a top drawn for adult_female
// would not render correctly on adult_male).

import type { BodyType } from "@/app/components/Avatar";

export type FashionSubTab = BodyType;

export type FashionCategoryKey = "tops" | "bottoms" | "shoes" | "accessories";

export type FashionField =
  | "avatarTop"
  | "avatarBottom"
  | "avatarShoes"
  | "avatarAccessories";

// `previewFile` overrides the default preview filename (`${id}_preview`).
// Use it when an item's preview PNG is named differently from the
// convention — e.g. an older screenshot kept around as `shoes1_preview_1`
// instead of being overwritten in place.
export type FashionItem = {
  id: string;
  name: string;
  price: number;
  previewFile?: string;
};

export const FASHION_SUB_TABS: { value: FashionSubTab; label: string }[] = [
  { value: "adult_male", label: "성인남" },
  { value: "adult_female", label: "성인여" },
  { value: "child_male", label: "어린이남" },
  { value: "child_female", label: "어린이여" },
];

export const FASHION_CATEGORY_TABS: {
  value: FashionCategoryKey;
  label: string;
}[] = [
  { value: "tops", label: "상의" },
  { value: "bottoms", label: "하의" },
  { value: "shoes", label: "신발" },
  { value: "accessories", label: "기타" },
];

export const FASHION_FIELD: Record<FashionCategoryKey, FashionField> = {
  tops: "avatarTop",
  bottoms: "avatarBottom",
  shoes: "avatarShoes",
  accessories: "avatarAccessories",
};

export const FASHION_ITEMS: Record<
  FashionSubTab,
  Record<FashionCategoryKey, FashionItem[]>
> = {
  adult_female: {
    tops: [{ id: "tops1", name: "세일러 클래식 교복", price: 50 }],
    bottoms: [],
    shoes: [{ id: "shoes1", name: "세일러 클래식 신발", price: 40 }],
    accessories: [],
  },
  adult_male: {
    tops: [{ id: "tops1", name: "클래식 스쿨룩", price: 50 }],
    bottoms: [],
    shoes: [{ id: "shoes1", name: "클래식 스쿨룩 신발", price: 40 }],
    accessories: [],
  },
  child_female: {
    tops: [{ id: "tops1", name: "키즈 스쿨룩", price: 50 }],
    bottoms: [],
    shoes: [
      {
        id: "shoes1",
        name: "키즈 스쿨룩 신발",
        price: 40,
        previewFile: "shoes1_preview_1",
      },
    ],
    accessories: [],
  },
  child_male: { tops: [], bottoms: [], shoes: [], accessories: [] },
};

export type OwnedEntry = {
  body: FashionSubTab;
  category: FashionCategoryKey;
  id: string;
};

const FASHION_CAT_SET = new Set<FashionCategoryKey>([
  "tops",
  "bottoms",
  "shoes",
  "accessories",
]);

const BODY_SET = new Set<FashionSubTab>([
  "adult_female",
  "adult_male",
  "child_female",
  "child_male",
]);

export function ownedKey(
  body: FashionSubTab,
  category: FashionCategoryKey,
  id: string,
): string {
  return `${body}/${category}/${id}`;
}

export function parseOwned(s: string): OwnedEntry | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [body, cat, id] = parts;
  if (!BODY_SET.has(body as FashionSubTab)) return null;
  if (!FASHION_CAT_SET.has(cat as FashionCategoryKey)) return null;
  return {
    body: body as FashionSubTab,
    category: cat as FashionCategoryKey,
    id,
  };
}

export function isOwned(
  ownedFashion: string[] | undefined | null,
  body: FashionSubTab,
  category: FashionCategoryKey,
  id: string,
): boolean {
  if (!ownedFashion || ownedFashion.length === 0) return false;
  return ownedFashion.includes(ownedKey(body, category, id));
}

export function getFashionItem(
  body: FashionSubTab,
  category: FashionCategoryKey,
  id: string,
): FashionItem | null {
  return (
    FASHION_ITEMS[body]?.[category]?.find((i) => i.id === id) ?? null
  );
}

// Resolves the preview PNG basename for a fashion item. Default convention
// is `${id}_preview`; items can override via `FashionItem.previewFile`.
// Used by shop pickers and wardrobe thumbnails so the ownedFashion path
// (which only carries `body/category/id`) can recover the right filename.
export function fashionPreviewFilename(
  body: FashionSubTab,
  category: FashionCategoryKey,
  id: string,
): string {
  const item = getFashionItem(body, category, id);
  return item?.previewFile ?? `${id}_preview`;
}
