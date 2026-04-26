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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  loadPlaygroundPets,
  PET_DYE_COLORS,
  PET_STAGES,
  PET_TYPES,
  applyDyeColor,
  projectStatus,
  setInPlayground,
  type PlaygroundPet,
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
  type PetStage,
  type PetType,
} from "@/src/lib/pets";
import { ItemIconSvg, PetSvg } from "./PetSvg";
import { PetRoom, type PetReaction } from "./PetRoom";
import { getOpenPanel, setOpenPanel, useOpenPanel } from "@/src/lib/uiBus";
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
              ? "rgba(255,229,196,0.16)"
              : code === "2"
              ? "#FFB5A7"
              : code === "3"
              ? "#f4efff"
              : code === "w"
              ? "#0b0821"
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
  // Mirror open state into the shared uiBus and hide the pet icon
  // whenever chat owns the screen.
  const openPanel = useOpenPanel();
  const hideForChat = openPanel === "chat";
  useEffect(() => {
    if (open) setOpenPanel("pet");
    else if (getOpenPanel() === "pet") setOpenPanel(null);
  }, [open]);
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
  // ── Admin-only debug overrides (visual only, never persisted) ──
  const [debugStage, setDebugStage] = useState<PetStage | null>(null);
  const [debugType, setDebugType] = useState<PetType | null>(null);
  const [debugPicker, setDebugPicker] = useState<"stage" | "type" | null>(null);
  // Level-up celebration banner — fires once when stage advances.
  const [levelUpBanner, setLevelUpBanner] = useState<string | null>(null);
  const prevStageRef = useRef<PetStage | null>(null);

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

  // ── Level-up celebration ──
  // Detect stage advance (egg → baby → … → adult) and surface a banner.
  // The ref stops repeats when stage re-resolves to the same value.
  useEffect(() => {
    if (!pet) {
      prevStageRef.current = null;
      return;
    }
    const prev = prevStageRef.current;
    if (prev && prev !== stage) {
      const stageLabel = PET_STAGES.find((s) => s.id === stage)?.label ?? "";
      setLevelUpBanner(stageLabel);
      const t = setTimeout(() => setLevelUpBanner(null), 2800);
      prevStageRef.current = stage;
      return () => clearTimeout(t);
    }
    prevStageRef.current = stage;
  }, [stage, pet]);

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
        style={{ pointerEvents: open ? "none" : "auto", display: hideForChat ? "none" : "flex" }}
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
              ? "radial-gradient(circle at 30% 30%, #FFF1D4 0%, #F4C07A 60%, #d896c8 100%)"
              : "radial-gradient(circle at 30% 30%, #E8E5DE 0%, rgba(216,150,200,0.18) 60%, #8E8B85 100%)",
            boxShadow: pet
              ? "0 8px 20px rgba(196,140,80,0.45), inset 0 1px 2px rgba(26,15,61,0.30)"
              : "0 4px 12px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3)",
            filter: pet ? "none" : "grayscale(0.6)",
          }}
        >
          <PetButtonIcon size={22} />
        </span>

        {/* Status bubble */}
        {pet && bubble && !open ? (
          <span
            className="pointer-events-none absolute -top-7 left-12 whitespace-nowrap rounded-full bg-abyss-deep/85 px-2 py-1 text-[10px] font-medium text-[#f4efff] shadow-lg"
            style={{ border: "1px solid rgba(216,150,200,0.25)" }}
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
            className="fixed left-4 bottom-24 z-50 flex max-h-[calc(100vh-160px)] w-[340px] flex-col overflow-hidden rounded-2xl border border-nebula-pink/30 backdrop-blur-md"
            style={{
              background: "linear-gradient(180deg, rgba(26,15,61,0.94) 0%, rgba(11,8,33,0.94) 100%)",
              boxShadow:
                "0 24px 60px rgba(11,8,33,0.7), 0 0 40px rgba(107,75,168,0.30), inset 0 1px 0 rgba(255,229,196,0.06)",
            }}
          >
            {/* Game-style HUD header — pet identity left, currency + close right */}
            <div
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{
                background: "linear-gradient(180deg, rgba(61,46,107,0.55), rgba(26,15,61,0.40))",
                borderBottom: "1px solid rgba(216,150,200,0.30)",
              }}
            >
              <div className="flex min-w-0 items-center gap-2 text-stardust">
                {pet ? (
                  <>
                    <span className="truncate font-serif text-[14px] font-bold tracking-wide">
                      {pet.name}
                    </span>
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 font-serif text-[10px] font-bold tracking-wider text-stardust"
                      style={{
                        background: "#6b4ba8",
                        border: "1px solid rgba(216,150,200,0.50)",
                        boxShadow: "0 0 8px rgba(255,229,196,0.45), inset 0 1px 0 rgba(255,229,196,0.18)",
                      }}
                    >
                      Lv.{PET_STAGES.findIndex((s) => s.id === stage) + 1}
                    </span>
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 font-serif text-[10px] font-semibold text-stardust"
                      style={{ background: "rgba(26,15,61,0.70)", border: "1px solid rgba(216,150,200,0.35)" }}
                    >
                      {PET_STAGES.find((s) => s.id === stage)?.label ?? ""}
                    </span>
                  </>
                ) : (
                  <>
                    <Heart size={16} />
                    <span className="font-serif text-[13px] font-medium tracking-wider">나의 펫</span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  className="flex items-center gap-1 rounded-full py-0.5 pr-2 font-serif text-[12px] font-bold text-[#92400E]"
                  style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}
                >
                  <span
                    className="-ml-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full font-bold leading-none text-[#92400E]"
                    style={{
                      background: "#F5C84E",
                      border: "1px solid #D97706",
                      fontSize: 10,
                    }}
                  >
                    ★
                  </span>
                  <span>{points}</span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[#f4efff] transition-opacity hover:opacity-70"
                  style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)" }}
                  aria-label="닫기"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tabs (only when pet exists) — game-style tab bar mirroring
                the homepage BottomNav with a stardust radial glow under the
                active tab. */}
            {pet ? (
              <div
                className="flex shrink-0 justify-around px-1 py-1.5"
                style={{ borderBottom: "1px solid rgba(216,150,200,0.30)", background: "rgba(11,8,33,0.85)" }}
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
                      className="group relative flex flex-1 flex-col items-center gap-0.5 py-1"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${
                          isActive ? "text-stardust" : "text-text-sub group-hover:text-nebula-pink"
                        }`}
                        style={
                          isActive
                            ? {
                                background:
                                  "radial-gradient(circle, rgba(255,229,196,0.30) 0%, rgba(216,150,200,0.14) 60%, transparent 100%)",
                                filter: "drop-shadow(0 0 8px rgba(255,229,196,0.6))",
                              }
                            : undefined
                        }
                      >
                        <PixelIconView icon={icon} size={22} dim={!isActive} />
                      </span>
                      <span
                        className={`font-serif text-[9px] tracking-wider transition-colors ${
                          isActive ? "text-stardust" : "text-text-sub"
                        }`}
                      >
                        {TAB_LABELS[t]}
                      </span>
                      {isActive ? (
                        <span
                          className="absolute -top-1 h-1 w-1 rounded-full bg-stardust"
                          style={{ boxShadow: "0 0 6px #FFE5C4" }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 text-[#f4efff]">
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
                  levelUpBanner={levelUpBanner}
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
                  debugStage={debugStage}
                  setDebugStage={setDebugStage}
                  debugType={debugType}
                  setDebugType={setDebugType}
                  debugPicker={debugPicker}
                  setDebugPicker={setDebugPicker}
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
                  equippedAccessories={pet.accessories ?? []}
                />
              ) : tab === "wardrobe" ? (
                <WardrobePanel
                  pet={pet}
                  inventory={items.inventory}
                  onEquip={handleEquip}
                />
              ) : tab === "playground" ? (
                <PlaygroundPanel
                  myNickname={nickname!}
                  myPetInPlayground={!!pet?.inPlayground}
                  busy={busy}
                  inventory={items.inventory}
                  onEnter={async () => {
                    if (!nickname) return;
                    setBusy(true);
                    try {
                      await setInPlayground(nickname, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onExit={async () => {
                    if (!nickname) return;
                    setBusy(true);
                    try {
                      await setInPlayground(nickname, false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onGiftTreat={handleGiftTreat}
                />
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
                <RankingPanel members={members} myNickname={nickname ?? null} />
              )}
            </div>

            {/* Toast */}
            {toast ? (
              <div
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 font-serif text-[11px]"
                style={{
                  background: "rgba(31,41,55,0.92)",
                  color: "rgba(26,15,61,0.5)",
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
        <div className="mt-1 font-serif text-[11px] text-[#9b8fb8]">
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
              background: type === p.id ? "rgba(216,150,200,0.30)" : "rgba(26,15,61,0.35)",
              border: type === p.id ? "1.5px solid #d896c8" : "1px solid rgba(216,150,200,0.25)",
            }}
          >
            <PetSvg type={p.id} stage="adult" size={48} />
            <span className="mt-1 font-serif text-[10px] text-[#f4efff]">{p.label}</span>
          </button>
        ))}
      </div>
      {type ? (
        <div className="flex flex-col gap-2 rounded-xl bg-abyss-deep/40 p-3">
          <label className="font-serif text-[11px] text-[#f4efff]">이름 (선택)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="비워두면 종 이름 사용"
            className="rounded-lg border border-[rgba(216,150,200,0.25)] bg-abyss-deep/80 px-2 py-1.5 font-serif text-[12px] outline-none focus:border-[#d896c8]"
          />
          <button
            disabled={disabled}
            onClick={() => onAdopt(type, name)}
            className="rounded-lg px-3 py-2 font-serif text-[12px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "#d896c8" }}
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
      <div className="flex items-center justify-between font-serif text-[10px] text-[#f4efff]">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(216,150,200,0.25)]">
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
  levelUpBanner,
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
  debugStage,
  setDebugStage,
  debugType,
  setDebugType,
  debugPicker,
  setDebugPicker,
}: {
  pet: PetDoc;
  stage: ReturnType<typeof computeStage>;
  stageProgress: number;
  projected: { hunger: number; happiness: number; clean: number };
  mood: "happy" | "sad";
  bubble: ReturnType<typeof computeBubble>;
  levelUpBanner: string | null;
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
  debugStage: PetStage | null;
  setDebugStage: (s: PetStage | null) => void;
  debugType: PetType | null;
  setDebugType: (t: PetType | null) => void;
  debugPicker: "stage" | "type" | null;
  setDebugPicker: (p: "stage" | "type" | null) => void;
}) {
  const stageLabel = PET_STAGES.find((s) => s.id === stage)?.label ?? "";
  return (
    <div className="flex flex-col gap-3">
      {/* ── Pet room (animated stage) — scrolls with the rest of the
          panel; user wants the room to move with the controls instead
          of staying pinned at the top ── */}
      <div className="-mx-4 px-4 pt-1 pb-2">
        <div className="relative">
          <PetRoom
            type={debugType ?? pet.type}
            stage={debugStage ?? stage}
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
              className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-abyss-deep/85 px-2 py-0.5 font-serif text-[10px] text-[#f4efff]"
              style={{ border: "1px solid rgba(216,150,200,0.25)", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
            >
              {bubble.message}
            </div>
          ) : null}
          <div
            className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-sm"
            style={{ background: "rgba(26,15,61,0.85)", border: "1px solid rgba(216,150,200,0.45)" }}
          >
            <span className="font-serif text-[11px] font-semibold text-stardust">{pet.name}</span>
            <span
              className="rounded-full px-1.5 font-serif text-[9px] font-semibold text-stardust"
              style={{ background: "rgba(216,150,200,0.25)" }}
            >
              {stageLabel}
            </span>
          </div>
          {/* Level-up celebration banner — cosmic stardust burst over the
              pet room for ~2.8s. */}
          {levelUpBanner ? (
            <div
              className="pointer-events-none absolute left-0 right-0 top-[30%] flex items-center justify-center gap-2 py-2 font-serif"
              style={{
                background:
                  "linear-gradient(180deg, rgba(11,8,33,0.92), rgba(61,46,107,0.92))",
                borderTop: "2px solid rgba(216,150,200,0.55)",
                borderBottom: "2px solid rgba(216,150,200,0.55)",
                boxShadow: "0 0 24px rgba(216,150,200,0.55), 0 0 48px rgba(255,229,196,0.35)",
                animation: "pet-levelup 2.8s ease-out forwards",
              }}
            >
              <span style={{ fontSize: 18 }}>✨</span>
              <span className="font-bold tracking-widest text-stardust" style={{ fontSize: 16 }}>
                LEVEL UP!
              </span>
              <span className="font-semibold text-stardust" style={{ fontSize: 11 }}>
                {levelUpBanner} 단계
              </span>
              <span style={{ fontSize: 18 }}>✨</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Rename row */}
      {renaming ? (
        <div className="flex w-full items-center gap-2">
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="새 이름"
            className="flex-1 rounded-lg border border-[rgba(216,150,200,0.25)] bg-abyss-deep/80 px-2 py-1 font-serif text-[12px] outline-none focus:border-[#d896c8]"
          />
          <button
            onClick={onRename}
            disabled={busy}
            className="rounded-lg px-2 py-1 font-serif text-[11px] font-medium text-white"
            style={{ background: "#d896c8" }}
          >
            변경
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="rounded-lg px-2 py-1 font-serif text-[11px] text-[#f4efff]"
            style={{ border: "1px solid rgba(216,150,200,0.25)" }}
          >
            취소
          </button>
        </div>
      ) : null}

      {/* ── HUD stat bars (icon + gradient gauge) ── */}
      <div className="flex flex-col gap-2">
        <HudBar
          icon={STATUS_ICONS.hunger}
          label="포만감"
          value={projected.hunger}
          colorFrom="#FED7AA"
          colorTo="#FB923C"
        />
        <HudBar
          icon={STATUS_ICONS.happiness}
          label="행복"
          value={projected.happiness}
          colorFrom="#FBCFE8"
          colorTo="#EC4899"
        />
        <HudBar
          icon={STATUS_ICONS.clean}
          label="청결"
          value={projected.clean}
          colorFrom="#BAE6FD"
          colorTo="#38BDF8"
        />
        <HudBar
          icon={STATUS_ICONS.exp}
          label={`경험치 · Lv.${PET_STAGES.findIndex((s) => s.id === stage) + 1}`}
          value={Math.round(stageProgress * 100)}
          colorFrom="#FFE5C4"
          colorTo="#FFB5A7"
          subLabel={
            stage === "adult"
              ? "최고 레벨 달성! ★"
              : (() => {
                  const cur = PET_STAGES.find((s) => s.id === stage);
                  const next = PET_STAGES[(PET_STAGES.findIndex((s) => s.id === stage) + 1) || 0];
                  if (!cur || !next) return null;
                  const span = Math.max(1, next.expMin - cur.expMin);
                  const got = Math.max(0, Math.min(span, (pet.exp ?? 0) - cur.expMin));
                  return `다음 단계까지 ${got}/${span} XP`;
                })()
          }
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
        <div className="mb-1 font-serif text-[11px] text-[#f4efff]">간단 사용</div>
        <div className="flex flex-wrap gap-1.5">
          {(["food", "treat", "cake"] as ItemId[]).map((id) => {
            const count = inventory?.[id] ?? 0;
            return (
              <button
                key={id}
                onClick={() => onConsume(id)}
                disabled={count < 1 || busy}
                className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
                style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)" }}
              >
                <ItemIconSvg id={id} size={20} />
                <span className="text-[#f4efff]">
                  {findItem(id)?.name} ×{count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Special items — dye + reset */}
      <div>
        <div className="mb-1 font-serif text-[11px] text-[#f4efff]">특수 아이템</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setDyePicker({ open: !dyePicker.open, preview: null })}
            disabled={busy || (inventory?.dye ?? 0) < 1}
            className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
            style={{
              background: dyePicker.open ? "rgba(216,150,200,0.32)" : "rgba(26,15,61,0.45)",
              border: "1px solid rgba(216,150,200,0.25)",
            }}
          >
            <ItemIconSvg id="dye" size={20} />
            <span className="text-[#f4efff]">염색약 ×{inventory?.dye ?? 0}</span>
          </button>
          {pet.petBodyColor ? (
            <button
              onClick={() => onApplyDye(null)}
              disabled={busy}
              className="rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
              style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)", color: "#f4efff" }}
            >
              기본색으로 (무료)
            </button>
          ) : null}
        </div>
        {dyePicker.open ? (
          <div
            className="mt-2 rounded-lg p-2"
            style={{ background: "rgba(255,229,196,0.12)", border: "1px solid rgba(216,150,200,0.25)" }}
          >
            <div className="mb-1 font-serif text-[10px] text-[#f4efff]">
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
                        : "linear-gradient(135deg, rgba(255,229,196,0.16) 50%, #B98750 50%)",
                      border: selected ? "2px solid #f4efff" : "1px solid #d896c8",
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
                className="rounded-md px-2 py-1 font-serif text-[10px] text-[#f4efff]"
                style={{ border: "1px solid rgba(216,150,200,0.25)", background: "white" }}
              >
                취소
              </button>
              <button
                onClick={() => onApplyDye(dyePicker.preview)}
                disabled={busy || dyePicker.preview === undefined}
                className="rounded-md px-3 py-1 font-serif text-[10px] text-white disabled:opacity-40"
                style={{ background: "#d896c8" }}
              >
                적용
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Admin debug controls (visual override only, never persisted) ── */}
      <div
        className="rounded-lg p-2"
        style={{ background: "rgba(120,180,200,0.12)", border: "1px dashed #60A5FA" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-[10px] text-[#3730A3]">🛠 디버그 (관리자)</span>
          {debugStage || debugType ? (
            <button
              onClick={() => {
                setDebugStage(null);
                setDebugType(null);
                setDebugPicker(null);
              }}
              className="rounded-full px-2 py-0.5 font-serif text-[10px] text-white"
              style={{ background: "#3730A3" }}
            >
              원래대로
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            onClick={() => setDebugPicker(debugPicker === "stage" ? null : "stage")}
            className="rounded-md px-2 py-1 font-serif text-[10px]"
            style={{
              background: debugPicker === "stage" ? "rgba(96,165,250,0.5)" : "rgba(26,15,61,0.45)",
              border: "1px solid #60A5FA",
              color: "#3730A3",
            }}
          >
            성장 단계 테스트{debugStage ? ` · ${PET_STAGES.find((s) => s.id === debugStage)?.label}` : ""}
          </button>
          <button
            onClick={() => setDebugPicker(debugPicker === "type" ? null : "type")}
            className="rounded-md px-2 py-1 font-serif text-[10px]"
            style={{
              background: debugPicker === "type" ? "rgba(96,165,250,0.5)" : "rgba(26,15,61,0.45)",
              border: "1px solid #60A5FA",
              color: "#3730A3",
            }}
          >
            펫 종류 테스트{debugType ? ` · ${PET_TYPES.find((t) => t.id === debugType)?.label}` : ""}
          </button>
        </div>
        {debugPicker === "stage" ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {PET_STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setDebugStage(s.id);
                  setDebugPicker(null);
                }}
                className="rounded-md px-2 py-1 font-serif text-[10px]"
                style={{
                  background: debugStage === s.id ? "#3730A3" : "rgba(26,15,61,0.55)",
                  color: debugStage === s.id ? "white" : "#3730A3",
                  border: "1px solid #60A5FA",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        {debugPicker === "type" ? (
          <div className="mt-2 grid grid-cols-3 gap-1">
            {PET_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setDebugType(t.id);
                  setDebugPicker(null);
                }}
                className="rounded-md px-2 py-1 font-serif text-[10px]"
                style={{
                  background: debugType === t.id ? "#3730A3" : "rgba(26,15,61,0.55)",
                  color: debugType === t.id ? "white" : "#3730A3",
                  border: "1px solid #60A5FA",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Release + 꾸미기 controls */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setPlacementMode(!placementMode)}
          className="rounded-full px-3 py-1 font-serif text-[11px] font-medium transition-colors"
          style={{
            background: placementMode ? "#d896c8" : "rgba(216,150,200,0.15)",
            color: placementMode ? "#0b0821" : "#f4efff",
            border: "1px solid #d896c8",
          }}
        >
          {placementMode ? "완료" : "꾸미기"}
        </button>
        <button
          onClick={onRelease}
          disabled={busy || placementMode}
          className="font-serif text-[10px] text-[#d896c8] underline opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          파양하기
        </button>
      </div>
      {placementMode ? (
        <div
          className="rounded-lg px-3 py-2 font-serif text-[10px] text-[#f4efff]"
          style={{ background: "rgba(255,229,196,0.12)", border: "1px solid rgba(216,150,200,0.25)" }}
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
  subLabel,
}: {
  icon: ItemIconRender;
  label: string;
  value: number;
  colorFrom: string;
  colorTo: string;
  // Optional secondary line ("다음 단계까지 120/500"). Used by the EXP
  // bar to surface concrete progress numbers under the gauge.
  subLabel?: string | null;
}) {
  const v = Math.max(0, Math.min(100, value));
  // Game HUDs flash red when a vital is critical.
  const danger = v < 30;
  const fillFrom = danger ? "#FECACA" : colorFrom;
  const fillTo = danger ? "#EF4444" : colorTo;
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "rgba(26,15,61,0.55)", border: "1px solid rgba(216,150,200,0.25)" }}
      >
        <PixelIconView icon={icon} size={20} />
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between font-serif text-[10px] text-[#f4efff]">
          <span>{label}</span>
          <span style={{ color: danger ? "#FFB5A7" : undefined, fontWeight: danger ? 700 : undefined }}>
            {Math.round(v)}%
          </span>
        </div>
        <div
          className="relative mt-0.5 h-2.5 w-full overflow-hidden rounded-full"
          style={{
            background: "rgba(11,8,33,0.65)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
            border: "1px solid rgba(216,150,200,0.30)",
          }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${v}%`,
              background: `linear-gradient(90deg, ${fillFrom}, ${fillTo})`,
              boxShadow: `0 0 6px ${fillTo}66`,
            }}
          />
          {/* Glossy highlight running across the top */}
          {v > 1 ? (
            <div
              className="pointer-events-none absolute left-0 top-0 h-[3px] rounded-t-full transition-[width] duration-500"
              style={{ width: `${v}%`, background: "rgba(255,255,255,0.55)" }}
            />
          ) : null}
        </div>
        {subLabel ? (
          <div className="mt-0.5 font-serif text-[9px] text-[#9b8fb8]">{subLabel}</div>
        ) : null}
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
  const onCooldown = !!cooldownLabel && !!disabled;
  const ready = !disabled;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-xl px-1 py-2 font-serif transition-transform active:scale-90 disabled:active:scale-100"
      style={{
        // Nebula-deep holo button — gradient + nebula-pink border + cosmic glow.
        background: disabled
          ? "rgba(26,15,61,0.45)"
          : "linear-gradient(180deg, rgba(61,46,107,0.65), rgba(11,8,33,0.65))",
        border: ready ? "1.5px solid rgba(216,150,200,0.55)" : "1.5px solid rgba(216,150,200,0.20)",
        boxShadow: disabled
          ? "inset 0 1px 0 rgba(255,229,196,0.04)"
          : "0 2px 0 rgba(11,8,33,0.5), inset 0 1px 0 rgba(255,229,196,0.10), 0 0 10px rgba(216,150,200,0.32)",
        opacity: disabled && !onCooldown ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{
          background: "rgba(11,8,33,0.85)",
          border: "1px solid rgba(255,229,196,0.18)",
        }}
      >
        <PixelIconView icon={icon} size={28} dim={disabled} />
      </span>
      <span className="text-[10px] font-medium text-stardust" style={{ opacity: disabled ? 0.55 : 1 }}>
        {label}
      </span>
      {/* Cooldown veil — dark scrim with the remaining time front-and-center. */}
      {onCooldown ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl text-[12px] font-bold text-stardust"
          style={{ background: "rgba(11,8,33,0.78)" }}
        >
          {cooldownLabel}
        </span>
      ) : null}
    </button>
  );
}

// Rarity tier coloring — drives the shop card border so a glance hints at
// item value. Common (consumables) = grey; Rare (accessories/furniture)
// = blue; Epic (specials like dye/sparkle/nameTag) = gold.
type Rarity = "common" | "rare" | "epic";
const EPIC_ITEMS: Record<string, true> = {
  dye: true,
  sparkle: true,
  nameTag: true,
};
function itemRarity(id: string, category: ItemCategory): Rarity {
  if (EPIC_ITEMS[id]) return "epic";
  if (category === "consumable") return "common";
  return "rare";
}
const RARITY_COLOR: Record<Rarity, { border: string; tint: string; label: string }> = {
  common: { border: "#9b8fb8", tint: "rgba(156,163,175,0.08)",  label: "일반" },
  rare:   { border: "#60A5FA", tint: "rgba(96,165,250,0.10)",   label: "고급" },
  epic:   { border: "#FBBF24", tint: "rgba(251,191,36,0.14)",   label: "특수" },
};

function ShopPanel({
  category,
  setCategory,
  points,
  inventory,
  busy,
  onBuy,
  boughtFlash,
  equippedAccessories,
}: {
  category: ItemCategory;
  setCategory: (c: ItemCategory) => void;
  points: number;
  inventory: PetItemsDoc["inventory"];
  busy: boolean;
  onBuy: (id: ItemId) => void;
  boughtFlash: string | null;
  equippedAccessories: ItemId[];
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
              background: category === c ? "#d896c8" : "rgba(26,15,61,0.45)",
              color: category === c ? "white" : "#f4efff",
              border: "1px solid rgba(216,150,200,0.25)",
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
          const equipped = equippedAccessories.includes(item.id as ItemId);
          const disabled = busy || points < item.price || (collectible && owned);
          const flashing = boughtFlash === item.id;
          const rarity = itemRarity(item.id, item.category);
          const rar = RARITY_COLOR[rarity];
          return (
            <div
              key={item.id}
              className="relative flex flex-col items-center gap-1 rounded-xl px-2 pb-2 pt-5"
              style={{
                background: flashing
                  ? "linear-gradient(135deg, rgba(216,150,200,0.18), rgba(255,229,196,0.16))"
                  : rar.tint,
                border: flashing ? `2px solid #d896c8` : `2px solid ${rar.border}`,
                boxShadow: flashing
                  ? "0 0 12px rgba(242,200,75,0.55), 0 4px 8px rgba(31,41,55,0.18)"
                  : "0 1px 2px rgba(31,41,55,0.08)",
                transition: "all 0.3s",
              }}
            >
              {/* Rarity chip — top-left corner of the card */}
              <span
                className="absolute left-1.5 top-1.5 rounded px-1 py-[1px] font-serif text-[8px] font-bold tracking-wider text-white"
                style={{ background: rar.border }}
              >
                {rar.label}
              </span>
              {flashing ? (
                <span
                  className="pointer-events-none absolute left-1/2 top-5"
                  style={{
                    color: "#d896c8",
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
              <div className="font-serif text-[11px] text-[#f4efff]">{item.name}</div>
              <div className="font-serif text-[10px] text-[#9b8fb8]">{item.desc}</div>
              <div className="flex w-full items-center justify-between">
                <span className="font-serif text-[10px] text-[#f4efff]">★ {item.price}</span>
                {equipped ? (
                  <span
                    className="rounded-full px-1.5 font-serif text-[9px] font-semibold text-white"
                    style={{ background: "#d896c8" }}
                  >
                    장착중
                  </span>
                ) : collectible && owned ? (
                  <span
                    className="rounded-full px-1.5 font-serif text-[9px]"
                    style={{ background: "#D1FAE5", color: "#047857" }}
                  >
                    보유중
                  </span>
                ) : !collectible && count > 0 ? (
                  <span className="font-serif text-[10px] text-[#f4efff]">×{count}</span>
                ) : null}
              </div>
              <button
                onClick={() => onBuy(item.id)}
                disabled={disabled}
                className="mt-1 w-full rounded-md px-2 py-1 font-serif text-[10px] text-white transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                style={{
                  background: collectible && owned ? "#9b8fb8" : "linear-gradient(180deg, #D89A5A, #C07840)",
                  boxShadow: disabled ? "none" : "0 2px 0 rgba(31,41,55,0.25)",
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
                    background: on ? "rgba(216,150,200,0.32)" : "rgba(26,15,61,0.45)",
                    border: on ? "1.5px solid #d896c8" : "1px solid rgba(216,150,200,0.25)",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#f4efff]">{item.name}</span>
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
                    background: on ? "rgba(216,150,200,0.32)" : "rgba(26,15,61,0.45)",
                    border: on ? "1.5px solid #d896c8" : "1px solid rgba(216,150,200,0.25)",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#f4efff]">{item.name}</span>
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
                    background: on ? "rgba(216,150,200,0.32)" : "rgba(26,15,61,0.45)",
                    border: on ? "1.5px solid #d896c8" : "1px solid rgba(216,150,200,0.25)",
                  }}
                >
                  <ItemIconSvg id={item.id} size={36} />
                  <span className="mt-1 font-serif text-[10px] text-[#f4efff]">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function PlaygroundPanel({
  myNickname,
  myPetInPlayground,
  busy,
  onEnter,
  onExit,
  onGiftTreat,
  inventory,
}: {
  myNickname: string;
  myPetInPlayground: boolean;
  busy: boolean;
  onEnter: () => void;
  onExit: () => void;
  onGiftTreat: (to: string, item: ItemId) => void;
  inventory: PetItemsDoc["inventory"];
}) {
  const [pets, setPets] = useState<PlaygroundPet[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PlaygroundPet | null>(null);

  // Load pets — when entering, refresh; when on entry screen, also count.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPlaygroundPets()
      .then((list) => {
        if (cancelled) return;
        setPets(list);
        setCount(list.length);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [myPetInPlayground]);

  if (!myPetInPlayground) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl p-4 text-center" style={{ background: "rgba(167,243,208,0.18)", border: "1px solid #A7F3D0" }}>
          <div className="font-serif text-[14px] font-medium text-[#f4efff]">펫 놀이터</div>
          <div className="mt-2 font-serif text-[11px] text-[#9b8fb8]">
            길드원의 펫들과 한 공간에서 자유롭게 놀 수 있어요.
            <br />다른 펫에게 다가가서 인사하거나 간식을 선물해보세요.
          </div>
          <div className="mt-3 inline-block rounded-full bg-abyss-deep/45 px-3 py-1 font-serif text-[11px] text-[#f4efff]">
            {loading ? "확인 중..." : `현재 ${count ?? 0}마리가 놀고 있어요`}
          </div>
        </div>
        <button
          onClick={onEnter}
          disabled={busy}
          className="rounded-xl py-3 font-serif text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: "linear-gradient(180deg, #7AC270, #34D399)", boxShadow: "0 2px 0 rgba(46,107,38,0.35)" }}
        >
          🌿 입장하기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="font-serif text-[11px] text-[#f4efff]">
          현재 {pets?.length ?? 0}마리가 놀고 있어요
        </div>
        <button
          onClick={onExit}
          disabled={busy}
          className="rounded-full px-3 py-1 font-serif text-[11px] disabled:opacity-50"
          style={{ background: "rgba(26,15,61,0.55)", border: "1px solid #d896c8", color: "#f4efff" }}
        >
          나가기
        </button>
      </div>
      <div
        className="relative -mx-4 overflow-hidden"
        style={{
          height: 280,
          background: "linear-gradient(180deg, #BFE6FA 0%, #BFE6FA 35%, #86EFAC 35%, #34D399 100%)",
          borderTop: "1px solid rgba(216,150,200,0.25)",
          borderBottom: "1px solid rgba(216,150,200,0.25)",
        }}
      >
        {/* Grass blades */}
        <svg viewBox="0 0 320 280" width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <rect key={`g-${i}`} x={(i * 11) + (i % 2 ? 2 : 0)} y={120 + (i % 6) * 22} width={2} height={5} fill="#4A8E47" />
          ))}
        </svg>

        {(pets ?? []).map((p) => (
          <WanderingPet
            key={p.nickname}
            pet={p}
            isMine={p.nickname === myNickname}
            onTap={() => setSelected(p)}
          />
        ))}

        {selected ? (
          <div
            onClick={() => setSelected(null)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(11,8,33,0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="rounded-xl px-3 py-3"
              style={{ background: "#0b0821", border: "1px solid rgba(216,150,200,0.25)", maxWidth: 220 }}
            >
              <div className="flex flex-col items-center gap-1">
                <PetSvg
                  type={selected.petType}
                  stage={selected.petStage}
                  size={64}
                  bodyColor={selected.petBodyColor}
                  glow={selected.glow}
                  hue={selected.hue}
                  accessories={selected.accessories}
                />
                <div className="font-serif text-[13px] font-medium text-[#f4efff]">{selected.petName}</div>
                <div className="font-serif text-[10px] text-[#9b8fb8]">@{selected.nickname}</div>
              </div>
              {selected.nickname !== myNickname ? (
                <div className="mt-2 flex flex-col gap-1">
                  <div className="text-center font-serif text-[10px] text-[#f4efff]">간식 선물하기</div>
                  <div className="flex justify-center gap-1.5">
                    {(["treat", "cake"] as ItemId[]).map((id) => {
                      const c = inventory?.[id] ?? 0;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            onGiftTreat(selected.nickname, id);
                            setSelected(null);
                          }}
                          disabled={c < 1 || busy}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
                          style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)" }}
                        >
                          <ItemIconSvg id={id} size={18} />
                          <span className="text-[#f4efff]">×{c}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-center font-serif text-[10px] text-[#9b8fb8]">내 펫</div>
              )}
              <button
                onClick={() => setSelected(null)}
                className="mt-2 w-full rounded-md py-1 font-serif text-[10px] text-[#f4efff]"
                style={{ border: "1px solid rgba(216,150,200,0.25)" }}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="font-serif text-[10px] text-[#9b8fb8]">펫을 탭해서 인사하거나 간식을 선물하세요.</div>
    </div>
  );
}

function WanderingPet({
  pet,
  isMine,
  onTap,
}: {
  pet: PlaygroundPet;
  isMine: boolean;
  onTap: () => void;
}) {
  // Random per-pet starting position + speed/cadence so they don't
  // all move in lockstep. Bounded inside the grass band [40%..90% top].
  const initialRef = useRef({
    x: 8 + Math.random() * 84,
    y: 45 + Math.random() * 45,
    period: 2800 + Math.random() * 3200,
  });
  const [pos, setPos] = useState({ x: initialRef.current.x, y: initialRef.current.y });

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setPos((cur) => {
        const dx = (Math.random() - 0.5) * 35;
        const dy = (Math.random() - 0.5) * 25;
        return {
          x: Math.max(5, Math.min(95, cur.x + dx)),
          y: Math.max(42, Math.min(92, cur.y + dy)),
        };
      });
      setTimeout(tick, initialRef.current.period);
    };
    const t = setTimeout(tick, 800 + Math.random() * 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      onClick={onTap}
      style={{
        position: "absolute",
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: "translate(-50%, -100%)",
        transition: `left ${initialRef.current.period - 400}ms ease-in-out, top ${initialRef.current.period - 400}ms ease-in-out`,
        cursor: "pointer",
        zIndex: Math.round(pos.y * 10),
      }}
    >
      <PetSvg
        type={pet.petType}
        stage={pet.petStage}
        size={48}
        bodyColor={pet.petBodyColor}
        glow={pet.glow}
        hue={pet.hue}
        accessories={pet.accessories}
      />
      <div
        className="mx-auto rounded-full px-1.5 py-0.5 font-serif text-[9px]"
        style={{
          background: isMine ? "rgba(216,150,200,0.55)" : "rgba(26,15,61,0.85)",
          border: "1px solid #d896c8",
          color: "#f4efff",
          maxWidth: 70,
          marginTop: -4,
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {isMine ? "나" : pet.petName}
      </div>
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
          className="self-start font-serif text-[10px] text-[#9b8fb8] underline"
        >
          ← 목록으로
        </button>
        <div className="flex flex-col items-center rounded-xl bg-abyss-deep/45 p-3">
          <PetSvg type={visiting.petType!} stage={visiting.petStage!} size={100} />
          <div className="mt-2 font-serif text-[13px] text-[#f4efff]">{visiting.petName}</div>
          <div className="font-serif text-[10px] text-[#9b8fb8]">@{visiting.nickname}</div>
        </div>
        <div className="font-serif text-[11px] text-[#f4efff]">간식 선물하기</div>
        <div className="flex flex-wrap gap-2">
          {(["treat", "cake"] as ItemId[]).map((id) => {
            const count = inventory?.[id] ?? 0;
            return (
              <button
                key={id}
                onClick={() => onGiftTreat(visiting.nickname, id)}
                disabled={count < 1 || busy}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-serif text-[10px] disabled:opacity-40"
                style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)" }}
              >
                <ItemIconSvg id={id} size={20} />
                <span className="text-[#f4efff]">
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
      <div className="font-serif text-[11px] text-[#9b8fb8]">
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
              className="flex flex-col items-center rounded-lg bg-abyss-deep/45 p-2 transition-colors hover:bg-abyss-deep/70"
            >
              <PetSvg type={m.petType!} stage={m.petStage!} size={48} />
              <div className="mt-1 truncate font-serif text-[10px] text-[#f4efff]" style={{ maxWidth: 100 }}>
                {m.petName}
              </div>
              <div className="font-serif text-[9px] text-[#9b8fb8]">@{m.nickname}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RankingPanel({ members, myNickname }: { members: MemberInfo[]; myNickname: string | null }) {
  const byExp = [...members].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0));
  const byHappy = [...members].sort((a, b) => (b.happiness ?? 0) - (a.happiness ?? 0));
  return (
    <div className="flex flex-col gap-3">
      <Section title="레벨 (경험치) 순">
        <RankList items={byExp} value={(m) => `${m.exp ?? 0} XP`} myNickname={myNickname} />
      </Section>
      <Section title="행복도 순">
        <RankList items={byHappy} value={(m) => `${Math.round(m.happiness ?? 0)}%`} myNickname={myNickname} />
      </Section>
    </div>
  );
}

// Medals make the top of the leaderboard feel celebratory at a glance.
// 1=gold crown, 2=silver, 3=bronze. 4+ falls back to numeric.
function rankBadge(idx: number): { emoji: string | null; bg: string; fg: string } {
  if (idx === 0) return { emoji: "👑", bg: "#FEF3C7", fg: "#92400E" };
  if (idx === 1) return { emoji: "🥈", bg: "#E5E5EA", fg: "#3A3A3A" };
  if (idx === 2) return { emoji: "🥉", bg: "#FED7AA", fg: "#f4efff" };
  return { emoji: null, bg: "rgba(26,15,61,0.55)", fg: "#f4efff" };
}

function RankList({
  items,
  value,
  myNickname,
}: {
  items: MemberInfo[];
  value: (m: MemberInfo) => string;
  myNickname: string | null;
}) {
  if (items.length === 0) return <Empty>아직 데이터가 없어요.</Empty>;
  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, 10).map((m, i) => {
        const badge = rankBadge(i);
        const mine = myNickname != null && m.nickname === myNickname;
        return (
          <div
            key={m.nickname}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              background: mine
                ? "rgba(216,150,200,0.22)"
                : i < 3
                  ? badge.bg
                  : "rgba(26,15,61,0.45)",
              border: mine
                ? "1.5px solid #d896c8"
                : i < 3
                  ? `1px solid ${badge.fg}`
                  : "1px solid transparent",
            }}
          >
            <span className="flex w-6 justify-center font-serif text-[11px]" style={{ color: badge.fg }}>
              {badge.emoji ? <span style={{ fontSize: 16 }}>{badge.emoji}</span> : <span>{i + 1}</span>}
            </span>
            <PetSvg type={m.petType!} stage={m.petStage!} size={26} />
            <div className="flex-1">
              <div className="font-serif text-[11px]" style={{ color: badge.fg }}>
                {m.petName}
                {mine ? <span className="ml-1 font-bold text-[9px] text-[#d896c8]">· 나</span> : null}
              </div>
              <div className="font-serif text-[9px] text-[#9b8fb8]">@{m.nickname}</div>
            </div>
            <span className="font-serif text-[10px] font-semibold" style={{ color: badge.fg }}>
              {value(m)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] font-medium text-[#f4efff]">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-abyss-deep/35 px-3 py-4 text-center font-serif text-[10px] text-[#9b8fb8]">
      {children}
    </div>
  );
}
