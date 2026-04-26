// PetRoom — game-feel "펫 방". Walls + wood floor + furniture + a
// state-machine-driven pet that idles, walks to random spots (5–10s
// cadence), occasionally sits, blinks every 2–3s, and faces its
// movement direction. Mirrored in dawnlight-app/src/components/PetRoom.tsx
// using react-native-reanimated.

"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  ACCESSORY_SPRITES,
  accessoryColor,
  BACKGROUND_SPRITES,
  backgroundColor,
  BLINK_OVERLAY,
  EGG_SPRITE,
  FURNITURE_PLACEMENTS,
  ITEM_ICONS,
  pixelColor,
  ROOM_FLOOR_COLOR,
  ROOM_FLOOR_LINE,
  ROOM_WALL_COLOR,
  ROOM_WALL_DECOR,
  ROOM_WALL_TRIM,
  spriteFor,
  STAGE_BEHAVIOR,
  type ItemIconRender,
  type PixelGrid,
} from "@/src/lib/petArt";
import {
  PET_PALETTE,
  type BackgroundId,
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

type Mode = "idle" | "walking" | "sitting";

type Props = {
  type: PetType;
  stage: PetStage;
  accessories?: ItemId[];
  furniture?: ItemId[];
  background?: BackgroundId;
  mood?: PetMood;
  glow?: boolean;
  hue?: number;
  reaction?: PetReaction;
  height?: number; // px tall; width fills container
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
  background = "none",
  mood = "happy",
  glow = false,
  hue = 0,
  reaction = null,
  height = 280,
}: Props) {
  const palette = PET_PALETTE[type];
  const sprite = stage === "egg" ? EGG_SPRITE : spriteFor(type, stage);
  const useFilter = hue !== 0 || glow;

  // Logical viewBox for the room SVG. Pet is rendered as an HTML div
  // overlaid via percentage positioning so it can be freely repositioned
  // via CSS transitions (we don't pin it to viewBox coords).
  const W = 320;
  const H = height;
  const wallEnd = H * 0.62;
  const floorEnd = H;
  const showOutdoor = background !== "none" && BACKGROUND_SPRITES[background];

  // Pet sizing — 70% of previous (140 → 98) so furniture has room.
  const petSize = Math.min(98, Math.max(68, Math.round(H * 0.35)));
  const petBottom = 12;
  const isEgg = stage === "egg";
  const behavior = STAGE_BEHAVIOR[stage];

  // ── State machine ──
  const [mode, setMode] = useState<Mode>("idle");
  const [posPct, setPosPct] = useState(0); // -1..1 within walking range
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [blink, setBlink] = useState(false);
  const walkDurRef = useRef(0);

  // Behaviour scheduler — every stage moves now (egg rolls!).
  useEffect(() => {
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
        if (r < behavior.sitChance) {
          setMode("sitting");
          window.setTimeout(() => {
            if (!cancelled) setMode("idle");
          }, 3000 + Math.random() * 2000);
        } else if (r < behavior.sitChance + behavior.walkChance) {
          const next = (Math.random() * 2 - 1) * 0.85;
          const distance = Math.abs(next - posPct);
          const dur = Math.max(behavior.walkDurMin, distance * behavior.walkDurPerUnit);
          walkDurRef.current = dur;
          setFacing(next > posPct ? "right" : "left");
          setMode("walking");
          setPosPct(next);
          window.setTimeout(() => {
            if (!cancelled) setMode("idle");
          }, dur + 80);
        }
        // else: stay idle (re-runs scheduler via effect dependency on mode/posPct)
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
  const walkDuration = mode === "walking" ? walkDurRef.current : 0;

  // Stage-specific animation selection
  const swayKeyframe =
    stage === "egg" ? "pet-roll-sway"
    : stage === "baby" ? "pet-waddle-sway"
    : stage === "teen" ? "pet-walk-sway-active"
    : "pet-walk-sway";
  const idleKeyframe = behavior.idleBouncy ? "pet-bob-egg" : "pet-bob";

  const innerAnim =
    mode === "walking"
      ? `${swayKeyframe} ${behavior.swayDuration}ms ease-in-out infinite`
      : mode === "sitting"
      ? "pet-sit 1.2s ease-in-out infinite"
      : `${idleKeyframe} ${behavior.bobDuration}ms ease-in-out infinite`;

  // Pet horizontal range: 18%..82% of container (leaves margin so the
  // sprite never crosses the edge).
  const petLeftPct = 50 + posPct * 32;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: H,
        overflow: "hidden",
        borderRadius: 16,
        boxShadow: "inset 0 0 0 1px #E0CFB8, 0 4px 12px rgba(91,58,31,0.10)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block", position: "absolute", inset: 0 }}
      >
        {/* Background */}
        {showOutdoor ? (
          gridRects(
            BACKGROUND_SPRITES[background as Exclude<BackgroundId, "none">],
            backgroundColor,
            Math.max(W, H) / SPRITE_GRID,
            0,
            0,
            "outdoor",
          )
        ) : (
          <>
            {/* Wall */}
            <rect x={0} y={0} width={W} height={wallEnd} fill={ROOM_WALL_COLOR} />
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={`stripe-${i}`}
                x={(i + 0.5) * (W / 8) - 0.5}
                y={0}
                width={1}
                height={wallEnd}
                fill={ROOM_WALL_DECOR}
                opacity={0.3}
              />
            ))}
            {/* Window decoration on the wall */}
            <g opacity={0.85}>
              <rect x={W * 0.18} y={wallEnd * 0.25} width={36} height={26} fill="#9CC9E5" />
              <rect x={W * 0.18} y={wallEnd * 0.25} width={36} height={26} fill="none" stroke="#7B5234" strokeWidth={2} />
              <line x1={W * 0.18 + 18} y1={wallEnd * 0.25} x2={W * 0.18 + 18} y2={wallEnd * 0.25 + 26} stroke="#7B5234" strokeWidth={1} />
              <line x1={W * 0.18} y1={wallEnd * 0.25 + 13} x2={W * 0.18 + 36} y2={wallEnd * 0.25 + 13} stroke="#7B5234" strokeWidth={1} />
            </g>
            {/* Picture frame on the wall */}
            <g>
              <rect x={W * 0.66} y={wallEnd * 0.28} width={28} height={20} fill="#FFFFFF" />
              <rect x={W * 0.66} y={wallEnd * 0.28} width={28} height={20} fill="none" stroke="#7B5234" strokeWidth={2} />
              <rect x={W * 0.66 + 4} y={wallEnd * 0.28 + 4} width={20} height={6} fill="#F2C84B" opacity={0.7} />
              <rect x={W * 0.66 + 4} y={wallEnd * 0.28 + 12} width={12} height={4} fill="#F08FA9" opacity={0.7} />
            </g>
            {/* Wall trim (baseboard) */}
            <rect x={0} y={wallEnd - 6} width={W} height={6} fill={ROOM_WALL_TRIM} />
            <rect x={0} y={wallEnd - 8} width={W} height={2} fill={ROOM_FLOOR_LINE} opacity={0.5} />

            {/* Floor */}
            <rect x={0} y={wallEnd} width={W} height={floorEnd - wallEnd} fill={ROOM_FLOOR_COLOR} />
            {/* Plank lines */}
            {Array.from({ length: 4 }).map((_, i) => (
              <rect
                key={`plank-${i}`}
                x={0}
                y={wallEnd + (i + 1) * ((floorEnd - wallEnd) / 5)}
                width={W}
                height={1}
                fill={ROOM_FLOOR_LINE}
                opacity={0.42}
              />
            ))}
            {/* Plank short joints */}
            {Array.from({ length: 12 }).map((_, i) => {
              const planks = 5;
              const yi = (i % (planks - 1)) + 1;
              const xi = Math.floor(i / (planks - 1)) + 1;
              const y = wallEnd + yi * ((floorEnd - wallEnd) / planks);
              const x = xi * (W / 5) + (yi % 2 ? 0 : W / 10);
              return (
                <rect
                  key={`joint-${i}`}
                  x={x}
                  y={y - 7}
                  width={1}
                  height={7}
                  fill={ROOM_FLOOR_LINE}
                  opacity={0.36}
                />
              );
            })}
            {/* Floor shadow gradient — adds depth */}
            <rect
              x={0}
              y={wallEnd}
              width={W}
              height={floorEnd - wallEnd}
              fill="url(#floor-grad)"
              opacity={0.18}
            />
            <defs>
              <linearGradient id="floor-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000000" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </linearGradient>
            </defs>
          </>
        )}

        {/* Furniture */}
        {!showOutdoor &&
          furniture.map((id) => {
            const placement = FURNITURE_PLACEMENTS[id];
            const icon: ItemIconRender | undefined = ITEM_ICONS[id];
            if (!placement || !icon) return null;
            const sizePx = (placement.size / 100) * W;
            const cols = Math.max(...icon.grid.map((r) => r.length));
            const px = sizePx / cols;
            const cx = (placement.x / 100) * W;
            const cy = floorEnd - placement.y - sizePx - 4;
            return (
              <g key={`furn-${id}`} transform={`translate(${cx - sizePx / 2} ${cy})`}>
                {gridRects(icon.grid, icon.resolve, px, 0, 0, `furn-${id}`)}
              </g>
            );
          })}
      </svg>

      {/* Pet — HTML overlay so we can freely transition position */}
      <div
        style={{
          position: "absolute",
          left: `${petLeftPct}%`,
          bottom: petBottom,
          width: petSize,
          height: petSize,
          marginLeft: -petSize / 2,
          transform: `scaleX(${facing === "right" ? 1 : -1})`,
          transition: walkDuration > 0 ? `left ${walkDuration}ms ease-in-out` : "none",
          willChange: "transform, left",
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
