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
//
// Collision and front-mask are authored as paint masks on top of the
// map so non-rectangular boundaries (curved shorelines, building
// silhouettes, eaves) are pixel-precise without listing dozens of
// rectangles. See `COLLISION_RED_*` thresholds below for the color
// gates that interpret those mask images at runtime.
export const ASSETS = {
  background: encodeURI("/images/fishing/배경.png"),
  mapFront: encodeURI("/images/fishing/배경_front.png"),
  collision: encodeURI("/images/fishing/collision.png"),
  shopInterior: encodeURI("/images/fishing/생선가게.png"),
  shopCollision: encodeURI("/images/fishing/생선가게_collision.png"),
  charBase: encodeURI("/images/fishing/Character assets/characters/char1.png"),
  npcChar: encodeURI("/images/fishing/Character assets/characters/char3.png"),
  eyes: encodeURI("/images/fishing/Character assets/eyes/eyes.png"),
  shirt: encodeURI("/images/fishing/Character assets/clothes/basic.png"),
  pants: encodeURI("/images/fishing/Character assets/clothes/pants.png"),
  shoes: encodeURI("/images/fishing/Character assets/clothes/shoes.png"),
  hair: encodeURI("/images/fishing/Character assets/hair/wavy.png"),
  shadow: encodeURI("/images/fishing/Character assets/shadow.png"),
};

// Color gates for the collision mask. Anti-aliased edges in the PNG
// land at intermediate values, so we keep the thresholds permissive.
//
// Outdoor (collision.png):
//   Red    → unwalkable (water, walls, trunks, etc.)
//   Green  → walkable but the player is occluded by 배경_front.png
//            in that region; informational for game logic.
//   Blue   → shop door entry trigger (auto-enters on foot overlap).
//            Left half = fish shop, right half = yellow shop.
//
// Indoor (생선가게_collision.png):
//   Red    → unwalkable (walls, counter, shelves).
//   Yellow → NPC anchor; also blocks so the player can't walk into
//            the NPC. The centroid of the yellow patch defines where
//            the NPC sprite is drawn at runtime.
//   Anything else (transparent/black) → walkable floor.
export const COLLISION_RED_R_MIN = 200;
export const COLLISION_RED_GB_MAX = 100;
export const COLLISION_GREEN_RB_MAX = 100;
export const COLLISION_GREEN_G_MIN = 200;
export const COLLISION_BLUE_B_MIN = 180;
export const COLLISION_BLUE_R_MAX = 100;
export const COLLISION_BLUE_G_MAX = 180;
export const COLLISION_YELLOW_RG_MIN = 200;
export const COLLISION_YELLOW_B_MAX = 100;

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

// Map-pixel-coordinate spawn. (168, 184) sits on the wide sand strip
// between the blue-house and fish-shop compounds — clear sight lines
// in every direction so the player can immediately see how movement
// and camera scrolling work.
export const SPAWN_X = 168;
export const SPAWN_Y = 184;

// Outdoor collision is now sampled from collision.png pixel-by-pixel
// (see FishingGame.tsx). The indoor shop has a much simpler footprint
// so we use plain rectangles for it — no mask image needed.

export type Rect = { x: number; y: number; w: number; h: number };

// ── Scene state ───────────────────────────────────────────────
// Phase-1 scenes: the outdoor beach map and the fish-shop interior.
// The yellow shop has an interaction zone but no interior yet (shows
// a "준비중입니다" toast on E).
export type Scene = "outdoor" | "fishshop";

// ── Indoor: 생선가게.png (fish shop interior) ────────────────
// Image is 160×160. Rendered at the same MAP_SCALE as outdoor for
// visual consistency; with a 153-px visible window the camera
// scrolls a few px near the edges but the player feels the same
// size everywhere.
export const INDOOR_MAP_WIDTH = 160;
export const INDOOR_MAP_HEIGHT = 160;

// Spawn coords. Indoor spawn sits in the bottom-half of the floor
// (player faces UP toward the shopkeeper). It's above the exit
// strip so re-entering doesn't immediately re-trigger the exit.
export const FISHSHOP_INDOOR_SPAWN_X = 80;
export const FISHSHOP_INDOOR_SPAWN_Y = 130;

// Where the player lands when leaving the shop — a couple of tiles
// south of the LEFT blue marker (fish-shop door) so the player
// doesn't bounce straight back inside.
export const FISHSHOP_EXIT_SPAWN_X = 88;
export const FISHSHOP_EXIT_SPAWN_Y = 152;

// Indoor exit zone — bottom strip of the floor. Walking south into
// this zone auto-fires the exit transition.
export const FISHSHOP_EXIT_ZONE: Rect = { x: 40, y: 144, w: 80, h: 16 };

// Fish-shop NPC dialog text. The NPC's foot position + interaction
// zone are computed at load time from the yellow pixel cluster in
// 생선가게_collision.png, so re-painting the marker moves the NPC
// without code changes.
export const FISHSHOP_NPC_LINE = "어서와! 잡은 물고기를 사줄게!";
export const YELLOW_SHOP_LINE = "준비중입니다";

// NPC modular layer indices. Picked to read clearly different from
// the player's default outfit (black shirt, brown pants, wavy hair).
export const NPC_EYES_COLOR = 3;
export const NPC_SHIRT_COLOR = 8;     // red
export const NPC_PANTS_COLOR = 1;     // blue
export const NPC_SHOES_COLOR = 3;     // brown
export const NPC_HAIR_COLOR = 11;     // pink

// Scene transition fade duration (seconds). Splits at 0.5 — the
// scene switch happens at the midpoint so the player never sees a
// flicker of the old scene during fade-in.
export const SCENE_FADE_SECONDS = 0.3;
