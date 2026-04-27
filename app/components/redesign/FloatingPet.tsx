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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  canDebugPet,
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
  enterPlayground,
  exitPlayground,
  expirePlaygroundRequest,
  loadPlaygroundLogToday,
  subscribePlaygroundLog,
  PLAYGROUND_REQUEST_TIMEOUT_MS,
  playgroundTreat,
  respondPlaygroundRequest,
  sendPlaygroundChat,
  sendPlaygroundRequest,
  subscribeIncomingPlaygroundRequests,
  subscribeOutgoingPlaygroundRequests,
  subscribePlaygroundChat,
  subscribePlaygroundPets,
  type PlaygroundChatMessage,
  type PlaygroundInteractionKind,
  type PlaygroundLog,
  type PlaygroundRequest,
  type PlaygroundRequestKind,
  PET_DYE_COLORS,
  PET_STAGES,
  PET_TYPES,
  applyDyeColor,
  projectStatus,
  type PlaygroundPet,
  refreshDecaySnapshot,
  updatePlaygroundPosition,
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
  type PetMood,
  type PetStage,
  type PetType,
} from "@/src/lib/pets";
import { ItemIconSvg, PetSvg } from "./PetSvg";
import { PetChatBox } from "./PetChatBox";
import { PetRoom, type PetReaction } from "./PetRoom";
import { getOpenPanel, setOpenPanel } from "@/src/lib/uiBus";
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
  // Mood snapshot at load time — visit list / ranking thumbnails pass
  // this to <PetSvg mood={...}> so they render the same status effects
  // (sparkle / tear / severe lines) the pet's owner sees in the room.
  petMood?: PetMood;
};

// Memoized — `size` rarely changes; skips re-render on the FAB's
// 1-second clock tick.
const PetButtonIcon = memo(function PetButtonIcon({ size = 22 }: { size?: number }) {
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
});

const TAB_LABELS: Record<Tab, string> = {
  main: "내 펫",
  shop: "상점",
  wardrobe: "옷장",
  playground: "놀이터",
  visit: "방문",
  ranking: "랭킹",
};

// Korean labels for the admin "상태 테스트" picker.
const MOOD_LABELS: Record<PetMood, string> = {
  happy: "행복",
  normal: "보통",
  sad: "슬픔",
  severe: "극도 불행",
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
  // FAB icons stay visible always. When a panel opens, its higher
  // z-index surface covers the icon visually, but the icon itself is
  // never removed from the layout. On wide screens both panels may be
  // open simultaneously since they live in opposite corners.
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
  const [debugMood, setDebugMood] = useState<PetMood | null>(null);
  const [debugPicker, setDebugPicker] = useState<"stage" | "type" | "mood" | null>(null);
  // Pet chat state — chatOpen toggles the chat panel, chatBubble
  // overrides the head bubble during a session. Auto-closes on tab
  // switch / panel close so the input never lingers under another
  // panel's UI.
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    if (tab !== "main" || !open) setChatOpen(false);
  }, [tab, open]);
  const [chatBubble, setChatBubbleState] = useState<string | null>(null);
  const setChatBubble = useCallback((s: string | null) => setChatBubbleState(s), []);
  useEffect(() => {
    if (!chatBubble || chatBubble === "...") return;
    const t = setTimeout(() => setChatBubbleState(null), 4500);
    return () => clearTimeout(t);
  }, [chatBubble]);
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

  // Auto-exit the playground whenever the user navigates away — closes
  // the pet panel, switches to a non-playground tab, or signs out.
  // Single source of truth so we don't need a "나가기" button anymore.
  //
  // Defensive: deps exclude `pet?.inPlayground` — we only react to
  // navigation events (open/tab/nickname), not to the playground state
  // itself flipping. Without this guard, the entry-flip from false → true
  // re-fires the effect and (under transient state mismatches) could
  // tear down the playground right after the user enters.
  useEffect(() => {
    if (!nickname) return;
    if (open && tab === "playground") return;
    if (!pet?.inPlayground) return;
    exitPlayground(nickname).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, nickname]);

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

  const realMood = projected ? computeMood(projected) : "happy";
  // Admin debug override (visual-only, no Firestore writes). When set,
  // the pet renders as if its status matched the picked mood — bubble
  // text is overridden to match too so the message stays consistent.
  const mood: PetMood = debugMood ?? realMood;
  const realBubble = projected ? computeBubble(projected) : null;
  const bubble = debugMood
    ? debugMood === "severe" || debugMood === "sad"
      ? { status: "hunger" as const, message: "배고파요..." }
      : null
    : realBubble;

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
          const nowMs = Date.now();
          const projected = projectStatus(
            { hunger: p.hunger ?? 100, happiness: p.happiness ?? 100, clean: p.clean ?? 100 },
            p.lastDecayAt?.toMillis?.() ?? nowMs,
            nowMs,
          );
          list.push({
            nickname: nick,
            petName: p.name,
            petType: p.type,
            petStage: computeStage(p.createdAt?.toMillis?.() ?? nowMs, p.exp ?? 0, nowMs),
            exp: p.exp ?? 0,
            happiness: p.happiness ?? 0,
            petMood: computeMood(projected),
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
      showToast("이름표가 없어요.\n상점에서 구매하세요.");
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
        className="group fixed left-4 bottom-24 z-[100] flex h-14 w-14 items-center justify-center rounded-full"
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-105"
          style={{
            // 납작한 단색 보라 + 펫 픽셀 얼굴. 라디얼 그라디언트/광택/
            // 베벨/헤일로 다 빼고 깔끔한 평면 디자인. 펫 없을 때는
            // 채도 낮춘 회색 비활성 톤.
            background: pet ? "#6b4ba8" : "rgba(61,46,107,0.55)",
            border: pet
              ? "1px solid rgba(216,150,200,0.45)"
              : "1px solid rgba(155,143,184,0.40)",
            opacity: pet ? 1 : 0.85,
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
            className="fixed left-4 bottom-24 z-[200] flex max-h-[calc(100vh-160px)] w-[340px] flex-col overflow-hidden rounded-2xl border border-nebula-pink/30 backdrop-blur-md"
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
                  debugMood={debugMood}
                  setDebugMood={setDebugMood}
                  debugPicker={debugPicker}
                  setDebugPicker={setDebugPicker}
                  isDebugAdmin={canDebugPet(nickname)}
                  ownerNickname={nickname ?? ""}
                  chatOpen={chatOpen}
                  setChatOpen={setChatOpen}
                  chatBubble={chatBubble}
                  setChatBubble={setChatBubble}
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
                    if (!nickname || !pet) return;
                    setBusy(true);
                    try {
                      await enterPlayground(nickname, pet);
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
                  now={now}
                  experimental={true}
                />
              ) : (
                <RankingPanel members={members} myNickname={nickname ?? null} />
              )}
            </div>

            {/* Toast */}
            {toast ? (
              <div
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-2xl px-3 py-1 text-center font-serif text-[11px] font-semibold leading-snug"
                style={{
                  // Was rgba(26,15,61,0.5) — dark navy text on dark grey
                  // bg → invisible. Stardust reads cleanly here.
                  // whiteSpace:pre-line so explicit "\n" in the message
                  // breaks at sentence boundaries instead of mid-word.
                  background: "rgba(31,41,55,0.92)",
                  color: "#FFE5C4",
                  whiteSpace: "pre-line",
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
          종류를 골라 시작하세요. 모두 무료예요.
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
            {/* Show egg preview instead of adult so the player gets the
                growth payoff later — every pet starts as an egg anyway. */}
            <PetSvg type={p.id} stage="egg" size={48} />
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
            maxLength={6}
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
  debugMood,
  setDebugMood,
  debugPicker,
  setDebugPicker,
  isDebugAdmin,
  ownerNickname,
  chatOpen,
  setChatOpen,
  chatBubble,
  setChatBubble,
}: {
  pet: PetDoc;
  stage: ReturnType<typeof computeStage>;
  stageProgress: number;
  projected: { hunger: number; happiness: number; clean: number };
  mood: PetMood;
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
  debugMood: PetMood | null;
  setDebugMood: (m: PetMood | null) => void;
  debugPicker: "stage" | "type" | "mood" | null;
  setDebugPicker: (p: "stage" | "type" | "mood" | null) => void;
  isDebugAdmin: boolean;
  ownerNickname: string;
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  chatBubble: string | null;
  setChatBubble: (s: string | null) => void;
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
            experimental={true}
            headBubble={chatBubble}
          />
          {/* Chat bubble now renders inside PetRoom via headBubble prop,
              positioned directly above the pet's head. The top-of-room
              overlay below is reserved for stat-based bubbles only. */}
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

      {/* Rename row — single line. Input narrow (max 150px), buttons
          fixed 60px each so vertical char-wrap is structurally
          impossible. Input shrinks first if the row is tight (flex-1
          + min-w-0 + shrink); buttons can't shrink (shrink-0). */}
      {renaming ? (
        <div className="flex w-full items-center gap-1.5">
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="새 이름"
            maxLength={6}
            className="min-w-0 flex-1 shrink rounded-lg border border-[rgba(216,150,200,0.25)] bg-abyss-deep/80 px-2 py-1 font-serif text-[12px] outline-none focus:border-[#d896c8]"
            style={{ maxWidth: 150 }}
          />
          <button
            onClick={onRename}
            disabled={busy}
            className="shrink-0 whitespace-nowrap rounded-lg py-1 text-center font-serif text-[11px] font-medium text-white"
            style={{ width: 60, background: "#d896c8" }}
          >
            변경
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="shrink-0 whitespace-nowrap rounded-lg py-1 text-center font-serif text-[11px] text-[#f4efff]"
            style={{ width: 60, border: "1px solid rgba(216,150,200,0.25)" }}
          >
            취소
          </button>
        </div>
      ) : null}

      {/* Chat panel — sits between the pet room and the gauge grid so
          the head bubble (above the pet) and the input land together
          in the user's gaze. */}
      {isDebugAdmin && chatOpen ? (
        <PetChatBox
          ownerNickname={ownerNickname}
          petType={pet.type}
          petStage={stage}
          petName={pet.name}
          stats={projected}
          petChatStarted={!!pet.petChatStarted}
          onSetPetBubble={setChatBubble}
        />
      ) : null}

      {/* ── HUD circular gauges (4 in a row) ── */}
      <div className="flex flex-row items-start gap-2">
        <CircleGauge
          icon={STATUS_ICONS.hunger}
          label="포만감"
          value={projected.hunger}
          color="#FB923C"
          centerText={`${Math.round(projected.hunger)}%`}
        />
        <CircleGauge
          icon={STATUS_ICONS.happiness}
          label="행복"
          value={projected.happiness}
          color="#EC4899"
          centerText={`${Math.round(projected.happiness)}%`}
        />
        <CircleGauge
          icon={STATUS_ICONS.clean}
          label="청결"
          value={projected.clean}
          color="#38BDF8"
          centerText={`${Math.round(projected.clean)}%`}
        />
        <CircleGauge
          icon={STATUS_ICONS.exp}
          label="경험치"
          value={Math.round(stageProgress * 100)}
          color="#A78BFA"
          centerText={`Lv.${PET_STAGES.findIndex((s) => s.id === stage) + 1}`}
          subText={(() => {
            const base = stage === "adult"
              ? "최고 레벨 ★"
              : (() => {
                  const cur = PET_STAGES.find((s) => s.id === stage);
                  const next = PET_STAGES[(PET_STAGES.findIndex((s) => s.id === stage) + 1) || 0];
                  if (!cur || !next) return "";
                  const span = Math.max(1, next.expMin - cur.expMin);
                  const got = Math.max(0, Math.min(span, (pet.exp ?? 0) - cur.expMin));
                  return `${got}/${span} XP`;
                })();
            const boost = pet.expBoostRemaining ?? 0;
            if (boost > 0) {
              return base ? `${base}\n✨ 2배 ${boost}/5` : `✨ 2배 ${boost}/5`;
            }
            return base || null;
          })()}
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
        {isDebugAdmin ? (
          <InteractButton
            icon={INTERACTION_ICONS.chat}
            label={chatOpen ? "대화 닫기" : "대화하기"}
            disabled={busy}
            onClick={() => setChatOpen((v) => !v)}
          />
        ) : null}
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

      {/* ── Admin debug controls (visual override only, never persisted) ──
          Hidden for non-admins now that the pet system is publicly
          available; the stage/type force-overrides remain useful for
          content authoring and screenshot review. */}
      {isDebugAdmin ? (
      <div
        className="rounded-lg p-2"
        style={{ background: "rgba(120,180,200,0.12)", border: "1px dashed #60A5FA" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-[10px] text-[#3730A3]">🛠 디버그 (관리자)</span>
          {debugStage || debugType || debugMood ? (
            <button
              onClick={() => {
                setDebugStage(null);
                setDebugType(null);
                setDebugMood(null);
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
          <button
            onClick={() => setDebugPicker(debugPicker === "mood" ? null : "mood")}
            className="rounded-md px-2 py-1 font-serif text-[10px]"
            style={{
              background: debugPicker === "mood" ? "rgba(96,165,250,0.5)" : "rgba(26,15,61,0.45)",
              border: "1px solid #60A5FA",
              color: "#3730A3",
            }}
          >
            상태 테스트{debugMood ? ` · ${MOOD_LABELS[debugMood]}` : ""}
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
        {debugPicker === "mood" ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {(["happy", "normal", "sad", "severe"] as PetMood[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setDebugMood(m);
                  setDebugPicker(null);
                }}
                className="rounded-md px-2 py-1 font-serif text-[10px]"
                style={{
                  background: debugMood === m ? "#3730A3" : "rgba(26,15,61,0.55)",
                  color: debugMood === m ? "white" : "#3730A3",
                  border: "1px solid #60A5FA",
                }}
              >
                {MOOD_LABELS[m]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

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

// Memoized — `icon` references are module-level constants from petArt
// (STATUS_ICONS, INTERACTION_ICONS, ITEM_ICONS), `size`/`dim` literals.
// Skips re-render on the parent's 1s clock tick.
const PixelIconView = memo(function PixelIconView({ icon, size = 20, dim = false }: { icon: ItemIconRender; size?: number; dim?: boolean }) {
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
});

// Circular donut gauge — replaces the old horizontal HudBar so all 4
// stats fit on a single row above the interaction grid (less scrolling
// to see the pet react after a press). CSS transition on
// strokeDashoffset = smooth fill animation when stats change.
const GAUGE_RADIUS = 22;
const GAUGE_STROKE = 5;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;
const GAUGE_SIZE = 56;

// Memoized — props change only when the underlying stat moves; the
// parent's 1s clock tick that produces the same projected value won't
// re-render any of the four gauges.
const CircleGauge = memo(function CircleGauge({
  icon,
  label,
  value,
  color,
  centerText,
  subText,
}: {
  icon: ItemIconRender;
  label: string;
  value: number;
  color: string;
  centerText: string;
  subText?: string | null;
}) {
  const v = Math.max(0, Math.min(100, value));
  const danger = v < 30;
  const stroke = danger ? "#EF4444" : color;
  const offset = GAUGE_CIRC * (1 - v / 100);
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <div className="relative" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
        <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
          {/* Track */}
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke="rgba(216,150,200,0.20)"
            strokeWidth={GAUGE_STROKE}
          />
          {/* Animated fill arc — starts at 12 o'clock via -90deg rotate. */}
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke={stroke}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRC}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
            style={{ transition: "stroke-dashoffset 0.5s ease-out, stroke 0.3s ease" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="font-serif text-[12px] font-bold"
            style={{ color: danger ? "#FFB5A7" : "#FFE5C4" }}
          >
            {centerText}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <PixelIconView icon={icon} size={11} />
        <span className="font-serif text-[10px] font-medium text-[#9b8fb8]">{label}</span>
      </div>
      {subText ? (
        <span
          className="text-center font-serif text-[9px] text-[#9b8fb8]"
          style={{ whiteSpace: "pre-line" }}
        >
          {subText}
        </span>
      ) : null}
    </div>
  );
});

// Memoized — only re-renders when cooldownLabel/disabled actually
// change; idle interactions (parent's 1s tick with same cooldown text)
// skip the button entirely.
const InteractButton = memo(function InteractButton({
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
});

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
  // 특별 케이크는 EXP 부스트라 일반 소모품보다 한 등급 위(고급).
  if (id === "cake") return "rare";
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
  onGiftTreat,
  inventory,
}: {
  myNickname: string;
  myPetInPlayground: boolean;
  busy: boolean;
  onEnter: () => void;
  onGiftTreat: (to: string, item: ItemId) => void;
  inventory: PetItemsDoc["inventory"];
}) {
  const [pets, setPets] = useState<PlaygroundPet[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PlaygroundPet | null>(null);
  // Map of nickname → latest chat message; each entry is rendered as a
  // bubble above that nickname's pet for ~5 s.
  const [chatByNickname, setChatByNickname] = useState<Record<string, PlaygroundChatMessage>>({});
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // ── Playground social interactions (greet / play / treat) ──
  // Today's playground log → drives "오늘 완료" badges + 30★ daily cap.
  const [pgLog, setPgLog] = useState<PlaygroundLog | null>(null);
  type ActiveInteraction = {
    id: string;
    kind: PlaygroundInteractionKind;
    from: string;
    to: string;
    reward: number;
    durationMs: number;
  };
  const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
  const [interactBusy, setInteractBusy] = useState(false);
  const [pgToast, setPgToast] = useState<string | null>(null);
  const [incomingReq, setIncomingReq] = useState<PlaygroundRequest | null>(null);
  const seenOutgoingRef = useRef<Set<string>>(new Set());

  // Refresh kept for places that explicitly want to re-pull (e.g.
  // immediately after my own request resolves). The live subscription
  // below is what makes the OTHER side of a greet/play interaction
  // disable my button without me reloading.
  const refreshLog = useCallback(async () => {
    if (!myNickname) return;
    const log = await loadPlaygroundLogToday(myNickname);
    setPgLog(log);
  }, [myNickname]);
  useEffect(() => {
    if (!myPetInPlayground || !myNickname) return;
    // onSnapshot delivers an immediate first read, so no separate
    // refreshLog() call needed on entry.
    return subscribePlaygroundLog(myNickname, setPgLog);
  }, [myPetInPlayground, myNickname]);

  const alreadyToday = useCallback(
    (kind: PlaygroundInteractionKind, otherNick: string) => {
      if (!pgLog) return false;
      const fieldByKind = {
        greet: "greetedWith",
        play: "playedWith",
        treat: "treatedWith",
      } as const;
      return !!(pgLog[fieldByKind[kind]] as Record<string, unknown>)[otherNick];
    },
    [pgLog],
  );

  const showPgToast = useCallback((msg: string) => {
    setPgToast(msg);
    setTimeout(() => setPgToast((c) => (c === msg ? null : c)), 1800);
  }, []);

  const triggerAnimation = useCallback(
    (kind: PlaygroundInteractionKind, from: string, to: string) => {
      const durationMs = kind === "play" ? 3500 : 2500;
      setActiveInteraction({
        id: `${Date.now()}-${kind}-${to}`,
        kind,
        from,
        to,
        reward: 3,
        durationMs,
      });
      setTimeout(() => setActiveInteraction(null), durationMs);
    },
    [],
  );

  const sendInteractionRequest = useCallback(
    async (kind: PlaygroundRequestKind, target: PlaygroundPet, myPetName: string) => {
      if (interactBusy) return;
      if (target.nickname === myNickname) return;
      setInteractBusy(true);
      try {
        const res = await sendPlaygroundRequest(
          myNickname,
          myPetName,
          target.nickname,
          target.petName,
          kind,
        );
        if (!res.ok) {
          if (res.reason === "already_today") showPgToast("오늘은 이미 했어요.");
          else if (res.reason === "daily_cap") showPgToast("오늘 별빛 한도(30★)에 도달했어요.");
          else showPgToast("실패했어요.");
          return;
        }
        showPgToast(kind === "greet" ? "인사 요청을 보냈어요..." : "같이 놀자고 요청했어요...");
        setSelected(null);
        setTimeout(async () => {
          try {
            await expirePlaygroundRequest({
              id: res.id,
              from: myNickname,
              fromPetName: myPetName,
              to: target.nickname,
              toPetName: target.petName,
              kind,
              status: "pending",
              createdAtMs: Date.now(),
            });
          } catch {}
        }, PLAYGROUND_REQUEST_TIMEOUT_MS);
      } finally {
        setInteractBusy(false);
      }
    },
    [interactBusy, myNickname, showPgToast],
  );

  const giveTreat = useCallback(
    async (target: PlaygroundPet, treatItem: ItemId) => {
      if (interactBusy) return;
      if (target.nickname === myNickname) return;
      const myPet = pets?.find((p) => p.nickname === myNickname);
      const myPetName = myPet?.petName ?? myNickname;
      setInteractBusy(true);
      try {
        const res = await playgroundTreat(
          myNickname,
          myPetName,
          target.nickname,
          target.petName,
          treatItem,
        );
        if (!res.ok) {
          if (res.reason === "no_item") showPgToast("간식이 없어요.");
          else showPgToast("실패했어요.");
          return;
        }
        triggerAnimation("treat", myNickname, target.nickname);
        setSelected(null);
        refreshLog();
      } finally {
        setInteractBusy(false);
      }
    },
    [interactBusy, myNickname, pets, triggerAnimation, refreshLog, showPgToast],
  );

  // Incoming request subscription — pop the accept/reject UI.
  useEffect(() => {
    if (!myPetInPlayground || !myNickname) return;
    const unsub = subscribeIncomingPlaygroundRequests(myNickname, (reqs) => {
      const now = Date.now();
      const fresh = reqs.find((r) => now - r.createdAtMs < PLAYGROUND_REQUEST_TIMEOUT_MS);
      setIncomingReq(fresh ?? null);
    });
    return () => unsub();
  }, [myPetInPlayground, myNickname]);

  // Outgoing-request status watcher. First-snapshot guard: Firestore
  // fires immediately with every existing doc — including stale resolved
  // requests from previous sessions. Mark them all as "already seen"
  // without toasting; only NEW resolutions during this session trigger
  // animations or toasts. (Was producing a spurious "응답이 없어요"
  // toast right after entering the playground.)
  useEffect(() => {
    if (!myPetInPlayground || !myNickname) return;
    let firstFire = true;
    const unsub = subscribeOutgoingPlaygroundRequests(myNickname, (reqs) => {
      if (firstFire) {
        firstFire = false;
        for (const r of reqs) {
          if (r.status !== "pending") seenOutgoingRef.current.add(r.id);
        }
        return;
      }
      for (const r of reqs) {
        if (r.status === "pending") continue;
        if (seenOutgoingRef.current.has(r.id)) continue;
        seenOutgoingRef.current.add(r.id);
        if (r.status === "accepted") {
          triggerAnimation(r.kind, r.from, r.to);
          refreshLog();
        } else if (r.status === "rejected") {
          showPgToast("지금은 안 된대요 ㅠ");
        } else if (r.status === "expired") {
          showPgToast("응답이 없어요...");
        }
      }
    });
    return () => unsub();
  }, [myPetInPlayground, myNickname, triggerAnimation, refreshLog, showPgToast]);

  const acceptIncoming = useCallback(async () => {
    if (!incomingReq || !myNickname || interactBusy) return;
    setInteractBusy(true);
    try {
      const res = await respondPlaygroundRequest(incomingReq, true, myNickname);
      if (!res.ok) {
        if (res.reason === "already_today") showPgToast("오늘은 이미 했어요.");
        else if (res.reason === "daily_cap") showPgToast("오늘 별빛 한도에 도달했어요.");
        else showPgToast("응답 실패");
        setIncomingReq(null);
        return;
      }
      triggerAnimation(incomingReq.kind, incomingReq.from, incomingReq.to);
      refreshLog();
      setIncomingReq(null);
    } finally {
      setInteractBusy(false);
    }
  }, [incomingReq, myNickname, interactBusy, triggerAnimation, refreshLog, showPgToast]);

  const rejectIncoming = useCallback(async () => {
    if (!incomingReq || !myNickname) return;
    try {
      await respondPlaygroundRequest(incomingReq, false, myNickname);
    } finally {
      setIncomingReq(null);
    }
  }, [incomingReq, myNickname]);

  // Realtime subscription to the playgroundPets collection. Live-updates
  // when pets enter, leave, or move (their position write triggers an
  // onSnapshot fire). One subscription = one listener cost regardless
  // of pet count.
  useEffect(() => {
    setLoading(true);
    const unsub = subscribePlaygroundPets((list) => {
      setPets(list);
      setCount(list.length);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // While my pet is in the playground, periodically write a new anchor
  // position so other clients see the pet wander. Owner-side only.
  //
  // EVERY tick picks a brand-new random target across the full grass
  // band — no delta-walk, no drift. Random walks were causing pets to
  // cluster on one side over time (fixed multiple times now; pure
  // random sampling is the only fix that's actually drift-proof).
  //
  // Range: X 8–92 (full visual width), Y 50–85 (grass band so feet
  // stay on grass). Interval: 5–10 s random per tick (different pets
  // step on different beats). Slide duration is 1800 ms — midway
  // between earlier "too fast" and "too slow" feels.
  useEffect(() => {
    if (!myPetInPlayground || !myNickname) return;
    const X_MIN = 8;
    const X_MAX = 92;
    const Y_MIN = 50;
    const Y_MAX = 85;
    // 30% of the grass-band X width (= 84 units) = ~25 units. Capped
    // as a Euclidean distance so neither axis can ship the pet across
    // the field in one move.
    const MAX_STEP = 25;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let curX = X_MIN + Math.random() * (X_MAX - X_MIN);
    let curY = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
    const pickClamped = () => {
      const tx = X_MIN + Math.random() * (X_MAX - X_MIN);
      const ty = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
      const dx = tx - curX;
      const dy = ty - curY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= MAX_STEP) return { x: tx, y: ty };
      const scale = MAX_STEP / dist;
      return { x: curX + dx * scale, y: curY + dy * scale };
    };
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[playground] my-pet wander range: X ${X_MIN}–${X_MAX}, Y ${Y_MIN}–${Y_MAX}, max step ${MAX_STEP} | initial: (${curX.toFixed(1)}, ${curY.toFixed(1)})`,
      );
    }
    updatePlaygroundPosition(myNickname, curX, curY).catch(() => {});
    const tick = () => {
      if (cancelled) return;
      const next = pickClamped();
      curX = next.x;
      curY = next.y;
      updatePlaygroundPosition(myNickname, next.x, next.y).catch(() => {});
      timer = setTimeout(tick, 5000 + Math.random() * 5000);
    };
    timer = setTimeout(tick, 5000 + Math.random() * 5000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [myPetInPlayground, myNickname]);

  // Realtime chat subscription — only while we're in the playground.
  useEffect(() => {
    if (!myPetInPlayground) return;
    const unsub = subscribePlaygroundChat((msgs) => {
      const map: Record<string, PlaygroundChatMessage> = {};
      for (const m of msgs) {
        const cur = map[m.nickname];
        if (!cur || m.ts > cur.ts) map[m.nickname] = m;
      }
      setChatByNickname(map);
    });
    return () => unsub();
  }, [myPetInPlayground]);

  const sendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    try {
      await sendPlaygroundChat(myNickname, text);
      setChatDraft("");
    } finally {
      setChatBusy(false);
    }
  }, [chatDraft, chatBusy, myNickname]);

  if (!myPetInPlayground) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl p-4 text-center" style={{ background: "rgba(167,243,208,0.18)", border: "1px solid #A7F3D0" }}>
          <div className="font-serif text-[14px] font-medium text-[#f4efff]">펫 놀이터</div>
          <div className="mt-2 font-serif text-[11px] text-[#9b8fb8]">
            길드원의 펫들과 한 공간에서 자유롭게 놀 수 있어요.
            <br />다른 펫에게 인사하거나 같이 놀면 별빛을 얻을 수 있어요! ⭐
            <br />간식을 선물할 수도 있답니다.
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
      <div className="text-center font-serif text-[10px] text-[#9b8fb8]">
        현재 {pets?.length ?? 0}마리가 놀고 있어요
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

        {(pets ?? []).map((p) => {
          // If this pet is in the active interaction, find its partner
          // (the other pet) so the renderer can compute an approach
          // position toward them.
          const involved =
            activeInteraction &&
            (activeInteraction.from === p.nickname || activeInteraction.to === p.nickname);
          const partnerNick = involved
            ? activeInteraction!.from === p.nickname
              ? activeInteraction!.to
              : activeInteraction!.from
            : null;
          const partner = partnerNick
            ? (pets ?? []).find((q) => q.nickname === partnerNick) ?? null
            : null;
          return (
            <WanderingPet
              key={p.nickname}
              pet={p}
              partner={partner}
              isMine={p.nickname === myNickname}
              chatMessage={chatByNickname[p.nickname] ?? null}
              interaction={involved ? activeInteraction : null}
              onTap={() => setSelected(p)}
            />
          );
        })}
        {pgToast ? (
          <div
            className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 font-serif text-[11px] font-semibold text-stardust"
            style={{
              background: "rgba(11,8,33,0.92)",
              border: "1px solid rgba(216,150,200,0.40)",
              zIndex: 9500,
            }}
          >
            {pgToast}
          </div>
        ) : null}
        {/* Incoming-request popup — appears for the target. */}
        {incomingReq && incomingReq.from !== myNickname ? (
          <div
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
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: "#0b0821", border: "1px solid #FFE5C4", maxWidth: 240 }}
            >
              <div className="font-serif text-[14px] font-bold text-stardust">
                {incomingReq.kind === "greet" ? "🤝 인사 요청" : "🎉 같이 놀자!"}
              </div>
              <div className="mt-2 font-serif text-[11px] text-[#f4efff]">
                {incomingReq.fromPetName || incomingReq.from}
                {incomingReq.kind === "greet"
                  ? "이(가) 인사를 하고 싶어해요!"
                  : "이(가) 같이 놀자고 해요!"}
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  onClick={rejectIncoming}
                  disabled={interactBusy}
                  className="rounded-md px-3 py-1.5 font-serif text-[11px] text-[#f4efff] disabled:opacity-50"
                  style={{ border: "1px solid rgba(216,150,200,0.30)", background: "rgba(26,15,61,0.55)" }}
                >
                  거절
                </button>
                <button
                  onClick={acceptIncoming}
                  disabled={interactBusy}
                  className="rounded-md px-3 py-1.5 font-serif text-[11px] font-bold text-stardust disabled:opacity-50"
                  style={{ background: "#6b4ba8", border: "1px solid rgba(216,150,200,0.50)" }}
                >
                  수락 +3 ★
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
              className="flex flex-col rounded-xl"
              style={{
                background: "#0b0821",
                border: "1px solid rgba(216,150,200,0.30)",
                width: "92%",
                maxWidth: 300,
                maxHeight: "92%",
                padding: 10,
              }}
            >
              {/* Compact header — small portrait + name/@nick + close X. */}
              <div
                className="flex items-center gap-2 pb-2"
                style={{ borderBottom: "1px solid rgba(216,150,200,0.20)" }}
              >
                <PetSvg
                  type={selected.petType}
                  stage={selected.petStage}
                  size={40}
                  bodyColor={selected.petBodyColor}
                  glow={selected.glow}
                  hue={selected.hue}
                  accessories={selected.accessories}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-serif text-[13px] font-bold text-stardust">
                    {selected.petName}
                  </div>
                  <div className="truncate font-serif text-[10px] text-[#9b8fb8]">
                    @{selected.nickname}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full font-bold text-stardust"
                  style={{
                    background: "rgba(26,15,61,0.55)",
                    border: "1px solid rgba(216,150,200,0.30)",
                  }}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              {selected.nickname !== myNickname ? (
                <div className="mt-2 flex flex-col gap-2 overflow-y-auto">
                  {/* Greet / play in one row. */}
                  <div className="flex gap-1.5">
                    {(["greet", "play"] as PlaygroundRequestKind[]).map((k) => {
                      const done = alreadyToday(k, selected.nickname);
                      const label = k === "greet" ? "인사하기" : "같이 놀기";
                      const myPet = pets?.find((p) => p.nickname === myNickname);
                      return (
                        <button
                          key={k}
                          onClick={() =>
                            sendInteractionRequest(k, selected, myPet?.petName ?? myNickname)
                          }
                          disabled={done || interactBusy}
                          className="flex flex-1 flex-col items-center justify-center rounded-lg px-2 py-1.5 font-serif disabled:opacity-50"
                          style={{
                            background: done ? "rgba(26,15,61,0.45)" : "rgba(61,46,107,0.55)",
                            border: `1px solid ${done ? "rgba(216,150,200,0.20)" : "rgba(216,150,200,0.40)"}`,
                            color: "#FFE5C4",
                          }}
                        >
                          <span className="text-[11px] font-bold" style={{ opacity: done ? 0.6 : 1 }}>
                            {label}
                          </span>
                          <span className="text-[9px]" style={{ opacity: 0.85 }}>
                            {done ? "오늘 완료" : "+3 ★"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Treat row — pure gift, gated only by sender's inventory. */}
                  <div>
                    <div className="font-serif text-[10px] font-semibold text-stardust">
                      간식 선물
                    </div>
                    <div className="mt-1 flex justify-center gap-1.5">
                      {(["treat", "cake"] as ItemId[]).map((id) => {
                        const c = inventory?.[id] ?? 0;
                        const disabled = c < 1 || interactBusy;
                        return (
                          <button
                            key={id}
                            onClick={() => giveTreat(selected, id)}
                            disabled={disabled}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 font-serif text-[10px] disabled:opacity-40"
                            style={{ background: "rgba(26,15,61,0.45)", border: "1px solid rgba(216,150,200,0.25)" }}
                          >
                            <ItemIconSvg id={id} size={16} />
                            <span className="text-[#f4efff]">×{c}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {pgLog ? (
                    <div className="text-center font-serif text-[9px] text-[#9b8fb8]">
                      오늘: {pgLog.totalEarned} / 30 ★
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-center font-serif text-[10px] text-[#9b8fb8]">내 펫</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {/* Playground chat — separate from the main guild chat. Messages
          appear as a bubble above the sender's pet for ~5 s. */}
      <form
        className="mt-1 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat();
        }}
      >
        <input
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value.slice(0, 50))}
          placeholder="놀이터 채팅..."
          maxLength={50}
          disabled={chatBusy}
          className="flex-1 rounded-full px-3 py-1.5 font-serif text-[12px] outline-none"
          style={{
            background: "rgba(11,8,33,0.65)",
            border: "1px solid rgba(216,150,200,0.30)",
            color: "#f4efff",
          }}
        />
        <button
          type="submit"
          disabled={!chatDraft.trim() || chatBusy}
          className="rounded-full px-3 py-1.5 font-serif text-[11px] font-bold text-stardust disabled:opacity-50"
          style={{
            background: "#6b4ba8",
            border: "1px solid rgba(216,150,200,0.45)",
          }}
        >
          보내기
        </button>
      </form>
    </div>
  );
}

type WanderingInteraction = {
  id: string;
  kind: PlaygroundInteractionKind;
  from: string;
  to: string;
  reward: number;
  durationMs: number;
};

function WanderingPet({
  pet,
  partner,
  isMine,
  chatMessage,
  interaction,
  onTap,
}: {
  pet: PlaygroundPet;
  partner: PlaygroundPet | null;
  isMine: boolean;
  chatMessage: PlaygroundChatMessage | null;
  interaction: WanderingInteraction | null;
  onTap: () => void;
}) {
  // Position is owner-driven and synced via Firestore. During an active
  // interaction, the FROM pet animates over to the TO pet's position
  // (with a small horizontal offset so they sit side-by-side). The TO
  // pet stays put. When the interaction ends, the next 4s position tick
  // scatters the FROM pet to a new random anchor — so "approach → react
  // → scatter" reads naturally without an extra exit animation.
  let pos: { x: number; y: number };
  if (interaction && partner && interaction.from === pet.nickname) {
    const goLeft = pet.posX > partner.posX;
    pos = {
      x: Math.max(5, Math.min(95, partner.posX + (goLeft ? 8 : -8))),
      y: partner.posY,
    };
  } else {
    pos = { x: pet.posX, y: pet.posY };
  }

  // Chat bubble — show for 5 s on each new chatMessage. Keyed by id so
  // a fresh repeat from the same user re-shows the bubble.
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  useEffect(() => {
    if (!chatMessage) return;
    if (Date.now() - chatMessage.ts > 5000) return;
    setBubbleText(chatMessage.message);
    const t = setTimeout(() => setBubbleText(null), 5000);
    return () => clearTimeout(t);
  }, [chatMessage?.id]);

  // Playground interaction overlay — "+3 ★" rises and fades; a small
  // particle char (heart/star/treat) rises alongside it. The wandering
  // walk is paused for the duration.
  const [interactionVisible, setInteractionVisible] = useState(false);
  useEffect(() => {
    if (!interaction) {
      setInteractionVisible(false);
      return;
    }
    setInteractionVisible(true);
    const t = setTimeout(() => setInteractionVisible(false), interaction.durationMs);
    return () => clearTimeout(t);
  }, [interaction?.id]);
  const partChar = interaction
    ? interaction.kind === "greet"
      ? "💕"
      : interaction.kind === "play"
        ? "⭐"
        : "🍪"
    : "";

  return (
    <div
      onClick={onTap}
      style={{
        position: "absolute",
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: "translate(-50%, -100%)",
        // 1800ms slide between anchors — the midway pace between
        // earlier "too fast" (1400ms) and "too slow" (2500ms) feels.
        // The continuous bobbing animation adds a walking feel on top.
        transition: "left 1800ms ease-in-out, top 1800ms ease-in-out",
        animation: "pet-walk-bob 0.7s ease-in-out infinite",
        cursor: "pointer",
        zIndex: Math.round(pos.y * 10),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Playground reward "+3 ★" — animates up and fades out. */}
      {interactionVisible && interaction ? (
        <span
          className="pointer-events-none absolute font-serif text-[14px] font-extrabold text-stardust"
          style={{
            top: -28,
            left: "50%",
            transform: "translateX(-50%)",
            textShadow: "0 1px 3px rgba(11,8,33,0.85)",
            animation: `pet-pg-bonus ${interaction.durationMs}ms ease-out forwards`,
            zIndex: 50,
          }}
        >
          +{interaction.reward} ★
        </span>
      ) : null}
      {interactionVisible && interaction ? (
        <span
          className="pointer-events-none absolute"
          style={{
            top: -16,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 18,
            animation: `pet-pg-particle ${interaction.durationMs}ms ease-out forwards`,
            zIndex: 49,
          }}
        >
          {partChar}
        </span>
      ) : null}
      {bubbleText ? (
        <div
          className="relative mb-1 max-w-[120px] rounded-lg px-2 py-1 font-serif text-[11px] text-[#1F2937]"
          style={{
            background: "#FFFFFF",
            border: "1px solid #d896c8",
            boxShadow: "0 2px 4px rgba(11,8,33,0.25)",
            textAlign: "center",
            // Long unbroken text (e.g. ㅋㅋㅋㅋㅋ) must wrap to keep the
            // bubble within ~40% of the playground width — break-all
            // is fine for CJK syllable-by-syllable wrapping.
            wordBreak: "break-all",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          {bubbleText}
          {/* Tail — outer triangle (border color) and inner triangle
              (white) layered to look like a speech-bubble tail. */}
          <span
            style={{
              position: "absolute",
              bottom: -7,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #d896c8",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: -5,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #FFFFFF",
            }}
          />
        </div>
      ) : null}
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
  now,
  experimental,
}: {
  members: MemberInfo[];
  visiting: MemberInfo | null;
  setVisiting: (m: MemberInfo | null) => void;
  now: number;
  experimental: boolean;
}) {
  // Lazy-load the visited pet's full doc so we get furniture, accessories,
  // background, glow, body color — same fields the owner sees in their
  // own room. The members list only carries summary fields.
  const [visitPet, setVisitPet] = useState<PetDoc | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!visiting) {
      setVisitPet(null);
      return;
    }
    let alive = true;
    setLoading(true);
    loadPet(visiting.nickname)
      .then((p) => {
        if (!alive) return;
        setVisitPet(p);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setVisitPet(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visiting]);

  if (visiting) {
    const visitedStage = visitPet
      ? computeStage(
          visitPet.createdAt?.toMillis?.() ?? now,
          visitPet.exp ?? 0,
          now,
        )
      : (visiting.petStage ?? "egg");
    const projected = visitPet
      ? projectStatus(
          { hunger: visitPet.hunger, happiness: visitPet.happiness, clean: visitPet.clean },
          visitPet.lastDecayAt?.toMillis?.() ?? now,
          now,
        )
      : null;
    const visitedMood = projected ? computeMood(projected) : "happy";

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate font-serif text-[13px] font-bold text-stardust"
            style={{ flex: 1, minWidth: 0 }}
          >
            {visiting.nickname}의 펫 방
          </span>
          <button
            type="button"
            onClick={() => setVisiting(null)}
            className="shrink-0 rounded-lg px-2.5 py-1 font-serif text-[10px] font-semibold text-[#f4efff]"
            style={{
              background: "rgba(26,15,61,0.45)",
              border: "1px solid rgba(216,150,200,0.30)",
            }}
          >
            ← 돌아가기
          </button>
        </div>
        {loading || !visitPet ? (
          <div className="py-16 text-center font-serif text-[11px] text-[#9b8fb8]">
            방을 불러오는 중…
          </div>
        ) : (
          <div className="relative">
            <PetRoom
              type={visitPet.type}
              stage={visitedStage}
              accessories={visitPet.accessories ?? []}
              furniture={visitPet.furniture ?? []}
              furniturePositions={visitPet.furniturePositions}
              background={visitPet.background ?? "none"}
              mood={visitedMood}
              glow={!!visitPet.glow}
              hue={visitPet.hue ?? 0}
              bodyColor={visitPet.petBodyColor ?? null}
              reaction={null}
              height={280}
              activeScene={null}
              onSceneEnd={() => {}}
              placementMode={false}
              selectedFurniture={null}
              onSelectFurniture={() => {}}
              onMoveFurniture={() => {}}
              experimental={experimental}
            />
            <div
              className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-sm"
              style={{
                background: "rgba(11,8,33,0.7)",
                border: "1px solid rgba(216,150,200,0.30)",
              }}
            >
              <span className="font-serif text-[11px] font-bold text-stardust">
                {visitPet.name}
              </span>
              <span
                className="rounded-md px-1 py-[1px] font-serif text-[9px] font-bold text-stardust"
                style={{ background: "rgba(216,150,200,0.30)" }}
              >
                {PET_STAGES.find((s) => s.id === visitedStage)?.label ?? ""}
              </span>
            </div>
          </div>
        )}
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
              <PetSvg type={m.petType!} stage={m.petStage!} mood={m.petMood ?? "normal"} size={48} />
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
            <PetSvg type={m.petType!} stage={m.petStage!} mood={m.petMood ?? "normal"} size={26} />
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
