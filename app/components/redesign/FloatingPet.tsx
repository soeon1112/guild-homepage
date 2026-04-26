// FloatingPet — bottom-left mirror of FloatingChat. Self-contained
// modal that handles ALL pet UX: adoption → main view → shop →
// wardrobe → playground → visit → ranking. Mirrored in
// dawnlight-app/src/components/FloatingPet.tsx.
//
// Theme-independent: all colors are literal hex values so the modal
// reads on any future theme without rework.

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Heart, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  buyItem,
  canSeePets,
  computeBubble,
  computeMood,
  computeStage,
  computeStageProgress,
  consumeItem,
  cooldownRemainingMs,
  createPet,
  doInteraction,
  findItem,
  formatDuration,
  giftTreat,
  INTERACTIONS,
  isOwned,
  ITEMS,
  loadPet,
  loadPetItems,
  PET_DYE_COLORS,
  PET_STAGES,
  PET_TYPES,
  applyDyeColor,
  projectStatus,
  refreshDecaySnapshot,
  releasePet,
  renamePet,
  setAccessoryEquipped,
  setBackground,
  setFurniturePlaced,
  setFurniturePosition,
  STATUS_LABELS,
  type BackgroundId,
  type InteractionId,
  type ItemCategory,
  type ItemId,
  type PetDoc,
  type PetItemsDoc,
  type PetType,
} from "@/src/lib/pets";
import { ItemIconSvg, PetSvg } from "./PetSvg";
import { PetRoom, type PetReaction } from "./PetRoom";
import {
  INTERACTION_ICONS,
  STATUS_ICONS,
  TAB_ICONS,
  type ItemIconRender,
  type SceneId,
} from "@/src/lib/petArt";

type Tab = "main" | "shop" | "wardrobe" | "playground" | "visit" | "ranking";

type MemberInfo = {
  nickname: string;
  petName?: string;
  petType?: PetType;
  petStage?: ReturnType<typeof computeStage>;
  exp?: number;
  happiness?: number;
};

function PetButtonIcon({ size = 22 }: { size?: number }) {
  // Tiny pixel pet face — neutral cream, theme-independent.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {[
        "................",
        "................",
        "..3.........3...",
        ".313.......313..",
        "31113.....31113.",
        "311111333111113.",
        "31wB1133Bw113...",
        "3BBB113BBB113...",
        "31112pBp1113....",
        "31133333113.....",
        "311111111113....",
        "311111111113....",
        ".3111111133.....",
        "..3333333.......",
        "................",
        "................",
      ].map((row, r) =>
        row.split("").map((code, c) => {
          const fill =
            code === "1"
              ? "#FFE5C4"
              : code === "2"
              ? "#FFB5A7"
              : code === "3"
              ? "#5B3A1F"
              : code === "w"
              ? "#FFFFFF"
              : code === "B"
              ? "#1A1A1A"
              : code === "p"
              ? "#F4A6BC"
              : null;
          if (!fill) return null;
          return <rect key={`pi-${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  main: "내 펫",
  shop: "상점",
  wardrobe: "옷장",
  playground: "놀이터",
  visit: "방문",
  ranking: "랭킹",
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  consumable: "소모품",
  accessory: "악세서리",
  furniture: "가구",
  special: "특수 아이템",
};

export default function FloatingPet() {
  const { nickname, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<PetDoc | null>(null);
  const [items, setItems] = useState<PetItemsDoc>({ inventory: {} });
  const [points, setPoints] = useState(0);
  const [tab, setTab] = useState<Tab>("main");
  const [now, setNow] = useState(() => Date.now());
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [visiting, setVisiting] = useState<MemberInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [shopCategory, setShopCategory] = useState<ItemCategory>("consumable");
  const [reaction, setReaction] = useState<PetReaction>(null);
  const [activeScene, setActiveScene] = useState<SceneId | null>(null);
  const [boughtFlash, setBoughtFlash] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<ItemId | null>(null);
  const [dyePicker, setDyePicker] = useState<{ open: boolean; preview: string | null }>({ open: false, preview: null });

  // Move a placed furniture to a new (x, y) and persist.
  const handleMoveFurniture = useCallback(
    async (id: ItemId, x: number, y: number) => {
      if (!nickname) return;
      await setFurniturePosition(nickname, id, { x, y });
    },
    [nickname],
  );

  const visible = ready && canSeePets(nickname);

  // Live ticker for status decay + cooldown countdowns.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Subscribe to pet doc + items + points whenever modal opens for a
  // logged-in admin user.
  useEffect(() => {
    if (!visible || !nickname) {
      setPet(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", nickname, "pet", "current"), (snap) => {
      setPet(snap.exists() ? (snap.data() as PetDoc) : null);
    });
    return () => unsub();
  }, [visible, nickname]);

  useEffect(() => {
    if (!visible || !nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname, "pet", "items"), (snap) => {
      setItems(snap.exists() ? (snap.data() as PetItemsDoc) : { inventory: {} });
    });
    return () => unsub();
  }, [visible, nickname]);

  useEffect(() => {
    if (!visible || !nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      setPoints(((snap.data() as any)?.points as number) ?? 0);
    });
    return () => unsub();
  }, [visible, nickname]);

  // Refresh decay snapshot once when modal opens (so live drift writes
  // back to Firestore opportunistically).
  useEffect(() => {
    if (!open || !visible || !nickname || !pet) return;
    refreshDecaySnapshot(nickname, pet).catch(() => {});
  }, [open, visible, nickname, pet?.lastDecayAt?.seconds]);

  const projected = useMemo(() => {
    if (!pet) return null;
    return projectStatus(
      { hunger: pet.hunger, happiness: pet.happiness, clean: pet.clean },
      pet.lastDecayAt?.toMillis?.() ?? Date.now(),
      now,
    );
  }, [pet, now]);

  const stage = useMemo(() => {
    if (!pet) return "egg" as const;
    return computeStage(pet.createdAt?.toMillis?.() ?? now, pet.exp ?? 0, now);
  }, [pet, now]);

  const stageProgress = useMemo(() => {
    if (!pet) return 0;
    return computeStageProgress(pet.createdAt?.toMillis?.() ?? now, pet.exp ?? 0, now);
  }, [pet, now]);

  const mood = projected ? computeMood(projected) : "happy";
  const bubble = projected ? computeBubble(projected) : null;

  // Lazy-load member list when entering social tabs.
  useEffect(() => {
    if (!open || !visible) return;
    if (tab !== "playground" && tab !== "visit" && tab !== "ranking") return;
    let cancelled = false;
    (async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const list: MemberInfo[] = [];
        for (const u of usersSnap.docs) {
          const nick = u.id;
          const petSnap = await getDoc(doc(db, "users", nick, "pet", "current"));
          if (!petSnap.exists()) continue;
          const p = petSnap.data() as PetDoc;
          list.push({
            nickname: nick,
            petName: p.name,
            petType: p.type,
            petStage: computeStage(p.createdAt?.toMillis?.() ?? Date.now(), p.exp ?? 0, Date.now()),
            exp: p.exp ?? 0,
            happiness: p.happiness ?? 0,
          });
        }
        if (!cancelled) setMembers(list);
      } catch {
        /* swallow — empty list ok */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, visible, tab]);

  // Apply a body dye color (consumes 1 dye for non-null colors).
  const handleApplyDye = useCallback(
    async (color: string | null) => {
      if (!nickname) return;
      setBusy(true);
      try {
        const res = await applyDyeColor(nickname, color);
        if (!res.ok) {
          if (res.reason === "no_item") setToast("염색약이 없어요.");
          else setToast("실패했어요.");
        } else {
          setToast(color ? "염색 완료!" : "기본색으로 되돌렸어요.");
        }
        setDyePicker({ open: false, preview: null });
      } finally {
        setBusy(false);
      }
    },
    [nickname],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1800);
  }, []);

  const handleAdopt = useCallback(
    async (type: PetType, name: string) => {
      if (!nickname) return;
      setBusy(true);
      try {
        await createPet(nickname, type, name);
        showToast(`${name || "펫"} 입양 완료!`);
      } finally {
        setBusy(false);
      }
    },
    [nickname, showToast],
  );

  const handleInteraction = useCallback(
    async (id: InteractionId) => {
      if (!nickname || !pet) return;
      setBusy(true);
      try {
        const res = await doInteraction(nickname, pet, id);
        if (!res.ok) {
          if (res.reason === "cooldown") showToast("아직 쿨타임이에요.");
          else if (res.reason === "no_item") showToast("간식이 없어요.");
          else showToast("실패했어요.");
        } else {
          const inter = INTERACTIONS.find((i) => i.id === id);
          showToast(`${inter?.label} 완료!`);
          // Trigger the cinematic scene matching this interaction.
          const sceneMap: Record<InteractionId, SceneId> = {
            feed: "feed",
            play: "play",
            wash: "wash",
            walk: "walk",
            pet: "pet",
            treat: "treat",
            sleep: "sleep",
            train: "train",
          };
          setActiveScene(sceneMap[id]);
        }
      } finally {
        setBusy(false);
      }
    },
    [nickname, pet, showToast],
  );

  const handleBuy = useCallback(
    async (id: ItemId) => {
      if (!nickname) return;
      const item = findItem(id);
      if (!item) return;
      if (points < item.price) {
        showToast("별빛이 부족해요.");
        return;
      }
      setBusy(true);
      try {
        const res = await buyItem(nickname, id, points);
        if (res.ok) {
          showToast(`${item.name} 구매!`);
          setBoughtFlash(id);
          setTimeout(() => setBoughtFlash((cur) => (cur === id ? null : cur)), 1200);
        } else showToast("구매 실패");
      } finally {
        setBusy(false);
      }
    },
    [nickname, points, showToast],
  );

  const handleConsume = useCallback(
    async (id: ItemId) => {
      if (!nickname || !pet) return;
      setBusy(true);
      try {
        const res = await consumeItem(nickname, pet, id);
        if (!res.ok) showToast("사용 실패");
        else showToast("사용 완료!");
      } finally {
        setBusy(false);
      }
    },
    [nickname, pet, showToast],
  );

  const handleEquip = useCallback(
    async (id: ItemId, on: boolean) => {
      if (!nickname || !pet) return;
      const item = findItem(id);
      if (!item) return;
      if (item.category === "accessory") {
        await setAccessoryEquipped(nickname, id, on);
      } else if (item.category === "furniture") {
        if (id.startsWith("bg")) {
          await setBackground(nickname, on ? (id as BackgroundId) : "none");
        } else {
          await setFurniturePlaced(nickname, id, on);
        }
      }
    },
    [nickname, pet],
  );

  const handleGiftTreat = useCallback(
    async (toNickname: string, itemId: ItemId) => {
      if (!nickname) return;
      setBusy(true);
      try {
        const res = await giftTreat(nickname, toNickname, itemId);
        if (res.ok) showToast(`${toNickname}님께 선물 보냄!`);
        else if (res.reason === "no_item") showToast("선물할 간식이 없어요.");
        else if (res.reason === "no_target_pet") showToast("상대가 펫이 없어요.");
        else showToast("선물 실패");
      } finally {
        setBusy(false);
      }
    },
    [nickname, showToast],
  );

  const handleRelease = useCallback(async () => {
    if (!nickname) return;
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      "정말 파양하시겠습니까? 펫과 구매한 모든 펫 아이템이 초기화됩니다.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await releasePet(nickname);
      showToast("펫이 떠났어요…");
      setTab("main");
    } finally {
      setBusy(false);
    }
  }, [nickname, showToast]);

  const handleRename = useCallback(async () => {
    if (!nickname || !pendingName.trim()) return;
    if (!isOwned(items.inventory, "nameTag")) {
      showToast("이름표가 없어요. 상점에서 구매하세요.");
      return;
    }
    setBusy(true);
    try {
      await renamePet(nickname, pendingName.trim());
      // consume the nameTag
      await consumeItem(nickname, pet!, "nameTag" as ItemId).catch(() => {});
      showToast("이름 변경 완료!");
      setRenaming(false);
      setPendingName("");
    } finally {
      setBusy(false);
    }
  }, [nickname, pendingName, items.inventory, pet, showToast]);

  if (!visible) return null;

  return (
    <>
      {/* ── Floating button (bottom-left) ── */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "펫 닫기" : "펫 열기"}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.2 }}
        className="group fixed left-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: pet
              ? "radial-gradient(circle, rgba(180,220,170,0.55) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(180,180,180,0.35) 0%, transparent 70%)",
          }}
        />
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-105"
          style={{
            background: pet
              ? "radial-gradient(circle at 30% 30%, #FFF1D4 0%, #F4C07A 60%, #C68748 100%)"
              : "radial-gradient(circle at 30% 30%, #E8E5DE 0%, #B8B5AE 60%, #8E8B85 100%)",
            boxShadow: pet
              ? "0 8px 20px rgba(196,140,80,0.45), inset 0 1px 2px rgba(255,255,255,0.4)"
              : "0 4px 12px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3)",
            filter: pet ? "none" : "grayscale(0.6)",
          }}
        >
          <PetButtonIcon size={22} />
        </span>

        {/* Status bubble */}
        {pet && bubble && !open ? (
          <span
            className="pointer-events-none absolute -top-7 left-12 whitespace-nowrap rounded-full bg-white/95 px-2 py-1 text-[10px] font-medium text-[#5B3A1F] shadow-lg"
            style={{ border: "1px solid #E0CFB8" }}
          >
            {bubble.message}
          </span>
        ) : null}
      </motion.button>

      {/* ── Modal panel ── */}
      <AnimatePresence>
        {open ? (
          <motion.div
            key="pet-panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed left-4 bottom-24 z-50 flex max-h-[calc(100vh-160px)] w-[340px] flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{
              background: "linear-gradient(180deg, #FFFAF0 0%, #FFF1DC 100%)",
              border: "1px solid #E0CFB8",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: "rgba(244,192,122,0.18)", borderBottom: "1px solid #E0CFB8" }}
            >
              <div className="flex items-center gap-2 text-[#5B3A1F]">
                <Heart size={16} />
                <span className="font-serif text-[13px] font-medium tracking-wider">
                  나의 펫
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/80 px-2 py-0.5 font-serif text-[10px] text-[#5B3A1F]">
                  ★ {points}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-[#5B3A1F] transition-opacity hover:opacity-70"
                  aria-label="닫기"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tabs (only when pet exists) — icon + label */}
            {pet ? (
              <div
                className="flex shrink-0 justify-around"
                style={{ borderBottom: "1px solid #E0CFB8", background: "#FFF6E6" }}
              >
                {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
                  const isActive = tab === t;
                  const icon = TAB_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        setTab(t);
                        setVisiting(null);
                      }}
                      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
                      style={{
                        background: isActive ? "rgba(244,192,122,0.22)" : "transparent",
                        borderBottom: isActive ? "2px solid #C68748" : "2px solid transparent",
                      }}
                    >
                      <PixelIconView icon={icon} size={20} dim={!isActive} />
                      <span
                        className="font-serif text-[9px]"
                        style={{
                          color: isActive ? "#5B3A1F" : "#9C7E5C",
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {TAB_LABELS[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 text-[#3A2818]">
              {!pet ? (
                <AdoptionPanel onAdopt={handleAdopt} disabled={busy} />
              ) : tab === "main" ? (
                <MainPanel
                  pet={pet}
                  stage={stage}
                  stageProgress={stageProgress}
                  projected={projected!}
                  mood={mood}
                  bubble={bubble}
                  inventory={items.inventory}
                  now={now}
                  busy={busy}
                  renaming={renaming}
                  pendingName={pendingName}
                  setPendingName={setPendingName}
                  setRenaming={setRenaming}
                  onInteract={handleInteraction}
                  onConsume={handleConsume}
                  onRename={handleRename}
                  onRelease={handleRelease}
                  reaction={reaction}
                  activeScene={activeScene}
                  setActiveScene={setActiveScene}
                  placementMode={placementMode}
                  setPlacementMode={setPlacementMode}
                  selectedFurniture={selectedFurniture}
                  setSelectedFurniture={setSelectedFurniture}
                  onMoveFurniture={handleMoveFurniture}
                  dyePicker={dyePicker}
                  setDyePicker={setDyePicker}
                  onApplyDye={handleApplyDye}
                />
              ) : tab === "shop" ? (
                <ShopPanel
                  category={shopCategory}
                  setCategory={setShopCategory}
                  points={points}
                  inventory={items.inventory}
                  busy={busy}
                  onBuy={handleBuy}
                  boughtFlash={boughtFlash}
                />
              ) : tab === "wardrobe" ? (
                <WardrobePanel
                  pet={pet}
                  inventory={items.inventory}
                  onEquip={handleEquip}
                />
              ) : tab === "playground" ? (
                <PlaygroundPanel members={members} self={nickname!} />
              ) : tab === "visit" ? (
                <VisitPanel
                  members={members}
                  visiting={visiting}
                  setVisiting={setVisiting}
                  inventory={items.inventory}
                  onGiftTreat={handleGiftTreat}
                  busy={busy}
                  now={now}
                />
              ) : (
                <RankingPanel members={members} />
              )}
            </div>

            {/* Toast */}
            {toast ? (
              <div
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 font-serif text-[11px]"
                style={{
                  background: "rgba(91,58,31,0.92)",
                  color: "#FFF1DC",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}
              >
                {toast}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// ── Subpanels ────────────────────────────────────────────────

function AdoptionPanel({
  onAdopt,
  disabled,
}: {
  onAdopt: (type: PetType, name: string) => void;
  disabled: boolean;
}) {
  const [type, setType] = useState<PetType | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <div className="font-serif text-[14px] font-medium">펫을 입양해보세요!</div>
        <div className="mt-1 font-serif text-[11px] text-[#7A5A3C]">
          종류를 골라 시작하세요. 모두 무료에요.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PET_TYPES.map((p) => (
          <button
            key={p.id}
            onClick={() => setType(p.id)}
            className="flex flex-col items-center rounded-xl px-2 py-2 transition-colors"
            style={{
              background: type === p.id ? "rgba(244,192,122,0.4)" : "rgba(255,255,255,0.5)",
              border: type === p.id ? "1.5px solid #C68748" : "1px solid #E0CFB8",
            }}
          >
            <PetSvg type={p.id} stage="adult" size={48} />
            <span className="mt-1 font-serif text-[10px] text-[#5B3A1F]">{p.label}</span>
          </button>
        ))}
      </div>
      {type ? (
        <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-3">
          <label className="font-serif text-[11px] text-[#5B3A1F]">이름 (선택)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="비워두면 종 이름 사용"
            className="rounded-lg border border-[#E0CFB8] bg-white px-2 py-1.5 font-serif text-[12px] outline-none focus:border-[#C68748]"
          />
          <button
            disabled={disabled}
            onClick={() => onAdopt(type, name)}
            className="rounded-lg px-3 py-2 font-serif text-[12px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "#C68748" }}
          >
            입양하기
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StatusBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between font-serif text-[10px] text-[#5B3A1F]">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFE0C9]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MainPanel({
  pet,
  stage,
  stageProgress,
  projected,
  mood,
  bubble,
  inventory,
  now,
  busy,
  renaming,
  pendingName,
  setPendingName,
  setRenaming,
  onInteract,
  onConsume,
  onRename,
  onRelease,
  reaction,
  activeScene,
  setActiveScene,
  placementMode,
  setPlacementMode,
  selectedFurniture,
  setSelectedFurniture,
  onMoveFurniture,
  dyePicker,
  setDyePicker,
  onApplyDye,
}: {
  pet: PetDoc;
  stage: ReturnType<typeof computeStage>;
  stageProgress: number;
  projected: { hunger: number; happiness: number; clean: number };
  mood: "happy" | "sad";
  bubble: ReturnType<typeof computeBubble>;
  inventory: PetItemsDoc["inventory"];
  now: number;
  busy: boolean;
  renaming: boolean;
  pendingName: string;
  setPendingName: (s: string) => void;
  setRenaming: (v: boolean) => void;
  onInteract: (id: InteractionId) => void;
  onConsume: (id: ItemId) => void;
  onRename: () => void;
  onRelease: () => void;
  reaction: PetReaction;
  activeScene: SceneId | null;
  setActiveScene: (s: SceneId | null) => void;
  placementMode: boolean;
  setPlacementMode: (v: boolean) => void;
  selectedFurniture: ItemId | null;
  setSelectedFurniture: (id: ItemId | null) => void;
  onMoveFurniture: (id: ItemId, x: number, y: number) => void;
  dyePicker: { open: boolean; preview: string | null };
  setDyePicker: (s: { open: boolean; preview: string | null }) => void;
  onApplyDye: (color: string | null) => void;
}) {
  const stageLabel = PET_STAGES.find((s) => s.id === stage)?.label ?? "";
  return (
    <div className="flex flex-col gap-3">
      {/* ── Pet room (animated stage) — sticky so it stays in view as
          the rest of the panel scrolls ── */}
      <div
        className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-2"
        style={{
          background:
            "linear-gradient(180deg, #FFFAF0 92%, rgba(255,250,240,0.85) 100%)",
        }}
      >
        <div className="relative">
          <PetRoom
            type={pet.type}
            stage={stage}
            accessories={pet.accessories ?? []}
            furniture={pet.furniture ?? []}
            furniturePositions={pet.furniturePositions}
            background={pet.background ?? "none"}
            mood={mood}
            glow={!!pet.glow}
            hue={pet.hue ?? 0}
            bodyColor={dyePicker.preview ?? pet.petBodyColor ?? null}
            reaction={reaction}
            height={280}
            activeScene={activeScene}
            onSceneEnd={() => setActiveScene(null)}
            placementMode={placementMode}
            selectedFurniture={selectedFurniture}
            onSelectFurniture={setSelectedFurniture}
            onMoveFurniture={onMoveFurniture}
          />
          {bubble ? (
            <div
              className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/95 px-2 py-0.5 font-serif text-[10px] text-[#5B3A1F]"
              style={{ border: "1px solid #E0CFB8", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
            >
              {bubble.message}
            </div>
          ) : null}
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 backdrop-blur-sm" style={{ border: "1px solid #E0CFB8" }}>
            <span className="font-serif text-[11px] font-medium text-[#3A2818]">{pet.name}</span>
            <span className="rounded-full bg-[#FFE5C4] px-1.5 font-serif text-[9px] text-[#5B3A1F]">{stageLabel}</span>
          </div>
        </div>
      </div>

      {/* Rename row */}
      {renaming ? (
        <div className="flex w-full items-center gap-2">
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="새 이름"
            className="flex-1 rounded-lg border border-[#E0CFB8] bg-white px-2 py-1 font-serif text-[12px] outline-none focus:border-[#C68748]"
          />
          <button
            onClick={onRename}
            disabled={busy}
            className="rounded-lg px-2 py-1 font-serif text-[11px] font-medium text-white"
            style={{ background: "#C68748" }}
          >
            변경
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="rounded-lg px-2 py-1 font-serif text-[11px] text-[#5B3A1F]"
            style={{ border: "1px solid #E0CFB8" }}
          >
            취소
          </button>
        </div>
      ) : null}

      {/* ── HUD stat bars (icon + gradient gauge) ── */}
      <div className="flex flex-col gap-1.5">
        <HudBar
          icon={STATUS_ICONS.hunger}
          label="포만감"
          value={projected.hunger}
          colorFrom="#FFCFA0"
          colorTo="#D24545"
        />
        <HudBar
          icon={STATUS_ICONS.happiness}
          label="행복"
          value={projected.happiness}
          colorFrom="#FFB5C8"
          colorTo="#E04575"
        />
        <HudBar
          icon={STATUS_ICONS.clean}
          label="청결"
          value={projected.clean}
          colorFrom="#B0E0FA"
          colorTo="#5BAEEA"
        />
        <HudBar
          icon={STATUS_ICONS.exp}
          label={`경험치 · Lv.${PET_STAGES.findIndex((s) => s.id === stage) + 1}`}
          value={Math.round(stageProgress * 100)}
          colorFrom="#FFE56B"
          colorTo="#F2C84B"
        />
      </div>

      {/* ── Icon-based interaction grid (3 × 3, with rename/wear) ── */}
      <div className="grid grid-cols-4 gap-1.5">
        {INTERACTIONS.map((inter) => {
          const remaining = cooldownRemainingMs(pet, inter.id, now);
          const disabled = remaining > 0 || busy;
          const icon = INTERACTION_ICONS[inter.id as keyof typeof INTERACTION_ICONS];
          return (
            <InteractButton
              key={inter.id}
              icon={icon}
              label={inter.label}
              cooldownLabel={remaining > 0 ? formatDuration(remaining) : null}
              disabled={disabled}
              onClick={() => onInteract(inter.id)}
            />
          );
        })}
        <InteractButton
          icon={INTERACTION_ICONS.wear}
          label="이름표"
          disabled={busy || renaming}
          onClick={() => {
            setRenaming(true);
            setPendingName(pet.name);
          }}
        />
      </div>

      {/* Quick consumables */}
      <div>
        <div className="mb-1 font-serif text-[11px] text-[#5B3A1F]">간단 사용</div>
        <div className="flex flex-wrap gap-1.5">
          {(["food", "treat", "cake"] as ItemId[]).map((id) => {
            const count = inventory?.[id] ?? 0;
            return (
              <button
                key={id}
                onClick={() => onConsume(id)}
                disabled={count < 1 || busy}
                className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.7)", border: "1px solid #E0CFB8" }}
              >
                <ItemIconSvg id={id} size={20} />
                <span className="text-[#5B3A1F]">
                  {findItem(id)?.name} ×{count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Special items — dye + reset */}
      <div>
        <div className="mb-1 font-serif text-[11px] text-[#5B3A1F]">특수 아이템</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setDyePicker({ open: !dyePicker.open, preview: null })}
            disabled={busy || (inventory?.dye ?? 0) < 1}
            className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
            style={{
              background: dyePicker.open ? "rgba(244,192,122,0.45)" : "rgba(255,255,255,0.7)",
              border: "1px solid #E0CFB8",
            }}
          >
            <ItemIconSvg id="dye" size={20} />
            <span className="text-[#5B3A1F]">염색약 ×{inventory?.dye ?? 0}</span>
          </button>
          {pet.petBodyColor ? (
            <button
              onClick={() => onApplyDye(null)}
              disabled={busy}
              className="rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.7)", border: "1px solid #E0CFB8", color: "#5B3A1F" }}
            >
              기본색으로 (무료)
            </button>
          ) : null}
        </div>
        {dyePicker.open ? (
          <div
            className="mt-2 rounded-lg p-2"
            style={{ background: "rgba(244,192,122,0.18)", border: "1px solid #E0CFB8" }}
          >
            <div className="mb-1 font-serif text-[10px] text-[#5B3A1F]">
              색상을 선택하세요. 미리보기 후 적용됩니다.
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PET_DYE_COLORS.map((c) => {
                const selected = dyePicker.preview === c.color;
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      setDyePicker({ open: true, preview: c.color })
                    }
                    title={c.label}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: c.color
                        ? c.color
                        : "linear-gradient(135deg, #FFE5C4 50%, #B98750 50%)",
                      border: selected ? "2px solid #5B3A1F" : "1px solid #C68748",
                      boxShadow: selected ? "0 0 6px rgba(0,0,0,0.25)" : "none",
                      cursor: "pointer",
                    }}
                    aria-label={c.label}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setDyePicker({ open: false, preview: null })}
                className="rounded-md px-2 py-1 font-serif text-[10px] text-[#5B3A1F]"
                style={{ border: "1px solid #E0CFB8", background: "white" }}
              >
                취소
              </button>
              <button
                onClick={() => onApplyDye(dyePicker.preview)}
                disabled={busy || dyePicker.preview === undefined}
                className="rounded-md px-3 py-1 font-serif text-[10px] text-white disabled:opacity-40"
                style={{ background: "#C68748" }}
              >
                적용
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Release + 꾸미기 controls */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setPlacementMode(!placementMode)}
          className="rounded-full px-3 py-1 font-serif text-[11px] font-medium transition-colors"
          style={{
            background: placementMode ? "#C68748" : "rgba(244,192,122,0.2)",
            color: placementMode ? "#FFFFFF" : "#5B3A1F",
            border: "1px solid #C68748",
          }}
        >
          {placementMode ? "완료" : "꾸미기"}
        </button>
        <button
          onClick={onRelease}
          disabled={busy || placementMode}
          className="font-serif text-[10px] text-[#B07F5C] underline opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          파양하기
        </button>
      </div>
      {placementMode ? (
        <div
          className="rounded-lg px-3 py-2 font-serif text-[10px] text-[#5B3A1F]"
          style={{ background: "rgba(244,192,122,0.18)", border: "1px solid #E0CFB8" }}
        >
          가구를 길게 누른 채 드래그해서 원하는 위치로 옮기세요. 바닥 영역 안에서만 배치됩니다.
        </div>
      ) : null}
    </div>
  );
}

// ── Reusable bits ────────────────────────────────────────────

function PixelIconView({ icon, size = 20, dim = false }: { icon: ItemIconRender; size?: number; dim?: boolean }) {
  const grid = icon.grid;
  const cols = Math.max(...grid.map((r) => r.length));
  const px = size / cols;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      style={{ display: "block", opacity: dim ? 0.55 : 1 }}
      aria-hidden
    >
      {grid.flatMap((row, r) =>
        row.split("").map((c, ci) => {
          const fill = icon.resolve(c);
          if (!fill) return null;
          return <rect key={`${r}-${ci}`} x={ci * px} y={r * px} width={px} height={px} fill={fill} />;
        }),
      )}
    </svg>
  );
}

function HudBar({
  icon,
  label,
  value,
  colorFrom,
  colorTo,
}: {
  icon: ItemIconRender;
  label: string;
  value: number;
  colorFrom: string;
  colorTo: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <PixelIconView icon={icon} size={20} />
      <div className="flex-1">
        <div className="flex items-center justify-between font-serif text-[10px] text-[#5B3A1F]">
          <span>{label}</span>
          <span>{Math.round(v)}%</span>
        </div>
        <div
          className="mt-0.5 h-2 w-full overflow-hidden rounded-full"
          style={{
            background: "#EFE0C9",
            boxShadow: "inset 0 1px 2px rgba(91,58,31,0.2)",
          }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${v}%`,
              background: `linear-gradient(90deg, ${colorFrom}, ${colorTo})`,
              boxShadow: `0 0 6px ${colorTo}66`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function InteractButton({
  icon,
  label,
  cooldownLabel,
  disabled,
  onClick,
}: {
  icon: ItemIconRender;
  label: string;
  cooldownLabel?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 font-serif transition-transform active:scale-90 disabled:active:scale-100"
      style={{
        background: disabled
          ? "rgba(220,210,195,0.7)"
          : "linear-gradient(180deg, #FFFAF0, #FFE5C4)",
        border: "1px solid #E0CFB8",
        boxShadow: disabled
          ? "inset 0 1px 0 rgba(255,255,255,0.4)"
          : "0 2px 0 rgba(91,58,31,0.18), inset 0 1px 0 rgba(255,255,255,0.6)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <PixelIconView icon={icon} size={22} dim={disabled} />
      <span className="text-[10px] text-[#5B3A1F]">{label}</span>
      {cooldownLabel ? (
        <span className="text-[9px] text-[#9C7E5C]">{cooldownLabel}</span>
      ) : null}
    </button>
  );
}

function ShopPanel({
  category,
  setCategory,
  points,
  inventory,
  busy,
  onBuy,
  boughtFlash,
}: {
  category: ItemCategory;
  setCategory: (c: ItemCategory) => void;
  points: number;
  inventory: PetItemsDoc["inventory"];
  busy: boolean;
  onBuy: (id: ItemId) => void;
  boughtFlash: string | null;
}) {
  const filtered = ITEMS.filter((i) => i.category === category);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="rounded-full px-2 py-0.5 font-serif text-[10px]"
            style={{
              background: category === c ? "#C68748" : "rgba(255,255,255,0.7)",
              color: category === c ? "white" : "#5B3A1F",
              border: "1px solid #E0CFB8",
            }}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((item) => {
          const owned = isOwned(inventory, item.id);
          const count = inventory?.[item.id] ?? 0;
          const collectible = item.category !== "consumable";
          const disabled = busy || points < item.price || (collectible && owned);
          const flashing = boughtFlash === item.id;
          return (
            <div
              key={item.id}
              className="relative flex flex-col items-center gap-1 rounded-xl p-2"
              style={{
                background: flashing
                  ? "linear-gradient(135deg, #FFF6CD, #FFE5C4)"
                  : "rgba(255,255,255,0.7)",
                border: flashing ? "1px solid #F2C84B" : "1px solid #E0CFB8",
                boxShadow: flashing
                  ? "0 0 12px rgba(242,200,75,0.55), 0 4px 8px rgba(91,58,31,0.18)"
                  : "0 1px 2px rgba(91,58,31,0.06)",
                transition: "all 0.3s",
              }}
            >
              {flashing ? (
                <span
                  className="pointer-events-none absolute left-1/2 top-3"
                  style={{
                    color: "#F2C84B",
                    fontSize: 16,
                    fontWeight: 700,
                    animation: "pet-shop-sparkle 1.1s ease-out forwards",
                  }}
                  aria-hidden
                >
                  ✦
                </span>
              ) : null}
              <ItemIconSvg id={item.id} size={40} />
              <div className="font-serif text-[11px] text-[#3A2818]">{item.name}</div>
              <div className="font-serif text-[10px] text-[#7A5A3C]">{item.desc}</div>
              <div className="flex w-full items-center justify-between">
                <span className="font-serif text-[10px] text-[#5B3A1F]">★ {item.price}</span>
                {collectible && owned ? (
                  <span
                    className="rounded-full px-1.5 font-serif text-[9px]"
                    style={{ background: "#D7E5C7", color: "#2E6B26" }}
                  >
                    보유중
                  </span>
                ) : !collectible && count > 0 ? (
                  <span className="font-serif text-[10px] text-[#5B3A1F]">×{count}</span>
                ) : null}
              </div>
              <button
                onClick={() => onBuy(item.id)}
                disabled={disabled}
                className="mt-1 w-full rounded-md px-2 py-1 font-serif text-[10px] text-white transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                style={{
                  background: collectible && owned ? "#A0A0A0" : "linear-gradient(180deg, #D89A5A, #C07840)",
                  boxShadow: disabled ? "none" : "0 2px 0 rgba(91,58,31,0.25)",
                }}
              >
                {collectible && owned ? "보유중" : "구매"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WardrobePanel({
  pet,
  inventory,
  onEquip,
}: {
  pet: PetDoc;
  inventory: PetItemsDoc["inventory"];
  onEquip: (id: ItemId, on: boolean) => void;
}) {
  const accessories = ITEMS.filter((i) => i.category === "accessory" && isOwned(inventory, i.id));
  const furniture = ITEMS.filter((i) => i.category === "furniture" && !i.id.startsWith("bg") && isOwned(inventory, i.id));
  const bgs = ITEMS.filter((i) => i.id.startsWith("bg") && isOwned(inventory, i.id));
  return (
    <div className="flex flex-col gap-3">
      <Section title="악세서리">
        {accessories.length === 0 ? (
          <Empty>아직 보유한 악세서리가 없어요.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {accessories.map((item) => {
              const on = pet.accessories?.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onEquip(item.id, !on)}
                  className="flex flex-col items-center rounded-lg p-1.5"
                  style={{
                    background: on ? "rgba(244,192,122,0.45)" : "rgba(255,255,255,0.7)",
                    border: on ? "1.5px solid #C68748" : "1px solid #E0CFB8",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#5B3A1F]">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="가구">
        {furniture.length === 0 ? (
          <Empty>가구가 없어요.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {furniture.map((item) => {
              const on = pet.furniture?.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onEquip(item.id, !on)}
                  className="flex flex-col items-center rounded-lg p-1.5"
                  style={{
                    background: on ? "rgba(244,192,122,0.45)" : "rgba(255,255,255,0.7)",
                    border: on ? "1.5px solid #C68748" : "1px solid #E0CFB8",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#5B3A1F]">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="배경">
        {bgs.length === 0 ? (
          <Empty>배경이 없어요.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {bgs.map((item) => {
              const on = pet.background === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onEquip(item.id, !on)}
                  className="flex flex-col items-center rounded-lg p-1.5"
                  style={{
                    background: on ? "rgba(244,192,122,0.45)" : "rgba(255,255,255,0.7)",
                    border: on ? "1.5px solid #C68748" : "1px solid #E0CFB8",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#5B3A1F]">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function PlaygroundPanel({ members, self }: { members: MemberInfo[]; self: string }) {
  const others = members.filter((m) => m.nickname !== self);
  return (
    <div className="flex flex-col gap-2">
      <div className="font-serif text-[11px] text-[#7A5A3C]">
        길드원들의 펫이 한 자리에 모였어요!
      </div>
      {others.length === 0 ? (
        <Empty>아직 다른 펫이 없네요.</Empty>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {others.map((m) => (
            <div key={m.nickname} className="flex flex-col items-center rounded-lg bg-white/70 p-2">
              <PetSvg type={m.petType!} stage={m.petStage!} size={56} />
              <div className="mt-1 truncate font-serif text-[10px] text-[#3A2818]" style={{ maxWidth: 80 }}>
                {m.petName}
              </div>
              <div className="font-serif text-[9px] text-[#7A5A3C]">@{m.nickname}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitPanel({
  members,
  visiting,
  setVisiting,
  inventory,
  onGiftTreat,
  busy,
  now,
}: {
  members: MemberInfo[];
  visiting: MemberInfo | null;
  setVisiting: (m: MemberInfo | null) => void;
  inventory: PetItemsDoc["inventory"];
  onGiftTreat: (to: string, item: ItemId) => void;
  busy: boolean;
  now: number;
}) {
  if (visiting) {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setVisiting(null)}
          className="self-start font-serif text-[10px] text-[#9C7E5C] underline"
        >
          ← 목록으로
        </button>
        <div className="flex flex-col items-center rounded-xl bg-white/70 p-3">
          <PetSvg type={visiting.petType!} stage={visiting.petStage!} size={100} />
          <div className="mt-2 font-serif text-[13px] text-[#3A2818]">{visiting.petName}</div>
          <div className="font-serif text-[10px] text-[#7A5A3C]">@{visiting.nickname}</div>
        </div>
        <div className="font-serif text-[11px] text-[#5B3A1F]">간식 선물하기</div>
        <div className="flex flex-wrap gap-2">
          {(["treat", "cake"] as ItemId[]).map((id) => {
            const count = inventory?.[id] ?? 0;
            return (
              <button
                key={id}
                onClick={() => onGiftTreat(visiting.nickname, id)}
                disabled={count < 1 || busy}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-serif text-[10px] disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.7)", border: "1px solid #E0CFB8" }}
              >
                <ItemIconSvg id={id} size={20} />
                <span className="text-[#5B3A1F]">
                  {findItem(id)?.name} ×{count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="font-serif text-[11px] text-[#7A5A3C]">
        길드원의 펫을 방문해 보세요.
      </div>
      {members.length === 0 ? (
        <Empty>방문할 펫이 없어요.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {members.map((m) => (
            <button
              key={m.nickname}
              onClick={() => setVisiting(m)}
              className="flex flex-col items-center rounded-lg bg-white/70 p-2 transition-colors hover:bg-white/90"
            >
              <PetSvg type={m.petType!} stage={m.petStage!} size={48} />
              <div className="mt-1 truncate font-serif text-[10px] text-[#3A2818]" style={{ maxWidth: 100 }}>
                {m.petName}
              </div>
              <div className="font-serif text-[9px] text-[#7A5A3C]">@{m.nickname}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RankingPanel({ members }: { members: MemberInfo[] }) {
  const byExp = [...members].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0));
  const byHappy = [...members].sort((a, b) => (b.happiness ?? 0) - (a.happiness ?? 0));
  return (
    <div className="flex flex-col gap-3">
      <Section title="레벨 (경험치) 순">
        <RankList items={byExp} value={(m) => `${m.exp ?? 0} XP`} />
      </Section>
      <Section title="행복도 순">
        <RankList items={byHappy} value={(m) => `${Math.round(m.happiness ?? 0)}%`} />
      </Section>
    </div>
  );
}

function RankList({
  items,
  value,
}: {
  items: MemberInfo[];
  value: (m: MemberInfo) => string;
}) {
  if (items.length === 0) return <Empty>아직 데이터가 없어요.</Empty>;
  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, 10).map((m, i) => (
        <div
          key={m.nickname}
          className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5"
        >
          <span className="w-5 font-serif text-[11px] text-[#9C7E5C]">{i + 1}</span>
          <PetSvg type={m.petType!} stage={m.petStage!} size={24} />
          <div className="flex-1">
            <div className="font-serif text-[11px] text-[#3A2818]">{m.petName}</div>
            <div className="font-serif text-[9px] text-[#7A5A3C]">@{m.nickname}</div>
          </div>
          <span className="font-serif text-[10px] text-[#5B3A1F]">{value(m)}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] font-medium text-[#5B3A1F]">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/50 px-3 py-4 text-center font-serif text-[10px] text-[#9C7E5C]">
      {children}
    </div>
  );
}
