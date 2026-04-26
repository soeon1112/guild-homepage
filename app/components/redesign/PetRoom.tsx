// PetRoom — game-feel "펫 방" stage. Renders walls + floor (or
// purchased outdoor background), placed furniture, and the animated
// pet sprite walking across the room. Also exposes a brief "react"
// animation triggered after an interaction (bounce + heart particles
// for happy ones, zZ for sleep, sparkle for clean, etc).
//
// Mirrored in dawnlight-app/src/components/PetRoom.tsx using
// react-native-reanimated for the animations.

"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  ACCESSORY_SPRITES,
  accessoryColor,
  BACKGROUND_SPRITES,
  backgroundColor,
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
  height = 200,
}: Props) {
  const palette = PET_PALETTE[type];
  const sprite = stage === "egg" ? EGG_SPRITE : spriteFor(type, stage);
  const wallH = 0.55; // wall top portion

  // Stable layout in viewBox coords. We fix the canvas at 320×200
  // logical units and let the parent <svg> scale via width=100%.
  const W = 320;
  const H = 200;
  const wallEnd = H * wallH;
  const floorEnd = H;

  const showOutdoor = background !== "none" && BACKGROUND_SPRITES[background];

  // Pet drawn at logical 64×64 (4× the 16-px sprite). Walks within
  // [PET_MIN_X, PET_MAX_X]. CSS animation handles the actual motion.
  const petSize = 64;
  const petY = floorEnd - petSize - 6; // sit on floor with a 6px tuck

  const filterId = `pet-room-filter-${hue}-${glow ? 1 : 0}`;
  const useFilter = hue !== 0 || glow;

  // Reaction state + effect overlays
  const reactionKey = useReactionKey(reaction);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
        overflow: "hidden",
        borderRadius: 12,
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
        {useFilter ? (
          <defs>
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              {hue !== 0 && <feColorMatrix type="hueRotate" values={String(hue)} />}
              {glow && (
                <>
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </>
              )}
            </filter>
          </defs>
        ) : null}

        {/* Background — outdoor scene OR room walls/floor */}
        {showOutdoor ? (
          // Stretch the 16×16 outdoor sprite over the entire canvas.
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
            {/* Wall vertical decoration stripes */}
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={`wall-stripe-${i}`}
                x={(i + 0.5) * (W / 8) - 0.5}
                y={0}
                width={1}
                height={wallEnd}
                fill={ROOM_WALL_DECOR}
                opacity={0.35}
              />
            ))}
            {/* Wall trim (baseboard top) */}
            <rect x={0} y={wallEnd - 4} width={W} height={4} fill={ROOM_WALL_TRIM} />
            <rect x={0} y={wallEnd - 6} width={W} height={2} fill={ROOM_FLOOR_LINE} opacity={0.45} />

            {/* Floor */}
            <rect x={0} y={wallEnd} width={W} height={floorEnd - wallEnd} fill={ROOM_FLOOR_COLOR} />
            {/* Floor planks */}
            {Array.from({ length: 4 }).map((_, i) => (
              <rect
                key={`plank-${i}`}
                x={0}
                y={wallEnd + (i + 1) * ((floorEnd - wallEnd) / 5)}
                width={W}
                height={1}
                fill={ROOM_FLOOR_LINE}
                opacity={0.38}
              />
            ))}
          </>
        )}

        {/* Furniture (only in room mode — outdoors hides them) */}
        {!showOutdoor &&
          furniture.map((id) => {
            const placement = FURNITURE_PLACEMENTS[id];
            const icon: ItemIconRender | undefined = ITEM_ICONS[id];
            if (!placement || !icon) return null;
            const sizePx = (placement.size / 100) * W;
            const cols = Math.max(...icon.grid.map((r) => r.length));
            const px = sizePx / cols;
            const cx = (placement.x / 100) * W;
            const cy = floorEnd - placement.y - sizePx;
            return (
              <g key={`furn-${id}`} transform={`translate(${cx - sizePx / 2} ${cy})`}>
                {gridRects(icon.grid, icon.resolve, px, 0, 0, `furn-${id}`)}
              </g>
            );
          })}
      </svg>

      {/* Pet sprite — separate <div> so CSS animations can apply.
          The pet itself is in a wrapper that translates left↔right;
          inside, a bobbing wrapper handles the idle bounce. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: petY,
          width: petSize,
          height: petSize,
          marginLeft: -petSize / 2,
          animation:
            reactionKey?.kind === "play"
              ? "pet-react-bounce 0.7s ease-out 1"
              : "pet-walk 9s ease-in-out infinite",
          willChange: "transform",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            animation:
              reactionKey?.kind === "fed"
                ? "pet-react-bounce 0.7s ease-out 1"
                : "pet-bob 1.6s ease-in-out infinite",
          }}
        >
          <svg
            viewBox={`0 0 ${SPRITE_GRID} ${SPRITE_GRID}`}
            width="100%"
            height="100%"
            shapeRendering="crispEdges"
            style={{ display: "block", overflow: "visible" }}
          >
            {useFilter ? (
              <defs>
                <filter id={`pf-${hue}-${glow ? 1 : 0}`} x="-20%" y="-20%" width="140%" height="140%">
                  {hue !== 0 && <feColorMatrix type="hueRotate" values={String(hue)} />}
                  {glow && (
                    <>
                      <feGaussianBlur stdDeviation="0.5" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </>
                  )}
                </filter>
              </defs>
            ) : null}
            <g filter={useFilter ? `url(#pf-${hue}-${glow ? 1 : 0})` : undefined}>
              {gridRects(sprite, (c) => pixelColor(c, palette), 1, 0, 0, "pet-body")}
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
                <rect x={5} y={10} width={1} height={1} fill="#1A1A1A" />
                <rect x={6} y={10} width={1} height={1} fill="#1A1A1A" />
                <rect x={7} y={10} width={1} height={1} fill="#1A1A1A" />
                <rect x={4} y={11} width={1} height={1} fill="#1A1A1A" />
                <rect x={8} y={11} width={1} height={1} fill="#1A1A1A" />
              </g>
            ) : null}
          </svg>
        </div>
      </div>

      {/* Reaction overlays — heart, sparkle, zzz */}
      {reactionKey?.kind === "happy" || reactionKey?.kind === "fed" ? (
        <div
          key={`heart-${reactionKey.id}`}
          style={{
            position: "absolute",
            left: "50%",
            top: petY - 8,
            pointerEvents: "none",
            animation: "pet-heart-rise 1.2s ease-out forwards",
            color: "#F08FA9",
            fontSize: 18,
          }}
          aria-hidden
        >
          ♥
        </div>
      ) : null}
      {reactionKey?.kind === "clean" ? (
        <div
          key={`spark-${reactionKey.id}`}
          style={{
            position: "absolute",
            left: "50%",
            top: petY - 8,
            pointerEvents: "none",
            animation: "pet-shop-sparkle 1.1s ease-out forwards",
            color: "#5BAEEA",
            fontSize: 16,
          }}
          aria-hidden
        >
          ✦
        </div>
      ) : null}
      {reactionKey?.kind === "sleep" ? (
        <div
          key={`zzz-${reactionKey.id}`}
          style={{
            position: "absolute",
            left: "calc(50% + 16px)",
            top: petY - 4,
            pointerEvents: "none",
            animation: "pet-zzz-float 1.6s ease-out forwards",
            color: "#7E61D2",
            fontSize: 14,
            fontWeight: 700,
          }}
          aria-hidden
        >
          z
        </div>
      ) : null}
    </div>
  );
}

// Keys reactions so React replays the CSS animation on each new event.
function useReactionKey(reaction: PetReaction): (PetReaction & { id: number }) | null {
  const idRef = useRef(0);
  const [state, setState] = useState<(PetReaction & { id: number }) | null>(null);
  useEffect(() => {
    if (!reaction) return;
    idRef.current += 1;
    setState({ ...reaction, id: idRef.current } as any);
    const t = setTimeout(() => setState(null), 1600);
    return () => clearTimeout(t);
  }, [reaction]);
  return state;
}

export const PetRoom = memo(PetRoomInner);
