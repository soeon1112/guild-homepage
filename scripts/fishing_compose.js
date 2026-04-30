/* eslint-disable no-console */
// Compose the four fishing scene PNGs at 306x306 from the Cozy Fishing Asset Pack.
// All source tiles are upscaled 2× with nearest-neighbour resampling to match the
// chunky pixel scale of the existing pet-room background.
//
// Output:
//   fishing_bg.png    – sky + sea + sand + trees + scattered shells
//   fishing_dock.png  – wooden dock extending from sand into sea (transparent bg)
//   fishing_water.png – just the sea band (transparent bg) for animation overlay
//   fishing_front.png – foreground decorations (cattails, flowers, small bush)

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = 'C:\\Users\\user\\Downloads\\fishing';
const TILES = path.join(ROOT, 'Tiles', 'tiles.png');
const GLOBAL = path.join(ROOT, 'global.png');
const OUT_DIR = 'C:\\Users\\user\\Desktop\\guild-homepage\\public\\images\\fishing';
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 306, H = 306;
const SCALE = 2;
const TS = 16 * SCALE;       // tile size in output pixels (= 32)

// === Reference colours sampled from the asset pack ===
const SEA      = { r: 96,  g: 160, b: 168, alpha: 1 };  // sand-water autotile background
const SEA_DEEP = { r: 70,  g: 132, b: 144, alpha: 1 };  // a touch deeper for the horizon
const SKY_TOP    = { r: 254, g: 222, b: 196, alpha: 1 };
const SKY_BOTTOM = { r: 252, g: 232, b: 218, alpha: 1 };
const SAND_FALLBACK = { r: 186, g: 161, b: 89, alpha: 1 };

// === Source rectangles in tiles.png (pixel coords) ===
// SCV = source crop for tiles.png; coordinates verified by gridded inspection.
const T = {
  // Pure sand fill: col 5, row 10 = guaranteed 256/256 opaque sand pixels
  sand:        { left: 80,  top: 160, width: 16, height: 16 },
  // Shoreline TOP edge tile: col 1 row 12 (sand peeks up into water)
  shoreTop:    { left: 16,  top: 192, width: 16, height: 16 },
  // Shoreline TOP corners: col 0/2 row 12
  shoreTopL:   { left: 0,   top: 192, width: 16, height: 16 },
  shoreTopR:   { left: 32,  top: 192, width: 16, height: 16 },
  // Sand-on-water inner-fill tile (under the wave): col 1 row 13
  sandFilled:  { left: 16,  top: 208, width: 16, height: 16 },
  // Palm trees: cols 7-8 / 9-10, rows 2-5 (32x64)
  palm1:       { left: 112, top: 32,  width: 32, height: 64 },
  palm2:       { left: 144, top: 32,  width: 32, height: 64 },
  // Bushes (4 variants, 2x2 block)
  bush1:       { left: 112, top: 0,   width: 32, height: 16 },
  bush2:       { left: 144, top: 0,   width: 32, height: 16 },
  bush3:       { left: 112, top: 16,  width: 32, height: 16 },
  // Small bushes (single tile sprites in cols 5-6 rows 0-3)
  smallBush:   { left: 80,  top: 0,   width: 16, height: 16 },
  smallBush2:  { left: 96,  top: 16,  width: 16, height: 16 },
  // Flowers (2x4 block of variants in cols 5-6 rows 4-7)
  flowerOrange:{ left: 96,  top: 64,  width: 16, height: 16 },
  flowerRed:   { left: 96,  top: 80,  width: 16, height: 16 },
  flowerPurple:{ left: 80,  top: 96,  width: 16, height: 16 },
  flowerPink:  { left: 80,  top: 64,  width: 16, height: 16 },
  // Coconut: col 7 row 6 (small)
  coconut:     { left: 112, top: 96,  width: 16, height: 16 },
  // Cattails patch (3x2 of cattails)
  cattails:    { left: 80,  top: 288, width: 48, height: 48 },
  // Dock pieces (verified pixel bboxes)
  dockClean:   { left: 78,  top: 334, width: 36, height: 48 },
  dockSplash:  { left: 125, top: 320, width: 40, height: 64 },
};

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function blank(w, h) {
  return await sharp({ create: { width: w, height: h, channels: 4, background: transparent } })
    .png().toBuffer();
}

// Extract a source rect and upscale 2× nearest-neighbour
async function piece(rect, src = TILES, scale = SCALE) {
  const w = rect.width * scale, h = rect.height * scale;
  return await sharp(src)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .resize(w, h, { kernel: sharp.kernel.nearest })
    .png().toBuffer();
}

async function pieceFlipV(rect, src = TILES, scale = SCALE) {
  const w = rect.width * scale, h = rect.height * scale;
  return await sharp(src)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .flip()
    .resize(w, h, { kernel: sharp.kernel.nearest })
    .png().toBuffer();
}

async function pieceFlipH(rect, src = TILES, scale = SCALE) {
  const w = rect.width * scale, h = rect.height * scale;
  return await sharp(src)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .flop()
    .resize(w, h, { kernel: sharp.kernel.nearest })
    .png().toBuffer();
}

(async () => {
  // ----------------------------------------------------------------
  // SCENE LAYOUT (px in 306×306 output, with 32-px tiles)
  // ----------------------------------------------------------------
  // Sky:   y=  0 .. 64    (2 tiles)
  // Sea:   y= 64 .. 224   (5 tiles, with shore wave on the bottom)
  // Sand:  y=224 .. 306   (~2.5 tiles)
  //
  // Shore wave (sand peeking up into water) sits at y=192..224 (1 tile = 32 px)
  // Sand fill below shore: y=224..306
  //
  // Dock:  centered, base at sand y≈250, top in sea y≈110 (length 140 px)
  // ----------------------------------------------------------------
  const SKY_H = 64;
  const SAND_TOP = 224;          // top edge of solid sand band
  const SHORE_Y = SAND_TOP - 32; // y for the shore wave row (so its bottom = SAND_TOP)

  // ---- pre-render pieces ----
  const sand        = await piece(T.sand);          // 32×32
  const sandFilled  = await piece(T.sandFilled);    // 32×32
  const shoreTop    = await piece(T.shoreTop);
  const shoreTopL   = await piece(T.shoreTopL);
  const shoreTopR   = await piece(T.shoreTopR);
  const palm1       = await piece(T.palm1);         // 64×128
  const palm2       = await piece(T.palm2);
  const bush1       = await piece(T.bush1);
  const bush3       = await piece(T.bush3);
  const smallBush   = await piece(T.smallBush);
  const smallBush2  = await piece(T.smallBush2);
  const flowerOrng  = await piece(T.flowerOrange);
  const flowerRed   = await piece(T.flowerRed);
  const flowerPurp  = await piece(T.flowerPurple);
  const flowerPink  = await piece(T.flowerPink);
  const coconut     = await piece(T.coconut);
  const cattailsAll = await piece(T.cattails);      // 96×96 (six cattails)
  const dockClean   = await piece(T.dockClean);     // 72×96
  const dockSplash  = await piece(T.dockSplash);    // 80×128
  const dockSplashFlipped = await pieceFlipV(T.dockSplash); // splash now at TOP

  // ---- 1. fishing_bg.png ----
  // Build sky + sea bands as full-canvas gradients, then overlay sand band on top.
  const bgGradient = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <defs>
         <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="rgb(${SKY_TOP.r},${SKY_TOP.g},${SKY_TOP.b})"/>
           <stop offset="100%" stop-color="rgb(${SKY_BOTTOM.r},${SKY_BOTTOM.g},${SKY_BOTTOM.b})"/>
         </linearGradient>
         <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="rgb(${SEA_DEEP.r},${SEA_DEEP.g},${SEA_DEEP.b})"/>
           <stop offset="100%" stop-color="rgb(${SEA.r},${SEA.g},${SEA.b})"/>
         </linearGradient>
       </defs>
       <rect x="0" y="0" width="${W}" height="${SKY_H}" fill="url(#sky)"/>
       <rect x="0" y="${SKY_H}" width="${W}" height="${SAND_TOP - SKY_H}" fill="url(#sea)"/>
       <!-- soft horizon haze -->
       <rect x="0" y="${SKY_H - 4}" width="${W}" height="8" fill="rgba(255,255,255,0.18)"/>
       <!-- a couple of soft cloud blobs -->
       <ellipse cx="60"  cy="22" rx="32" ry="6"  fill="rgba(255,255,255,0.55)"/>
       <ellipse cx="220" cy="14" rx="40" ry="5"  fill="rgba(255,255,255,0.45)"/>
       <ellipse cx="170" cy="38" rx="22" ry="4"  fill="rgba(255,255,255,0.35)"/>
     </svg>`
  );

  // Sand band = tiled pure-sand tile across full canvas width
  const sandBandComposites = [];
  for (let y = SAND_TOP; y < H; y += TS) {
    for (let x = 0; x < W; x += TS) {
      // alternate between two near-identical sand tiles for slight variation
      const t = ((Math.floor(x / TS) + Math.floor(y / TS)) % 2 === 0) ? sand : sandFilled;
      sandBandComposites.push({ input: t, top: y, left: x });
    }
  }

  // Shoreline wave row: tile shoreTop across the width at y = SHORE_Y
  const shoreComposites = [];
  for (let x = 0; x < W; x += TS) {
    const piece = (x === 0) ? shoreTopL :
                  (x + TS >= W) ? shoreTopR : shoreTop;
    shoreComposites.push({ input: piece, top: SHORE_Y, left: x });
  }

  // Trees, bushes and decorations
  const palmLeftX = -10;             // bleed slightly off-canvas for natural framing
  const palmRightX = W - 64 + 10;
  const palmY = SAND_TOP - 96;       // trunk bottom rests ~32 px below SAND_TOP
  const decoComposites = [
    // background bushes behind palms
    { input: bush1, top: SAND_TOP - 8,  left: 30 },
    { input: bush3, top: SAND_TOP - 6,  left: W - 60 },
    // palms
    { input: palm1, top: palmY, left: palmLeftX },
    { input: palm2, top: palmY - 6, left: palmRightX },
    // small bushes on sand
    { input: smallBush,  top: SAND_TOP + 28, left: 14 },
    { input: smallBush2, top: SAND_TOP + 30, left: W - 40 },
    // flowers scattered on sand
    { input: flowerOrng, top: SAND_TOP + 50, left: 80 },
    { input: flowerRed,  top: SAND_TOP + 56, left: W - 110 },
    // coconuts on sand
    { input: coconut,    top: SAND_TOP + 36, left: 110 },
    { input: coconut,    top: SAND_TOP + 60, left: W - 90 },
  ];

  await sharp({ create: { width: W, height: H, channels: 4, background: SKY_TOP } })
    .composite([
      { input: bgGradient, top: 0, left: 0 },
      ...sandBandComposites,
      ...shoreComposites,
      ...decoComposites,
    ])
    .png()
    .toFile(path.join(OUT_DIR, 'fishing_bg.png'));
  console.log('wrote fishing_bg.png');

  // ---- 2. fishing_dock.png ----
  // The flipped splash dock is a single coherent sprite: splash + balls at TOP
  // (in the water), planks in the middle, balls at the BOTTOM (resting on sand).
  // We extend it by repeating the middle plank section before stitching the
  // bottom end-cap back on, so the dock reaches further down onto the sand
  // without introducing the width-mismatch step that a second sprite would
  // cause.
  const FlipW = 80;
  const FlipH = 128;
  // Slice the flipped dock vertically: top end-cap (splash), middle planks,
  // bottom end-cap.  The balls at top/bottom are ~16 px tall in source = 32 px
  // after 2× scaling; the splash adds another ~6-8 px above the top end-cap.
  const TOP_CAP_H = 40;     // splash + ball end-cap (in output px)
  const BOT_CAP_H = 32;     // ball end-cap (in output px)
  const MID_H_FROM_SOURCE = FlipH - TOP_CAP_H - BOT_CAP_H; // 56
  // Extract pieces from the already-rendered flipped dock buffer
  const dockTopCap = await sharp(dockSplashFlipped)
    .extract({ left: 0, top: 0, width: FlipW, height: TOP_CAP_H }).png().toBuffer();
  const dockMid = await sharp(dockSplashFlipped)
    .extract({ left: 0, top: TOP_CAP_H, width: FlipW, height: MID_H_FROM_SOURCE }).png().toBuffer();
  const dockBotCap = await sharp(dockSplashFlipped)
    .extract({ left: 0, top: FlipH - BOT_CAP_H, width: FlipW, height: BOT_CAP_H }).png().toBuffer();

  const dockBaseY = SAND_TOP + 30;        // bottom of dock end-cap rests on sand
  const dockX = Math.floor((W - FlipW) / 2);
  // Stack: top + N×middle + bottom.  Two middle slices ⇒ extends body by 56 px.
  const midRepeats = 2;
  const totalDockH = TOP_CAP_H + midRepeats * MID_H_FROM_SOURCE + BOT_CAP_H;
  const dockTopY = dockBaseY - totalDockH;

  const dockComposites = [
    { input: dockTopCap, top: dockTopY, left: dockX },
  ];
  for (let i = 0; i < midRepeats; i++) {
    dockComposites.push({
      input: dockMid,
      top: dockTopY + TOP_CAP_H + i * MID_H_FROM_SOURCE,
      left: dockX,
    });
  }
  dockComposites.push({
    input: dockBotCap,
    top: dockTopY + TOP_CAP_H + midRepeats * MID_H_FROM_SOURCE,
    left: dockX,
  });

  await sharp({ create: { width: W, height: H, channels: 4, background: transparent } })
    .composite(dockComposites)
    .png()
    .toFile(path.join(OUT_DIR, 'fishing_dock.png'));
  console.log('wrote fishing_dock.png');

  // ---- 3. fishing_water.png ----
  // Just the sea band region (transparent above and below) for animation overlays.
  const seaOnly = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <defs>
         <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="rgb(${SEA_DEEP.r},${SEA_DEEP.g},${SEA_DEEP.b})"/>
           <stop offset="100%" stop-color="rgb(${SEA.r},${SEA.g},${SEA.b})"/>
         </linearGradient>
       </defs>
       <rect x="0" y="${SKY_H}" width="${W}" height="${SAND_TOP - SKY_H}" fill="url(#sea)"/>
     </svg>`
  );
  await sharp({ create: { width: W, height: H, channels: 4, background: transparent } })
    .composite([{ input: seaOnly, top: 0, left: 0 }])
    .png()
    .toFile(path.join(OUT_DIR, 'fishing_water.png'));
  console.log('wrote fishing_water.png');

  // ---- 4. fishing_front.png ----
  // Foreground decorations layered on top of everything.  Place items along the
  // very bottom edge so they don't cover the palms or the dock base.
  // Use only half of the cattails patch (top row, three smaller cattails) and
  // tuck it into the bottom-left corner so it reads as foreground reeds rather
  // than a wall of vegetation.
  const cattailRow = await sharp(cattailsAll)
    .extract({ left: 0, top: 0, width: 96, height: 48 }).png().toBuffer();
  const frontComposites = [
    // small cattail clump bottom-left corner (front of foreground sand)
    { input: cattailRow, top: H - 56, left: -10 },
    // single flower clusters scattered low
    { input: flowerPink, top: H - 30, left: 100 },
    { input: flowerPurp, top: H - 30, left: W - 80 },
    { input: smallBush2, top: H - 26, left: W - 36 },
  ];
  await sharp({ create: { width: W, height: H, channels: 4, background: transparent } })
    .composite(frontComposites)
    .png()
    .toFile(path.join(OUT_DIR, 'fishing_front.png'));
  console.log('wrote fishing_front.png');

  console.log('all done');
})().catch((e) => { console.error(e); process.exit(1); });
