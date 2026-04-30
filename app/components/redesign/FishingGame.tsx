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
  CHAR_BBOX_HALF_W,
  CHAR_BBOX_HEIGHT,
  COLLISION_RED_GB_MAX,
  COLLISION_RED_R_MIN,
  DEFAULT_EYES_COLOR,
  DEFAULT_HAIR_COLOR,
  DEFAULT_PANTS_COLOR,
  DEFAULT_SHIRT_COLOR,
  DEFAULT_SHOES_COLOR,
  FISHSHOP_DOOR_ZONE,
  FISHSHOP_EXIT_SPAWN_X,
  FISHSHOP_EXIT_SPAWN_Y,
  FISHSHOP_EXIT_ZONE,
  FISHSHOP_INDOOR_SPAWN_X,
  FISHSHOP_INDOOR_SPAWN_Y,
  FISHSHOP_INDOOR_UNWALKABLE,
  FISHSHOP_NPC_LINE,
  FISHSHOP_NPC_X,
  FISHSHOP_NPC_Y,
  FISHSHOP_NPC_ZONE,
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
  YELLOW_SHOP_DOOR_ZONE,
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
  shopInterior: HTMLImageElement;
  char: HTMLImageElement;
  npcChar: HTMLImageElement;
  eyes: HTMLImageElement;
  shirt: HTMLImageElement;
  pants: HTMLImageElement;
  shoes: HTMLImageElement;
  hair: HTMLImageElement;
  shadow: HTMLImageElement;
};

type Prompt = "blueDoor" | "yellowDoor" | "exit" | "npc" | null;

function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function rectsCollideWithFoot(
  footX: number,
  footY: number,
  rects: Rect[],
): boolean {
  const bx = footX - CHAR_BBOX_HALF_W;
  const by = footY - CHAR_BBOX_HEIGHT;
  const bw = CHAR_BBOX_HALF_W * 2;
  const bh = CHAR_BBOX_HEIGHT;
  for (const r of rects) {
    if (
      bx + bw > r.x &&
      bx < r.x + r.w &&
      by + bh > r.y &&
      by < r.y + r.h
    ) {
      return true;
    }
  }
  return false;
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
    };
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    sceneRef.current = "outdoor";
    promptRef.current = null;
    fadeRef.current = { active: false, t: 0, midDone: false, onMid: null };
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
    Promise.all([
      load(ASSETS.background),
      loadOpaqueOverlay(ASSETS.mapFront),
      loadCollision(ASSETS.collision),
      load(ASSETS.shopInterior),
      load(ASSETS.charBase),
      load(ASSETS.npcChar),
      load(ASSETS.eyes),
      load(ASSETS.shirt),
      load(ASSETS.pants),
      load(ASSETS.shoes),
      load(ASSETS.hair),
      load(ASSETS.shadow),
    ])
      .then(([map, mapFront, collision, shopInterior, char, npcChar, eyes, shirt, pants, shoes, hair, shadow]) => {
        if (cancelled) return;
        setAssets({ map, mapFront, collision, shopInterior, char, npcChar, eyes, shirt, pants, shoes, hair, shadow });
      })
      .catch((err) => {
        if (!cancelled) console.error("[fishing] asset load failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Trigger a 0.3s fade transition. The midpoint callback runs when
  // the screen is fully black, swapping scene + position so fade-in
  // already shows the new scene. While the fade is active, E is
  // ignored and movement input is dropped (handled in the loop).
  const startTransition = useCallback((onMid: () => void) => {
    if (fadeRef.current.active) return;
    keysRef.current = { up: false, down: false, left: false, right: false };
    joyRef.current = { active: false, pointerId: -1, dx: 0, dy: 0 };
    setJoyView({ active: false, dx: 0, dy: 0 });
    fadeRef.current = { active: true, t: 0, midDone: false, onMid };
  }, []);

  // E-key / tap-prompt handler. Reads the current zone via promptRef
  // so it works the same whether triggered by a keystroke or a tap.
  const handleInteract = useCallback(() => {
    if (npcDialog) {
      setNpcDialog(false);
      return;
    }
    if (fadeRef.current.active) return;
    const zone = promptRef.current;
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
        };
        promptRef.current = null;
        setScene("fishshop");
        setPrompt(null);
      });
    } else if (zone === "yellowDoor") {
      setYellowToast(true);
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
        };
        promptRef.current = null;
        setScene("outdoor");
        setPrompt(null);
      });
    } else if (zone === "npc") {
      setNpcDialog(true);
    }
  }, [npcDialog, startTransition]);

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
      } else if (down && (e.key === "e" || e.key === "E" || e.key === "ㄷ")) {
        e.preventDefault();
        handleInteract();
      } else if (down && e.key === "Escape") {
        if (npcDialog) {
          setNpcDialog(false);
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
  }, [open, onClose, handleInteract, npcDialog]);

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

    // Pick the right collision check for the active scene. Outdoor
    // is the painted collision.png mask; indoor uses simple rect
    // tests (the shop interior is small and rectilinear).
    const sceneCollides = (
      currentScene: Scene,
      x: number,
      y: number,
    ): boolean => {
      if (currentScene === "outdoor") return collidesAt(x, y, collision);
      return rectsCollideWithFoot(x, y, FISHSHOP_INDOOR_UNWALKABLE);
    };

    // Determine which interaction prompt (if any) is active based on
    // scene + foot position.
    const computeZone = (
      currentScene: Scene,
      x: number,
      y: number,
    ): Prompt => {
      if (currentScene === "outdoor") {
        if (pointInRect(x, y, FISHSHOP_DOOR_ZONE)) return "blueDoor";
        if (pointInRect(x, y, YELLOW_SHOP_DOOR_ZONE)) return "yellowDoor";
        return null;
      }
      if (pointInRect(x, y, FISHSHOP_NPC_ZONE)) return "npc";
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

      // Prompt zone bookkeeping — only call setState when the zone
      // actually changes so React doesn't re-render every frame.
      const newZone = computeZone(currentScene, s.x, s.y);
      if (newZone !== promptRef.current) {
        promptRef.current = newZone;
        setPrompt(newZone);
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
        imgs.shadow,
        Math.round(footX - 8 - camX),
        Math.round(footY - 6 - camY),
      );
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

    const render = (ctx: CanvasRenderingContext2D) => {
      const s = stateRef.current;
      const currentScene = sceneRef.current;
      const fade = fadeRef.current;

      const mapW = currentScene === "outdoor" ? MAP_WIDTH : INDOOR_MAP_WIDTH;
      const mapH = currentScene === "outdoor" ? MAP_HEIGHT : INDOOR_MAP_HEIGHT;
      // Visible map area in 1x map coords — half the viewport per axis
      // because we draw at 2x. Camera clamps so the player drifts
      // off-center near map edges instead of revealing dead space.
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

      // Black background — fills any letterbox area when the indoor
      // map is smaller than the viewport (after MAP_SCALE the shop
      // image is 320×320, so this only matters near edges).
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIEWPORT, VIEWPORT);
      ctx.save();
      ctx.scale(MAP_SCALE, MAP_SCALE);
      // Re-assert pixelated sampling under the scale matrix; some
      // browsers reset this when the transform changes.
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

      if (currentScene === "outdoor") {
        ctx.drawImage(imgs.map, -camX, -camY);
        drawCharacter(imgs.char, s.x, s.y, camX, camY, s.frame, s.dir, playerColors);
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
        // Fish-shop interior. NPC drawn before the player so the
        // player passes "in front" if they ever overlap (the player's
        // bbox is constrained to the floor, so this rarely matters).
        ctx.drawImage(imgs.shopInterior, -camX, -camY);
        drawCharacter(
          imgs.npcChar,
          FISHSHOP_NPC_X,
          FISHSHOP_NPC_Y,
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
  }, [open, assets]);

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

            {/* Interaction prompt — appears when the player is in any
                interactive zone. Top-right of the canvas so it can't
                hide under the thumb on mobile. PC users press E; the
                whole pill is also tappable. */}
            {prompt ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleInteract();
                }}
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-stardust transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(26,15,61,0.85)",
                  border: "1px solid rgba(216,150,200,0.55)",
                  boxShadow: "0 0 12px rgba(255,229,196,0.30)",
                }}
              >
                <span
                  className="flex h-[18px] w-[18px] items-center justify-center rounded font-bold"
                  style={{
                    background: "rgba(216,150,200,0.35)",
                    border: "1px solid rgba(255,229,196,0.55)",
                  }}
                >
                  E
                </span>
                <span>
                  {prompt === "blueDoor" || prompt === "yellowDoor"
                    ? "입장"
                    : prompt === "exit"
                    ? "나가기"
                    : "대화"}
                </span>
              </button>
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
                  탭 또는 E로 닫기
                </span>
              </button>
            ) : null}
          </div>

          <div
            className="px-3 py-1.5 text-[10px] text-text-sub"
            style={{ borderTop: "1px solid rgba(216,150,200,0.20)" }}
          >
            {scene === "outdoor"
              ? "WASD / 방향키 · 입구 앞에서 E 또는 탭"
              : "E로 가게 주인과 대화 · 출구에서 E로 나가기"}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
