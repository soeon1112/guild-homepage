// FishingGame — phase 1. Modal floating panel that renders a 306×306
// canvas-based world: background image map, multi-layer character
// composited from the modular sprite sheet, WASD/joystick movement,
// camera that follows the player but locks at map edges, and rough
// rectangle collision for buildings and sea.
//
// Constants live in src/lib/fishingData.ts so we can refine collision
// and customization without touching the loop.

"use client";

import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSETS,
  ASSETS_FISH,
  ASSETS_FISH_CATALOG,
  ASSETS_FORAGE_CATALOG,
  BOBBER_CELL,
  BOBBER_DISTANCE,
  BOBBER_INDEX,
  FISH_BITE_DEPTH_PX,
  FISH_BOBBER_BOB_AMP,
  FISH_BOBBER_BOB_FREQ,
  FISH_FAKE_BITE_DEPTH_PX,
  FISH_FAKE_BITE_DURATION_MS,
  FISH_FAKE_BITE_MAX,
  FISH_FAKE_BITE_PROBABILITY,
  FISH_GRADES,
  FISH_GRADE_COLOR,
  FISH_GRADE_LABEL,
  FISH_SPRITE_CELL,
  FISH_TEXT_GOT_AWAY,
  FORAGE_SPRITE_CELL,
  GAUGE_SPEED_SIN_FREQ,
  FISH_SHADOW_CELL,
  FISH_SHADOW_FRAME_MS,
  FISH_SHADOW_FRAMES,
  FISH_SHADOW_LEAD_MS,
  FISH_WAIT_MAX_MS,
  FISH_WAIT_MIN_MS,
  GAUGE_BOTTOM_OFFSET,
  GAUGE_MAX_EDGE_HITS,
  GAUGE_WIDTH,
  rollCatchResult,
  gradeForGauge,
  expForCatch,
  levelFromTotalExp,
  TOTAL_DEX_SPECIES,
  FISH_LIST,
  FORAGE_LIST,
  type CatchResult,
  type FishGrade,
  type Fish,
  type Forage,
  CHAR_BBOX_HALF_W,
  CHAR_BBOX_HEIGHT,
  COLLISION_BLUE_B_MIN,
  COLLISION_BLUE_G_MAX,
  COLLISION_BLUE_R_MAX,
  COLLISION_RED_GB_MAX,
  COLLISION_RED_R_MIN,
  COLLISION_YELLOW_B_MAX,
  COLLISION_YELLOW_RG_MIN,
  DEFAULT_EYES_COLOR,
  DEFAULT_HAIR_COLOR,
  DEFAULT_PANTS_COLOR,
  DEFAULT_SHIRT_COLOR,
  DEFAULT_SHOES_COLOR,
  FISH_FRAMES,
  FISH_PROBE_DISTANCES,
  FISH_TIMINGS_LR,
  FISH_TIMINGS_UD,
  FISH_VARIANT_WIDTH,
  ROD_TIP_OFFSETS,
  WATER_B_MIN,
  WATER_G_MIN,
  WATER_R_MAX,
  FISHSHOP_EXIT_SPAWN_X,
  FISHSHOP_EXIT_SPAWN_Y,
  FISHSHOP_EXIT_ZONE,
  FISHSHOP_INDOOR_SPAWN_X,
  FISHSHOP_INDOOR_SPAWN_Y,
  FISHSHOP_NPC_LINE,
  INDOOR_MAP_HEIGHT,
  INDOOR_MAP_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOVE_SPEED_PX_PER_SEC,
  NPC_EYES_COLOR,
  NPC_HAIR_COLOR,
  NPC_PANTS_COLOR,
  NPC_SHIRT_COLOR,
  NPC_SHOES_COLOR,
  SCENE_FADE_SECONDS,
  SPAWN_X,
  SPAWN_Y,
  SPRITE_CELL,
  VARIANT_WIDTH,
  VIEWPORT,
  WALK_FRAMES,
  WALK_FRAME_MS,
  WALK_ROWS,
  YELLOW_SHOP_LINE,
  type Direction,
  type Rect,
  type Scene,
} from "@/src/lib/fishingData";

type Props = { open: boolean; onClose: () => void; nickname: string };

type LoadedAssets = {
  map: HTMLImageElement;
  // mapFront is stored as a canvas — see loadOpaqueOverlay below for
  // why we pre-process the PNG instead of using the raw <img>.
  mapFront: HTMLCanvasElement;
  collision: ImageData;
  // ImageData of the background art itself, used to sample water
  // pixels for the can-fish probe.
  backgroundData: ImageData;
  shopInterior: HTMLImageElement;
  shopCollision: ImageData;
  // NPC anchor + interaction zone, both derived at load time from the
  // yellow pixel cluster in shopCollision so the artist can move the
  // marker without touching code.
  npcFoot: { x: number; y: number };
  npcZone: Rect;
  char: HTMLImageElement;
  npcChar: HTMLImageElement;
  eyes: HTMLImageElement;
  shirt: HTMLImageElement;
  pants: HTMLImageElement;
  shoes: HTMLImageElement;
  hair: HTMLImageElement;
  shadow: HTMLImageElement;
  // Fishing minigame sprites (separate sheets at 160×128 — 5 frames
  // × 4 directions per color variant).
  fishBase: HTMLImageElement;
  fishEyes: HTMLImageElement;
  fishShirt: HTMLImageElement;
  fishPants: HTMLImageElement;
  fishShoes: HTMLImageElement;
  fishHair: HTMLImageElement;
  fishRod: HTMLImageElement;
  fishBobber: HTMLImageElement;
  fishShadow: HTMLImageElement;
  // Flat-theme gauge sprites — used for the canvas-rendered catch
  // minigame. The button + banner sprites are loaded as plain <img>
  // tags in JSX, so they're not stored here.
  uiGaugeBar: HTMLImageElement;
  uiGaugeFill: HTMLImageElement;
  uiGaugeMarker: HTMLImageElement;
  // Catalog sprites used by the result popup. fishAll/forageAll are
  // 16×16-cell sheets indexed by Fish.spriteX/Y or Forage.spriteX/Y;
  // the popup crops a single cell at popup-paint time.
  fishCatalog: HTMLImageElement;
  forageCatalog: HTMLImageElement;
};

type Prompt = "blueDoor" | "yellowDoor" | "exit" | "npc" | null;
type Mode =
  | "walk"
  | "fishingCast"
  | "fishingWait"
  | "fishingFakeBite"
  | "fishingBite"
  | "fishingSuccess"
  | "fishingFail";

type BiteEvent = { at: number; type: "fake" | "real" };

function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// Indoor blocked test: red OR yellow on shopCollision blocks the
// player. Yellow is the NPC anchor, intentionally unwalkable so the
// player stops at the counter front instead of overlapping the NPC.
function isBlockedIndoorPixel(data: ImageData, x: number, y: number): boolean {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= data.width || iy >= data.height) return true;
  const i = (iy * data.width + ix) * 4;
  const r = data.data[i];
  const g = data.data[i + 1];
  const b = data.data[i + 2];
  const a = data.data[i + 3];
  if (a < 50) return false;
  // Red = wall / counter / shelf
  if (
    r >= COLLISION_RED_R_MIN &&
    g <= COLLISION_RED_GB_MAX &&
    b <= COLLISION_RED_GB_MAX
  ) {
    return true;
  }
  // Yellow = NPC tile (player can't stand on the NPC)
  if (
    r >= COLLISION_YELLOW_RG_MIN &&
    g >= COLLISION_YELLOW_RG_MIN &&
    b <= COLLISION_YELLOW_B_MAX
  ) {
    return true;
  }
  return false;
}

function collidesIndoor(
  footX: number,
  footY: number,
  shopData: ImageData,
): boolean {
  const bx = footX - CHAR_BBOX_HALF_W;
  const by = footY - CHAR_BBOX_HEIGHT;
  const bw = CHAR_BBOX_HALF_W * 2;
  const bh = CHAR_BBOX_HEIGHT;
  return (
    isBlockedIndoorPixel(shopData, bx, by) ||
    isBlockedIndoorPixel(shopData, bx + bw, by) ||
    isBlockedIndoorPixel(shopData, bx, by + bh) ||
    isBlockedIndoorPixel(shopData, bx + bw, by + bh)
  );
}

// Water test against the BACKGROUND art (not collision). Used by
// the can-fish probe so building walls and tree trunks (which are
// also red on collision.png) don't qualify.
function isWaterPixel(data: ImageData, x: number, y: number): boolean {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= data.width || iy >= data.height) return false;
  const i = (iy * data.width + ix) * 4;
  const r = data.data[i];
  const g = data.data[i + 1];
  const b = data.data[i + 2];
  const a = data.data[i + 3];
  return (
    a > 50 &&
    r <= WATER_R_MAX &&
    g >= WATER_G_MIN &&
    b >= WATER_B_MIN
  );
}

// Outdoor blue door marker test. The collision PNG paints a blue
// patch inside each shop's red footprint at the actual building door;
// the foot-bbox overlapping that patch auto-fires the entry trigger.
function isBluePixel(data: ImageData, x: number, y: number): boolean {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= data.width || iy >= data.height) return false;
  const i = (iy * data.width + ix) * 4;
  const r = data.data[i];
  const g = data.data[i + 1];
  const b = data.data[i + 2];
  const a = data.data[i + 3];
  return (
    a > 50 &&
    b >= COLLISION_BLUE_B_MIN &&
    r <= COLLISION_BLUE_R_MAX &&
    g <= COLLISION_BLUE_G_MAX
  );
}

function isBlueAtBbox(
  footX: number,
  footY: number,
  data: ImageData,
): boolean {
  const bx = footX - CHAR_BBOX_HALF_W;
  const by = footY - CHAR_BBOX_HEIGHT;
  const bw = CHAR_BBOX_HALF_W * 2;
  const bh = CHAR_BBOX_HEIGHT;
  return (
    isBluePixel(data, bx, by) ||
    isBluePixel(data, bx + bw, by) ||
    isBluePixel(data, bx, by + bh) ||
    isBluePixel(data, bx + bw, by + bh)
  );
}

// Yellow centroid scan — runs once at load. Returns null if the mask
// has no yellow pixels (defensive fallback before any are painted).
function scanYellowCentroid(
  data: ImageData,
): { foot: { x: number; y: number }; zone: Rect } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let maxY = -1;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const i = (y * data.width + x) * 4;
      const r = data.data[i];
      const g = data.data[i + 1];
      const b = data.data[i + 2];
      const a = data.data[i + 3];
      if (
        a > 50 &&
        r >= COLLISION_YELLOW_RG_MIN &&
        g >= COLLISION_YELLOW_RG_MIN &&
        b <= COLLISION_YELLOW_B_MAX
      ) {
        sumX += x;
        sumY += y;
        count++;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  const foot = {
    x: Math.round(sumX / count),
    y: Math.round(sumY / count),
  };
  // Interaction zone sits one pixel south of the yellow patch's
  // bottom edge — that's where the player can stand and talk.
  const zone: Rect = {
    x: foot.x - 16,
    y: maxY + 1,
    w: 32,
    h: 16,
  };
  return { foot, zone };
}

// Collision lookup. Out-of-bounds reads block (so the player can't
// leave the map even if they squeeze along an edge).
function isBlockedPixel(data: ImageData, x: number, y: number): boolean {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= data.width || iy >= data.height) return true;
  const i = (iy * data.width + ix) * 4;
  const r = data.data[i];
  const g = data.data[i + 1];
  const b = data.data[i + 2];
  const a = data.data[i + 3];
  return (
    a > 0 &&
    r >= COLLISION_RED_R_MIN &&
    g <= COLLISION_RED_GB_MAX &&
    b <= COLLISION_RED_GB_MAX
  );
}

// Sample the four corners of the foot bbox. One pixel per corner is
// enough since the painted mask is conservative on edges (anti-alias
// pixels read as red because of permissive thresholds).
function collidesAt(
  footX: number,
  footY: number,
  collision: ImageData,
): boolean {
  const bx = footX - CHAR_BBOX_HALF_W;
  const by = footY - CHAR_BBOX_HEIGHT;
  const bw = CHAR_BBOX_HALF_W * 2;
  const bh = CHAR_BBOX_HEIGHT;
  return (
    isBlockedPixel(collision, bx, by) ||
    isBlockedPixel(collision, bx + bw, by) ||
    isBlockedPixel(collision, bx, by + bh) ||
    isBlockedPixel(collision, bx + bw, by + bh)
  );
}

// ── Korean keyboard layout: ㅈ/ㄴ/ㅁ/ㅇ map to W/S/A/D when 한영 is on.
const KEY_UP = new Set(["w", "W", "ㅈ", "ㅉ", "ArrowUp"]);
const KEY_DOWN = new Set(["s", "S", "ㄴ", "ArrowDown"]);
const KEY_LEFT = new Set(["a", "A", "ㅁ", "ArrowLeft"]);
const KEY_RIGHT = new Set(["d", "D", "ㅇ", "ArrowRight"]);

// Visual zoom applied at render time. The map and character live in
// 1x map coordinates (so collision rects, spawn point, and movement
// math stay in native asset units) and we let the canvas scale up by
// MAP_SCALE for display. Visible map area shrinks proportionally:
// VIEWPORT (306) ÷ MAP_SCALE (2) = 153px of map visible at a time.
const MAP_SCALE = 2;

// Flat-theme UI sprites used for the action button + text banners +
// catch-gauge minigame. Paths use encodeURI so the literal "UI
// assets" space resolves correctly in the browser and Next.js's
// static handler.
const UI_FLAT_BASE =
  "/images/fishing/UI_assets/01_Flat_Theme/Sprites/";
// Frame order in the asset is HIGHEST-NUMBER-FIRST: _4 sits highest
// off the surface (idle), _3 dips a touch (hover), _1 is fully
// pressed. _2 is an intermediate "almost pressed" frame we don't
// currently use.
const UI_ACTION_BUTTON_IDLE = encodeURI(
  UI_FLAT_BASE + "UI_Flat_Button02a_4.png",
);
const UI_ACTION_BUTTON_HOVER = encodeURI(
  UI_FLAT_BASE + "UI_Flat_Button02a_3.png",
);
const UI_ACTION_BUTTON_PRESSED = encodeURI(
  UI_FLAT_BASE + "UI_Flat_Button02a_1.png",
);
// Gauge-fail toast lines + on-screen duration. Defined locally so we
// can keep the data file (FISH_FAIL_RETRACT_MS) untouched while still
// holding the toast long enough to read — 1500 ms feels like a clean
// "miss" beat before the rod retracts back to walk. Pressing outside
// the green zone always reads as "타이밍을 놓쳤다." regardless of
// which side missed; the early/late split was confusing in playtest.
const FISH_TEXT_MISTIMED = "타이밍을 놓쳤다.";
const FAIL_TOAST_DURATION_MS = 1500;

const UI_GAUGE_BAR = encodeURI(UI_FLAT_BASE + "UI_Flat_Bar01a.png");
const UI_GAUGE_FILL = encodeURI(UI_FLAT_BASE + "UI_Flat_BarFill01a.png");
const UI_GAUGE_MARKER = encodeURI(UI_FLAT_BASE + "UI_Flat_Handle06a.png");
// Result popup frame. Frame01a is a 96×64 light-gray slab with a 1-px
// outer border, 2-px highlight and 1-px shadow — i.e. ~4 px caps for
// 9-slice. Painted via the Frame9Slice helper which draws each slice
// on a canvas at its native size (corners) or stretched along one
// axis (edges) / both (center). CSS `border-image` was tried first
// but blurred the border in some browsers despite image-rendering:
// pixelated, so we draw it ourselves.
const UI_POPUP_FRAME = encodeURI(UI_FLAT_BASE + "UI_Flat_Frame01a.png");
// Confirm-button icon for the catch popup. 17×14 source, rendered
// at 2× = 34×28 inside a button-shaped container.
const UI_ICON_CHECK = encodeURI(UI_FLAT_BASE + "UI_Flat_IconCheck01a.png");
// Inventory / info / ranking panel UI sprites.
const UI_TAB_MARKER = encodeURI(UI_FLAT_BASE + "UI_Flat_FrameMarker01a.png");
const UI_INV_SLOT = encodeURI(UI_FLAT_BASE + "UI_Flat_FrameSlot01c.png");
const UI_ICON_CROSS = encodeURI(UI_FLAT_BASE + "UI_Flat_IconCross01a.png");
const UI_ICON_ARROW = encodeURI(UI_FLAT_BASE + "UI_Flat_IconArrow01a.png");

// Joystick is parked at a fixed bottom-left dock so the player can
// always thumb-drag from a known spot. Outer diameter ≈ 24% of the
// 306px viewport (per design note "20–25%"). Idle state fades to a
// faint hint, drag state lights up.
const JOYSTICK_BASE_X = 50;
const JOYSTICK_BASE_Y = VIEWPORT - 50;
const JOYSTICK_RADIUS = 36;
const JOYSTICK_KNOB = 16;
const JOYSTICK_DEAD_ZONE = 5;

export default function FishingGame({ open, onClose, nickname }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Loop-owned state lives in refs to avoid React re-renders at 60fps.
  const stateRef = useRef({
    x: SPAWN_X,
    y: SPAWN_Y,
    dir: "down" as Direction,
    moving: false,
    frame: 0,
    frameAcc: 0,
    // Fishing state machine. mode = "walk" outside the minigame;
    // "fishingCast" plays the 5-frame cast; "fishingWait" loops the
    // bobber bobbing while fake/real bite events fire on schedule.
    mode: "walk" as Mode,
    fishFrame: 0,
    fishFrameAcc: 0,
    bobberFrame: 0,
    bobberAcc: 0,
    // Bite-system bookkeeping. waitElapsed is the cumulative time
    // spent in fishingWait (paused during fake bites); subT is the
    // ms elapsed in the current sub-mode (cast / wait / fake / bite
    // / success / fail). events is the schedule rolled at the start
    // of each wait — fake bites + the eventual real bite.
    waitElapsed: 0,
    subT: 0,
    events: [] as BiteEvent[],
    eventIdx: 0,
    realBiteAt: 0,
    shadowAt: 0,
    shadowFrame: 0,
    shadowAcc: 0,
    // Catch-gauge minigame state. Activated when fishingBite begins;
    // marker ping-pongs across the bar at gaugeBaseSpeed (modulated
    // by gaugeJitter) and the action button checks markerPos
    // against the success-zone window.
    fishGrade: "common" as FishGrade,
    gaugeMarkerPos: 0,
    gaugeMarkerDir: 1,
    gaugeBaseSpeed: 1.4,
    gaugeJitter: 0.1,
    gaugeSuccessStart: 0,
    gaugeSuccessWidth: 0.4,
    gaugeEdgeHits: 0,
    gaugePhase: 0,
    // Catch decided at bite time, surfaced to the popup on success.
    catchResult: null as CatchResult | null,
  });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const joyRef = useRef({
    active: false,
    pointerId: -1,
    dx: 0,
    dy: 0,
  });
  // Scene + interaction state. `sceneRef` is read by the game loop
  // every frame; the `scene` state mirrors it for re-rendering UI
  // (prompt button, dialog) when the scene changes.
  const sceneRef = useRef<Scene>("outdoor");
  const promptRef = useRef<Prompt>(null);
  // Fade overlay for scene transitions. `t` runs 0 → 1 over
  // SCENE_FADE_SECONDS; at t=0.5 the scene swap fires (so the new
  // scene is already live during fade-in).
  const fadeRef = useRef<{
    active: boolean;
    t: number;
    midDone: boolean;
    onMid: (() => void) | null;
  }>({ active: false, t: 0, midDone: false, onMid: null });
  // `assets` lives in state (not a ref) so we re-render once assets
  // resolve. setState only fires inside the async .then() callback,
  // which sidesteps react-hooks/set-state-in-effect.
  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [scene, setScene] = useState<Scene>("outdoor");
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [npcDialog, setNpcDialog] = useState(false);
  const [yellowToast, setYellowToast] = useState(false);
  const [mode, setMode] = useState<Mode>("walk");
  const [canFish, setCanFish] = useState(false);
  const canFishRef = useRef(false);
  // Floating action button visual state. `actionHover` switches the
  // sprite to the hover variant on PC (mouse only); `actionPressed`
  // takes priority and shows the pressed sprite while held down.
  // Both reset on pointer up / leave / cancel.
  const [actionHover, setActionHover] = useState(false);
  const [actionPressed, setActionPressed] = useState(false);
  // Catch result popup state. On success the gauge press resolves
  // the catch (fish/treasure/trash) and we render a popup that the
  // player has to confirm before the game returns to walk. The
  // failure toast (early/late/got-away) auto-clears after
  // FAIL_TOAST_DURATION_MS, so we keep a separate transient string
  // for it.
  const [catchPopup, setCatchPopup] = useState<CatchResult | null>(null);
  const [failToast, setFailToast] = useState<string | null>(null);
  // Screen-shake controls for legendary/mythic catches. Targets the
  // inner game pane (canvas + overlays) so the popup itself rides
  // along with the shake — feels more like the world is reacting.
  const shakeControls = useAnimationControls();
  // Inventory map: itemKey ("fish-12" / "forage-3") → stack count.
  // Local state only for now; Firestore sync is a later phase. The
  // catch popup confirm hook adds to this and grants xp at the same
  // time so the inventory and stats stay in sync.
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [totalExp, setTotalExp] = useState(0);
  const [totalCatches, setTotalCatches] = useState(0);
  const [totalStarlight, setTotalStarlight] = useState(0);
  // Brief level-up banner shown when totalExp crosses a threshold.
  const [levelUpBanner, setLevelUpBanner] = useState<number | null>(null);
  // Character-click bag button + the panel it opens.
  const [bagButton, setBagButton] = useState<{
    visible: boolean;
    x: number;   // canvas-local coords
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"inventory" | "info" | "ranking">(
    "inventory",
  );
  const [invPage, setInvPage] = useState(0);
  const [invSelected, setInvSelected] = useState<string | null>(null);
  // Panel-open ref read by the game loop to gate movement input
  // without a re-render every frame.
  const panelOpenRef = useRef(false);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);
  // Joystick visual state mirrored into React for the DOM overlay.
  // Updates only on pointer events (not 60fps), so React isn't thrashed.
  // dx/dy here are knob offset in pixels relative to the static base.
  const [joyView, setJoyView] = useState<{
    active: boolean;
    dx: number;
    dy: number;
  }>({ active: false, dx: 0, dy: 0 });

  // Auto-dismiss the yellow shop "준비중입니다" toast after 1.6s.
  useEffect(() => {
    if (!yellowToast) return;
    const t = setTimeout(() => setYellowToast(false), 1600);
    return () => clearTimeout(t);
  }, [yellowToast]);

  // Level-up banner auto-clears after a brief celebration window.
  useEffect(() => {
    if (levelUpBanner == null) return;
    const t = setTimeout(() => setLevelUpBanner(null), 1800);
    return () => clearTimeout(t);
  }, [levelUpBanner]);

  // Screen shake on legendary/mythic catches. Mythic shakes harder
  // and longer than legendary — the rest of the visual flair (glow,
  // sparkles) is rendered inside the popup itself.
  useEffect(() => {
    if (!catchPopup) return;
    const grade = catchPopup.kind === "fish" ? catchPopup.grade : null;
    if (grade === "legendary") {
      shakeControls.start({
        x: [0, -2, 2, -2, 2, -1, 1, 0],
        transition: { duration: 0.5 },
      });
    } else if (grade === "mythic") {
      shakeControls.start({
        x: [0, -4, 4, -4, 4, -3, 3, -2, 2, 0],
        y: [0, 1, -1, 1, -1, 1, 0, 0, 0, 0],
        transition: { duration: 0.7 },
      });
    }
  }, [catchPopup, shakeControls]);

  // Reset loop refs every time the panel re-opens so a closed/reopened
  // game starts at the spawn point with no leftover input. joyView is
  // managed by pointer events; we don't reset it here to avoid
  // setState-in-effect.
  useEffect(() => {
    if (!open) return;
    stateRef.current = {
      x: SPAWN_X,
      y: SPAWN_Y,
      dir: "down",
      moving: false,
      frame: 0,
      frameAcc: 0,
      mode: "walk",
      fishFrame: 0,
      fishFrameAcc: 0,
      bobberFrame: 0,
      bobberAcc: 0,
      waitElapsed: 0,
      subT: 0,
      events: [],
      eventIdx: 0,
      realBiteAt: 0,
      shadowAt: 0,
      shadowFrame: 0,
      shadowAcc: 0,
      fishGrade: "common",
      gaugeMarkerPos: 0,
      gaugeMarkerDir: 1,
      gaugeBaseSpeed: 1.4,
      gaugeJitter: 0.1,
      gaugeSuccessStart: 0,
      gaugeSuccessWidth: 0.4,
      gaugeEdgeHits: 0,
      gaugePhase: 0,
      catchResult: null,
    };
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    sceneRef.current = "outdoor";
    promptRef.current = null;
    fadeRef.current = { active: false, t: 0, midDone: false, onMid: null };
    canFishRef.current = false;
  }, [open]);

  // Asset loader — runs each time the panel opens. The browser cache
  // makes subsequent opens cheap; we keep the previous assets in
  // state during reload so the canvas doesn't flash empty. The
  // collision PNG is rasterised into ImageData here once so the game
  // loop can do O(1) pixel lookups instead of re-decoding per frame.
  //
  // Every loader is fault-tolerant: a 404 logs the URL and resolves
  // with a 1×1 transparent placeholder (or empty ImageData) instead
  // of rejecting. A single missing asset can no longer wedge the
  // panel on "불러오는 중...". The console output from the dump call
  // below + the per-loader error log makes path mismatches easy to
  // spot in devtools.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const PLACEHOLDER_PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==";
    // Single loader used for everything — never rejects, so Promise.all
    // always resolves even if individual assets 404.
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.error("[fishing] asset 404:", src);
          const ph = new Image();
          ph.onload = () => resolve(ph);
          ph.src = PLACEHOLDER_PNG;
        };
        img.src = src;
      });
    // Backwards-compat alias used by the gauge UI block below — kept
    // so code reads as "this is best-effort, OK if missing".
    const loadOptional = load;
    const blankImageData = (): ImageData => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d")!.getImageData(0, 0, 1, 1);
    };
    const loadCollision = async (src: string): Promise<ImageData> => {
      const img = await load(src);
      const c = document.createElement("canvas");
      c.width = img.width || 1;
      c.height = img.height || 1;
      const cx = c.getContext("2d");
      if (!cx) return blankImageData();
      cx.drawImage(img, 0, 0);
      try {
        return cx.getImageData(0, 0, c.width, c.height);
      } catch {
        return blankImageData();
      }
    };
    // The 배경_front.png artwork was authored with some semi-opaque
    // brush strokes, so drawing it raw lets the player show through
    // tree canopies / roof eaves. Force every visible pixel to full
    // alpha here so the front layer occludes the player completely
    // (the spec calls for binary opacity, not soft transparency).
    const loadOpaqueOverlay = async (
      src: string,
    ): Promise<HTMLCanvasElement> => {
      const img = await load(src);
      const c = document.createElement("canvas");
      c.width = img.width || 1;
      c.height = img.height || 1;
      const cx = c.getContext("2d");
      if (!cx) return c;
      cx.drawImage(img, 0, 0);
      try {
        const data = cx.getImageData(0, 0, c.width, c.height);
        const px = data.data;
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] > 0) px[i] = 255;
        }
        cx.putImageData(data, 0, 0);
      } catch {
        // tainted or zero-size — leave canvas as-is.
      }
      return c;
    };
    // Loader for the background ART that returns BOTH the image
    // (for rendering) and ImageData (for sampling water pixels).
    const loadBackground = async (
      src: string,
    ): Promise<{ img: HTMLImageElement; data: ImageData }> => {
      const img = await load(src);
      const c = document.createElement("canvas");
      c.width = img.width || 1;
      c.height = img.height || 1;
      const cx = c.getContext("2d");
      if (!cx) return { img, data: blankImageData() };
      cx.drawImage(img, 0, 0);
      try {
        return { img, data: cx.getImageData(0, 0, c.width, c.height) };
      } catch {
        return { img, data: blankImageData() };
      }
    };
    // Dump every URL we're about to fetch. If the panel hangs again
    // the network tab + this list make it trivial to find the
    // mismatched name.
    const allPaths = [
      ASSETS.background,
      ASSETS.mapFront,
      ASSETS.collision,
      ASSETS.shopInterior,
      ASSETS.shopCollision,
      ASSETS.charBase,
      ASSETS.npcChar,
      ASSETS.eyes,
      ASSETS.shirt,
      ASSETS.pants,
      ASSETS.shoes,
      ASSETS.hair,
      ASSETS.shadow,
      ASSETS_FISH.base,
      ASSETS_FISH.eyes,
      ASSETS_FISH.shirt,
      ASSETS_FISH.pants,
      ASSETS_FISH.shoes,
      ASSETS_FISH.hair,
      ASSETS_FISH.rod,
      ASSETS_FISH.bobber,
      ASSETS_FISH.fishShadow,
      UI_GAUGE_BAR,
      UI_GAUGE_FILL,
      UI_GAUGE_MARKER,
      ASSETS_FISH_CATALOG.fishAll,
      ASSETS_FORAGE_CATALOG.forageAll,
    ];
    console.log("[fishing] loading", allPaths.length, "assets:", allPaths);
    Promise.all([
      loadBackground(ASSETS.background),
      loadOpaqueOverlay(ASSETS.mapFront),
      loadCollision(ASSETS.collision),
      load(ASSETS.shopInterior),
      loadCollision(ASSETS.shopCollision),
      load(ASSETS.charBase),
      load(ASSETS.npcChar),
      load(ASSETS.eyes),
      load(ASSETS.shirt),
      load(ASSETS.pants),
      load(ASSETS.shoes),
      load(ASSETS.hair),
      load(ASSETS.shadow),
      load(ASSETS_FISH.base),
      load(ASSETS_FISH.eyes),
      load(ASSETS_FISH.shirt),
      load(ASSETS_FISH.pants),
      load(ASSETS_FISH.shoes),
      load(ASSETS_FISH.hair),
      load(ASSETS_FISH.rod),
      load(ASSETS_FISH.bobber),
      load(ASSETS_FISH.fishShadow),
      loadOptional(UI_GAUGE_BAR),
      loadOptional(UI_GAUGE_FILL),
      loadOptional(UI_GAUGE_MARKER),
      load(ASSETS_FISH_CATALOG.fishAll),
      load(ASSETS_FORAGE_CATALOG.forageAll),
    ])
      .then(
        ([
          mapBundle,
          mapFront,
          collision,
          shopInterior,
          shopCollision,
          char,
          npcChar,
          eyes,
          shirt,
          pants,
          shoes,
          hair,
          shadow,
          fishBase,
          fishEyes,
          fishShirt,
          fishPants,
          fishShoes,
          fishHair,
          fishRod,
          fishBobber,
          fishShadow,
          uiGaugeBar,
          uiGaugeFill,
          uiGaugeMarker,
          fishCatalog,
          forageCatalog,
        ]) => {
          if (cancelled) return;
          // Yellow patch → NPC anchor + interaction zone. Fallback is
          // a sensible default position if the marker is missing so
          // the scene still renders during asset iteration.
          const npc = scanYellowCentroid(shopCollision) ?? {
            foot: { x: 80, y: 80 },
            zone: { x: 64, y: 88, w: 32, h: 16 },
          };
          setAssets({
            map: mapBundle.img,
            backgroundData: mapBundle.data,
            mapFront,
            collision,
            shopInterior,
            shopCollision,
            npcFoot: npc.foot,
            npcZone: npc.zone,
            char,
            npcChar,
            eyes,
            shirt,
            pants,
            shoes,
            hair,
            shadow,
            fishBase,
            fishEyes,
            fishShirt,
            fishPants,
            fishShoes,
            fishHair,
            fishRod,
            fishBobber,
            fishShadow,
            uiGaugeBar,
            uiGaugeFill,
            uiGaugeMarker,
            fishCatalog,
            forageCatalog,
          });
        },
      )
      .catch((err) => {
        if (!cancelled) console.error("[fishing] asset load failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Trigger a 0.3s fade transition. The midpoint callback runs when
  // the screen is fully black, swapping scene + position so fade-in
  // already shows the new scene. While the fade is active, movement
  // input is dropped (handled in the loop).
  const startTransition = useCallback((onMid: () => void) => {
    if (fadeRef.current.active) return;
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    setJoyView({ active: false, dx: 0, dy: 0 });
    fadeRef.current = { active: true, t: 0, midDone: false, onMid };
  }, []);

  // Fired by the game loop the first frame the player's foot enters a
  // door / exit / yellow-shop zone. Entry and exit are auto-triggered
  // by walking; the NPC zone only sets up the prompt and waits for E.
  const triggerZone = useCallback(
    (zone: Prompt) => {
      if (fadeRef.current.active) return;
      if (zone === "blueDoor") {
        startTransition(() => {
          sceneRef.current = "fishshop";
          stateRef.current = {
            x: FISHSHOP_INDOOR_SPAWN_X,
            y: FISHSHOP_INDOOR_SPAWN_Y,
            dir: "up",
            moving: false,
            frame: 0,
            frameAcc: 0,
            mode: "walk",
            fishFrame: 0,
            fishFrameAcc: 0,
            bobberFrame: 0,
            bobberAcc: 0,
            waitElapsed: 0,
            subT: 0,
            events: [],
            eventIdx: 0,
            realBiteAt: 0,
            shadowAt: 0,
            shadowFrame: 0,
            shadowAcc: 0,
            fishGrade: "common",
            gaugeMarkerPos: 0,
            gaugeMarkerDir: 1,
            gaugeBaseSpeed: 1.4,
            gaugeJitter: 0.1,
            gaugeSuccessStart: 0,
            gaugeSuccessWidth: 0.4,
            gaugeEdgeHits: 0,
            gaugePhase: 0,
            catchResult: null,
          };
          promptRef.current = null;
          canFishRef.current = false;
          setScene("fishshop");
          setPrompt(null);
          setMode("walk");
          setCanFish(false);
        });
      } else if (zone === "exit") {
        startTransition(() => {
          sceneRef.current = "outdoor";
          stateRef.current = {
            x: FISHSHOP_EXIT_SPAWN_X,
            y: FISHSHOP_EXIT_SPAWN_Y,
            dir: "down",
            moving: false,
            frame: 0,
            frameAcc: 0,
            mode: "walk",
            fishFrame: 0,
            fishFrameAcc: 0,
            bobberFrame: 0,
            bobberAcc: 0,
            waitElapsed: 0,
            subT: 0,
            events: [],
            eventIdx: 0,
            realBiteAt: 0,
            shadowAt: 0,
            shadowFrame: 0,
            shadowAcc: 0,
            fishGrade: "common",
            gaugeMarkerPos: 0,
            gaugeMarkerDir: 1,
            gaugeBaseSpeed: 1.4,
            gaugeJitter: 0.1,
            gaugeSuccessStart: 0,
            gaugeSuccessWidth: 0.4,
            gaugeEdgeHits: 0,
            gaugePhase: 0,
            catchResult: null,
          };
          promptRef.current = null;
          canFishRef.current = false;
          setScene("outdoor");
          setPrompt(null);
          setMode("walk");
          setCanFish(false);
        });
      } else if (zone === "yellowDoor") {
        setYellowToast(true);
      }
    },
    [startTransition],
  );

  // Resolve the catch and initialise the gauge. Called once at the
  // moment of the real bite. The catch is determined NOW (forage vs
  // fish, then specific grade/item) so gauge difficulty matches the
  // grade and the popup can show the actual item on success — we
  // never re-roll on press.
  const rollGauge = useCallback((s: typeof stateRef.current) => {
    const result = rollCatchResult();
    s.catchResult = result;
    const grade = gradeForGauge(result);
    const cfg = FISH_GRADES[grade];
    s.fishGrade = grade;
    s.gaugeBaseSpeed = cfg.baseSpeed;
    s.gaugeJitter = cfg.jitter;
    s.gaugeSuccessWidth = cfg.width;
    // Place the success zone anywhere along the bar (uniform).
    s.gaugeSuccessStart = Math.random() * (1 - cfg.width);
    // Marker starts somewhere in the left third moving right.
    s.gaugeMarkerPos = Math.random() * 0.3;
    s.gaugeMarkerDir = 1;
    s.gaugeEdgeHits = 0;
    s.gaugePhase = Math.random() * Math.PI * 2;
  }, []);

  // Roll a new bite schedule when entering wait. Real bite drops in
  // [3..10]s, optionally preceded by 0..2 fake bites scattered
  // earlier; the fish shadow appears FISH_SHADOW_LEAD_MS before the
  // real bite so the player gets a tell.
  const scheduleFishingEvents = useCallback((s: typeof stateRef.current) => {
    const realAt =
      FISH_WAIT_MIN_MS +
      Math.random() * (FISH_WAIT_MAX_MS - FISH_WAIT_MIN_MS);
    const numFakes =
      Math.random() < FISH_FAKE_BITE_PROBABILITY
        ? Math.floor(Math.random() * (FISH_FAKE_BITE_MAX + 1))
        : 0;
    const events: BiteEvent[] = [];
    for (let i = 0; i < numFakes; i++) {
      events.push({
        at: 800 + Math.random() * Math.max(0, realAt - 1600),
        type: "fake",
      });
    }
    events.push({ at: realAt, type: "real" });
    events.sort((a, b) => a.at - b.at);
    s.events = events;
    s.eventIdx = 0;
    s.realBiteAt = realAt;
    s.shadowAt = Math.max(500, realAt - FISH_SHADOW_LEAD_MS);
    s.waitElapsed = 0;
    s.shadowFrame = 0;
    s.shadowAcc = 0;
  }, []);

  // Cancel any active fishing back to walking. Used by Esc and by
  // the action button when the player wants out of wait.
  const cancelFishingToWalk = useCallback(() => {
    const s = stateRef.current;
    s.mode = "walk";
    s.subT = 0;
    s.fishFrame = 0;
    s.fishFrameAcc = 0;
    s.events = [];
    s.eventIdx = 0;
    s.waitElapsed = 0;
    s.catchResult = null;
    setMode("walk");
    setFailToast(null);
  }, []);

  // Start a new cast. Movement input is cleared so the animation
  // plays without dragging.
  const startCast = useCallback(() => {
    const s = stateRef.current;
    s.mode = "fishingCast";
    s.subT = 0;
    s.fishFrame = 0;
    s.fishFrameAcc = 0;
    s.events = [];
    s.eventIdx = 0;
    s.waitElapsed = 0;
    s.catchResult = null;
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    setJoyView({ active: false, dx: 0, dy: 0 });
    setMode("fishingCast");
    setFailToast(null);
  }, []);

  // Single context-aware action. Wired to both Space and the
  // floating action button. The mode dictates the response:
  //   walk + canFish → start cast
  //   walk + npc zone → open dialog
  //   fishingCast / fishingWait → cancel back to walk
  //   fishingFakeBite → fail with "너무 빨랐다..."
  //   fishingBite → success with "물고기를 잡았다!"
  //   fishingSuccess / fishingFail → ignored (auto-advance)
  const handleAction = useCallback(() => {
    if (npcDialog) {
      setNpcDialog(false);
      return;
    }
    if (fadeRef.current.active) return;
    const s = stateRef.current;
    if (s.mode === "fishingBite") {
      // Gauge press — success only when marker is in the green zone.
      const inZone =
        s.gaugeMarkerPos >= s.gaugeSuccessStart &&
        s.gaugeMarkerPos <= s.gaugeSuccessStart + s.gaugeSuccessWidth;
      if (inZone) {
        s.mode = "fishingSuccess";
        s.subT = 0;
        setMode("fishingSuccess");
        // The catch was rolled at bite time so the gauge difficulty
        // could match the fish grade — surface it in the popup now.
        setCatchPopup(s.catchResult);
      } else {
        // Missed press — single "mistimed" line, no early/late split.
        s.mode = "fishingFail";
        s.subT = 0;
        s.catchResult = null;
        setMode("fishingFail");
        setFailToast(FISH_TEXT_MISTIMED);
      }
      return;
    }
    if (
      s.mode === "fishingWait" ||
      s.mode === "fishingCast" ||
      s.mode === "fishingFakeBite"
    ) {
      // Cast/wait/fake bite all just cancel back to walk; the old
      // "press during fake bite = fail" rule is gone with the gauge
      // minigame.
      cancelFishingToWalk();
      return;
    }
    if (s.mode === "fishingSuccess" || s.mode === "fishingFail") {
      return;
    }
    // walk mode — start cast or open NPC dialog
    if (sceneRef.current === "outdoor" && canFishRef.current) {
      startCast();
      return;
    }
    if (promptRef.current === "npc") {
      setNpcDialog(true);
    }
  }, [npcDialog, cancelFishingToWalk, startCast]);

  // Backward-compatible alias used by the Esc handler — same as
  // cancelFishingToWalk for any non-walk fishing state.
  const toggleFishing = cancelFishingToWalk;

  // Keyboard input. We listen on window so focus on the canvas isn't
  // required — the panel is the foreground UI when open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (KEY_UP.has(e.key)) {
        keysRef.current.up = down;
        e.preventDefault();
      } else if (KEY_DOWN.has(e.key)) {
        keysRef.current.down = down;
        e.preventDefault();
      } else if (KEY_LEFT.has(e.key)) {
        keysRef.current.left = down;
        e.preventDefault();
      } else if (KEY_RIGHT.has(e.key)) {
        keysRef.current.right = down;
        e.preventDefault();
      } else if (e.key === " " || e.code === "Space") {
        // Mirror the mouse/touch pressed-state on the action button
        // so Space gives the same visual feedback. Auto-repeat (held
        // Space) shouldn't re-fire handleAction or thrash setState.
        e.preventDefault();
        if (down) {
          if (!e.repeat) {
            setActionPressed(true);
            handleAction();
          }
        } else {
          setActionPressed(false);
        }
      } else if (down && e.key === "Escape") {
        if (npcDialog) {
          setNpcDialog(false);
        } else if (stateRef.current.mode !== "walk") {
          toggleFishing();
        } else {
          onClose();
        }
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [open, onClose, handleAction, npcDialog, toggleFishing]);

  // Static-base virtual joystick. Pointer-down anywhere in the stage
  // captures the pointer; the input vector is computed from the
  // pointer position relative to the fixed base, so the player can
  // thumb-drag from anywhere on the canvas and the visible knob
  // tracks the drag at the bottom-left dock. Single-pointer only.
  const updateJoy = (
    e: React.PointerEvent<HTMLDivElement>,
    isStart: boolean,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let dx = px - JOYSTICK_BASE_X;
    let dy = py - JOYSTICK_BASE_Y;
    const len = Math.hypot(dx, dy);
    if (len > JOYSTICK_RADIUS) {
      dx = (dx / len) * JOYSTICK_RADIUS;
      dy = (dy / len) * JOYSTICK_RADIUS;
    }
    if (len < JOYSTICK_DEAD_ZONE) {
      dx = 0;
      dy = 0;
    }
    joyRef.current.dx = dx / JOYSTICK_RADIUS;
    joyRef.current.dy = dy / JOYSTICK_RADIUS;
    if (isStart) {
      joyRef.current.active = true;
      joyRef.current.pointerId = e.pointerId;
    }
    setJoyView({ active: true, dx, dy });
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Panel open → game is paused; don't engage joystick.
    if (panelOpenRef.current) return;
    if (joyRef.current.active) return;
    // Character-click detection. The character footprint is at
    // (s.x, s.y) in map units; the canvas paints with ctx.scale of
    // MAP_SCALE, so the on-screen foot pixel is (s.x-camX)*MAP_SCALE.
    // Hit-box is generous (~32 wide × 40 tall around the visible
    // sprite) so taps near the character also trigger the menu.
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = stateRef.current;
    const visibleW = VIEWPORT / MAP_SCALE;
    const visibleH = VIEWPORT / MAP_SCALE;
    const mw =
      sceneRef.current === "outdoor" ? MAP_WIDTH : INDOOR_MAP_WIDTH;
    const mh =
      sceneRef.current === "outdoor" ? MAP_HEIGHT : INDOOR_MAP_HEIGHT;
    const cx = clamp(
      Math.round(s.x - visibleW / 2),
      0,
      Math.max(0, mw - visibleW),
    );
    const cy = clamp(
      Math.round(s.y - visibleH / 2),
      0,
      Math.max(0, mh - visibleH),
    );
    const charSx = (s.x - cx) * MAP_SCALE;
    const charSy = (s.y - cy) * MAP_SCALE;
    const onChar =
      Math.abs(px - charSx) <= 16 &&
      py >= charSy - 44 &&
      py <= charSy + 6;
    if (onChar && s.mode === "walk") {
      // Toggle: re-tapping the character closes the menu.
      setBagButton((prev) =>
        prev.visible
          ? { visible: false, x: 0, y: 0 }
          : { visible: true, x: charSx, y: charSy - 28 },
      );
      return;
    }
    if (bagButton.visible) {
      // Tap anywhere else dismisses the floating menu.
      setBagButton({ visible: false, x: 0, y: 0 });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoy(e, true);
  }, [bagButton.visible]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const j = joyRef.current;
    if (!j.active || j.pointerId !== e.pointerId) return;
    updateJoy(e, false);
  }, []);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const j = joyRef.current;
    if (j.pointerId !== e.pointerId) return;
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    setJoyView({ active: false, dx: 0, dy: 0 });
  }, []);

  // Game loop. requestAnimationFrame yields naturally to the browser,
  // and dt is clamped to 50ms so a tab-switch pause doesn't teleport
  // the character through walls when we resume.
  useEffect(() => {
    if (!open || !assets) return;
    const imgs = assets;
    const collision = assets.collision;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let last = performance.now();

    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      tick(dt);
      render(ctx);
      raf = requestAnimationFrame(step);
    };

    const shopCollision = assets.shopCollision;
    const npcZone = assets.npcZone;

    // Pick the right collision check for the active scene. Both are
    // pixel-mask based: outdoor uses collision.png (red = blocked,
    // blue = entry trigger), indoor uses 생선가게_collision.png
    // (red = walls/counter, yellow = NPC tile).
    const sceneCollides = (
      currentScene: Scene,
      x: number,
      y: number,
    ): boolean => {
      if (currentScene === "outdoor") return collidesAt(x, y, collision);
      return collidesIndoor(x, y, shopCollision);
    };

    // Determine which interaction prompt (if any) is active based on
    // scene + foot position.
    const computeZone = (
      currentScene: Scene,
      x: number,
      y: number,
    ): Prompt => {
      if (currentScene === "outdoor") {
        // Blue marker → shop door. Disambiguate by x: left half of
        // the map = fish shop, right half = yellow shop.
        if (isBlueAtBbox(x, y, collision)) {
          return x < MAP_WIDTH / 2 ? "blueDoor" : "yellowDoor";
        }
        return null;
      }
      if (pointInRect(x, y, npcZone)) return "npc";
      if (pointInRect(x, y, FISHSHOP_EXIT_ZONE)) return "exit";
      return null;
    };

    const tick = (dt: number) => {
      const s = stateRef.current;
      const k = keysRef.current;
      const j = joyRef.current;
      const fade = fadeRef.current;
      const currentScene = sceneRef.current;

      // Advance the fade transition. Movement and prompts freeze
      // while a transition is in progress so input doesn't leak
      // between scenes.
      if (fade.active) {
        fade.t += dt / SCENE_FADE_SECONDS;
        if (fade.t >= 0.5 && !fade.midDone) {
          fade.midDone = true;
          fade.onMid?.();
        }
        if (fade.t >= 1) {
          fade.active = false;
          fade.t = 1;
        }
        return;
      }

      // Fishing modes — movement, zone triggers, and the can-fish
      // probe are all skipped while the player is casting/waiting.
      if (s.mode === "fishingCast") {
        const timings =
          s.dir === "left" || s.dir === "right"
            ? FISH_TIMINGS_LR
            : FISH_TIMINGS_UD;
        // Left/right play the cast in REVERSE so the wait pose ends
        // on frame 0 (rod held high). The state-frame counter still
        // advances 0→4, but each step's ms budget is read from the
        // mirrored timing slot to keep per-frame durations matched
        // to the visible animation.
        const isReversed =
          s.dir === "left" || s.dir === "right";
        const timingForState = (stateFrame: number) =>
          timings[isReversed ? FISH_FRAMES - 1 - stateFrame : stateFrame];
        s.fishFrameAcc += dt * 1000;
        while (
          s.fishFrame < FISH_FRAMES - 1 &&
          s.fishFrameAcc >= timingForState(s.fishFrame)
        ) {
          s.fishFrameAcc -= timingForState(s.fishFrame);
          s.fishFrame++;
        }
        if (
          s.fishFrame === FISH_FRAMES - 1 &&
          s.fishFrameAcc >= timingForState(s.fishFrame)
        ) {
          s.mode = "fishingWait";
          s.fishFrameAcc = 0;
          s.subT = 0;
          scheduleFishingEvents(s);
          setMode("fishingWait");
        }
        return;
      }
      if (s.mode === "fishingWait") {
        s.waitElapsed += dt * 1000;
        s.subT += dt * 1000;
        // Animate fish shadow once it appears.
        if (s.waitElapsed >= s.shadowAt) {
          s.shadowAcc += dt * 1000;
          while (s.shadowAcc >= FISH_SHADOW_FRAME_MS) {
            s.shadowAcc -= FISH_SHADOW_FRAME_MS;
            s.shadowFrame = (s.shadowFrame + 1) % FISH_SHADOW_FRAMES;
          }
        }
        // Trigger the next scheduled event if its time has come.
        if (
          s.eventIdx < s.events.length &&
          s.waitElapsed >= s.events[s.eventIdx].at
        ) {
          const ev = s.events[s.eventIdx];
          s.eventIdx++;
          s.subT = 0;
          if (ev.type === "fake") {
            s.mode = "fishingFakeBite";
            setMode("fishingFakeBite");
          } else {
            // Roll the gauge minigame for this real bite.
            rollGauge(s);
            s.mode = "fishingBite";
            setMode("fishingBite");
          }
        }
        return;
      }
      if (s.mode === "fishingFakeBite") {
        s.subT += dt * 1000;
        // Keep the fish-shadow flipbook animating during fake bites.
        s.shadowAcc += dt * 1000;
        while (s.shadowAcc >= FISH_SHADOW_FRAME_MS) {
          s.shadowAcc -= FISH_SHADOW_FRAME_MS;
          s.shadowFrame = (s.shadowFrame + 1) % FISH_SHADOW_FRAMES;
        }
        if (s.subT >= FISH_FAKE_BITE_DURATION_MS) {
          s.mode = "fishingWait";
          s.subT = 0;
          setMode("fishingWait");
        }
        return;
      }
      if (s.mode === "fishingBite") {
        s.subT += dt * 1000;
        // Keep the fish-shadow flipbook animating while the gauge is up.
        s.shadowAcc += dt * 1000;
        while (s.shadowAcc >= FISH_SHADOW_FRAME_MS) {
          s.shadowAcc -= FISH_SHADOW_FRAME_MS;
          s.shadowFrame = (s.shadowFrame + 1) % FISH_SHADOW_FRAMES;
        }
        // Animate the gauge marker. Speed is the base bar-widths
        // per second, modulated by a slow sin term so the marker
        // smoothly eases in and out rather than snapping between
        // speeds. ±jitter of base, never abrupt.
        const speed =
          s.gaugeBaseSpeed *
          (1 +
            s.gaugeJitter *
              Math.sin(
                performance.now() * GAUGE_SPEED_SIN_FREQ + s.gaugePhase,
              ));
        s.gaugeMarkerPos += s.gaugeMarkerDir * speed * dt;
        if (s.gaugeMarkerPos >= 1) {
          s.gaugeMarkerPos = 1;
          s.gaugeMarkerDir = -1;
          s.gaugeEdgeHits++;
        } else if (s.gaugeMarkerPos <= 0) {
          s.gaugeMarkerPos = 0;
          s.gaugeMarkerDir = 1;
          s.gaugeEdgeHits++;
        }
        if (s.gaugeEdgeHits >= GAUGE_MAX_EDGE_HITS) {
          // Timeout — show the "got away" toast and retract.
          s.mode = "fishingFail";
          s.subT = 0;
          s.catchResult = null;
          setMode("fishingFail");
          setFailToast(FISH_TEXT_GOT_AWAY);
        }
        return;
      }
      if (s.mode === "fishingSuccess") {
        // Hold here until the player confirms the popup. The popup
        // dismiss handler advances mode → walk; we don't auto-tick
        // out so the celebration stays on-screen as long as needed.
        return;
      }
      if (s.mode === "fishingFail") {
        s.subT += dt * 1000;
        if (s.subT >= FAIL_TOAST_DURATION_MS) {
          s.mode = "walk";
          s.subT = 0;
          setMode("walk");
          setFailToast(null);
        }
        return;
      }

      // Inventory / info / ranking panel locks movement input — the
      // game pauses while the modal is up.
      const inputLocked = panelOpenRef.current;
      let vx = 0;
      let vy = 0;
      if (!inputLocked) {
        if (k.up) vy -= 1;
        if (k.down) vy += 1;
        if (k.left) vx -= 1;
        if (k.right) vx += 1;
        if (j.active) {
          vx += j.dx;
          vy += j.dy;
        }
      }
      const len = Math.hypot(vx, vy);
      const moving = len > 0.05;
      if (len > 1) {
        vx /= len;
        vy /= len;
      }

      const mapW = currentScene === "outdoor" ? MAP_WIDTH : INDOOR_MAP_WIDTH;
      const mapH = currentScene === "outdoor" ? MAP_HEIGHT : INDOOR_MAP_HEIGHT;

      if (moving) {
        const speed = MOVE_SPEED_PX_PER_SEC;
        const dx = vx * speed * dt;
        const dy = vy * speed * dt;
        // Try x and y independently so the player can slide along
        // walls instead of getting stuck on a corner.
        if (dx !== 0) {
          const tryX = clamp(s.x + dx, 0, mapW);
          if (!sceneCollides(currentScene, tryX, s.y)) s.x = tryX;
        }
        if (dy !== 0) {
          const tryY = clamp(s.y + dy, 0, mapH);
          if (!sceneCollides(currentScene, s.x, tryY)) s.y = tryY;
        }
        // Direction follows the dominant axis. Vertical wins ties so a
        // pure-down keypress doesn't accidentally show a side facing.
        if (Math.abs(vx) > Math.abs(vy)) {
          s.dir = vx >= 0 ? "right" : "left";
        } else {
          s.dir = vy >= 0 ? "down" : "up";
        }
        s.frameAcc += dt * 1000;
        while (s.frameAcc >= WALK_FRAME_MS) {
          s.frameAcc -= WALK_FRAME_MS;
          s.frame = (s.frame + 1) % WALK_FRAMES;
        }
      } else {
        s.frame = 0;
        s.frameAcc = 0;
      }
      s.moving = moving;

      // Zone bookkeeping. The first frame the player crosses INTO a
      // zone (null → zone), entry/exit/yellow auto-trigger; the NPC
      // zone just publishes the prompt for E. setState fires only on
      // edges, so React doesn't re-render every frame.
      const newZone = computeZone(currentScene, s.x, s.y);
      if (newZone !== promptRef.current) {
        promptRef.current = newZone;
        setPrompt(newZone);
        if (
          newZone === "blueDoor" ||
          newZone === "exit" ||
          newZone === "yellowDoor"
        ) {
          triggerZone(newZone);
        }
      }

      // Can-fish probe: outdoor + walk mode only. Two gates that
      // must BOTH pass: the player has to be adjacent to water (any
      // probe distance) AND the bobber's eventual landing position
      // (BOBBER_DISTANCE ahead) has to be on water too — so casting
      // onto open sand or just past the shoreline never activates.
      // Edge-triggered setState keeps React from re-rendering every
      // tick.
      let nextCanFish = false;
      if (currentScene === "outdoor") {
        const dx = s.dir === "right" ? 1 : s.dir === "left" ? -1 : 0;
        const dy = s.dir === "down" ? 1 : s.dir === "up" ? -1 : 0;
        let nearWater = false;
        for (const dist of FISH_PROBE_DISTANCES) {
          if (
            isWaterPixel(
              assets.backgroundData,
              s.x + dx * dist,
              s.y + dy * dist,
            )
          ) {
            nearWater = true;
            break;
          }
        }
        const bobberOnWater =
          nearWater &&
          isWaterPixel(
            assets.backgroundData,
            s.x + dx * BOBBER_DISTANCE,
            s.y + dy * BOBBER_DISTANCE,
          );
        nextCanFish = nearWater && bobberOnWater;
      }
      if (nextCanFish !== canFishRef.current) {
        canFishRef.current = nextCanFish;
        setCanFish(nextCanFish);
      }
    };

    // Modular character composite. Used for both the player and the
    // NPC — only the base sheet, frame x/y, and color indices differ.
    const drawCharacter = (
      base: HTMLImageElement,
      footX: number,
      footY: number,
      camX: number,
      camY: number,
      frameCol: number,
      dir: Direction,
      colors: {
        eyes: number;
        shirt: number;
        pants: number;
        shoes: number;
        hair: number;
      },
    ) => {
      const drawX = Math.round(footX - SPRITE_CELL / 2 - camX);
      const drawY = Math.round(footY + 4 - SPRITE_CELL - camY);
      const sx = frameCol * SPRITE_CELL;
      const sy = WALK_ROWS[dir] * SPRITE_CELL;
      ctx.drawImage(
        base,
        sx, sy, SPRITE_CELL, SPRITE_CELL,
        drawX, drawY, SPRITE_CELL, SPRITE_CELL,
      );
      const layer = (img: HTMLImageElement, c: number) => {
        ctx.drawImage(
          img,
          c * VARIANT_WIDTH + sx, sy, SPRITE_CELL, SPRITE_CELL,
          drawX, drawY, SPRITE_CELL, SPRITE_CELL,
        );
      };
      layer(imgs.eyes, colors.eyes);
      layer(imgs.shirt, colors.shirt);
      layer(imgs.pants, colors.pants);
      layer(imgs.shoes, colors.shoes);
      layer(imgs.hair, colors.hair);
    };

    // Fishing-cast/wait composite. Mirrors drawCharacter but indexes
    // the 160-px-wide fishing variants and overlays the rod sprite
    // last so it sits on top of the "without" base body. The
    // FISHING sheet draws the body 4 px higher inside the cell (per
    // info.txt's "char moved up 4 px"), so we shift the destination
    // Y down by an extra 4 px to keep the character's feet aligned
    // with the walking pose.
    const drawFishingChar = (
      footX: number,
      footY: number,
      camX: number,
      camY: number,
      frameCol: number,
      dir: Direction,
      colors: {
        eyes: number;
        shirt: number;
        pants: number;
        shoes: number;
        hair: number;
      },
    ) => {
      const drawX = Math.round(footX - SPRITE_CELL / 2 - camX);
      const drawY = Math.round(footY + 4 - SPRITE_CELL - camY + 4);
      // Left/right play the cast animation in reverse so the wait
      // pose ends on frame 0 (rod tilted up — line then drops down
      // naturally to the bobber). Up/down keep the original 0→4
      // order. The state-frame counter is unchanged either way; the
      // remap is purely a display transform.
      const reversed = dir === "left" || dir === "right";
      const displayFrame = reversed
        ? FISH_FRAMES - 1 - frameCol
        : frameCol;
      const sx = displayFrame * SPRITE_CELL;
      const sy = WALK_ROWS[dir] * SPRITE_CELL;
      ctx.drawImage(
        imgs.fishBase,
        sx, sy, SPRITE_CELL, SPRITE_CELL,
        drawX, drawY, SPRITE_CELL, SPRITE_CELL,
      );
      const layer = (img: HTMLImageElement, c: number) => {
        ctx.drawImage(
          img,
          c * FISH_VARIANT_WIDTH + sx, sy, SPRITE_CELL, SPRITE_CELL,
          drawX, drawY, SPRITE_CELL, SPRITE_CELL,
        );
      };
      layer(imgs.fishEyes, colors.eyes);
      layer(imgs.fishShirt, colors.shirt);
      layer(imgs.fishPants, colors.pants);
      layer(imgs.fishShoes, colors.shoes);
      layer(imgs.fishHair, colors.hair);
      // Rod is single-color (no variant offset).
      ctx.drawImage(
        imgs.fishRod,
        sx, sy, SPRITE_CELL, SPRITE_CELL,
        drawX, drawY, SPRITE_CELL, SPRITE_CELL,
      );
    };

    // Compute the bobber's vertical offset for the current fishing
    // sub-mode. wait + fail bob gently with a sin oscillation;
    // fakeBite peaks down ~1.5 px halfway through; bite eases down
    // FISH_BITE_DEPTH_PX and holds; success pops up briefly then
    // disappears (handled by skipping the draw in render).
    const bobberYOffset = (m: Mode, subT: number, time: number): number => {
      if (m === "fishingWait" || m === "fishingFail") {
        return Math.sin(time * FISH_BOBBER_BOB_FREQ) * FISH_BOBBER_BOB_AMP;
      }
      if (m === "fishingFakeBite") {
        const t = Math.min(subT / FISH_FAKE_BITE_DURATION_MS, 1);
        return Math.sin(t * Math.PI) * FISH_FAKE_BITE_DEPTH_PX;
      }
      if (m === "fishingBite") {
        // Quick sink (300 ms) then hold at depth.
        const t = Math.min(subT / 300, 1);
        return t * FISH_BITE_DEPTH_PX;
      }
      if (m === "fishingSuccess") {
        // First 200 ms pops up, then we stop drawing.
        const t = Math.min(subT / 200, 1);
        return -t * 4;
      }
      return 0;
    };

    // Bobber + fishing line. bobber.png is a 128×32 strip of EIGHT
    // distinct 16×16 bobber designs; we crop the first one and
    // render it statically. The Y position varies with mode (see
    // bobberYOffset above) so the bobber bobs in wait, dips on fake
    // bites, sinks on real bites, and pops up on success.
    //
    // On a real bite, the bobber sinks for 300 ms then HIDES — the
    // line still draws through to the underwater anchor point so the
    // rod looks like it's lifting a fish out of sight.
    const drawBobberAndLine = (
      footX: number,
      footY: number,
      camX: number,
      camY: number,
      dir: Direction,
      m: Mode,
      subT: number,
      time: number,
    ) => {
      const fishingActive =
        m === "fishingWait" ||
        m === "fishingFakeBite" ||
        m === "fishingBite" ||
        m === "fishingFail" ||
        m === "fishingSuccess";
      if (!fishingActive) return;
      // After the success pop-up clears, both bobber and line are
      // gone (the fish is "out of the water").
      if (m === "fishingSuccess" && subT > 200) return;
      const dx = dir === "right" ? 1 : dir === "left" ? -1 : 0;
      const dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
      const baseCX = footX + dx * BOBBER_DISTANCE;
      const baseCY = footY + dy * BOBBER_DISTANCE;
      const yOffset = bobberYOffset(m, subT, time);
      const bobberCX = baseCX;
      const bobberCY = baseCY + yOffset;
      // Hide the bobber sprite once the bite-sink finishes — the
      // fish has pulled it underwater.
      const showBobber = !(m === "fishingBite" && subT > 300);
      if (showBobber) {
        const half = BOBBER_CELL / 2;
        const bobberDrawX = Math.round(bobberCX - half - camX);
        const bobberDrawY = Math.round(bobberCY - half - camY);
        ctx.drawImage(
          imgs.fishBobber,
          BOBBER_INDEX * BOBBER_CELL, 0, BOBBER_CELL, BOBBER_CELL,
          bobberDrawX, bobberDrawY, BOBBER_CELL, BOBBER_CELL,
        );
      }
      // Rod tip — exact pixel from the cast's final frame, after
      // applying the +4 fishing Y correction. Each direction has a
      // hand-measured offset (see ROD_TIP_OFFSETS in fishingData.ts).
      // Line always draws even when the bobber is hidden; while the
      // bobber is visible the line follows it, but once it disappears
      // (real-bite sink complete) the line ends at the water surface
      // — rod tip → sea level — so it reads as "line dipping in".
      const tipOffset = ROD_TIP_OFFSETS[dir];
      const tipX = footX + tipOffset.x - camX;
      const tipY = footY + tipOffset.y - camY;
      const lineEndY = showBobber ? bobberCY : baseCY;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#f4efff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(bobberCX - camX, lineEndY - camY);
      ctx.stroke();
      ctx.restore();
    };

    // Fish shadow under water. Stays put through the entire lurk +
    // bite sequence (wait → fakeBite → bite) so the player keeps
    // seeing the fish while the bobber is being yanked. It's only
    // hidden during success / fail messages.
    //
    // The position MUST land on a water (red-on-collision) pixel —
    // we try a few tile-step candidates around the bobber and pick
    // the first one that's water, so a bobber sitting next to a
    // dock or pier never paints a fish on the planks/sand.
    const drawFishShadow = (
      footX: number,
      footY: number,
      camX: number,
      camY: number,
      dir: Direction,
      m: Mode,
      waitElapsed: number,
      shadowAt: number,
      shadowFrame: number,
    ) => {
      const visible =
        (m === "fishingWait" && waitElapsed >= shadowAt) ||
        m === "fishingFakeBite" ||
        m === "fishingBite";
      if (!visible) return;
      const dx = dir === "right" ? 1 : dir === "left" ? -1 : 0;
      const dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
      const bobberCX = footX + dx * BOBBER_DISTANCE;
      const bobberCY = footY + dy * BOBBER_DISTANCE;
      // Candidate positions, ordered by preference:
      //   1. one tile DEEPER (further from player along facing dir)
      //   2. on the bobber (guaranteed water — canFish ensured it)
      //   3. side tiles, then a tile back toward the player
      // First red-on-collision hit wins; if none, the shadow is
      // suppressed for that frame.
      const candidates: Array<{ x: number; y: number }> = [
        { x: bobberCX + dx * 16, y: bobberCY + dy * 16 },
        { x: bobberCX, y: bobberCY },
        { x: bobberCX + 16, y: bobberCY },
        { x: bobberCX - 16, y: bobberCY },
        { x: bobberCX, y: bobberCY + 16 },
        { x: bobberCX, y: bobberCY - 16 },
        { x: bobberCX - dx * 16, y: bobberCY - dy * 16 },
      ];
      let pickedX = 0;
      let pickedY = 0;
      let found = false;
      for (const c of candidates) {
        if (isBlockedPixel(imgs.collision, c.x, c.y)) {
          pickedX = c.x;
          pickedY = c.y;
          found = true;
          break;
        }
      }
      if (!found) return;
      const half = FISH_SHADOW_CELL / 2;
      const drawX = Math.round(pickedX - half - camX);
      const drawY = Math.round(pickedY - half - camY);
      ctx.drawImage(
        imgs.fishShadow,
        shadowFrame * FISH_SHADOW_CELL, 0, FISH_SHADOW_CELL, FISH_SHADOW_CELL,
        drawX, drawY, FISH_SHADOW_CELL, FISH_SHADOW_CELL,
      );
    };

    // "!" exclamation above the player's head during a real bite —
    // the canonical "fish on the line" cue.
    const drawBiteIndicator = (
      footX: number,
      footY: number,
      camX: number,
      camY: number,
    ) => {
      ctx.save();
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#FFE5C4";
      ctx.strokeStyle = "rgba(11,8,33,0.85)";
      ctx.lineWidth = 2;
      const x = footX - camX;
      const y = footY - 30 - camY;
      ctx.strokeText("!", x, y);
      ctx.fillText("!", x, y);
      ctx.restore();
    };

    const render = (ctx: CanvasRenderingContext2D) => {
      const s = stateRef.current;
      const currentScene = sceneRef.current;
      const fade = fadeRef.current;

      // Always start with a clean black canvas so the indoor scene's
      // letterbox area renders solid black per the design spec
      // ("뷰포트가 크면 주변은 검정색").
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIEWPORT, VIEWPORT);
      ctx.imageSmoothingEnabled = false;

      const playerColors = {
        eyes: DEFAULT_EYES_COLOR,
        shirt: DEFAULT_SHIRT_COLOR,
        pants: DEFAULT_PANTS_COLOR,
        shoes: DEFAULT_SHOES_COLOR,
        hair: DEFAULT_HAIR_COLOR,
      };
      const npcColors = {
        eyes: NPC_EYES_COLOR,
        shirt: NPC_SHIRT_COLOR,
        pants: NPC_PANTS_COLOR,
        shoes: NPC_SHOES_COLOR,
        hair: NPC_HAIR_COLOR,
      };

      // Both scenes render at MAP_SCALE (2x) with camera-follow.
      // Map dimensions differ — outdoor 336², indoor 160². Indoor's
      // 320×320 displayed size barely overflows the 306 viewport, so
      // the camera scrolls only a few pixels near the edges.
      const mapW = currentScene === "outdoor" ? MAP_WIDTH : INDOOR_MAP_WIDTH;
      const mapH = currentScene === "outdoor" ? MAP_HEIGHT : INDOOR_MAP_HEIGHT;
      const visibleW = VIEWPORT / MAP_SCALE;
      const visibleH = VIEWPORT / MAP_SCALE;
      const camX = clamp(
        Math.round(s.x - visibleW / 2),
        0,
        Math.max(0, mapW - visibleW),
      );
      const camY = clamp(
        Math.round(s.y - visibleH / 2),
        0,
        Math.max(0, mapH - visibleH),
      );

      ctx.save();
      ctx.scale(MAP_SCALE, MAP_SCALE);
      ctx.imageSmoothingEnabled = false;

      if (currentScene === "outdoor") {
        ctx.drawImage(imgs.map, -camX, -camY);
        const now = performance.now();
        if (s.mode === "walk") {
          drawCharacter(
            imgs.char,
            s.x,
            s.y,
            camX,
            camY,
            s.frame,
            s.dir,
            playerColors,
          );
        } else {
          // Fishing modes share the same per-direction 5-frame
          // sheet; the wait/result modes lock to the last cast
          // frame (frame 4 in raw order, frame 0 after the L/R
          // reversal handled inside drawFishingChar).
          drawFishingChar(
            s.x,
            s.y,
            camX,
            camY,
            s.fishFrame,
            s.dir,
            playerColors,
          );
          // Underwater shadow first (so the bobber draws on top of
          // it when they overlap during the bite-pull moment).
          drawFishShadow(
            s.x,
            s.y,
            camX,
            camY,
            s.dir,
            s.mode,
            s.waitElapsed,
            s.shadowAt,
            s.shadowFrame,
          );
          drawBobberAndLine(
            s.x,
            s.y,
            camX,
            camY,
            s.dir,
            s.mode,
            s.subT,
            now,
          );
          if (s.mode === "fishingBite") {
            drawBiteIndicator(s.x, s.y, camX, camY);
          }
        }
        // Front layer — drawn last so any non-transparent pixel of
        // 배경_front.png covers the player at that location, giving
        // the depth illusion when walking behind tree canopies, roof
        // eaves, parasol tops, etc. Defensive: re-assert full alpha
        // and the default compositing op so an earlier accidental
        // mutation (e.g. a future feature toying with shadows) can't
        // make the player bleed through occluders.
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(imgs.mapFront, -camX, -camY);
      } else {
        ctx.drawImage(imgs.shopInterior, -camX, -camY);
        // NPC drawn before the player so the player z-orders on top
        // if they ever overlap. The yellow tile blocks the player
        // from reaching the NPC's anchor in practice.
        drawCharacter(
          imgs.npcChar,
          imgs.npcFoot.x,
          imgs.npcFoot.y,
          camX,
          camY,
          0,
          "down",
          npcColors,
        );
        drawCharacter(imgs.char, s.x, s.y, camX, camY, s.frame, s.dir, playerColors);
      }

      ctx.restore();

      // Catch gauge — Flat-theme sprites stretched to the gauge
      // width via a horizontal 9-slice (4 px caps, middle stretched).
      // Drawn AFTER the scaled scene so the bar sits in viewport
      // pixels and stays crisp regardless of MAP_SCALE.
      if (s.mode === "fishingBite") {
        const gaugeX = Math.round((VIEWPORT - GAUGE_WIDTH) / 2);
        const gaugeY = VIEWPORT - GAUGE_BOTTOM_OFFSET;
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;

        // 9-slice horizontal: source caps fixed, middle column
        // stretched to fill the destination width.
        const drawHoriz9 = (
          img: HTMLImageElement,
          capPx: number,
          scale: number,
          dx: number,
          dy: number,
          dstWidth: number,
        ) => {
          const sw = img.width;
          const sh = img.height;
          const capDst = capPx * scale;
          const dstHeight = sh * scale;
          // Left cap
          ctx.drawImage(img, 0, 0, capPx, sh, dx, dy, capDst, dstHeight);
          // Middle (stretched horizontally only)
          const midSrc = sw - capPx * 2;
          const midDst = dstWidth - capDst * 2;
          if (midSrc > 0 && midDst > 0) {
            ctx.drawImage(
              img,
              capPx, 0, midSrc, sh,
              dx + capDst, dy, midDst, dstHeight,
            );
          }
          // Right cap
          ctx.drawImage(
            img,
            sw - capPx, 0, capPx, sh,
            dx + dstWidth - capDst, dy, capDst, dstHeight,
          );
        };

        // Bar background (UI_Flat_Bar01a: 32×8, 4 px caps).
        drawHoriz9(imgs.uiGaugeBar, 4, 2, gaugeX, gaugeY, GAUGE_WIDTH);

        // Success-zone fill (UI_Flat_BarFill01a: 32×3, bright green).
        // Inset 2 px from each side and 4 px from top so the fill
        // sits inside the bar frame.
        const zoneX = Math.round(
          gaugeX + s.gaugeSuccessStart * GAUGE_WIDTH,
        );
        const zoneW = Math.round(s.gaugeSuccessWidth * GAUGE_WIDTH);
        if (zoneW > 0) {
          drawHoriz9(
            imgs.uiGaugeFill,
            4,
            2,
            zoneX,
            gaugeY + 4,
            zoneW,
          );
        }

        // Marker (UI_Flat_Handle06a: 4×7) — drawn at 2× and a touch
        // taller than the bar so it overshoots top/bottom for
        // visibility against the green fill.
        const markerSrc = imgs.uiGaugeMarker;
        const markerDstW = markerSrc.width * 2; // 8
        const markerDstH = markerSrc.height * 2 + 4; // 18
        const markerX = Math.round(
          gaugeX + s.gaugeMarkerPos * GAUGE_WIDTH,
        );
        ctx.drawImage(
          markerSrc,
          0, 0, markerSrc.width, markerSrc.height,
          markerX - markerDstW / 2,
          gaugeY - 1,
          markerDstW,
          markerDstH,
        );

        // No grade label rendered — the player only sees what they
        // caught after the success popup. The grade is internal
        // difficulty info only.
      }

      // Fade overlay — black plane whose alpha follows a 0→1→0 ramp
      // across the SCENE_FADE_SECONDS window so transitions never
      // flash the old scene during fade-in.
      if (fade.active) {
        const a =
          fade.t < 0.5 ? fade.t * 2 : Math.max(0, 2 - fade.t * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
        ctx.fillRect(0, 0, VIEWPORT, VIEWPORT);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open, assets, triggerZone, scheduleFishingEvents, rollGauge]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="fishing-panel"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className="fixed left-4 bottom-24 z-[200] flex flex-col overflow-hidden rounded-2xl border border-nebula-pink/30 backdrop-blur-md"
          style={{
            background:
              "linear-gradient(180deg, rgba(26,15,61,0.94) 0%, rgba(11,8,33,0.94) 100%)",
            boxShadow:
              "0 24px 60px rgba(11,8,33,0.7), 0 0 40px rgba(107,75,168,0.30), inset 0 1px 0 rgba(255,229,196,0.06)",
          }}
        >
          <div
            className="flex items-center justify-between gap-2 px-3 py-2"
            style={{
              background:
                "linear-gradient(180deg, rgba(61,46,107,0.55), rgba(26,15,61,0.40))",
              borderBottom: "1px solid rgba(216,150,200,0.30)",
            }}
          >
            <span className="font-serif text-[14px] font-bold tracking-wide text-stardust">
              낚시터
            </span>
            <button
              onClick={onClose}
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[#f4efff] transition-opacity hover:opacity-70"
              style={{
                background: "rgba(26,15,61,0.45)",
                border: "1px solid rgba(216,150,200,0.25)",
              }}
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>

          <motion.div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            animate={shakeControls}
            className="relative touch-none select-none"
            style={{ width: VIEWPORT, height: VIEWPORT }}
          >
            <canvas
              ref={canvasRef}
              width={VIEWPORT}
              height={VIEWPORT}
              className="block"
              style={{
                imageRendering: "pixelated",
                width: VIEWPORT,
                height: VIEWPORT,
              }}
            />
            {!assets ? (
              <div className="absolute inset-0 flex items-center justify-center text-stardust text-[12px]">
                불러오는 중…
              </div>
            ) : null}

            {/* Static joystick dock — always rendered, low opacity
                when idle ("살짝 숨겨지고") and full opacity while
                dragging ("선명해지는"). 200ms fade matches the rest
                of the cosmic UI's transition feel. Hidden while the
                inventory / info / ranking panel is up — the game is
                paused so the input UI shouldn't compete. */}
            {!panelOpen ? (
              <>
                <div
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: JOYSTICK_BASE_X - JOYSTICK_RADIUS,
                    top: JOYSTICK_BASE_Y - JOYSTICK_RADIUS,
                    width: JOYSTICK_RADIUS * 2,
                    height: JOYSTICK_RADIUS * 2,
                    background: "rgba(244,239,255,0.08)",
                    border: "1px solid rgba(216,150,200,0.45)",
                    opacity: joyView.active ? 0.85 : 0.30,
                    transition: "opacity 200ms ease",
                  }}
                />
                <div
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: JOYSTICK_BASE_X + joyView.dx - JOYSTICK_KNOB,
                    top: JOYSTICK_BASE_Y + joyView.dy - JOYSTICK_KNOB,
                    width: JOYSTICK_KNOB * 2,
                    height: JOYSTICK_KNOB * 2,
                    background: "rgba(216,150,200,0.55)",
                    border: "1px solid rgba(255,229,196,0.65)",
                    boxShadow: joyView.active
                      ? "0 0 12px rgba(255,229,196,0.45)"
                      : "none",
                    opacity: joyView.active ? 0.90 : 0.35,
                    transition: "opacity 200ms ease, box-shadow 200ms ease",
                  }}
                />
              </>
            ) : null}

            {/* Unified action button (bottom-right). Mirrors the
                Space key — it's only rendered when there's something
                meaningful to do, and the icon shifts with context:
                  • 🎣 — fishing in progress, or facing water
                  • 💬 — standing in the NPC interaction zone
                Hidden during dialog (the dialog acts as its own tap
                target) and during fade transitions. */}
            {(() => {
              if (npcDialog) return null;
              // Hide the action button while the result popup is up —
              // its own confirm button is the only legal interaction.
              if (catchPopup) return null;
              // Hide while the inventory / info / ranking modal is up;
              // also hide while the small "open menu" button is showing
              // next to the character so the two don't visually compete.
              if (panelOpen || bagButton.visible) return null;
              const fishingActive = mode !== "walk";
              const showFish =
                scene === "outdoor" && (canFish || fishingActive);
              const showTalk = !fishingActive && prompt === "npc";
              if (!showFish && !showTalk) return null;
              // Bite mode swaps the icon to a vivid "!" so it reads
              // as "press now!" instead of a passive fishing prompt.
              const icon = showTalk
                ? "💬"
                : mode === "fishingBite"
                ? "❗"
                : "🎣";
              const label =
                mode === "fishingBite"
                  ? "당기기"
                  : mode === "fishingFakeBite" || mode === "fishingWait"
                  ? "낚시 취소"
                  : showTalk
                  ? "대화하기"
                  : "낚시하기";
              const isBite = mode === "fishingBite";
              const buttonSrc = actionPressed
                ? UI_ACTION_BUTTON_PRESSED
                : actionHover
                ? UI_ACTION_BUTTON_HOVER
                : UI_ACTION_BUTTON_IDLE;
              // The pressed sprite shifts the visible button face
              // ~2 px down inside the cell. Sync the icon offset so
              // the emoji travels with the press, not against it.
              const iconOffsetY = actionPressed ? -1 : -3;
              return (
                <motion.button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setActionPressed(true);
                    handleAction();
                  }}
                  onPointerUp={() => setActionPressed(false)}
                  onPointerLeave={() => {
                    setActionPressed(false);
                    setActionHover(false);
                  }}
                  onPointerCancel={() => setActionPressed(false)}
                  onMouseEnter={() => setActionHover(true)}
                  onMouseLeave={() => setActionHover(false)}
                  whileTap={{ scale: 0.92 }}
                  animate={
                    isBite ? { scale: [1, 1.08, 1] } : { scale: 1 }
                  }
                  transition={
                    isBite
                      ? { duration: 0.6, repeat: Infinity }
                      : { duration: 0.08 }
                  }
                  aria-label={label}
                  className="absolute right-3 bottom-3 flex items-center justify-center"
                  style={{
                    width: 64,
                    height: 64,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    // Bite mode adds a red glow around the sprite so
                    // it reads as urgent without changing the asset.
                    filter: isBite
                      ? "drop-shadow(0 0 8px rgba(220,80,80,0.85)) drop-shadow(0 0 14px rgba(220,80,80,0.55))"
                      : "drop-shadow(0 4px 6px rgba(11,8,33,0.45))",
                  }}
                >
                  <img
                    src={buttonSrc}
                    alt=""
                    width={64}
                    height={64}
                    draggable={false}
                    style={{
                      imageRendering: "pixelated",
                      width: 64,
                      height: 64,
                      pointerEvents: "none",
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute leading-none"
                    style={{
                      transform: `translateY(${iconOffsetY}px)`,
                      transition: "transform 60ms ease-out",
                      fontSize: isBite ? 28 : 24,
                      fontWeight: isBite ? 800 : 600,
                      color: isBite ? "#c0392b" : "#3d2c1c",
                      textShadow: isBite
                        ? "0 0 4px rgba(255,255,255,0.6)"
                        : "none",
                      pointerEvents: "none",
                    }}
                  >
                    {icon}
                  </span>
                </motion.button>
              );
            })()}

            {/* "물고기가 도망갔다." — short-lived toast on a missed
                gauge press or timeout. Auto-clears with fishingFail. */}
            {failToast ? (
              <div
                className="pointer-events-none absolute left-1/2 top-[28%] -translate-x-1/2 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-stardust"
                style={{
                  background: "rgba(11,8,33,0.92)",
                  border: "1px solid rgba(216,150,200,0.50)",
                  boxShadow: "0 4px 16px rgba(11,8,33,0.6)",
                }}
              >
                {failToast}
              </div>
            ) : null}

            {/* Catch result popup — frame asset border, sprite from
                fish_all/forage_all, grade-colored label, message, and
                a confirm button to close. Held open until the player
                presses confirm; while open, gameplay is paused in
                fishingSuccess mode. */}
            <CatchPopup
              result={catchPopup}
              onConfirm={() => {
                const s = stateRef.current;
                const result = s.catchResult;
                if (result) {
                  // Stack into inventory under fish-{id} or forage-{id}.
                  const itemKey =
                    result.kind === "fish"
                      ? `fish-${result.fish.id}`
                      : `forage-${result.forage.id}`;
                  setInventory((prev) => ({
                    ...prev,
                    [itemKey]: (prev[itemKey] ?? 0) + 1,
                  }));
                  setTotalCatches((c) => c + 1);
                  const earnings =
                    result.kind === "fish"
                      ? result.fish.price
                      : result.kind === "treasure"
                      ? result.forage.price
                      : 0;
                  if (earnings > 0) {
                    setTotalStarlight((sl) => sl + earnings);
                  }
                  // Award xp; trigger the level-up banner if the
                  // catch crossed a threshold.
                  const xp = expForCatch(result);
                  if (xp > 0) {
                    setTotalExp((prev) => {
                      const before = levelFromTotalExp(prev).level;
                      const next = prev + xp;
                      const after = levelFromTotalExp(next).level;
                      if (after > before) setLevelUpBanner(after);
                      return next;
                    });
                  }
                }
                s.mode = "walk";
                s.subT = 0;
                s.catchResult = null;
                setMode("walk");
                setCatchPopup(null);
              }}
            />

            {/* "준비중입니다" toast — auto-dismisses after 1.6s */}
            {yellowToast ? (
              <div
                className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-stardust"
                style={{
                  background: "rgba(11,8,33,0.92)",
                  border: "1px solid rgba(216,150,200,0.50)",
                  boxShadow: "0 4px 16px rgba(11,8,33,0.6)",
                }}
              >
                {YELLOW_SHOP_LINE}
              </div>
            ) : null}

            {/* NPC dialog — cosmic-themed panel; tap or Space
                dismisses (handled by handleAction). */}
            {npcDialog ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setNpcDialog(false);
                }}
                className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5 rounded-xl px-3 py-2 text-left text-stardust"
                style={{
                  background: "rgba(11,8,33,0.94)",
                  border: "1px solid rgba(216,150,200,0.50)",
                  boxShadow: "0 8px 28px rgba(11,8,33,0.7)",
                }}
              >
                <span className="font-serif text-[10px] font-bold tracking-widest text-nebula-pink">
                  생선가게 주인
                </span>
                <span className="text-[12px] leading-snug">
                  {FISHSHOP_NPC_LINE}
                </span>
                <span className="text-[9px] text-text-sub">
                  탭 또는 Space로 닫기
                </span>
              </button>
            ) : null}

            {/* Floating bag button. Appears next to the character
                when the player taps them; tapping it opens the
                inventory / info / ranking panel. Re-tapping the
                character or anywhere else dismisses without opening. */}
            {bagButton.visible && !panelOpen ? (
              <motion.button
                type="button"
                key="bag-button"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setBagButton({ visible: false, x: 0, y: 0 });
                  setPanelOpen(true);
                }}
                aria-label="가방 열기"
                className="absolute z-[15] flex items-center justify-center"
                style={{
                  left: bagButton.x - 24,
                  top: bagButton.y - 24,
                  width: 48,
                  height: 48,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  filter: "drop-shadow(0 3px 5px rgba(11,8,33,0.55))",
                }}
              >
                <img
                  src={UI_ACTION_BUTTON_IDLE}
                  alt=""
                  draggable={false}
                  style={{
                    imageRendering: "pixelated",
                    width: 48,
                    height: 48,
                    pointerEvents: "none",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute leading-none"
                  style={{
                    transform: "translateY(-2px)",
                    fontSize: 18,
                    pointerEvents: "none",
                  }}
                >
                  🎒
                </span>
              </motion.button>
            ) : null}

            {/* Level-up banner — brief celebration when totalExp
                crosses a threshold. Auto-clears after 1.8s. */}
            {levelUpBanner != null ? (
              <motion.div
                key={`levelup-${levelUpBanner}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-xl px-3 py-1.5 text-[12px] font-serif font-bold"
                style={{
                  background: "rgba(251,191,36,0.95)",
                  color: "#3d2c1c",
                  border: "1px solid rgba(255,229,196,0.85)",
                  boxShadow:
                    "0 0 18px rgba(251,191,36,0.7), 0 4px 12px rgba(11,8,33,0.5)",
                  letterSpacing: 1,
                }}
              >
                레벨 업! Lv.{levelUpBanner}
              </motion.div>
            ) : null}

            {/* Inventory / info / ranking panel — rendered inside
                the game pane (absolute, not fixed) so it floats
                inside the canvas viewport instead of overlaying the
                whole site. AnimatePresence handles fade in/out. */}
            <AnimatePresence>
              {panelOpen ? (
                <InventoryPanel
                  key="inv-panel"
                  nickname={nickname}
                  inventory={inventory}
                  totalExp={totalExp}
                  totalCatches={totalCatches}
                  totalStarlight={totalStarlight}
                  tab={panelTab}
                  onTab={setPanelTab}
                  invPage={invPage}
                  setInvPage={setInvPage}
                  invSelected={invSelected}
                  setInvSelected={setInvSelected}
                  assets={assets}
                  onClose={() => {
                    setPanelOpen(false);
                    setInvSelected(null);
                  }}
                />
              ) : null}
            </AnimatePresence>
          </motion.div>

          <div
            className="px-3 py-1.5 text-[10px] text-text-sub"
            style={{ borderTop: "1px solid rgba(216,150,200,0.20)" }}
          >
            {scene === "outdoor"
              ? "WASD / 방향키 · Space 또는 우하단 액션 버튼"
              : "Space 또는 우하단 액션 버튼으로 대화 · 출구로 걸어가면 자동 퇴장"}
          </div>
        </motion.div>
      ) : null}

    </AnimatePresence>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── 9-slice frame renderer ────────────────────────────────────────
// Draws a stretchable frame on a <canvas> by slicing the source image
// into a 3×3 grid: four corners drawn at native size, two horizontal
// edges stretched along x, two vertical edges stretched along y, and
// the center stretched on both axes. Image smoothing is disabled so
// upscaling stays pixel-crisp — the same effect CSS border-image is
// supposed to give but doesn't, reliably, with image-rendering:
// pixelated across browsers. Children render on top of the canvas.
function Frame9Slice({
  src,
  cap,
  scale,
  width,
  height,
  className,
  style,
  children,
}: {
  src: string;
  cap: number;
  scale: number;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const sw = img.width;
    const sh = img.height;
    const dw = width;
    const dh = height;
    const cs = cap * scale;
    const sm = Math.max(1, sw - cap * 2); // source middle width
    const smH = Math.max(1, sh - cap * 2);
    const dm = Math.max(0, dw - cs * 2);  // dest middle width
    const dmH = Math.max(0, dh - cs * 2);
    // Corners — native size at scale.
    ctx.drawImage(img, 0, 0, cap, cap, 0, 0, cs, cs);
    ctx.drawImage(img, sw - cap, 0, cap, cap, dw - cs, 0, cs, cs);
    ctx.drawImage(img, 0, sh - cap, cap, cap, 0, dh - cs, cs, cs);
    ctx.drawImage(img, sw - cap, sh - cap, cap, cap, dw - cs, dh - cs, cs, cs);
    // Top + bottom edges (stretch x).
    if (dm > 0) {
      ctx.drawImage(img, cap, 0, sm, cap, cs, 0, dm, cs);
      ctx.drawImage(img, cap, sh - cap, sm, cap, cs, dh - cs, dm, cs);
    }
    // Left + right edges (stretch y).
    if (dmH > 0) {
      ctx.drawImage(img, 0, cap, cap, smH, 0, cs, cs, dmH);
      ctx.drawImage(img, sw - cap, cap, cap, smH, dw - cs, cs, cs, dmH);
    }
    // Center (stretch both).
    if (dm > 0 && dmH > 0) {
      ctx.drawImage(img, cap, cap, sm, smH, cs, cs, dm, dmH);
    }
  }, [img, width, height, cap, scale]);

  // Why the wrapper-inside-wrapper: in CSS painting order a
  // positioned (absolute) descendant paints AFTER its non-positioned
  // siblings. With the canvas positioned absolute and the children
  // un-positioned, the canvas drew over the text and buttons. Putting
  // the children inside their own absolute wrapper with a higher
  // z-index keeps the canvas behind everything author-rendered. The
  // outer div carries no padding so absolute children inset to its
  // edges; padding/flex passed via the caller's style/className apply
  // to the inner wrapper so layout is unaffected.
  return (
    <div style={{ position: "relative", width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          width,
          height,
          imageRendering: "pixelated",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Catch result popup ────────────────────────────────────────────
// Renders a centered modal card on top of the canvas using the
// Flat_Frame02a sprite as a 9-slice border (via CSS border-image).
// Sprites are cropped from fish_all.png / forage_all.png by setting
// the parent div's background-position; both sheets use 16×16 cells
// indexed by Fish.spriteX/Y or Forage.spriteX/Y. Per-grade flair is
// layered on top via box-shadow glows + (mythic) sparkle particles.
// Sized for a 306-wide viewport: 240 wide leaves ~33 px margins on
// each side. Height fits the sprite, four text rows, and the confirm
// button at the bottom of the frame (no overhang) without clipping.
const POPUP_WIDTH = 240;
const POPUP_HEIGHT = 200;
const POPUP_FRAME_CAP = 4;        // px in source — Frame01a 9-slice
const POPUP_FRAME_SCALE = 2;       // 2× upscale per spec, pixelated
const POPUP_BORDER = POPUP_FRAME_CAP * POPUP_FRAME_SCALE; // 8
const SPRITE_DISPLAY_SIZE = 64;    // px shown on screen — 4× of 16×16
const FISH_SHEET_W = 160;
const FISH_SHEET_H = 160;
const FORAGE_SHEET_W = 160;
const FORAGE_SHEET_H = 48;

type GradeFlair = {
  glow: string;
  textGlow: string;
  haloColor: string | null;
  sparkles: boolean;
};

function gradeFlair(result: CatchResult): GradeFlair {
  if (result.kind !== "fish") {
    // Forage shares the calm common-tier flair.
    return { glow: "none", textGlow: "none", haloColor: null, sparkles: false };
  }
  switch (result.grade) {
    case "common":
      return { glow: "none", textGlow: "none", haloColor: null, sparkles: false };
    case "uncommon":
      return {
        glow: "0 0 14px rgba(134,239,172,0.45)",
        textGlow: "0 0 6px rgba(134,239,172,0.65)",
        haloColor: null,
        sparkles: false,
      };
    case "rare":
      return {
        glow:
          "0 0 18px rgba(125,211,252,0.65), 0 0 36px rgba(125,211,252,0.35)",
        textGlow: "0 0 8px rgba(125,211,252,0.85)",
        haloColor: "rgba(125,211,252,0.55)",
        sparkles: false,
      };
    case "legendary":
      return {
        glow:
          "0 0 22px rgba(196,181,253,0.75), 0 0 44px rgba(196,181,253,0.45)",
        textGlow: "0 0 10px rgba(196,181,253,0.95)",
        haloColor: "rgba(196,181,253,0.70)",
        sparkles: false,
      };
    case "mythic":
      return {
        glow:
          "0 0 28px rgba(251,191,36,0.85), 0 0 60px rgba(251,191,36,0.55)",
        textGlow: "0 0 12px rgba(251,191,36,1.0)",
        haloColor: "rgba(251,191,36,0.85)",
        sparkles: true,
      };
  }
}

function CatchPopup({
  result,
  onConfirm,
}: {
  result: CatchResult | null;
  onConfirm: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  // Space key acts on the check button while the popup is open:
  // keydown → pressed (scale-down feedback), keyup → fire onConfirm
  // and release. Mirrors the pointer flow so the visual is identical.
  // Auto-repeat keydowns are ignored so holding Space doesn't thrash
  // setState. Listener is attached only while a result is present, so
  // it auto-cleans on dismount.
  useEffect(() => {
    if (!result) return;
    const isSpace = (e: KeyboardEvent) =>
      e.key === " " || e.code === "Space";
    const onDown = (e: KeyboardEvent) => {
      if (!isSpace(e)) return;
      e.preventDefault();
      if (!e.repeat) setPressed(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!isSpace(e)) return;
      e.preventDefault();
      setPressed(false);
      onConfirm();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [result, onConfirm]);
  return (
    <AnimatePresence>
      {result ? (
        // Flex-center wrapper handles positioning so framer-motion's
        // animate transforms (scale/opacity) don't fight a CSS
        // translate(-50%,-50%). Without this split the animated y/x
        // values overwrite the centering transform and the popup ends
        // up offset to the bottom-right of the viewport.
        <div
          key="catch-popup-anchor"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <motion.div
            key="catch-popup"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="pointer-events-auto"
            style={{
              width: POPUP_WIDTH,
              height: POPUP_HEIGHT,
              boxShadow: gradeFlair(result).glow,
            }}
          >
            <Frame9Slice
              src={UI_POPUP_FRAME}
              cap={POPUP_FRAME_CAP}
              scale={POPUP_FRAME_SCALE}
              width={POPUP_WIDTH}
              height={POPUP_HEIGHT}
              className="flex flex-col items-center"
              style={{
                paddingTop: POPUP_BORDER + 4,
                paddingBottom: POPUP_BORDER + 4,
                paddingInline: POPUP_BORDER + 8,
                boxSizing: "border-box",
              }}
            >
              <PopupContents result={result} />
              {gradeFlair(result).sparkles ? <Sparkles /> : null}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setPressed(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setPressed(false);
                  onConfirm();
                }}
                onPointerLeave={() => setPressed(false)}
                onPointerCancel={() => setPressed(false)}
                aria-label="확인"
                className="mt-1 flex items-center justify-center"
                style={{
                  width: 17 * 2,
                  height: 14 * 2,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <img
                  src={UI_ICON_CHECK}
                  alt=""
                  draggable={false}
                  style={{
                    imageRendering: "pixelated",
                    width: 17 * 2,
                    height: 14 * 2,
                    pointerEvents: "none",
                    transform: `scale(${pressed ? 0.9 : 1})`,
                    transition: "transform 80ms ease",
                  }}
                />
              </button>
            </Frame9Slice>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function PopupContents({ result }: { result: CatchResult }) {
  const flair = gradeFlair(result);
  // Sprite source + cell coords + sheet dims depend on whether the
  // catch is a fish (10×10 sheet) or forage (10×3 sheet).
  let spriteUrl: string;
  let spriteX: number;
  let spriteY: number;
  let sheetW: number;
  let sheetH: number;
  let nameKo: string;
  let gradeText: string;
  let gradeColor: string;
  let priceLine: string;
  if (result.kind === "fish") {
    spriteUrl = ASSETS_FISH_CATALOG.fishAll;
    spriteX = result.fish.spriteX;
    spriteY = result.fish.spriteY;
    sheetW = FISH_SHEET_W;
    sheetH = FISH_SHEET_H;
    nameKo = result.fish.nameKo;
    gradeText = FISH_GRADE_LABEL[result.grade];
    gradeColor = FISH_GRADE_COLOR[result.grade];
    priceLine = `${result.fish.price} 별빛`;
  } else {
    spriteUrl = ASSETS_FORAGE_CATALOG.forageAll;
    spriteX = result.forage.spriteX;
    spriteY = result.forage.spriteY;
    sheetW = FORAGE_SHEET_W;
    sheetH = FORAGE_SHEET_H;
    nameKo = result.forage.nameKo;
    gradeText = result.kind === "treasure" ? "해양 자원" : "쓰레기";
    gradeColor = result.kind === "treasure" ? "#fde68a" : "#94a3b8";
    priceLine =
      result.kind === "treasure" ? `${result.forage.price} 별빛` : "판매 불가";
  }
  const cellSize = result.kind === "fish" ? FISH_SPRITE_CELL : FORAGE_SPRITE_CELL;
  const scale = SPRITE_DISPLAY_SIZE / cellSize;
  return (
    <>
      {/* Sprite — pixelated background-position crop. The halo sits
          behind the sprite for rare+ tiers. */}
      <div className="relative" style={{ marginTop: 4 }}>
        {flair.haloColor ? (
          <motion.div
            aria-hidden
            initial={{ scale: 0.4, opacity: 0.85 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${flair.haloColor} 0%, transparent 70%)`,
              filter: "blur(2px)",
            }}
          />
        ) : null}
        <div
          aria-hidden
          style={{
            width: SPRITE_DISPLAY_SIZE,
            height: SPRITE_DISPLAY_SIZE,
            backgroundImage: `url(${spriteUrl})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
            backgroundPosition: `-${spriteX * scale}px -${spriteY * scale}px`,
            imageRendering: "pixelated",
          }}
        />
      </div>
      <div
        className="font-serif font-bold leading-none"
        style={{
          marginTop: 4,
          fontSize: 13,
          color: "#3d2c1c",
        }}
      >
        {nameKo}
      </div>
      <div
        className="leading-none"
        style={{
          marginTop: 4,
          fontSize: 10,
          color: gradeColor,
          textShadow: flair.textGlow,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        {gradeText}
      </div>
      <div
        className="leading-snug"
        style={{
          marginTop: 4,
          fontSize: 10,
          color: "#3d2c1c",
          textAlign: "center",
          maxWidth: POPUP_WIDTH - 28,
        }}
      >
        {result.message}
      </div>
      <div
        className="leading-none"
        style={{
          marginTop: 3,
          fontSize: 10,
          color: result.kind === "trash" ? "#64748b" : "#3d2c1c",
          fontWeight: 600,
        }}
      >
        {priceLine}
      </div>
    </>
  );
}

// Mythic-only sparkle particles. 8 dots fly outward from the center
// of the popup and fade. Random offsets are captured in a useState
// lazy initializer so re-renders don't re-roll mid-animation; using
// useState (rather than useMemo) keeps the rule that no impure call
// runs during render — the initializer only fires on first mount.
function Sparkles() {
  const [dots] = useState(() =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return {
        angle,
        dist: 70 + Math.random() * 30,
        delay: Math.random() * 0.15,
      };
    }),
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: "50%",
        top: "45%",
        transform: "translate(-50%, -50%)",
      }}
    >
      {dots.map((d, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
          animate={{
            x: Math.cos(d.angle) * d.dist,
            y: Math.sin(d.angle) * d.dist,
            opacity: [0, 1, 0],
            scale: [0.6, 1, 0.4],
          }}
          transition={{ duration: 0.9, delay: d.delay, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: 6,
            height: 6,
            borderRadius: 999,
            background:
              "radial-gradient(circle, #fff7c2 0%, rgba(251,191,36,0.85) 60%, transparent 100%)",
            boxShadow: "0 0 10px rgba(251,191,36,0.85)",
          }}
        />
      ))}
    </div>
  );
}

// ── Inventory / info / ranking panel ─────────────────────────────
// Sized to fit inside the 306×306 game pane with no overflow. Tabs
// at native (1×) scale, slots at 1.25× — the smallest readable
// settings that let the 5×4 = 20-slot grid + tab strip + close
// button + pagination row all coexist within the canvas. Source
// pixels stay crisp via image-rendering: pixelated; the fractional
// 1.25× on slots gets nearest-neighbour rendering with mild width
// unevenness but no blur.
const PANEL_WIDTH = 256;
const PANEL_HEIGHT = 256;
const PANEL_FRAME_CAP = 4;
const PANEL_FRAME_SCALE = 2;
const PANEL_BORDER = PANEL_FRAME_CAP * PANEL_FRAME_SCALE;
const SLOT_DISPLAY = 40;        // 32×32 source × 1.25×
const SLOT_GAP = 0;
const SLOTS_PER_PAGE = 20;      // 5 cols × 4 rows — wider than tall
const SLOT_COLS = 5;
const SLOT_ROWS = 4;
const TAB_W = 64;               // 64×32 source at 1×
const TAB_H = 32;
const TAB_CAP = 4;
const TAB_SCALE = 1;
// How far the active tab sticks up above the panel top edge. The
// remaining (TAB_H - TAB_VISIBLE) px overlap the panel's top edge —
// active tab paints over (zIndex 3), inactive tabs tuck behind
// (zIndex 1) so the active tab visually "connects" to the panel.
const TAB_VISIBLE = 12;
// Where the panel sits inside the inner game pane (306×306).
const PANEL_LEFT = (VIEWPORT - PANEL_WIDTH) / 2;
const PANEL_TOP = 18;

type PanelTab = "inventory" | "info" | "ranking";

function InventoryPanel({
  nickname,
  inventory,
  totalExp,
  totalCatches,
  totalStarlight,
  tab,
  onTab,
  invPage,
  setInvPage,
  invSelected,
  setInvSelected,
  assets,
  onClose,
}: {
  nickname: string;
  inventory: Record<string, number>;
  totalExp: number;
  totalCatches: number;
  totalStarlight: number;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  invPage: number;
  setInvPage: (n: number | ((p: number) => number)) => void;
  invSelected: string | null;
  setInvSelected: (s: string | null) => void;
  assets: LoadedAssets | null;
  onClose: () => void;
}) {
  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: "inventory", label: "인벤토리" },
    { id: "info", label: "정보" },
    { id: "ranking", label: "랭킹" },
  ];
  return (
    // Backdrop fills the inner game pane (absolute, not fixed) so the
    // panel lives inside the canvas viewport instead of overlaying
    // the whole screen.
    <motion.div
      key="inv-panel-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto absolute inset-0 z-[20]"
      style={{ background: "rgba(11,8,33,0.55)" }}
      onPointerDown={(e) => {
        // Tap on the dim backdrop closes the panel; tapping inside
        // the panel content stops propagation so we don't catch it.
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 12 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="pointer-events-auto absolute"
        style={{
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          left: PANEL_LEFT,
          top: PANEL_TOP,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Tab bookmarks above the frame top edge. The selected tab
            sits HIGHER (zIndex 3) so it visually connects to the
            panel; inactive tabs slide BELOW (zIndex 1) and dim. */}
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{ top: -(TAB_H - TAB_VISIBLE), gap: 2 }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onTab(t.id);
                  setInvSelected(null);
                }}
                aria-label={t.label}
                aria-pressed={active}
                className="relative flex items-center justify-center"
                style={{
                  width: TAB_W,
                  height: TAB_H,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  // Active tab pops UP (negative translate) and sits
                  // above the panel border; inactive tabs sink down
                  // and tuck behind, dimmed.
                  transform: active ? "translateY(-2px)" : "translateY(4px)",
                  transition: "transform 140ms ease",
                  filter: active
                    ? "none"
                    : "brightness(0.6) saturate(0.55)",
                  zIndex: active ? 3 : 1,
                }}
              >
                <Frame9Slice
                  src={UI_TAB_MARKER}
                  cap={TAB_CAP}
                  scale={TAB_SCALE}
                  width={TAB_W}
                  height={TAB_H}
                />
                <span
                  aria-hidden
                  className="absolute font-serif font-bold leading-none"
                  style={{
                    fontSize: 12,
                    color: "#3d2c1c",
                    paddingBottom: 4,
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Close button — sits OUTSIDE the panel, hanging off the
            top-right corner. Offsets are smaller than the button
            radius so part of it overlaps the frame border (the
            "걸치는 느낌"). Stays clear of the slot grid below. */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="닫기"
          className="absolute flex items-center justify-center transition-transform active:scale-90"
          style={{
            top: -10,
            right: -10,
            width: 30,
            height: 30,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            zIndex: 4,
          }}
        >
          <img
            src={UI_ICON_CROSS}
            alt=""
            draggable={false}
            style={{
              imageRendering: "pixelated",
              width: 30,
              height: 30,
              pointerEvents: "none",
              filter: "drop-shadow(0 1px 2px rgba(11,8,33,0.55))",
            }}
          />
        </button>

        <Frame9Slice
          src={UI_POPUP_FRAME}
          cap={PANEL_FRAME_CAP}
          scale={PANEL_FRAME_SCALE}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          style={{
            // paddingTop clears the tab-cover region (the part of
            // each tab that sits behind the panel border). 4 px of
            // breathing room beneath that. paddingInline/paddingBottom
            // are kept tight so every available pixel goes to content.
            paddingTop: TAB_H - TAB_VISIBLE + 4,
            paddingBottom: 6,
            paddingInline: PANEL_BORDER + 2,
            boxSizing: "border-box",
            // Panel itself sits below the active tab in z so the
            // tab visually connects to it.
            zIndex: 2,
          }}
        >
          {/* Tab content */}
          <div className="flex h-full w-full flex-col items-center">
            {tab === "inventory" ? (
              <InventoryContent
                inventory={inventory}
                page={invPage}
                setPage={setInvPage}
                selected={invSelected}
                setSelected={setInvSelected}
              />
            ) : tab === "info" ? (
              <InfoContent
                nickname={nickname}
                totalExp={totalExp}
                totalCatches={totalCatches}
                totalStarlight={totalStarlight}
                inventory={inventory}
                assets={assets}
              />
            ) : (
              <RankingContent nickname={nickname} totalExp={totalExp} />
            )}
          </div>
        </Frame9Slice>
      </motion.div>
    </motion.div>
  );
}

// ── Slot icon helpers ─────────────────────────────────────────────
// Look up the fish/forage that a `fish-{id}` / `forage-{id}` key
// refers to, and return the sprite-sheet info needed to render its
// 16×16 cell at SLOT_DISPLAY scale.
type ItemRef =
  | { kind: "fish"; data: Fish }
  | { kind: "treasure"; data: Forage }
  | { kind: "trash"; data: Forage };

function resolveItemKey(key: string): ItemRef | null {
  if (key.startsWith("fish-")) {
    const id = parseInt(key.slice(5), 10);
    const f = FISH_LIST.find((x) => x.id === id);
    if (!f) return null;
    return { kind: "fish", data: f };
  }
  if (key.startsWith("forage-")) {
    const id = parseInt(key.slice(7), 10);
    const f = FORAGE_LIST.find((x) => x.id === id);
    if (!f) return null;
    return { kind: f.type === "trash" ? "trash" : "treasure", data: f };
  }
  return null;
}

function InventoryContent({
  inventory,
  page,
  setPage,
  selected,
  setSelected,
}: {
  inventory: Record<string, number>;
  page: number;
  setPage: (n: number | ((p: number) => number)) => void;
  selected: string | null;
  setSelected: (s: string | null) => void;
}) {
  // Stable ordering — sort by item key so the same key always lands
  // in the same slot across re-renders (no jumping when a new item
  // pushes the list).
  const items = Object.entries(inventory)
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const totalPages = Math.max(1, Math.ceil(items.length / SLOTS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * SLOTS_PER_PAGE;
  const slice = items.slice(start, start + SLOTS_PER_PAGE);
  const selectedRef = selected ? resolveItemKey(selected) : null;
  const selectedCount = selected ? inventory[selected] ?? 0 : 0;
  return (
    <>
      {/* Slot grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${SLOT_COLS}, ${SLOT_DISPLAY}px)`,
          gridTemplateRows: `repeat(${SLOT_ROWS}, ${SLOT_DISPLAY}px)`,
          gap: SLOT_GAP,
        }}
      >
        {Array.from({ length: SLOTS_PER_PAGE }, (_, i) => {
          const entry = slice[i];
          const itemKey = entry?.[0];
          const count = entry?.[1] ?? 0;
          const ref = itemKey ? resolveItemKey(itemKey) : null;
          return (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (itemKey) setSelected(itemKey);
              }}
              aria-label={ref ? ref.data.nameKo : "빈 슬롯"}
              className="relative flex items-center justify-center"
              style={{
                width: SLOT_DISPLAY,
                height: SLOT_DISPLAY,
                padding: 0,
                border: "none",
                background: "transparent",
              }}
            >
              <img
                src={UI_INV_SLOT}
                alt=""
                draggable={false}
                style={{
                  imageRendering: "pixelated",
                  width: SLOT_DISPLAY,
                  height: SLOT_DISPLAY,
                  pointerEvents: "none",
                }}
              />
              {ref ? <SlotSprite ref_={ref} /> : null}
              {count > 1 ? (
                <span
                  aria-hidden
                  className="absolute font-serif font-bold leading-none"
                  style={{
                    right: 6,
                    bottom: 4,
                    fontSize: 11,
                    color: "#fff",
                    textShadow:
                      "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
                    pointerEvents: "none",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Pagination — left arrow (flipped), "n/total", right arrow.
          Smaller arrows than the previous panel sizing so the row
          fits comfortably under the slot grid in the new compact
          panel. */}
      <div
        className="mt-1 flex items-center justify-center gap-2 text-[11px] font-serif font-bold"
        style={{ color: "#3d2c1c" }}
      >
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            setPage((p) => Math.max(0, p - 1));
          }}
          disabled={safePage === 0}
          aria-label="이전 페이지"
          className="flex items-center justify-center"
          style={{
            width: 24,
            height: 18,
            padding: 0,
            border: "none",
            background: "transparent",
            opacity: safePage === 0 ? 0.3 : 1,
            cursor: safePage === 0 ? "default" : "pointer",
          }}
        >
          <img
            src={UI_ICON_ARROW}
            alt=""
            draggable={false}
            style={{
              imageRendering: "pixelated",
              width: 24,
              height: 18,
              transform: "scaleX(-1)",
              pointerEvents: "none",
            }}
          />
        </button>
        <span style={{ minWidth: 40, textAlign: "center" }}>
          {safePage + 1}/{totalPages}
        </span>
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            setPage((p) => Math.min(totalPages - 1, p + 1));
          }}
          disabled={safePage >= totalPages - 1}
          aria-label="다음 페이지"
          className="flex items-center justify-center"
          style={{
            width: 24,
            height: 18,
            padding: 0,
            border: "none",
            background: "transparent",
            opacity: safePage >= totalPages - 1 ? 0.3 : 1,
            cursor: safePage >= totalPages - 1 ? "default" : "pointer",
          }}
        >
          <img
            src={UI_ICON_ARROW}
            alt=""
            draggable={false}
            style={{
              imageRendering: "pixelated",
              width: 24,
              height: 18,
              pointerEvents: "none",
            }}
          />
        </button>
      </div>

      {/* Detail card — slides up from the bottom of the panel when a
          slot is selected. Tap the backdrop to dismiss. */}
      <AnimatePresence>
        {selectedRef && selected ? (
          <motion.div
            key="slot-detail"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.14 }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-1 right-1 rounded-lg px-2 py-1.5 text-[10px]"
            style={{
              bottom: 8,
              background: "rgba(11,8,33,0.94)",
              border: "1px solid rgba(216,150,200,0.45)",
              boxShadow: "0 4px 16px rgba(11,8,33,0.6)",
              color: "#f4efff",
              zIndex: 4,
            }}
          >
            <div className="flex items-center gap-2">
              <div className="relative" style={{ width: 32, height: 32 }}>
                <SlotSprite ref_={selectedRef} small />
              </div>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-serif font-bold text-[13px] text-stardust">
                  {selectedRef.data.nameKo}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color:
                      selectedRef.kind === "fish"
                        ? "#fbbf24"
                        : selectedRef.kind === "trash"
                        ? "#94a3b8"
                        : "#fde68a",
                    fontWeight: 700,
                  }}
                >
                  {selectedRef.kind === "fish"
                    ? gradeLabel(selectedRef.data.grade)
                    : selectedRef.kind === "trash"
                    ? "쓰레기"
                    : "해양 자원"}
                </span>
              </div>
              <div className="text-right leading-tight">
                <div style={{ fontSize: 10, color: "#a8a0d0" }}>
                  {selectedCount}개 보유
                </div>
                <div style={{ fontSize: 11, color: "#fde68a" }}>
                  {selectedRef.kind === "trash"
                    ? "판매 불가"
                    : `${selectedRef.data.price} 별빛`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelected(null);
              }}
              className="mt-2 w-full rounded text-[11px] font-bold"
              style={{
                background: "rgba(216,150,200,0.30)",
                border: "1px solid rgba(216,150,200,0.55)",
                color: "#f4efff",
                padding: "4px 0",
              }}
            >
              닫기
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function gradeLabel(g: FishGrade): string {
  return g === "common"
    ? "일반"
    : g === "uncommon"
    ? "고급"
    : g === "rare"
    ? "희귀"
    : g === "legendary"
    ? "전설"
    : "신화";
}

// 16×16 sheet cell rendered at slot scale, cropped via background-
// position (same trick the catch popup uses).
function SlotSprite({
  ref_,
  small = false,
}: {
  ref_: ItemRef;
  small?: boolean;
}) {
  // Default sprite display fits comfortably inside a SLOT_DISPLAY-px
  // slot frame (slot has its own 4-px border + visual padding).
  const display = small ? 24 : 32;
  const isFish = ref_.kind === "fish";
  const sheetUrl = isFish
    ? ASSETS_FISH_CATALOG.fishAll
    : ASSETS_FORAGE_CATALOG.forageAll;
  const sheetW = isFish ? 160 : 160;
  const sheetH = isFish ? 160 : 48;
  const cellSize = 16;
  const scale = display / cellSize;
  const sx = ref_.data.spriteX;
  const sy = ref_.data.spriteY;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: "50%",
        top: "50%",
        width: display,
        height: display,
        transform: "translate(-50%, -50%)",
        backgroundImage: `url(${sheetUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
        backgroundPosition: `-${sx * scale}px -${sy * scale}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}

// ── Info tab content ─────────────────────────────────────────────
function InfoContent({
  nickname,
  totalExp,
  totalCatches,
  totalStarlight,
  inventory,
  assets,
}: {
  nickname: string;
  totalExp: number;
  totalCatches: number;
  totalStarlight: number;
  inventory: Record<string, number>;
  assets: LoadedAssets | null;
}) {
  const lvl = levelFromTotalExp(totalExp);
  const dexCount = Object.keys(inventory).filter(
    (k) => (inventory[k] ?? 0) > 0,
  ).length;
  const expFraction =
    lvl.expToNext > 0 ? Math.min(1, lvl.expInLevel / lvl.expToNext) : 0;
  return (
    // overflowY:auto as a safety net — content is sized to fit but a
    // very long nickname / future stat lines could push it over;
    // scrolling is preferable to clipping.
    <div
      className="flex w-full flex-col items-center"
      style={{
        color: "#3d2c1c",
        fontSize: 10,
        gap: 3,
        overflowY: "auto",
        height: "100%",
      }}
    >
      <CharacterPreview assets={assets} />
      <div
        className="font-serif font-bold leading-none"
        style={{ fontSize: 12 }}
      >
        {nickname || "이름 없음"}
      </div>
      {/* Fishing level + exp bar */}
      <div className="flex w-full flex-col" style={{ gap: 1 }}>
        <div
          className="flex items-baseline justify-between font-bold"
          style={{ fontSize: 10 }}
        >
          <span>낚시 Lv.{lvl.level}</span>
          <span style={{ fontSize: 9, color: "#5a4a30" }}>
            {lvl.expInLevel} / {lvl.expToNext} EXP
          </span>
        </div>
        <ExpBar fraction={expFraction} />
      </div>
      {/* Disabled lines for not-yet-built systems */}
      <div className="flex w-full justify-between" style={{ color: "#9a8d6a" }}>
        <span>생활 Lv.</span>
        <span>준비중입니다</span>
      </div>
      <div className="flex w-full justify-between" style={{ color: "#9a8d6a" }}>
        <span>전투 Lv.</span>
        <span>준비중입니다</span>
      </div>
      <div
        className="h-px w-full"
        style={{ background: "rgba(61,44,28,0.25)", margin: "1px 0" }}
      />
      <StatRow label="총 낚은 횟수" value={`${totalCatches}마리`} />
      <StatRow label="총 번 별빛" value={`${totalStarlight} 별빛`} />
      <StatRow
        label="도감 진행률"
        value={`${dexCount} / ${TOTAL_DEX_SPECIES}종`}
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full justify-between font-bold">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Mini exp-bar styled like the catch gauge but without the marker.
// Width tuned for the compact info tab; gauge height matches the
// in-game catch gauge so the visual language is consistent.
const EXP_BAR_WIDTH = 200;
const EXP_BAR_HEIGHT = 12;
function ExpBar({ fraction }: { fraction: number }) {
  return (
    <div
      className="relative"
      style={{ width: EXP_BAR_WIDTH, height: EXP_BAR_HEIGHT }}
    >
      <img
        src={UI_GAUGE_BAR}
        alt=""
        draggable={false}
        style={{
          imageRendering: "pixelated",
          width: EXP_BAR_WIDTH,
          height: EXP_BAR_HEIGHT,
          pointerEvents: "none",
          objectFit: "fill",
        }}
      />
      <div
        className="absolute"
        style={{
          left: 4,
          top: 4,
          width: Math.max(0, (EXP_BAR_WIDTH - 8) * fraction),
          height: EXP_BAR_HEIGHT - 8,
          background: "linear-gradient(180deg, #fde68a 0%, #f59e0b 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

// Composite character preview (idle frame, facing down). Re-uses the
// same sheet layout the game renders — char base + eyes + shirt +
// pants + shoes + hair, in that order.
function CharacterPreview({ assets }: { assets: LoadedAssets | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Compact preview — 32×32 cell at 1.5× = 48 px on screen. Fits the
  // smaller info tab without crowding the stat lines.
  const PREVIEW_SCALE = 1.5;
  const SIZE = SPRITE_CELL * PREVIEW_SCALE; // 48
  useEffect(() => {
    if (!assets || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const draw = (img: HTMLImageElement, variantStartX: number) => {
      ctx.drawImage(
        img,
        variantStartX,
        0,
        SPRITE_CELL,
        SPRITE_CELL,
        0,
        0,
        SIZE,
        SIZE,
      );
    };
    // Frame 0, row 0 → idle, facing down. Variant index × VARIANT_WIDTH
    // for the multi-color sheets; char base has no variants.
    draw(assets.char, 0);
    draw(assets.eyes, DEFAULT_EYES_COLOR * VARIANT_WIDTH);
    draw(assets.shirt, DEFAULT_SHIRT_COLOR * VARIANT_WIDTH);
    draw(assets.pants, DEFAULT_PANTS_COLOR * VARIANT_WIDTH);
    draw(assets.shoes, DEFAULT_SHOES_COLOR * VARIANT_WIDTH);
    draw(assets.hair, DEFAULT_HAIR_COLOR * VARIANT_WIDTH);
  }, [assets, SIZE]);
  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        imageRendering: "pixelated",
        width: SIZE,
        height: SIZE,
      }}
    />
  );
}

// ── Ranking tab content ─────────────────────────────────────────
// Phase-1 placeholder — only the local player. When the panel goes
// multi-user (Firestore guild roll-up) this will fill out to a
// top-10 list sorted by level then xp-in-level. For now we render
// the self entry so the layout exists.
function RankingContent({
  nickname,
  totalExp,
}: {
  nickname: string;
  totalExp: number;
}) {
  const lvl = levelFromTotalExp(totalExp);
  const rows = [{ rank: 1, nickname: nickname || "이름 없음", level: lvl.level }];
  return (
    <div
      className="flex w-full flex-col"
      style={{ color: "#3d2c1c", fontSize: 12, gap: 4 }}
    >
      <div
        className="text-center font-serif font-bold"
        style={{ fontSize: 13, marginBottom: 4 }}
      >
        낚시 레벨 랭킹
      </div>
      {rows.map((r) => (
        <div
          key={r.rank}
          className="flex items-center justify-between rounded px-3 py-2"
          style={{
            background:
              r.rank === 1 ? "rgba(251,191,36,0.20)" : "rgba(0,0,0,0.05)",
            border:
              r.rank === 1
                ? "1px solid rgba(251,191,36,0.55)"
                : "1px solid rgba(61,44,28,0.20)",
          }}
        >
          <span className="font-serif font-bold" style={{ width: 36 }}>
            {r.rank}위
          </span>
          <span className="flex-1 truncate px-2">{r.nickname}</span>
          <span className="font-bold">Lv.{r.level}</span>
        </div>
      ))}
      <div
        className="mt-2 text-center"
        style={{ fontSize: 10, color: "#7a6a4a" }}
      >
        길드원 전체 랭킹은 추후 업데이트됩니다
      </div>
    </div>
  );
}
