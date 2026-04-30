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

// ── Fishing minigame phase 1 ──────────────────────────────────
// Cast/wait state assets live under
// /images/fishing/Character assets/separate/fish/. The "without"
// base is the body without the rod baked in; layering
// tool/fishingrod.png on top renders the held rod. Color variants
// are 160-px wide blocks (vs 256-px for the walk sheet).
export const ASSETS_FISH = {
  base: encodeURI("/images/fishing/Character assets/separate/fish/without/char1_fish_without.png"),
  eyes: encodeURI("/images/fishing/Character assets/separate/fish/eyes/eyes_fish.png"),
  shirt: encodeURI("/images/fishing/Character assets/separate/fish/clothes/basic_fish.png"),
  pants: encodeURI("/images/fishing/Character assets/separate/fish/clothes/pants_fish.png"),
  shoes: encodeURI("/images/fishing/Character assets/separate/fish/clothes/shoes_fish.png"),
  hair: encodeURI("/images/fishing/Character assets/separate/fish/hair/wavy_fish.png"),
  rod: encodeURI("/images/fishing/Character assets/separate/fish/tool/fishingrod.png"),
  bobber: encodeURI("/images/fishing/Character assets/separate/fish/tool/bobber.png"),
  fishShadow: encodeURI("/images/fishing/fishing assets/Fish Forage Items/fish_shadow_transparent.png"),
};

// Fish-shadow filmstrip: 240×16 = 15 frames × 16×16, looped while a
// fish is "lurking" under the bobber. Frame timing kept slow so the
// silhouette swims smoothly rather than flickering.
export const FISH_SHADOW_CELL = 16;
export const FISH_SHADOW_FRAMES = 15;
export const FISH_SHADOW_FRAME_MS = 100;
export const FISH_SHADOW_ORBIT_RADIUS = 14;

// Bite-system tunables. The wait timer rolls a real-bite time in
// [3..10]s and 0–2 fake bites scattered earlier; the shadow appears
// FISH_SHADOW_LEAD_MS before the real bite. Real-bite reaction is
// no longer a fixed window — see FISH_GRADES below for the gauge
// minigame that replaces the simple timing press.
export const FISH_WAIT_MIN_MS = 3000;
export const FISH_WAIT_MAX_MS = 10000;
export const FISH_FAKE_BITE_PROBABILITY = 0.5;
export const FISH_FAKE_BITE_MAX = 2;
export const FISH_FAKE_BITE_DURATION_MS = 200;
// Success message duration (catch celebration). Fail uses
// FISH_FAIL_RETRACT_MS instead — short and silent per the new spec.
export const FISH_RESULT_MS = 1500;
export const FISH_FAIL_RETRACT_MS = 500;
export const FISH_SHADOW_LEAD_MS = 2500;
export const FISH_BITE_DEPTH_PX = 7;        // bobber sinks this far on real bite
export const FISH_FAKE_BITE_DEPTH_PX = 1.5; // fake bite peak dip
export const FISH_BOBBER_BOB_AMP = 2;       // sin oscillation amplitude in wait
export const FISH_BOBBER_BOB_FREQ = 0.005;  // sin frequency

// Catch text — only shown on success now (fail is silent).
export const FISH_TEXT_CAUGHT = "물고기를 잡았다!";

// ── Catch gauge minigame ───────────────────────────────────────
// On a real bite the gauge bar opens at the bottom of the viewport.
// A marker ping-pongs across it; pressing the action button while
// the marker is over the green success zone catches the fish, any
// other press (or 3 round trips of inactivity) silently retracts.

export const GAUGE_WIDTH = 184;       // px (~60% of 306 viewport)
export const GAUGE_HEIGHT = 16;       // px (Bar01a 8 px × 2 scale)
export const GAUGE_BOTTOM_OFFSET = 28; // px from canvas bottom
// 3 round trips = 6 edge bounces (left↔right counted on each hit).
export const GAUGE_MAX_EDGE_HITS = 6;

export type FishGrade =
  | "common"
  | "uncommon"
  | "rare"
  | "legendary"
  | "mythic";

export type FishGradeConfig = {
  width: number;            // success-zone width as fraction of bar (0..1)
  baseSpeed: number;        // bar-widths traversed per second
  jitter: number;           // 0..1 — speed sin amplitude (irregularity)
  rollProbability: number;  // chance this grade rolls on a real bite
};

export const FISH_GRADES: Record<FishGrade, FishGradeConfig> = {
  common:    { width: 0.40, baseSpeed: 1.4, jitter: 0.10, rollProbability: 0.60 },
  uncommon:  { width: 0.30, baseSpeed: 1.9, jitter: 0.18, rollProbability: 0.25 },
  rare:      { width: 0.20, baseSpeed: 2.5, jitter: 0.28, rollProbability: 0.10 },
  legendary: { width: 0.15, baseSpeed: 3.2, jitter: 0.42, rollProbability: 0.04 },
  mythic:    { width: 0.10, baseSpeed: 4.0, jitter: 0.55, rollProbability: 0.01 },
};

export const FISH_GRADE_LABEL: Record<FishGrade, string> = {
  common: "일반",
  uncommon: "고급",
  rare: "희귀",
  legendary: "전설",
  mythic: "신화",
};

export const FISH_GRADE_COLOR: Record<FishGrade, string> = {
  common: "#cbd5e1",
  uncommon: "#86efac",
  rare: "#7dd3fc",
  legendary: "#c4b5fd",
  mythic: "#fbbf24",
};

// Fishing sprite sheet: 5 frames × 4 directions in a 160×128 block;
// each color variant is laid out horizontally at FISH_VARIANT_WIDTH.
export const FISH_VARIANT_WIDTH = 160;
export const FISH_FRAMES = 5;

// Per-direction cast frame durations (ms) — copied verbatim from
// Character assets/info.txt (FISHING L/R and FISHING U/D rows).
export const FISH_TIMINGS_LR: readonly number[] = [100, 100, 250, 60, 100];
export const FISH_TIMINGS_UD: readonly number[] = [100, 250, 60, 100, 100];

// Bobber: 128×32 sheet, but the layout is 8 distinct 16×16 bobber
// designs laid out horizontally — NOT a 4-frame animation. We pick
// the first design (sx=0..16) and render it as a static sprite.
export const BOBBER_CELL = 16;
export const BOBBER_INDEX = 0;

// How far in front of the player's feet the bobber lands, in map
// pixels. Two tiles forward keeps the line visibly slack.
export const BOBBER_DISTANCE = 32;

// "Can I fish here?" probe: the player must be RIGHT next to water
// (within ~1 tile in front). We sample the BACKGROUND image so
// building walls and tree trunks — which are also red on
// collision.png — don't qualify. Water is detected by the seafoam
// blue palette in 배경.png (R<100, G≥150, B≥200).
//
// Two-stage gate: the probe distances below ensure the player is
// adjacent to water; the bobber-landing check (at BOBBER_DISTANCE)
// also has to land on water, so casting onto sand never activates.
export const FISH_PROBE_DISTANCES: readonly number[] = [8, 16];

// Water color thresholds for 배경.png. Sampled at multiple shore
// pixels: water sits at ~(72, 185, 221). Sand (227, 187, 77),
// grass (99, 158, 60), and building stripes all fail at least one
// of these cuts.
export const WATER_R_MAX = 100;
export const WATER_G_MIN = 150;
export const WATER_B_MIN = 200;

// Rod-tip offsets per facing direction, measured from each
// direction's wait-pose frame in fishingrod.png. After the +4
// fishing Y correction, the cell origin lines up with
// (footX-16, footY-24); adding these offsets to (footX, footY)
// gives the precise pixel where the rod tip is drawn on screen —
// which is also where the fishing line starts.
//
// down / up wait at frame 4 (cast end) — rod tilts toward the
// water vertically. left / right play the cast IN REVERSE so the
// wait shows frame 0 (rod held high diagonally), and the line
// drops naturally to the bobber below; their offsets reflect that
// frame's tip pixel, not frame 4's.
export const ROD_TIP_OFFSETS: Record<
  "down" | "up" | "left" | "right",
  { x: number; y: number }
> = {
  down: { x: -1, y: 7 },
  up: { x: -3, y: -17 },
  right: { x: 12, y: -10 },
  left: { x: -13, y: -10 },
};

// ── Fish catalog (100 species) ─────────────────────────────────
// Sourced from fishing assets/Fish Forage Items/fish list.txt and
// the fish_all.png / inv_fish_shadow.png 16×16 sprite sheets — both
// are 160×160 = 10×10 grids, so each fish at id N has sprite cell
//   col = (N-1) mod 10, row = (N-1) div 10.
// fish list.txt order is Ocean Fish (1..35) → Ocean Creatures
// (36..52) → River Fish (53..76) → River Creatures (77..80) →
// Pond Fish (81..97) → Pond Creatures (98..100).

export type FishHabitat = "ocean" | "river" | "pond";
export type FishType = "fish" | "creature";

export type Fish = {
  id: number;
  nameEn: string;
  nameKo: string;
  grade: FishGrade;
  price: number;
  habitat: FishHabitat;
  type: FishType;
  spriteX: number;
  spriteY: number;
};

// Sprite cells are 16 px on both fish_all.png and inv_fish_shadow.png.
export const FISH_SPRITE_CELL = 16;
export const FISH_SPRITE_COLS = 10;
export const FISH_SPRITE_ROWS = 10;

export const ASSETS_FISH_CATALOG = {
  fishAll: encodeURI("/images/fishing/fishing assets/Fish Forage Items/fish_all.png"),
  fishSilhouettes: encodeURI("/images/fishing/fishing assets/Fish Forage Items/inv_fish_shadow.png"),
};

// Helper: given a 1-based fish id, return its sprite-cell offset.
export function fishSpriteCoords(id: number): { x: number; y: number } {
  const n = id - 1;
  return {
    x: (n % FISH_SPRITE_COLS) * FISH_SPRITE_CELL,
    y: Math.floor(n / FISH_SPRITE_COLS) * FISH_SPRITE_CELL,
  };
}

// Authored seed list (id, name, grade, price, habitat, type) —
// spriteX/Y filled in by the .map below so adding a fish only needs
// the gameplay metadata.
type FishSeed = Omit<Fish, "spriteX" | "spriteY">;

const FISH_SEED: FishSeed[] = [
  // ── Ocean Fish (1–35) ──
  { id: 1,  nameEn: "Parrot Fish",          nameKo: "앵무고기",       grade: "rare",      price: 8,  habitat: "ocean", type: "fish" },
  { id: 2,  nameEn: "Mackerel",             nameKo: "고등어",         grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 3,  nameEn: "Clown Fish",           nameKo: "흰동가리",       grade: "uncommon",  price: 5,  habitat: "ocean", type: "fish" },
  { id: 4,  nameEn: "Plaice",               nameKo: "가자미",         grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 5,  nameEn: "Silver Eel",           nameKo: "은장어",         grade: "uncommon",  price: 6,  habitat: "ocean", type: "fish" },
  { id: 6,  nameEn: "Sea Horse",            nameKo: "해마",           grade: "rare",      price: 10, habitat: "ocean", type: "fish" },
  { id: 7,  nameEn: "Lionfish",             nameKo: "쏠배감펭",       grade: "legendary", price: 20, habitat: "ocean", type: "fish" },
  { id: 8,  nameEn: "Cowfish",              nameKo: "뿔복",           grade: "rare",      price: 9,  habitat: "ocean", type: "fish" },
  { id: 9,  nameEn: "Tuna",                 nameKo: "참치",           grade: "uncommon",  price: 6,  habitat: "ocean", type: "fish" },
  { id: 10, nameEn: "Banded Butterflyfish", nameKo: "줄나비고기",     grade: "rare",      price: 8,  habitat: "ocean", type: "fish" },
  { id: 11, nameEn: "Atlantic Bass",        nameKo: "농어",           grade: "common",    price: 3,  habitat: "ocean", type: "fish" },
  { id: 12, nameEn: "Blue Tang",            nameKo: "블루탱",         grade: "uncommon",  price: 5,  habitat: "ocean", type: "fish" },
  { id: 13, nameEn: "Pollock",              nameKo: "명태",           grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 14, nameEn: "Ballan Wrasse",        nameKo: "놀래기",         grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 15, nameEn: "Weaver Fish",          nameKo: "독가시치",       grade: "uncommon",  price: 4,  habitat: "ocean", type: "fish" },
  { id: 16, nameEn: "Bream",                nameKo: "도미",           grade: "common",    price: 3,  habitat: "ocean", type: "fish" },
  { id: 17, nameEn: "Pufferfish",           nameKo: "복어",           grade: "legendary", price: 18, habitat: "ocean", type: "fish" },
  { id: 18, nameEn: "Cod",                  nameKo: "대구",           grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 19, nameEn: "Dab",                  nameKo: "참서대",         grade: "common",    price: 1,  habitat: "ocean", type: "fish" },
  { id: 20, nameEn: "Flounder",             nameKo: "넙치",           grade: "uncommon",  price: 5,  habitat: "ocean", type: "fish" },
  { id: 21, nameEn: "Whiting",              nameKo: "민어",           grade: "common",    price: 2,  habitat: "ocean", type: "fish" },
  { id: 22, nameEn: "Halibut",              nameKo: "광어",           grade: "uncommon",  price: 6,  habitat: "ocean", type: "fish" },
  { id: 23, nameEn: "Herring",              nameKo: "청어",           grade: "common",    price: 1,  habitat: "ocean", type: "fish" },
  { id: 24, nameEn: "Stingray",             nameKo: "가오리",         grade: "legendary", price: 22, habitat: "ocean", type: "fish" },
  { id: 25, nameEn: "Wolfish",              nameKo: "이리치",         grade: "rare",      price: 10, habitat: "ocean", type: "fish" },
  { id: 26, nameEn: "Bonefish",             nameKo: "뼈고기",         grade: "uncommon",  price: 4,  habitat: "ocean", type: "fish" },
  { id: 27, nameEn: "Cobia",                nameKo: "코비아",         grade: "rare",      price: 9,  habitat: "ocean", type: "fish" },
  { id: 28, nameEn: "Black Drum",           nameKo: "검은드럼",       grade: "uncommon",  price: 5,  habitat: "ocean", type: "fish" },
  { id: 29, nameEn: "Blobfish",             nameKo: "블로브피쉬",     grade: "mythic",    price: 40, habitat: "ocean", type: "fish" },
  { id: 30, nameEn: "Pompano",              nameKo: "전갱이",         grade: "common",    price: 3,  habitat: "ocean", type: "fish" },
  { id: 31, nameEn: "Sardine",              nameKo: "정어리",         grade: "common",    price: 1,  habitat: "ocean", type: "fish" },
  { id: 32, nameEn: "Angelfish",            nameKo: "엔젤피쉬",       grade: "rare",      price: 8,  habitat: "ocean", type: "fish" },
  { id: 33, nameEn: "Red Snapper",          nameKo: "붉은돔",         grade: "legendary", price: 15, habitat: "ocean", type: "fish" },
  { id: 34, nameEn: "Salmon",               nameKo: "연어",           grade: "uncommon",  price: 6,  habitat: "ocean", type: "fish" },
  { id: 35, nameEn: "Anglerfish",           nameKo: "아귀",           grade: "mythic",    price: 35, habitat: "ocean", type: "fish" },

  // ── Ocean Creatures (36–52) ──
  { id: 36, nameEn: "Shrimp",               nameKo: "새우",           grade: "common",    price: 2,  habitat: "ocean", type: "creature" },
  { id: 37, nameEn: "Squid",                nameKo: "오징어",         grade: "common",    price: 3,  habitat: "ocean", type: "creature" },
  { id: 38, nameEn: "Dumbo Octopus",        nameKo: "덤보문어",       grade: "mythic",    price: 45, habitat: "ocean", type: "creature" },
  { id: 39, nameEn: "Crab",                 nameKo: "게",             grade: "common",    price: 3,  habitat: "ocean", type: "creature" },
  { id: 40, nameEn: "Lobster",              nameKo: "바닷가재",       grade: "rare",      price: 12, habitat: "ocean", type: "creature" },
  { id: 41, nameEn: "Sea Angel",            nameKo: "바다천사",       grade: "legendary", price: 25, habitat: "ocean", type: "creature" },
  { id: 42, nameEn: "Turtle",               nameKo: "바다거북",       grade: "legendary", price: 20, habitat: "ocean", type: "creature" },
  { id: 43, nameEn: "Octopus",              nameKo: "문어",           grade: "uncommon",  price: 6,  habitat: "ocean", type: "creature" },
  { id: 44, nameEn: "Pink Fantasia",        nameKo: "핑크환상",       grade: "mythic",    price: 50, habitat: "ocean", type: "creature" },
  { id: 45, nameEn: "Sea Spider",           nameKo: "바다거미",       grade: "rare",      price: 7,  habitat: "ocean", type: "creature" },
  { id: 46, nameEn: "Jellyfish",            nameKo: "해파리",         grade: "uncommon",  price: 4,  habitat: "ocean", type: "creature" },
  { id: 47, nameEn: "Sea Cucumber",         nameKo: "해삼",           grade: "common",    price: 3,  habitat: "ocean", type: "creature" },
  { id: 48, nameEn: "Christmas Tree Worm",  nameKo: "크리스마스갯지렁이", grade: "rare",  price: 9,  habitat: "ocean", type: "creature" },
  { id: 49, nameEn: "Sea Pen",              nameKo: "바다깃펜",       grade: "uncommon",  price: 5,  habitat: "ocean", type: "creature" },
  { id: 50, nameEn: "Sea Urchin",           nameKo: "성게",           grade: "common",    price: 2,  habitat: "ocean", type: "creature" },
  { id: 51, nameEn: "Blue Lobster",         nameKo: "푸른바닷가재",   grade: "mythic",    price: 50, habitat: "ocean", type: "creature" },
  { id: 52, nameEn: "Saltwater Snail",      nameKo: "바다달팽이",     grade: "common",    price: 1,  habitat: "ocean", type: "creature" },

  // ── River Fish (53–76) ──
  { id: 53, nameEn: "Crucian Carp",         nameKo: "붕어",           grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 54, nameEn: "Bluegill",             nameKo: "블루길",         grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 55, nameEn: "Tilapia",              nameKo: "틸라피아",       grade: "common",    price: 2,  habitat: "river", type: "fish" },
  { id: 56, nameEn: "Smelt",                nameKo: "빙어",           grade: "common",    price: 2,  habitat: "river", type: "fish" },
  { id: 57, nameEn: "Trout",                nameKo: "송어",           grade: "uncommon",  price: 4,  habitat: "river", type: "fish" },
  { id: 58, nameEn: "Betta",                nameKo: "베타",           grade: "rare",      price: 8,  habitat: "river", type: "fish" },
  { id: 59, nameEn: "Rainbow Trout",        nameKo: "무지개송어",     grade: "uncommon",  price: 5,  habitat: "river", type: "fish" },
  { id: 60, nameEn: "Yellow Perch",         nameKo: "노란퍼치",       grade: "common",    price: 2,  habitat: "river", type: "fish" },
  { id: 61, nameEn: "Char",                 nameKo: "곤들매기",       grade: "uncommon",  price: 5,  habitat: "river", type: "fish" },
  { id: 62, nameEn: "Guppy",                nameKo: "구피",           grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 63, nameEn: "King Salmon",          nameKo: "킹연어",         grade: "legendary", price: 18, habitat: "river", type: "fish" },
  { id: 64, nameEn: "Neon Tetra",           nameKo: "네온테트라",     grade: "uncommon",  price: 4,  habitat: "river", type: "fish" },
  { id: 65, nameEn: "Piranha",              nameKo: "피라냐",         grade: "legendary", price: 15, habitat: "river", type: "fish" },
  { id: 66, nameEn: "Bitterling",           nameKo: "납줄개",         grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 67, nameEn: "Black Bass",           nameKo: "배스",           grade: "uncommon",  price: 5,  habitat: "river", type: "fish" },
  { id: 68, nameEn: "Eel",                  nameKo: "뱀장어",         grade: "rare",      price: 9,  habitat: "river", type: "fish" },
  { id: 69, nameEn: "Chub",                 nameKo: "피라미",         grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 70, nameEn: "Perch",                nameKo: "퍼치",           grade: "common",    price: 2,  habitat: "river", type: "fish" },
  { id: 71, nameEn: "Crappie",              nameKo: "크래피",         grade: "common",    price: 2,  habitat: "river", type: "fish" },
  { id: 72, nameEn: "Catfish",              nameKo: "메기",           grade: "uncommon",  price: 4,  habitat: "river", type: "fish" },
  { id: 73, nameEn: "Walleye",              nameKo: "월아이",         grade: "rare",      price: 7,  habitat: "river", type: "fish" },
  { id: 74, nameEn: "Dace",                 nameKo: "황어",           grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 75, nameEn: "Loach",                nameKo: "미꾸라지",       grade: "common",    price: 1,  habitat: "river", type: "fish" },
  { id: 76, nameEn: "Largemouth Bass",      nameKo: "큰입배스",       grade: "rare",      price: 8,  habitat: "river", type: "fish" },

  // ── River Creatures (77–80) ──
  { id: 77, nameEn: "Water Beetle",         nameKo: "물방개",         grade: "common",    price: 1,  habitat: "river", type: "creature" },
  { id: 78, nameEn: "Crayfish",             nameKo: "가재",           grade: "uncommon",  price: 4,  habitat: "river", type: "creature" },
  { id: 79, nameEn: "Snake",                nameKo: "물뱀",           grade: "rare",      price: 7,  habitat: "river", type: "creature" },
  { id: 80, nameEn: "Freshwater Snail",     nameKo: "민물달팽이",     grade: "common",    price: 1,  habitat: "river", type: "creature" },

  // ── Pond Fish (81–97) ──
  { id: 81, nameEn: "Goldfish",             nameKo: "금붕어",         grade: "common",    price: 2,  habitat: "pond",  type: "fish" },
  { id: 82, nameEn: "Koi",                  nameKo: "비단잉어",       grade: "rare",      price: 10, habitat: "pond",  type: "fish" },
  { id: 83, nameEn: "Grass Carp",           nameKo: "초어",           grade: "common",    price: 2,  habitat: "pond",  type: "fish" },
  { id: 84, nameEn: "Fathead Minnow",       nameKo: "뚱뚱송사리",     grade: "common",    price: 1,  habitat: "pond",  type: "fish" },
  { id: 85, nameEn: "Green Sunfish",        nameKo: "초록개복치",     grade: "uncommon",  price: 4,  habitat: "pond",  type: "fish" },
  { id: 86, nameEn: "Plecostomus",          nameKo: "플레코",         grade: "uncommon",  price: 5,  habitat: "pond",  type: "fish" },
  { id: 87, nameEn: "Red Shiner",           nameKo: "붉은치리",       grade: "common",    price: 1,  habitat: "pond",  type: "fish" },
  { id: 88, nameEn: "Pumpkin Seed Fish",    nameKo: "호박씨고기",     grade: "uncommon",  price: 4,  habitat: "pond",  type: "fish" },
  { id: 89, nameEn: "Goby",                 nameKo: "망둥어",         grade: "common",    price: 1,  habitat: "pond",  type: "fish" },
  { id: 90, nameEn: "Shubukin",             nameKo: "슈분킨",         grade: "uncommon",  price: 5,  habitat: "pond",  type: "fish" },
  { id: 91, nameEn: "Fancy Goldfish",       nameKo: "난초금붕어",     grade: "rare",      price: 9,  habitat: "pond",  type: "fish" },
  { id: 92, nameEn: "High Fin Banded Shark",nameKo: "칠성상어",       grade: "legendary", price: 22, habitat: "pond",  type: "fish" },
  { id: 93, nameEn: "Paradise Fish",        nameKo: "극락어",         grade: "rare",      price: 8,  habitat: "pond",  type: "fish" },
  { id: 94, nameEn: "Gizzard Shad",         nameKo: "전어",           grade: "common",    price: 2,  habitat: "pond",  type: "fish" },
  { id: 95, nameEn: "Rosette",              nameKo: "로제트",         grade: "uncommon",  price: 5,  habitat: "pond",  type: "fish" },
  { id: 96, nameEn: "Golden Tench",         nameKo: "황금잉어",       grade: "legendary", price: 20, habitat: "pond",  type: "fish" },
  { id: 97, nameEn: "Molly",                nameKo: "몰리",           grade: "common",    price: 1,  habitat: "pond",  type: "fish" },

  // ── Pond Creatures (98–100) ──
  { id: 98, nameEn: "Frog",                 nameKo: "개구리",         grade: "common",    price: 2,  habitat: "pond",  type: "creature" },
  { id: 99, nameEn: "Tadpole",              nameKo: "올챙이",         grade: "common",    price: 1,  habitat: "pond",  type: "creature" },
  { id: 100,nameEn: "Axolotl",              nameKo: "아홀로틀",       grade: "mythic",    price: 45, habitat: "pond",  type: "creature" },
];

export const FISH_LIST: Fish[] = FISH_SEED.map((f) => ({
  ...f,
  ...((c) => ({ spriteX: c.x, spriteY: c.y }))(fishSpriteCoords(f.id)),
}));

// Lookup by id (1..100). Returns undefined for out-of-range ids.
export function getFishById(id: number): Fish | undefined {
  return FISH_LIST[id - 1];
}
