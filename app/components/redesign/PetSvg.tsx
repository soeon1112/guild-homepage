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
  eggMoodOverlay,
  eggMoodOverlayColor,
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

// Three staggered "+ shape" sparkles — egg-stage happy effect. CSS
// keyframe `egg-sparkle-blink` handles each sparkle's opacity cycle;
// per-element `animation-delay` shifts them so the screen always has
// 1–2 visible sparkles instead of all blinking in lockstep.
export function EggHappySparkles({ overlayPx }: { overlayPx: number }) {
  return (
    <>
      <g className="egg-sparkle" style={{ animationDelay: "0s" }}>
        {plusShape(3, 2, overlayPx, "a")}
      </g>
      <g className="egg-sparkle" style={{ animationDelay: "0.5s" }}>
        {plusShape(13, 7, overlayPx, "b")}
      </g>
      <g className="egg-sparkle" style={{ animationDelay: "1s" }}>
        {plusShape(9, 1, overlayPx, "c")}
      </g>
    </>
  );
}

function plusShape(cx: number, cy: number, px: number, key: string) {
  const fill = "#FFD56B";
  return [
    <rect key={`s-${key}-c`} x={cx * px} y={cy * px} width={px} height={px} fill={fill} />,
    <rect key={`s-${key}-u`} x={cx * px} y={(cy - 1) * px} width={px} height={px} fill={fill} />,
    <rect key={`s-${key}-d`} x={cx * px} y={(cy + 1) * px} width={px} height={px} fill={fill} />,
    <rect key={`s-${key}-l`} x={(cx - 1) * px} y={cy * px} width={px} height={px} fill={fill} />,
    <rect key={`s-${key}-r`} x={(cx + 1) * px} y={cy * px} width={px} height={px} fill={fill} />,
  ];
}

// Egg-stage sad effect — single blue tear that fades in just below
// the egg's right "eye" highlight pixel (EGG_SPRITE row 5 col 10),
// slides ~4 grid cells down the egg's surface, fades out before the
// bottom shell, and loops. SMIL <animateTransform> + <animate> so the
// translation is in SVG user units (independent of CSS pixel size,
// works in both PetSvg's size-matching viewBox and PetRoom's
// 16-unit viewBox).
export function EggSadTear({ overlayPx }: { overlayPx: number }) {
  const px = overlayPx;
  const tearColor = "#4FB3FF";
  return (
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values={`0 0; 0 ${4 * px}; 0 ${4 * px}`}
        keyTimes="0;0.88;1"
        dur="2.5s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values="0;1;1;0;0"
        keyTimes="0;0.12;0.76;0.88;1"
        dur="2.5s"
        repeatCount="indefinite"
      />
      <rect x={10 * px} y={6 * px} width={px} height={px} fill={tearColor} />
      <rect x={10 * px} y={7 * px} width={px} height={px} fill={tearColor} />
      <rect x={10 * px} y={8 * px} width={px} height={px} fill={tearColor} />
    </g>
  );
}

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

      {/* Egg-stage mood overlay. Happy → animated sparkles (separate
          component); sad/severe → static grids. Baby+ keeps the legacy
          frown — only fires on the legacy "any-0%" condition (= new
          "severe" level). */}
      {stage === "egg" && mood === "sad" ? (
        <EggSadTear overlayPx={overlayPx} />
      ) : stage === "egg" && mood === "severe" ? (
        (() => {
            const overlay = eggMoodOverlay(mood);
            if (!overlay) return null;
            return renderGrid(overlay, eggMoodOverlayColor, overlayPx, `egg-${mood}`);
          })()
      ) : stage === "egg" ? (
        // happy + normal both render sparkle so the egg always feels
        // alive unless the pet is actively sad/severe. Matches the
        // visit-list thumbnail behaviour (PetSvg without mood prop
        // defaults to happy → sparkle).
        <EggHappySparkles overlayPx={overlayPx} />
      ) : mood === "severe"
          ? renderGrid(
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
