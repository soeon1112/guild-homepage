// PetSvg — renders a pet sprite + optional accessories + background.
// Mirrored in dawnlight-app/src/components/PetSvg.tsx using
// react-native-svg primitives (same data source: src/lib/petArt.ts).
//
// Theme-independent: every color is a literal hex from the pet
// palette, accessory map, or background map. No theme tokens.

"use client";

import { memo, useEffect, useState, type ReactElement } from "react";
import {
  ACCESSORY_SPRITES,
  accessoryColor,
  BACKGROUND_SPRITES,
  backgroundColor,
  EGG_SPRITE,
  ITEM_ICONS,
  pixelColor,
  SPARKLE_FRAMES,
  sparkleColor,
  spriteCols,
  spriteFor,
  type AccessoryGrid,
  type BackgroundGrid,
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

const ACCESSORY_CANVAS = 16; // overlay sprites are still 16×16
const SPARKLE_INTERVAL_MS = 420;

type PetSvgProps = {
  type: PetType;
  stage: PetStage;
  size?: number;
  accessories?: ItemId[];
  background?: BackgroundId;
  mood?: PetMood;
  glow?: boolean;
  hue?: number; // 0..360 dye hue rotation (legacy)
  bodyColor?: string | null; // overrides PET_PALETTE.primary if set
};

function renderGrid(
  grid: PixelGrid | AccessoryGrid | BackgroundGrid,
  resolve: (code: string) => string | null,
  pixelSize: number,
  keyPrefix: string,
) {
  const rects: ReactElement[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? "";
    for (let c = 0; c < row.length; c++) {
      const code = row[c]!;
      const fill = resolve(code);
      if (!fill) continue;
      rects.push(
        <rect
          key={`${keyPrefix}-${r}-${c}`}
          x={c * pixelSize}
          y={r * pixelSize}
          width={pixelSize}
          height={pixelSize}
          fill={fill}
          shapeRendering="crispEdges"
        />,
      );
    }
  }
  return rects;
}

function PetSvgInner({
  type,
  stage,
  size = 96,
  accessories = [],
  background = "none",
  mood = "happy",
  glow = false,
  hue = 0,
  bodyColor = null,
}: PetSvgProps) {
  const basePalette = PET_PALETTE[type];
  // Body-only dye: replace primary while keeping secondary/accent/etc.
  const palette = bodyColor ? { ...basePalette, primary: bodyColor } : basePalette;
  const sprite = stage === "egg" ? EGG_SPRITE : spriteFor(type, stage);
  // Adult sprites are drawn at 32×32 — body cell pixel-size is derived
  // from the grid so the body fits the same display rect at any res.
  const bodyPx = size / spriteCols(sprite);
  const overlayPx = size / ACCESSORY_CANVAS;
  const sparklePx = size / spriteCols(SPARKLE_FRAMES[0]!);

  // Egg uses primary tint via the palette resolver too.
  const petResolve = (code: string) => pixelColor(code, palette);

  const filterId = `pet-filter-${type}-${stage}-${hue}`;
  const useFilter = hue !== 0 || glow;

  // Adult-only twinkle: tiny sparkle in different corners cycling.
  // Each instance starts at a random frame so multiple pets desync.
  const [sparkleFrame, setSparkleFrame] = useState(() =>
    Math.floor(Math.random() * SPARKLE_FRAMES.length),
  );
  useEffect(() => {
    if (stage !== "adult") return;
    const id = setInterval(() => {
      setSparkleFrame((f) => (f + 1) % SPARKLE_FRAMES.length);
    }, SPARKLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stage]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${type} ${stage}`}
      style={{ display: "block" }}
    >
      {useFilter ? (
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            {hue !== 0 && (
              <feColorMatrix
                type="hueRotate"
                values={String(hue)}
              />
            )}
            {glow && (
              <>
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </>
            )}
          </filter>
        </defs>
      ) : null}

      {/* Background layer (always drawn first) */}
      {background !== "none" && BACKGROUND_SPRITES[background]
        ? renderGrid(BACKGROUND_SPRITES[background], backgroundColor, overlayPx, "bg")
        : null}

      {/* Behind-pet accessories (cape + wings drape behind the body so the
          pet itself stays in front). Always render — equipping is the
          user's choice; we don't gate by stage. */}
      {(["cape", "wings"] as ItemId[])
        .filter((id) => accessories.includes(id))
        .map((id) => {
          const grid = ACCESSORY_SPRITES[id];
          if (!grid) return null;
          return (
            <g key={id}>{renderGrid(grid, accessoryColor, overlayPx, `acc-${id}`)}</g>
          );
        })}

      {/* Pet sprite */}
      <g filter={useFilter ? `url(#${filterId})` : undefined}>
        {renderGrid(sprite, petResolve, bodyPx, "pet")}
      </g>

      {/* Front-pet accessories — head/neck items (scarf, necklace, bell,
          ribbon, hat, crown, glasses). */}
      {(["scarf", "necklace", "bell", "ribbon", "hat", "crown", "glasses"] as ItemId[])
        .filter((id) => accessories.includes(id))
        .map((id) => {
          const grid = ACCESSORY_SPRITES[id];
          if (!grid) return null;
          return (
            <g key={id}>{renderGrid(grid, accessoryColor, overlayPx, `acc-${id}`)}</g>
          );
        })}

      {/* Sad mouth overlay if mood is sad */}
      {mood === "sad"
        ? renderGrid(
            // Inline tiny sad mouth grid to avoid pulling another export.
            [
              "................",
              "................",
              "................",
              "................",
              "................",
              "................",
              "................",
              "................",
              "................",
              "................",
              ".....BBB........",
              "....B...B.......",
              "................",
              "................",
              "................",
              "................",
            ],
            (c) => (c === "B" ? "#1A1A1A" : null),
            overlayPx,
            "sad",
          )
        : null}

      {/* Adult-only sparkle decoration */}
      {stage === "adult" && SPARKLE_FRAMES[sparkleFrame]
        ? renderGrid(SPARKLE_FRAMES[sparkleFrame]!, sparkleColor, sparklePx, "spk")
        : null}
    </svg>
  );
}

export const PetSvg = memo(PetSvgInner);

// ── Item icon (shop grid) ────────────────────────────────────
// Memoized — `id` and `size` are stable in nearly all call sites
// (literal props), so the rect-grid renders once per item icon and
// skip on subsequent parent re-renders.
export const ItemIconSvg = memo(function ItemIconSvg({
  id,
  size = 36,
}: {
  id: ItemId;
  size?: number;
}) {
  const data: ItemIconRender = ITEM_ICONS[id];
  // Item icons are 12-wide — auto-scale.
  const grid = data.grid;
  const cols = Math.max(...grid.map((r) => r.length));
  const px = size / cols;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`item-${id}`}
      style={{ display: "block" }}
    >
      {renderGrid(grid, data.resolve, px, `item-${id}`)}
    </svg>
  );
});
