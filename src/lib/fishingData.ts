// Fishing game — phase 1 constants. Paired with
// app/components/redesign/FishingGame.tsx.
//
// Asset paths use literal spaces and Korean filenames; encodeURI lets
// the browser fetch them without manual %-escaping at every call site.

// Phase-1 soft-launch gate — fishing UI is only visible to this
// nickname. Mirrors the PET_DEBUG_ADMIN_NICKNAME pattern in pets.ts.
export const FISHING_ADMIN_NICKNAME = "언쏘";

export function canSeeFishing(nickname: string | null | undefined): boolean {
  if (!nickname) return false;
  return nickname === FISHING_ADMIN_NICKNAME;
}

export const TILE_SIZE = 16;
export const VIEWPORT = 306;
export const MAP_WIDTH = 336;
export const MAP_HEIGHT = 336;

// Per Character assets/info.txt LAYERS section, the full character is
// composited bottom-to-top as:
//   1. char base
//   2. eyes (+ optional blush/lipstick — skipped in phase 1)
//   3. clothes: shirt → pants → shoes
//   4. hair
//   5. accessories (skipped in phase 1)
// `clothes/basic.png` is just the shirt — pants and shoes are
// independent sheets in the same folder, and a complete outfit needs
// all three. Hair is a separate folder with one sheet per hairstyle.
export const ASSETS = {
  background: encodeURI("/images/fishing/배경.png"),
  charBase: encodeURI("/images/fishing/Character assets/characters/char1.png"),
  eyes: encodeURI("/images/fishing/Character assets/eyes/eyes.png"),
  shirt: encodeURI("/images/fishing/Character assets/clothes/basic.png"),
  pants: encodeURI("/images/fishing/Character assets/clothes/pants.png"),
  shoes: encodeURI("/images/fishing/Character assets/clothes/shoes.png"),
  hair: encodeURI("/images/fishing/Character assets/hair/wavy.png"),
  shadow: encodeURI("/images/fishing/Character assets/shadow.png"),
};

// Sprite sheet: 256×1568, 32×32 cells, 8 cols × 49 rows. Each color
// variant of eyes/clothes is a 256-wide block laid horizontally
// (eyes.png = 14 colors → 3584; basic.png = 10 colors → 2560).
export const SPRITE_CELL = 32;
export const SPRITE_COLS = 8;
export const VARIANT_WIDTH = 256;

export type Direction = "up" | "right" | "down" | "left";

// WALK action lives at sheet rows 0..3, 8 frames per direction. Row
// order corrected after in-browser testing: row 0 is the front/face
// view (down), row 1 is the back-of-head view (up), row 2 is the
// right profile, row 3 is the left profile. The initial guess
// (up=0…) had row 0 and row 1 swapped because the back-of-head
// sprite at small scale looks similar to a face-down sleep pose.
export const WALK_ROWS: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 3,
};
export const WALK_FRAMES = 8;
export const WALK_FRAME_MS = 100;

export const MOVE_SPEED_PX_PER_SEC = 80;

// Default modular layer indices. Hardcoded for phase 1; later phases
// will let the player pick from list.txt's color palette (eyes 14
// colors, clothes 10 colors, hair 14 colors). Pants intentionally
// chosen brown (clothes index 3 = "Brown") so it's visually
// distinguishable from the black shirt — at solid black on black the
// shirt and pants merge into a single silhouette and earlier QA
// passes mistook the composite for "missing pants".
export const DEFAULT_EYES_COLOR = 0;
export const DEFAULT_SHIRT_COLOR = 0;
export const DEFAULT_PANTS_COLOR = 3;
export const DEFAULT_SHOES_COLOR = 0;
export const DEFAULT_HAIR_COLOR = 0;

// Character bbox in sprite-cell-relative px. The 32×32 cell holds a
// ~15×22 character centered horizontally with feet near the bottom.
// We collide on a small rect at the feet so head/torso can clip into
// building tops without "sticking" to walls a tile away.
export const CHAR_BBOX_HALF_W = 5;
export const CHAR_BBOX_HEIGHT = 6;

// Map-pixel-coordinate spawn. (80, 232) sits on the open beach left
// of the umbrellas, clear of buildings and sea.
export const SPAWN_X = 80;
export const SPAWN_Y = 232;

export type Rect = { x: number; y: number; w: number; h: number };

// Unwalkable rects in map px. Phase 1 is intentionally rough — the
// background art has irregular building footprints and a diagonal
// shoreline, but rectangle approximations are enough to keep the
// player out of obvious obstacles. Refine to per-tile collision later.
export const UNWALKABLE_RECTS: Rect[] = [
  // Top-left house (blue roof + base)
  { x: 24, y: 40, w: 104, h: 104 },
  // Top-right fishing shop (yellow roof + base)
  { x: 176, y: 24, w: 128, h: 144 },
  // Sea — right side (large rectangle covering the right water body)
  { x: 240, y: 192, w: 96, h: 144 },
  // Sea — bottom (covers the lower coastal water)
  { x: 144, y: 256, w: 192, h: 80 },
  // Sea — middle bridging area (between right and bottom blocks)
  { x: 192, y: 224, w: 144, h: 48 },
];
