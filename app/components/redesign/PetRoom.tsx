// PetRoom — game-feel "펫 방". Walls + wood floor + furniture + a
// state-machine-driven pet that idles, walks to random spots (5–10s
// cadence), occasionally sits, blinks every 2–3s, and faces its
// movement direction. Mirrored in dawnlight-app/src/components/PetRoom.tsx
// using react-native-reanimated.

"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCESSORY_SPRITES,
  accessoryColor,
  BLINK_OVERLAY,
  effectiveBehavior,
  EGG_SPRITE,
  FURNITURE_PLACEMENTS,
  ITEM_ICONS,
  pixelColor,
  ROOM_THEMES,
  SCENE_SPRITES,
  SCENES,
  spriteFor,
  type ItemIconRender,
  type PixelGrid,
  type SceneId,
  type SpecialAction,
} from "@/src/lib/petArt";
import {
  PET_PALETTE,
  type BackgroundId,
  type FurnitureUserPosition,
  type ItemId,
  type PetMood,
  type PetStage,
  type PetType,
} from "@/src/lib/pets";

const SPRITE_GRID = 16;

export type PetReaction =
  | { kind: "happy" }
  | { kind: "fed" }
  | { kind: "clean" }
  | { kind: "sleep" }
  | { kind: "play" }
  | null;

type Mode = "idle" | "walking" | "sitting" | "special" | "scene";

type Props = {
  type: PetType;
  stage: PetStage;
  accessories?: ItemId[];
  furniture?: ItemId[];
  furniturePositions?: Partial<Record<ItemId, FurnitureUserPosition>>;
  background?: BackgroundId;
  mood?: PetMood;
  glow?: boolean;
  hue?: number;
  bodyColor?: string | null;
  reaction?: PetReaction;
  height?: number;
  activeScene?: SceneId | null;
  onSceneEnd?: () => void;
  // 꾸미기 mode wiring
  placementMode?: boolean;
  selectedFurniture?: ItemId | null;
  onSelectFurniture?: (id: ItemId | null) => void;
  onMoveFurniture?: (id: ItemId, x: number, y: number) => void;
};

function gridRects(
  grid: PixelGrid,
  resolve: (code: string) => string | null,
  pixelSize: number,
  offsetX: number,
  offsetY: number,
  keyPrefix: string,
) {
  const out: React.ReactElement[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? "";
    const limit = Math.min(row.length, SPRITE_GRID);
    for (let c = 0; c < limit; c++) {
      const code = row[c]!;
      const fill = resolve(code);
      if (!fill) continue;
      out.push(
        <rect
          key={`${keyPrefix}-${r}-${c}`}
          x={offsetX + c * pixelSize}
          y={offsetY + r * pixelSize}
          width={pixelSize}
          height={pixelSize}
          fill={fill}
          shapeRendering="crispEdges"
        />,
      );
    }
  }
  return out;
}

function PetRoomInner({
  type,
  stage,
  accessories = [],
  furniture = [],
  furniturePositions = {},
  background = "none",
  mood = "happy",
  glow = false,
  hue = 0,
  reaction = null,
  height = 280,
  activeScene = null,
  onSceneEnd,
  placementMode = false,
  selectedFurniture = null,
  onSelectFurniture,
  onMoveFurniture,
  bodyColor = null,
}: Props) {
  const theme = ROOM_THEMES[background];
  const basePalette = PET_PALETTE[type];
  const palette = bodyColor ? { ...basePalette, primary: bodyColor } : basePalette;
  const sprite = stage === "egg" ? EGG_SPRITE : spriteFor(type, stage);
  const useFilter = hue !== 0 || glow;

  // Logical viewBox for the room SVG. Pet is rendered as an HTML div
  // overlaid via percentage positioning so it can be freely repositioned
  // via CSS transitions (we don't pin it to viewBox coords).
  const W = 320;
  const H = height;
  const wallEnd = H * 0.62;
  const floorEnd = H;
  const floorDepth = floorEnd - wallEnd;

  // Pet sizing — 70% of previous (140 → 98) so furniture has room.
  const petSize = Math.min(98, Math.max(68, Math.round(H * 0.35)));
  const isEgg = stage === "egg";
  const behavior = effectiveBehavior(type, stage);

  // ── State machine ──
  const [mode, setMode] = useState<Mode>("idle");
  const [posPct, setPosPct] = useState(0); // -1..1 within walking range
  // Pet y depth in [0, 1] (0 = back wall, 1 = front of floor). Defaults
  // to 0.65 (front-mid). Picked alongside posPct when walking so pet
  // can naturally pass behind/in-front of furniture.
  const [posY, setPosY] = useState(0.65);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [blink, setBlink] = useState(false);
  const [activeAction, setActiveAction] = useState<SpecialAction>("none");
  const walkDurRef = useRef(0);

  // ── Long-press drag for furniture (placement mode) ──
  // Refs hold the authoritative drag state (avoids stale closures in
  // pointermove/pointerup handlers); state is mirrored only for the
  // few things React needs to re-render (selection ring + position).
  const [dragId, setDragId] = useState<ItemId | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{
    id: ItemId;
    startCursorX: number;
    startCursorY: number;
    startFx: number;
    startFy: number;
  } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const cancelLongPress = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const endDrag = (commit: boolean) => {
    cancelLongPress();
    if (commit && dragStartRef.current && dragPosRef.current) {
      onMoveFurniture?.(dragStartRef.current.id, dragPosRef.current.x, dragPosRef.current.y);
    }
    if (dragStartRef.current) onSelectFurniture?.(null);
    dragStartRef.current = null;
    dragPosRef.current = null;
    setDragId(null);
    setDragPos(null);
  };

  // ── Scene mode (interaction cutscene) ──
  // CRITICAL: depend ONLY on `activeScene` here. The previous version
  // also depended on `onSceneEnd`, which is a fresh inline arrow on
  // every parent re-render (status timer ticks every second). Each
  // re-render reset the timeout, so the scene effectively NEVER ended.
  // We mirror onSceneEnd into a ref so the callback stays current
  // without retriggering the effect.
  const onSceneEndRef = useRef(onSceneEnd);
  useEffect(() => { onSceneEndRef.current = onSceneEnd; }, [onSceneEnd]);
  useEffect(() => {
    if (!activeScene) return;
    const scene = SCENES[activeScene];
    setMode("scene");
    if (scene.petAnchor !== undefined) {
      walkDurRef.current = 600;
      setPosPct(scene.petAnchor);
    }
    const t = window.setTimeout(() => {
      setMode("idle");
      onSceneEndRef.current?.();
    }, scene.durationMs);
    return () => window.clearTimeout(t);
  }, [activeScene]);

  // Behaviour scheduler — every stage moves now. Position picker
  // alternates sides so the pet keeps crossing through center.
  useEffect(() => {
    if (mode === "scene") return; // suspended during cutscenes
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const delay =
        mode === "idle"
          ? behavior.idleWaitMin + Math.random() * (behavior.idleWaitMax - behavior.idleWaitMin)
          : 0;
      const t = window.setTimeout(() => {
        if (cancelled) return;
        const r = Math.random();
        // Special action first (rolled before sit/walk to give it priority)
        if (r < behavior.specialChance && behavior.specialAction !== "none") {
          setActiveAction(behavior.specialAction);
          setMode("special");
          // dash is implemented as a fast walk, not a hold-pose
          if (behavior.specialAction === "dash") {
            const lastSign = posPct > 0.05 ? 1 : posPct < -0.05 ? -1 : (Math.random() < 0.5 ? 1 : -1);
            const next = -lastSign * (0.5 + Math.random() * 0.35);
            const dur = Math.max(500, Math.abs(next - posPct) * 700); // fast
            walkDurRef.current = dur;
            setFacing(next > posPct ? "right" : "left");
            setPosPct(next);
            window.setTimeout(() => {
              if (!cancelled) {
                setActiveAction("none");
                setMode("idle");
              }
            }, dur + 80);
          } else {
            window.setTimeout(() => {
              if (!cancelled) {
                setActiveAction("none");
                setMode("idle");
              }
            }, 1700);
          }
        } else {
          const r2 = (r - behavior.specialChance) / Math.max(0.0001, 1 - behavior.specialChance);
          if (r2 < behavior.sitChance) {
            setMode("sitting");
            window.setTimeout(() => {
              if (!cancelled) setMode("idle");
            }, 3000 + Math.random() * 2000);
          } else if (r2 < behavior.sitChance + behavior.walkChance) {
            // Pick opposite side from current — cross through center.
            const lastSign = posPct > 0.05 ? 1 : posPct < -0.05 ? -1 : (Math.random() < 0.5 ? 1 : -1);
            const newSign = -lastSign;
            const magnitude = 0.3 + Math.random() * 0.55; // 0.3..0.85
            const next = newSign * magnitude;
            // Also pick a new depth y in [0.45, 0.85] so the pet
            // wanders forward/backward and the z-sort animates.
            const nextY = 0.45 + Math.random() * 0.4;
            const distance = Math.abs(next - posPct);
            const dur = Math.max(behavior.walkDurMin, distance * behavior.walkDurPerUnit);
            walkDurRef.current = dur;
            setFacing(next > posPct ? "right" : "left");
            setMode("walking");
            setPosPct(next);
            setPosY(nextY);
            window.setTimeout(() => {
              if (!cancelled) setMode("idle");
            }, dur + 80);
          }
        }
      }, delay);
      return () => window.clearTimeout(t);
    };

    const cleanup = tick();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [mode, posPct, behavior]);

  // Blink scheduler — independent of behaviour.
  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      const wait = 1800 + Math.random() * 1800;
      window.setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setBlink(false);
          schedule();
        }, 130);
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reaction overlay (heart/sparkle/zZ) — replays per event.
  const [reactionShown, setReactionShown] = useState<{ kind: NonNullable<PetReaction>["kind"]; id: number } | null>(null);
  const reactionIdRef = useRef(0);
  useEffect(() => {
    if (!reaction) return;
    reactionIdRef.current += 1;
    setReactionShown({ kind: reaction.kind, id: reactionIdRef.current });
    const t = window.setTimeout(() => setReactionShown(null), 1500);
    return () => window.clearTimeout(t);
  }, [reaction]);

  // CSS transition timing for `left` matches the planned walk duration.
  const walkDuration = mode === "walking" || (mode === "special" && activeAction === "dash") ? walkDurRef.current : 0;

  // Walk animation pick. Rabbit hops once trait expression unlocks it.
  let swayKeyframe = stage === "egg" ? "pet-roll-sway"
    : stage === "baby" ? "pet-waddle-sway"
    : stage === "teen" ? "pet-walk-sway-active"
    : "pet-walk-sway";
  if (behavior.hopOnWalk) swayKeyframe = "pet-hop-walk";

  const idleKeyframe = "pet-bob";

  // Special action keyframes
  const actionKeyframe: Record<SpecialAction, string | null> = {
    none: null,
    groom: "pet-action-groom",
    jump: "pet-action-jump",
    sniff: "pet-action-sniff",
    dash: null, // dash uses walk anim
    puff: "pet-action-puff",
    flap: "pet-action-flap",
    howl: "pet-action-howl",
    roll: "pet-action-roll",
  };

  // Scene-mode pet animations (one per petAnim type)
  const sceneAnimKeyframe: Record<NonNullable<typeof activeScene> extends infer S ? S extends SceneId ? string : never : never, string> = {
    feed: "pet-scene-eat",
    play: "pet-scene-chase",
    wash: "pet-scene-shake",
    walk: "pet-scene-run",
    pet: "pet-scene-happy",
    treat: "pet-scene-eat",
    sleep: "pet-scene-sleep",
    train: "pet-scene-jump",
  } as any;

  let innerAnim: string;
  if (mode === "scene" && activeScene) {
    const dur =
      activeScene === "wash" ? "0.18s"
      : activeScene === "play" ? "0.5s"
      : activeScene === "sleep" ? "1.2s"
      : "0.6s";
    const keyf = sceneAnimKeyframe[activeScene];
    innerAnim =
      activeScene === "sleep"
        ? `${keyf} ${dur} ease-out forwards`
        : `${keyf} ${dur} ease-in-out infinite`;
  } else if (mode === "special" && activeAction !== "none" && actionKeyframe[activeAction]) {
    innerAnim = `${actionKeyframe[activeAction]} 1.6s ease-in-out infinite`;
  } else if (mode === "walking" || (mode === "special" && activeAction === "dash")) {
    const dur = activeAction === "dash" ? behavior.swayDuration * 0.55 : behavior.swayDuration;
    innerAnim = `${swayKeyframe} ${dur}ms ease-in-out infinite`;
  } else if (mode === "sitting") {
    innerAnim = "pet-sit 1.2s ease-in-out infinite";
  } else {
    innerAnim = `${idleKeyframe} ${behavior.bobDuration}ms ease-in-out infinite`;
  }

  // Pet horizontal range: 18%..82% of container (leaves margin so the
  // sprite never crosses the edge).
  const petLeftPct = 50 + posPct * 32;
  // Effective bottom px for pet (matches pet wrapper). Used by scene
  // props/particles so they stay anchored to the pet.
  const petBottom = (1 - posY) * floorDepth + 4;

  return (
    <div
      onPointerMove={(e) => {
        if (!dragStartRef.current) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const cursorXPx = e.clientX - rect.left;
        const cursorYPx = e.clientY - rect.top;
        const wallEndPx = (wallEnd / H) * rect.height;
        const floorDepthPx = rect.height - wallEndPx;
        const dxPct = ((cursorXPx - dragStartRef.current.startCursorX) / rect.width) * 100;
        const dyPct = ((cursorYPx - dragStartRef.current.startCursorY) / floorDepthPx) * 100;
        const newX = Math.max(0, Math.min(100, dragStartRef.current.startFx + dxPct));
        // Clamp to floor area only — never above the wall line.
        const newY = Math.max(0, Math.min(100, dragStartRef.current.startFy + dyPct));
        dragPosRef.current = { x: newX, y: newY };
        setDragPos({ x: newX, y: newY });
      }}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
      onPointerLeave={() => endDrag(true)}
      style={{
        position: "relative",
        width: "100%",
        height: H,
        overflow: "hidden",
        borderRadius: 16,
        boxShadow: "inset 0 0 0 1px #E0CFB8, 0 4px 12px rgba(91,58,31,0.10)",
        cursor: placementMode ? (dragId ? "grabbing" : "default") : "default",
        touchAction: placementMode ? "none" : "auto",
        userSelect: "none",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block", position: "absolute", inset: 0 }}
      >
        {/* Themed wall */}
        <rect x={0} y={0} width={W} height={wallEnd} fill={theme.wall} />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={`stripe-${i}`}
            x={(i + 0.5) * (W / 8) - 0.5}
            y={0}
            width={1}
            height={wallEnd}
            fill={theme.wallDecor}
            opacity={0.3}
          />
        ))}
        {/* Wall extras (e.g. star field for space theme) */}
        {theme.wallExtras === "stars"
          ? Array.from({ length: 14 }).map((_, i) => (
              <rect
                key={`star-${i}`}
                x={((i * 53) % W) + 4}
                y={((i * 27) % wallEnd) + 4}
                width={2}
                height={2}
                fill="#FFE873"
                opacity={0.9}
              />
            ))
          : null}
        {/* Window — content depends on theme */}
        <g>
          <rect x={W * 0.18} y={wallEnd * 0.25} width={36} height={26} fill={theme.windowKind === "ocean" ? "#5BAEEA" : theme.windowKind === "forest" ? "#A8D08C" : theme.windowKind === "space" ? "#0E0B25" : "#9CC9E5"} />
          {theme.windowKind === "house" ? (
            <>
              {/* sky + tiny cloud */}
              <rect x={W * 0.18 + 4} y={wallEnd * 0.25 + 6} width={10} height={3} fill="#FFFFFF" opacity={0.8} />
            </>
          ) : theme.windowKind === "forest" ? (
            <>
              {/* tiny tree silhouette in window */}
              <rect x={W * 0.18 + 17} y={wallEnd * 0.25 + 14} width={2} height={10} fill="#5B3A1F" />
              <rect x={W * 0.18 + 13} y={wallEnd * 0.25 + 6} width={10} height={10} fill="#4A8E47" />
            </>
          ) : theme.windowKind === "ocean" ? (
            <>
              {/* horizon + sun */}
              <rect x={W * 0.18} y={wallEnd * 0.25 + 14} width={36} height={12} fill="#3F86C0" />
              <rect x={W * 0.18 + 24} y={wallEnd * 0.25 + 6} width={6} height={6} fill="#FFE873" />
            </>
          ) : (
            <>
              {/* stars */}
              <rect x={W * 0.18 + 6} y={wallEnd * 0.25 + 6} width={2} height={2} fill="#FFE873" />
              <rect x={W * 0.18 + 16} y={wallEnd * 0.25 + 12} width={2} height={2} fill="#FFE873" />
              <rect x={W * 0.18 + 26} y={wallEnd * 0.25 + 8} width={2} height={2} fill="#FFFFFF" />
            </>
          )}
          <rect x={W * 0.18} y={wallEnd * 0.25} width={36} height={26} fill="none" stroke="#7B5234" strokeWidth={2} />
          <line x1={W * 0.18 + 18} y1={wallEnd * 0.25} x2={W * 0.18 + 18} y2={wallEnd * 0.25 + 26} stroke="#7B5234" strokeWidth={1} />
          <line x1={W * 0.18} y1={wallEnd * 0.25 + 13} x2={W * 0.18 + 36} y2={wallEnd * 0.25 + 13} stroke="#7B5234" strokeWidth={1} />
        </g>
        {/* Picture frame */}
        <g>
          <rect x={W * 0.66} y={wallEnd * 0.28} width={28} height={20} fill="#FFFFFF" />
          <rect x={W * 0.66} y={wallEnd * 0.28} width={28} height={20} fill="none" stroke="#7B5234" strokeWidth={2} />
          <rect x={W * 0.66 + 4} y={wallEnd * 0.28 + 4} width={20} height={6} fill="#F2C84B" opacity={0.7} />
          <rect x={W * 0.66 + 4} y={wallEnd * 0.28 + 12} width={12} height={4} fill="#F08FA9" opacity={0.7} />
        </g>
        {/* Baseboard */}
        <rect x={0} y={wallEnd - 6} width={W} height={6} fill={theme.wallTrim} />
        <rect x={0} y={wallEnd - 8} width={W} height={2} fill={theme.floorLine} opacity={0.5} />

        {/* Floor */}
        <rect x={0} y={wallEnd} width={W} height={floorEnd - wallEnd} fill={theme.floor} />
        {Array.from({ length: 4 }).map((_, i) => (
          <rect
            key={`plank-${i}`}
            x={0}
            y={wallEnd + (i + 1) * ((floorEnd - wallEnd) / 5)}
            width={W}
            height={1}
            fill={theme.floorLine}
            opacity={0.42}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => {
          const planks = 5;
          const yi = (i % (planks - 1)) + 1;
          const xi = Math.floor(i / (planks - 1)) + 1;
          const y = wallEnd + yi * ((floorEnd - wallEnd) / planks);
          const x = xi * (W / 5) + (yi % 2 ? 0 : W / 10);
          return (
            <rect key={`joint-${i}`} x={x} y={y - 7} width={1} height={7} fill={theme.floorLine} opacity={0.36} />
          );
        })}
        <rect x={0} y={wallEnd} width={W} height={floorEnd - wallEnd} fill="url(#floor-grad)" opacity={0.18} />
        <defs>
          <linearGradient id="floor-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      {/* Furniture HTML overlays — z-index from y, long-press drag in
          placement mode. The pet wrapper sets pointerEvents:none in
          placement mode so back-row furniture stays selectable. */}
      {!activeScene &&
        furniture.map((id) => {
          const placement = FURNITURE_PLACEMENTS[id];
          const icon: ItemIconRender | undefined = ITEM_ICONS[id];
          if (!placement || !icon) return null;
          const userPos = furniturePositions?.[id];
          const baseFx = userPos?.x ?? placement.x;
          const baseFy = userPos?.y ?? placement.y;
          const fx = dragId === id && dragPos ? dragPos.x : baseFx;
          const fy = dragId === id && dragPos ? dragPos.y : baseFy;
          const sizePx = (placement.size / 100) * W;
          const cols = Math.max(...icon.grid.map((r) => r.length));
          const px = sizePx / cols;
          const leftPx = (fx / 100) * W - sizePx / 2;
          const bottomPx = (1 - fy / 100) * floorDepth + 2;
          const isSelected = placementMode && selectedFurniture === id;
          const isDragging = dragId === id;
          return (
            <div
              key={`furn-${id}`}
              onPointerDown={(e) => {
                if (!placementMode) return;
                e.stopPropagation();
                const containerEl = e.currentTarget.parentElement as HTMLDivElement;
                const rect = containerEl.getBoundingClientRect();
                const startCursorX = e.clientX - rect.left;
                const startCursorY = e.clientY - rect.top;
                cancelLongPress();
                longPressTimerRef.current = window.setTimeout(() => {
                  dragStartRef.current = {
                    id,
                    startCursorX,
                    startCursorY,
                    startFx: baseFx,
                    startFy: baseFy,
                  };
                  dragPosRef.current = { x: baseFx, y: baseFy };
                  setDragId(id);
                  setDragPos({ x: baseFx, y: baseFy });
                  onSelectFurniture?.(id);
                }, 220);
              }}
              style={{
                position: "absolute",
                left: leftPx,
                bottom: bottomPx,
                width: sizePx,
                height: sizePx,
                zIndex: isDragging ? 9999 : Math.round(fy * 10),
                pointerEvents: placementMode ? "auto" : "none",
                cursor: placementMode ? (isDragging ? "grabbing" : "grab") : "default",
                outline: isSelected ? "2px dashed #C68748" : "none",
                outlineOffset: 2,
                borderRadius: 4,
                background: isSelected ? "rgba(244,192,122,0.25)" : "transparent",
                transition: isDragging
                  ? "none"
                  : "left 200ms ease-out, bottom 200ms ease-out",
                touchAction: "none",
                transform: isDragging ? "scale(1.08)" : "none",
                filter: isDragging ? "drop-shadow(0 4px 6px rgba(0,0,0,0.25))" : "none",
              }}
            >
              <svg viewBox={`0 0 ${cols * px} ${icon.grid.length * px}`} width="100%" height="100%" style={{ display: "block" }}>
                {gridRects(icon.grid, icon.resolve, px, 0, 0, `furn-${id}`)}
              </svg>
            </div>
          );
        })}

      {/* ── Scene overlays (bath/park/dark) — rendered BEFORE the pet
          so the pet stays visible on top of the new background. ── */}
      {activeScene && SCENES[activeScene].overlay !== "none" ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              SCENES[activeScene].overlay === "bath"
                ? "linear-gradient(180deg, #BDE5F4 0%, #BDE5F4 50%, #8BC8E0 50%, #8BC8E0 100%)"
                : SCENES[activeScene].overlay === "park"
                ? "linear-gradient(180deg, #8FC9F0 0%, #8FC9F0 60%, #76C172 60%, #5DAB5A 100%)"
                : SCENES[activeScene].overlay === "dark"
                ? "linear-gradient(180deg, rgba(20,15,55,0.55) 0%, rgba(10,8,35,0.7) 100%)"
                : "transparent",
            animation: "scene-fade-in 0.35s ease-out",
          }}
        >
          {SCENES[activeScene].overlay === "bath" ? (
            // Simple white-on-blue tile pattern.
            <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <line key={`bv-${i}`} x1={(i + 1) * 32} y1={0} x2={(i + 1) * 32} y2={200} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.55} />
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <line key={`bh-${i}`} x1={0} y1={(i + 1) * 28} x2={320} y2={(i + 1) * 28} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.55} />
              ))}
              {/* shower head silhouette */}
              <rect x={150} y={4} width={20} height={6} fill="#7C9DB4" />
              <rect x={154} y={10} width={12} height={3} fill="#7C9DB4" />
            </svg>
          ) : null}
          {SCENES[activeScene].overlay === "park" ? (
            <>
              {/* ── Sun (just a circle, no rays) ── */}
              <div
                style={{
                  position: "absolute",
                  right: 18,
                  top: 18,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#FFE873",
                  border: "1.5px solid #F2C84B",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />

              {/* ── Clouds (3) ── */}
              {[
                { left: "10%", top: 16, w: 42, h: 13 },
                { left: "40%", top: 24, w: 36, h: 12 },
                { left: "65%", top: 12, w: 28, h: 10 },
              ].map((c, i) => (
                <div
                  key={`cloud-${i}`}
                  style={{
                    position: "absolute",
                    left: c.left,
                    top: c.top,
                    width: c.w,
                    height: c.h,
                    borderRadius: c.h / 2,
                    background: "#FFFFFF",
                    opacity: 0.92,
                    pointerEvents: "none",
                    animation: `cloud-drift 6s ease-in-out infinite alternate ${i * 0.7}s`,
                    zIndex: 2,
                  }}
                />
              ))}

              {/* ── Fence — along front, bottom anchored ── */}
              <svg
                viewBox="0 0 320 22"
                width="100%"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  height: 22,
                  pointerEvents: "none",
                  zIndex: 7,
                }}
              >
                <rect x="0" y="6" width="320" height="2" fill="#FFFFFF" />
                <rect x="0" y="14" width="320" height="2" fill="#FFFFFF" />
                {Array.from({ length: 14 }).map((_, i) => (
                  <rect key={`fence-${i}`} x={i * 24 + 4} y={0} width={3} height={22} fill="#FFFFFF" />
                ))}
              </svg>

              {/* ── Flowers scattered on grass — bottom anchored ── */}
              {[
                { left: "16%", bottom: 38, color: "#E76A6A" },
                { left: "26%", bottom: 30, color: "#FFE873" },
                { left: "44%", bottom: 36, color: "#F4A6BC" },
                { left: "56%", bottom: 28, color: "#E76A6A" },
                { left: "64%", bottom: 40, color: "#FFE873" },
                { left: "74%", bottom: 32, color: "#F4A6BC" },
                { left: "82%", bottom: 38, color: "#A878D0" },
                { left: "20%", bottom: 24, color: "#FFE873" },
                { left: "50%", bottom: 22, color: "#F4A6BC" },
                { left: "72%", bottom: 24, color: "#E76A6A" },
              ].map((f, i) => (
                <div
                  key={`flower-${i}`}
                  style={{
                    position: "absolute",
                    left: f.left,
                    bottom: f.bottom,
                    width: 7,
                    pointerEvents: "none",
                    zIndex: 8,
                  }}
                >
                  {/* petals on top */}
                  <div style={{ position: "relative", width: 7, height: 7 }}>
                    <div style={{ position: "absolute", left: 2, top: 0, width: 3, height: 3, borderRadius: "50%", background: f.color }} />
                    <div style={{ position: "absolute", left: 0, top: 2, width: 3, height: 3, borderRadius: "50%", background: f.color }} />
                    <div style={{ position: "absolute", left: 4, top: 2, width: 3, height: 3, borderRadius: "50%", background: f.color }} />
                    <div style={{ position: "absolute", left: 2, top: 4, width: 3, height: 3, borderRadius: "50%", background: f.color }} />
                    <div style={{ position: "absolute", left: 2, top: 2, width: 3, height: 3, borderRadius: "50%", background: "#FFE873" }} />
                  </div>
                  {/* stem hanging down from petals */}
                  <div style={{ width: 1, height: 6, background: "#3D8B3D", marginLeft: 3 }} />
                </div>
              ))}

              {/* ── Butterfly — flies at pet head height ── */}
              <div
                style={{
                  position: "absolute",
                  left: "-8%",
                  top: "55%",
                  width: 16,
                  height: 12,
                  pointerEvents: "none",
                  zIndex: 9,
                  animation: "butterfly-fly 7s linear infinite",
                }}
              >
                <div style={{ animation: "butterfly-wings 0.18s ease-in-out infinite" }}>
                  <svg viewBox="0 0 16 12" width="16" height="12" style={{ display: "block" }}>
                    <ellipse cx="5" cy="5" rx="3.5" ry="3" fill="#F4A6BC" stroke="#A03B5A" strokeWidth="0.4" />
                    <ellipse cx="11" cy="5" rx="3.5" ry="3" fill="#F4A6BC" stroke="#A03B5A" strokeWidth="0.4" />
                    <ellipse cx="5" cy="9" rx="2.5" ry="2" fill="#F4A6BC" stroke="#A03B5A" strokeWidth="0.4" />
                    <ellipse cx="11" cy="9" rx="2.5" ry="2" fill="#F4A6BC" stroke="#A03B5A" strokeWidth="0.4" />
                    <rect x="7.5" y="3" width="1" height="7" fill="#3A1F1F" />
                  </svg>
                </div>
              </div>

              {/* ── Grass blades — small rects on the ground ── */}
              <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
                {Array.from({ length: 30 }).map((_, i) => {
                  const x = (i * 11) + (i % 2 ? 2 : 0);
                  const baseY = 130 + (i % 5) * 12;
                  return <rect key={`g-${i}`} x={x} y={baseY} width={2} height={6} fill="#4A8E47" />;
                })}
              </svg>
            </>
          ) : null}
          {SCENES[activeScene].overlay === "dark" ? (
            // No moon inside the room — just the dark overlay (per user).
            null
          ) : null}
        </div>
      ) : null}

      {/* Pet — HTML overlay so we can freely transition position +
          z-sort against furniture. In placement mode, pointerEvents
          is disabled so back-row furniture stays selectable. */}
      <div
        style={{
          position: "absolute",
          left: `${petLeftPct}%`,
          bottom: (1 - posY) * floorDepth + 4,
          width: petSize,
          height: petSize,
          marginLeft: -petSize / 2,
          transform: `scaleX(${facing === "right" ? 1 : -1})`,
          transition: walkDuration > 0
            ? `left ${walkDuration}ms ease-in-out, bottom ${walkDuration}ms ease-in-out`
            : "bottom 400ms ease-out",
          willChange: "transform, left, bottom",
          zIndex: Math.round(posY * 1000) + 1,
          pointerEvents: placementMode ? "none" : "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            animation: innerAnim,
            transformOrigin: "50% 90%",
          }}
        >
          <svg
            viewBox={`0 0 ${SPRITE_GRID} ${SPRITE_GRID}`}
            width="100%"
            height="100%"
            shapeRendering="crispEdges"
            style={{ display: "block" }}
          >
            {useFilter ? (
              <defs>
                <filter id={`pf-${type}-${stage}-${hue}-${glow ? 1 : 0}`} x="-20%" y="-20%" width="140%" height="140%">
                  {hue !== 0 && <feColorMatrix type="hueRotate" values={String(hue)} />}
                  {glow && (
                    <>
                      <feGaussianBlur stdDeviation="0.4" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </>
                  )}
                </filter>
              </defs>
            ) : null}
            <g filter={useFilter ? `url(#pf-${type}-${stage}-${hue}-${glow ? 1 : 0})` : undefined}>
              {gridRects(sprite, (c) => pixelColor(c, palette), 1, 0, 0, "pet-body")}
              {/* Blink overlay — paints over the eye band with primary color */}
              {blink && !isEgg
                ? gridRects(BLINK_OVERLAY, (c) => pixelColor(c, palette), 1, 0, 0, "blink")
                : null}
            </g>
            {/* Accessories */}
            {(["cape", "wings", "scarf", "necklace", "bell", "ribbon", "hat", "crown", "glasses"] as ItemId[])
              .filter((id) => accessories.includes(id))
              .map((id) => {
                const grid = ACCESSORY_SPRITES[id];
                if (!grid) return null;
                return <g key={id}>{gridRects(grid, accessoryColor, 1, 0, 0, `acc-${id}`)}</g>;
              })}
            {mood === "sad" ? (
              <g>
                <rect x={5} y={11} width={1} height={1} fill="#1A1A1A" />
                <rect x={6} y={11} width={1} height={1} fill="#1A1A1A" />
                <rect x={7} y={11} width={1} height={1} fill="#1A1A1A" />
                <rect x={4} y={12} width={1} height={1} fill="#1A1A1A" />
                <rect x={8} y={12} width={1} height={1} fill="#1A1A1A" />
              </g>
            ) : null}
          </svg>
        </div>
      </div>

      {/* ── Scene prop (bowl, ball, hand, cookie, hurdle) ── */}
      {activeScene && SCENES[activeScene].prop ? (
        <ScenePropView
          scene={SCENES[activeScene]}
          petLeftPct={petLeftPct}
          petBottom={petBottom}
          petSize={petSize}
        />
      ) : null}

      {/* ── Scene particles ── */}
      {activeScene ? (
        <SceneParticles
          scene={SCENES[activeScene]}
          petLeftPct={petLeftPct}
          petBottom={petBottom}
          petSize={petSize}
        />
      ) : null}

      {/* Reaction overlays — react absolute, anchored above the pet */}
      {reactionShown ? (
        <ReactionGlyph
          key={`r-${reactionShown.id}`}
          kind={reactionShown.kind}
          leftPct={petLeftPct}
          bottom={petBottom + petSize - 8}
        />
      ) : null}
    </div>
  );
}

// ── Scene helpers ────────────────────────────────────────────

function ScenePropView({
  scene,
  petLeftPct,
  petBottom,
  petSize,
}: {
  scene: typeof SCENES[SceneId];
  petLeftPct: number;
  petBottom: number;
  petSize: number;
}) {
  const propId = scene.prop?.sprite;
  if (!propId) return null;
  const sprite = SCENE_SPRITES[propId];
  if (!sprite) return null;

  const grid = sprite.grid;
  const cols = Math.max(...grid.map((r) => r.length));
  // size is now a fraction of pet size (0..1).
  const sizePx = scene.prop!.size * petSize;
  const px = sizePx / cols;
  const cells: React.ReactElement[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? "";
    for (let c = 0; c < row.length; c++) {
      const code = row[c]!;
      const fill = sprite.resolve(code);
      if (!fill) continue;
      cells.push(
        <rect key={`p-${r}-${c}`} x={c * px} y={r * px} width={px} height={px} fill={fill} shapeRendering="crispEdges" />,
      );
    }
  }

  // Hand sprite floats above pet — sways side-to-side (petting motion)
  if (scene.handAbovePet) {
    return (
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${petLeftPct}%`,
          // Hand hovers slightly above the pet's head — its fingers
          // dangle down toward the pet.
          bottom: petBottom + petSize - 14,
          width: sizePx,
          height: sizePx,
          marginLeft: -sizePx / 2,
          animation: "scene-fade-in 0.3s ease-out, scene-hand-pet 0.7s ease-in-out infinite 0.3s",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <svg viewBox={`0 0 ${cols * px} ${grid.length * px}`} width="100%" height="100%" style={{ display: "block" }}>
          {cells}
        </svg>
      </div>
    );
  }

  // Ball during play scene — bouncing animation
  const isPlayBall = scene.id === "play" && propId === "ball";

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: `${scene.prop!.x}%`,
        bottom: petBottom + (scene.prop!.floorOffset ?? 0),
        width: sizePx,
        height: sizePx,
        marginLeft: -sizePx / 2,
        animation: isPlayBall
          ? "scene-fade-in 0.3s ease-out, scene-ball-bounce 1.4s ease-in-out infinite"
          : "scene-fade-in 0.4s ease-out",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <svg viewBox={`0 0 ${cols * px} ${grid.length * px}`} width="100%" height="100%" style={{ display: "block" }}>
        {cells}
      </svg>
    </div>
  );
}

function SceneParticles({
  scene,
  petLeftPct,
  petBottom,
  petSize,
}: {
  scene: typeof SCENES[SceneId];
  petLeftPct: number;
  petBottom: number;
  petSize: number;
}) {
  const baseTop = petBottom + petSize - 12;
  const particles = useMemo(() => {
    // Spawn 4-6 particles staggered through the scene duration.
    const count = scene.particle === "drop" ? 7 : scene.particle === "zzz" ? 4 : 5;
    return Array.from({ length: count }).map((_, i) => ({
      delay: i * (scene.durationMs / (count * 1.4)),
      offsetX: scene.particle === "drop" ? (Math.random() * 80 - 40) : 0,
    }));
  }, [scene]);

  if (scene.particle === "drop") {
    return (
      <>
        {particles.map((p, i) => (
          <span
            key={`d-${scene.id}-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `calc(${petLeftPct}% + ${p.offsetX}px)`,
              top: 8,
              color: "#5BAEEA",
              fontSize: 16,
              animation: `scene-particle-fall 1.2s ease-in ${p.delay}ms infinite`,
              pointerEvents: "none",
              textShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}
          >
            💧
          </span>
        ))}
      </>
    );
  }
  if (scene.particle === "leaf") {
    return (
      <>
        {particles.map((_, i) => (
          <span
            key={`l-${scene.id}-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `${10 + (i * 18) % 80}%`,
              bottom: 30 + (i * 14) % 60,
              color: "#5DAB5A",
              fontSize: 14,
              animation: `scene-particle-drift 2.4s ease-in-out ${i * 280}ms infinite`,
              ["--drift-x" as any]: `${(i % 2 === 0 ? 1 : -1) * 30}px`,
              ["--drift-r" as any]: `${i * 30}deg`,
              pointerEvents: "none",
            }}
          >
            🍃
          </span>
        ))}
      </>
    );
  }
  if (scene.particle === "zzz") {
    return (
      <>
        {particles.map((_, i) => (
          <span
            key={`z-${scene.id}-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `calc(${petLeftPct}% + 22px)`,
              bottom: baseTop + 4,
              color: "#FFE873",
              fontSize: 16,
              fontWeight: 800,
              animation: `scene-zzz-rise 1.4s ease-out ${i * 600}ms infinite`,
              pointerEvents: "none",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            }}
          >
            z
          </span>
        ))}
      </>
    );
  }

  // heart / star / sparkle — floating up from pet
  const symbol = scene.particle === "heart" ? "♥" : scene.particle === "star" ? "★" : "✦";
  const color = scene.particle === "heart" ? "#F08FA9" : scene.particle === "star" ? "#F2C84B" : "#7AB7E4";
  return (
    <>
      {particles.map((p, i) => (
        <span
          key={`p-${scene.id}-${i}`}
          aria-hidden
          style={{
            position: "absolute",
            left: `calc(${petLeftPct}% + ${(i % 2 === 0 ? 1 : -1) * 14}px)`,
            bottom: baseTop,
            color,
            fontSize: 18,
            fontWeight: 800,
            animation: `scene-particle-up 1.4s ease-out ${p.delay}ms infinite`,
            pointerEvents: "none",
            textShadow: "0 1px 2px rgba(0,0,0,0.18)",
          }}
        >
          {symbol}
        </span>
      ))}
    </>
  );
}

function ReactionGlyph({
  kind,
  leftPct,
  bottom,
}: {
  kind: NonNullable<PetReaction>["kind"];
  leftPct: number;
  bottom: number;
}) {
  const symbol =
    kind === "sleep" ? "z"
      : kind === "clean" ? "✦"
      : kind === "play" ? "★"
      : "♥";
  const color =
    kind === "sleep" ? "#7E61D2"
      : kind === "clean" ? "#5BAEEA"
      : kind === "play" ? "#F2C84B"
      : "#F08FA9";
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        bottom,
        pointerEvents: "none",
        animation: "pet-heart-rise 1.4s ease-out forwards",
        color,
        fontSize: 22,
        fontWeight: 800,
        textShadow: "0 1px 2px rgba(0,0,0,0.18)",
      }}
    >
      {symbol}
    </span>
  );
}

export const PetRoom = memo(PetRoomInner);
