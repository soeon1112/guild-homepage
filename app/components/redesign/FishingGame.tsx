// FishingGame — phase 1. Modal floating panel that renders a 306×306
// canvas-based world: background image map, multi-layer character
// composited from the modular sprite sheet, WASD/joystick movement,
// camera that follows the player but locks at map edges, and rough
// rectangle collision for buildings and sea.
//
// Constants live in src/lib/fishingData.ts so we can refine collision
// and customization without touching the loop.

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSETS,
  ASSETS_FISH,
  BOBBER_CELL,
  BOBBER_DISTANCE,
  BOBBER_INDEX,
  FISH_BITE_DEPTH_PX,
  FISH_BITE_REACTION_MS,
  FISH_BOBBER_BOB_AMP,
  FISH_BOBBER_BOB_FREQ,
  FISH_FAKE_BITE_DEPTH_PX,
  FISH_FAKE_BITE_DURATION_MS,
  FISH_FAKE_BITE_MAX,
  FISH_FAKE_BITE_PROBABILITY,
  FISH_RESULT_MS,
  FISH_SHADOW_CELL,
  FISH_SHADOW_FRAME_MS,
  FISH_SHADOW_FRAMES,
  FISH_SHADOW_LEAD_MS,
  FISH_TEXT_CAUGHT,
  FISH_TEXT_GOT_AWAY,
  FISH_TEXT_TOO_EARLY,
  FISH_WAIT_MAX_MS,
  FISH_WAIT_MIN_MS,
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

type Props = { open: boolean; onClose: () => void };

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

// Joystick is parked at a fixed bottom-left dock so the player can
// always thumb-drag from a known spot. Outer diameter ≈ 24% of the
// 306px viewport (per design note "20–25%"). Idle state fades to a
// faint hint, drag state lights up.
const JOYSTICK_BASE_X = 50;
const JOYSTICK_BASE_Y = VIEWPORT - 50;
const JOYSTICK_RADIUS = 36;
const JOYSTICK_KNOB = 16;
const JOYSTICK_DEAD_ZONE = 5;

export default function FishingGame({ open, onClose }: Props) {
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
  // Result text shown during fishingSuccess / fishingFail. The kind
  // distinguishes styling but both auto-clear when the mode advances.
  const [fishingResult, setFishingResult] = useState<{
    text: string;
    kind: "success" | "fail";
  } | null>(null);
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
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed: ${src}`));
        img.src = src;
      });
    const loadCollision = async (src: string): Promise<ImageData> => {
      const img = await load(src);
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      if (!cx) throw new Error("collision: 2d context unavailable");
      cx.drawImage(img, 0, 0);
      return cx.getImageData(0, 0, img.width, img.height);
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
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      if (!cx) throw new Error("front: 2d context unavailable");
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, img.width, img.height);
      const px = data.data;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] > 0) px[i] = 255;
      }
      cx.putImageData(data, 0, 0);
      return c;
    };
    // Loader for the background ART that returns BOTH the image
    // (for rendering) and ImageData (for sampling water pixels).
    const loadBackground = async (
      src: string,
    ): Promise<{ img: HTMLImageElement; data: ImageData }> => {
      const img = await load(src);
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      if (!cx) throw new Error("background: 2d context unavailable");
      cx.drawImage(img, 0, 0);
      return { img, data: cx.getImageData(0, 0, img.width, img.height) };
    };
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
    setMode("walk");
    setFishingResult(null);
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
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    setJoyView({ active: false, dx: 0, dy: 0 });
    setMode("fishingCast");
    setFishingResult(null);
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
    if (s.mode === "fishingFakeBite") {
      s.mode = "fishingFail";
      s.subT = 0;
      setMode("fishingFail");
      setFishingResult({ text: FISH_TEXT_TOO_EARLY, kind: "fail" });
      return;
    }
    if (s.mode === "fishingBite") {
      s.mode = "fishingSuccess";
      s.subT = 0;
      setMode("fishingSuccess");
      setFishingResult({ text: FISH_TEXT_CAUGHT, kind: "success" });
      return;
    }
    if (s.mode === "fishingWait" || s.mode === "fishingCast") {
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
      } else if (down && (e.key === " " || e.code === "Space")) {
        e.preventDefault();
        handleAction();
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
    if (joyRef.current.active) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoy(e, true);
  }, []);

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
            s.mode = "fishingBite";
            setMode("fishingBite");
          }
        }
        return;
      }
      if (s.mode === "fishingFakeBite") {
        s.subT += dt * 1000;
        if (s.subT >= FISH_FAKE_BITE_DURATION_MS) {
          s.mode = "fishingWait";
          s.subT = 0;
          setMode("fishingWait");
        }
        return;
      }
      if (s.mode === "fishingBite") {
        s.subT += dt * 1000;
        if (s.subT >= FISH_BITE_REACTION_MS) {
          // Player missed the reaction window — fish escapes.
          s.mode = "fishingFail";
          s.subT = 0;
          setMode("fishingFail");
          setFishingResult({ text: FISH_TEXT_GOT_AWAY, kind: "fail" });
        }
        return;
      }
      if (s.mode === "fishingSuccess") {
        s.subT += dt * 1000;
        if (s.subT >= FISH_RESULT_MS) {
          // Catch sequence done — back to walk.
          s.mode = "walk";
          s.subT = 0;
          setMode("walk");
          setFishingResult(null);
        }
        return;
      }
      if (s.mode === "fishingFail") {
        s.subT += dt * 1000;
        if (s.subT >= FISH_RESULT_MS) {
          // Bobber resets and a fresh schedule rolls so the player
          // can keep fishing without re-casting.
          s.mode = "fishingWait";
          s.subT = 0;
          scheduleFishingEvents(s);
          setMode("fishingWait");
          setFishingResult(null);
        }
        return;
      }

      let vx = 0;
      let vy = 0;
      if (k.up) vy -= 1;
      if (k.down) vy += 1;
      if (k.left) vx -= 1;
      if (k.right) vx += 1;
      if (j.active) {
        vx += j.dx;
        vy += j.dy;
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
  }, [open, assets, triggerZone, scheduleFishingEvents]);

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

          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
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
                of the cosmic UI's transition feel. */}
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

            {/* Unified action button (bottom-right). Mirrors the
                Space key — it's only rendered when there's something
                meaningful to do, and the icon shifts with context:
                  • 🎣 — fishing in progress, or facing water
                  • 💬 — standing in the NPC interaction zone
                Hidden during dialog (the dialog acts as its own tap
                target) and during fade transitions. */}
            {(() => {
              if (npcDialog) return null;
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
                ? "!"
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
              return (
                <motion.button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleAction();
                  }}
                  whileTap={{ scale: 0.9 }}
                  animate={
                    isBite ? { scale: [1, 1.08, 1] } : { scale: 1 }
                  }
                  transition={
                    isBite
                      ? { duration: 0.6, repeat: Infinity }
                      : { duration: 0.08 }
                  }
                  aria-label={label}
                  className="absolute right-3 bottom-3 flex items-center justify-center rounded-full text-stardust"
                  style={{
                    width: 56,
                    height: 56,
                    background: isBite
                      ? "rgba(220,80,80,0.78)"
                      : "rgba(11,8,33,0.6)",
                    border: isBite
                      ? "1px solid rgba(255,229,196,0.85)"
                      : "1px solid rgba(216,150,200,0.35)",
                    boxShadow: isBite
                      ? "0 4px 18px rgba(220,80,80,0.55), inset 0 1px 0 rgba(255,229,196,0.30)"
                      : "0 4px 14px rgba(11,8,33,0.55), inset 0 1px 0 rgba(255,229,196,0.10)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  <span
                    className="leading-none"
                    aria-hidden
                    style={{
                      fontSize: isBite ? 28 : 24,
                      fontWeight: isBite ? 800 : 400,
                    }}
                  >
                    {icon}
                  </span>
                </motion.button>
              );
            })()}

            {/* Fishing result toast — shown during fishingSuccess
                / fishingFail. Distinct color per kind so a glance
                tells the player what happened. */}
            {fishingResult ? (
              <div
                className="pointer-events-none absolute left-1/2 top-[28%] -translate-x-1/2 rounded-xl px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  background:
                    fishingResult.kind === "success"
                      ? "rgba(216,150,200,0.92)"
                      : "rgba(11,8,33,0.92)",
                  color:
                    fishingResult.kind === "success" ? "#1a0f3d" : "#f4efff",
                  border:
                    fishingResult.kind === "success"
                      ? "1px solid rgba(255,229,196,0.85)"
                      : "1px solid rgba(216,150,200,0.50)",
                  boxShadow:
                    fishingResult.kind === "success"
                      ? "0 4px 16px rgba(216,150,200,0.55)"
                      : "0 4px 16px rgba(11,8,33,0.6)",
                }}
              >
                {fishingResult.text}
              </div>
            ) : null}

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

            {/* NPC dialog — speech bubble style, dismiss on tap or E */}
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
          </div>

          <div
            className="px-3 py-1.5 text-[10px] text-text-sub"
            style={{ borderTop: "1px solid rgba(216,150,200,0.20)" }}
          >
            {scene === "outdoor"
              ? "WASD / 방향키 · Space 또는 우하단 🎣 버튼"
              : "Space 또는 우하단 💬 버튼으로 대화 · 출구로 걸어가면 자동 퇴장"}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
