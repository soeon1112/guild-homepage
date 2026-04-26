// Pet pixel-art data. Mirrored verbatim in
// dawnlight-app/src/lib/petArt.ts (keep in sync).
//
// Each sprite is a 16×16 grid of single-char codes that the renderer
// maps to colors. Codes:
//   .  transparent
//   1  primary    (PET_PALETTE.primary)
//   2  secondary  (PET_PALETTE.secondary)
//   3  accent     (PET_PALETTE.accent — outlines / eye outline)
//   w  white      (#FFFFFF — eye sclera, highlights, panda face)
//   p  pink       (#F4A6BC — cheeks, inner ear, tongue)
//   B  black      (#1A1A1A — pupils, nose dot)
//   y  yellow     (#FFD56B — beak, owl eye ring)
//   g  grey       (#7E8895 — wolf accents)
//   o  orange-tip (#FFFFFF — fox tail tip / cat paw tip)
//
// Stages are visually distinct: egg is shared across types, then baby
// (small round head-only), child (small body appears), teen (taller,
// tail/wings emerge), adult (full sprite).

import type { ItemId, PetStage, PetType, BackgroundId, InteractionId } from "./pets";

export type PixelGrid = string[]; // 16 strings of length 16

// ── Code → color resolver ────────────────────────────────────
export type PaletteColors = {
  primary: string;
  secondary: string;
  accent: string;
};

export function pixelColor(code: string, p: PaletteColors): string | null {
  switch (code) {
    case ".": return null;
    case "1": return p.primary;
    case "2": return p.secondary;
    case "3": return p.accent;
    case "w": return "#FFFFFF";
    case "p": return "#F4A6BC";
    case "B": return "#1A1A1A";
    case "y": return "#FFD56B";
    case "g": return "#7E8895";
    case "o": return "#FFFFFF";
    default: return null;
  }
}

// ── Universal egg ────────────────────────────────────────────
// Same shape for every pet — tinted by primary color. Speckled with
// secondary so each species is identifiable even pre-hatch.
export const EGG_SPRITE: PixelGrid = [
  "................",
  "................",
  "................",
  ".....33333......",
  "....3111113.....",
  "...312111213....",
  "...311112113....",
  "..31121111213...",
  "..31111121113...",
  "..31112111113...",
  "..31111111113...",
  "..31211112113...",
  "..31111121113...",
  "...3111111113...",
  "....33333333....",
  "................",
];

// ── Per-pet, per-stage sprites ───────────────────────────────
// Note: not exhaustive — baby/child/teen/adult are distinct silhouettes
// to satisfy "성장 단계별 외형이 달라야 해". Egg is shared above.

const CAT: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    "................",
    "................",
    "....33....33....",
    "...3113..3113...",
    "..311113311113..",
    "..3111111111113.",
    "..311w1Bw13B113.",
    "..31wB1131B1113.",
    "..3111p1p11113..",
    "..311113B11113..",
    "...31111111113..",
    "....3331333.....",
    "................",
    "................",
  ],
  child: [
    "................",
    "................",
    "...33......33...",
    "..3113....3113..",
    ".311123..3211113",
    ".31111133311113.",
    ".3111111111113..",
    ".311wB1133Bw113.",
    ".31wBB113B1B113.",
    ".31111p11p11113.",
    "..311113B311113.",
    "..311111111113..",
    "..31222221113...",
    "...3111111133...",
    "...331....133...",
    "................",
  ],
  teen: [
    "................",
    "..33........33..",
    ".3113......3113.",
    ".311123....321113",
    ".311111333311113",
    ".3111111111113..",
    ".31wB113311Bw1133",
    ".31BBB113B1BB1131",
    ".311112p1p1113..",
    ".31111B1B11113..",
    ".311111111113...",
    ".3122222113.....",
    ".3111111113.....",
    ".31111133133....",
    "..31133.....33..",
    "..133...........",
  ],
  adult: [
    "..33..........33",
    ".3113........3113",
    ".311123......321113",
    ".311112333333211113",
    ".3111111111111113.",
    ".31wB1133311Bw113.",
    ".3BBB1133311BBB113",
    ".311112pBp21113...",
    ".311111BB111113...",
    ".311111111113.....",
    ".3122222111113....",
    ".3111111111113....",
    ".311113311111113..",
    ".311333.13311113..",
    "..3133...3331113..",
    "...3.......333....",
  ],
};

const DOG: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    "................",
    "..3322....2233..",
    ".321113..311123.",
    ".311111333111113",
    ".3111111111113..",
    ".311wB113B1w113.",
    ".31BBB113BBB113.",
    ".3111pp3pp1113..",
    ".311113B311113..",
    ".3111111111113..",
    "..33111111133...",
    "....3333333.....",
    "................",
    "................",
  ],
  child: [
    "................",
    "..3322......2233",
    ".3211123....3211123",
    ".31111113....31111113",
    ".311111133333111113",
    ".311111111111113..",
    ".311wB1133311wB113",
    ".31BBB1133311BBB1.",
    ".3111pp3BB3pp113..",
    ".3111113333111113.",
    ".31111111111113...",
    "..31111111111133..",
    "..31222211113.....",
    "..31111111113.....",
    "..3111....1113....",
    "..133.....1333....",
  ],
  teen: [
    "................",
    "..32........23..",
    ".3211123..3211123",
    ".311111133311113",
    ".3111111111113..",
    ".311wB1133311Bw113",
    ".3BBB113311BBB113",
    ".3111pBBp1113....",
    ".311113B311113...",
    ".311111111113....",
    ".3111111111113...",
    ".31222221111113..",
    ".31111111111113..",
    ".3111133311113...",
    ".3133.....3113...",
    ".33.........33...",
  ],
  adult: [
    "..32............23",
    ".321123........321123",
    ".31111133....33111113",
    ".311111113333111113.",
    ".3111111111111113...",
    ".311wB113311Bw113...",
    ".3BBB113311BBB113...",
    ".311pBBp113pBBp113..",
    ".31113B3113B3113....",
    ".3111111111113......",
    ".311222211111113....",
    ".3111111111111113...",
    ".311113311111113....",
    ".3133..1331111133...",
    ".33....3.31111333...",
    "..............333...",
  ],
};

const RABBIT: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "...33......33...",
    "..3113....3113..",
    "..3p13....31p3..",
    "..3pp3....3pp3..",
    "..3p13....31p3..",
    "...33333333.....",
    "..31111111113...",
    "..31wB113Bw13...",
    "..31BB113BB13...",
    "..3111p3p1113...",
    "..3111111113....",
    "...3331333......",
    "................",
    "................",
    "................",
  ],
  child: [
    "..33..........33",
    ".3113........3113",
    ".3p13........31p3",
    ".3pp3........3pp3",
    ".3pp13......3p113",
    ".311p3......3p113",
    "..313333333333..",
    "..31111111111113",
    "..31wB1133Bw113.",
    "..31BB1133BB113.",
    "..3111pp3pp1113.",
    "..3111133331113.",
    "..31111111111133",
    "...3331111133...",
    "....333333333...",
    "................",
  ],
  teen: [
    "..33........33..",
    ".3113......3113.",
    ".3p13......31p3.",
    ".3pp3......3pp3.",
    ".3pp13....3p113.",
    ".311p3....3p113.",
    "..3133333333133.",
    "..3111111111113.",
    "..31wB1133Bw113.",
    "..3BBB1133BBB113",
    "..3111pp3pp113..",
    "..31133333133...",
    "..3111111111113.",
    "..311111111133..",
    "..31111133133...",
    "..3133.....3...",
  ],
  adult: [
    "..33..........33",
    ".3113........3113",
    ".3p13........31p3",
    ".3pp3........3pp3",
    ".3pp13......3p113",
    ".311p3......3p113",
    ".311p3333333p113",
    "..31333111333113",
    "..3wB113311Bw113",
    "..3BBB113311BB113",
    "..3111pp3pp1113.",
    "..3113333333113.",
    "..311111111111133",
    "..3111111111133..",
    "..31133111133....",
    "..3133...3133....",
  ],
};

const FOX: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    "...3........3...",
    "..313......313..",
    "..3113....3113..",
    "..31123333211113",
    "..3111111111113.",
    "..31wB1133Bw113.",
    "..31BB1133BB113.",
    "..31111pBp1113..",
    "..3111133313....",
    "...331111113....",
    "...331111113....",
    "....3331333.....",
    "................",
    "................",
  ],
  child: [
    "................",
    "...3........3...",
    "..313......313..",
    ".31113....31113.",
    ".311123..321113.",
    ".311113333111113",
    ".3111111111113..",
    ".31wB1133Bw113..",
    ".3BBB1133BBB113.",
    ".311pBBp113.....",
    ".31133333113....",
    ".311111111113...",
    ".3111111111133..",
    ".311111111133...",
    "..31133313333...",
    "..133....3o133..",
  ],
  teen: [
    "....3......3....",
    "...313....313...",
    "..31113..31113..",
    "..311123321113..",
    "..311113311113..",
    "..3wB113311Bw113",
    "..3BBB1133BBB113",
    "..311pBBp113....",
    "..3113B31113....",
    "..3111111113....",
    "..31222211113...",
    "..31111111113...",
    "..3111111133....",
    "..31111333......",
    "..31133.........",
    "..133.....333oo3",
  ],
  adult: [
    "...3..........3.",
    "..313........313",
    ".31113......31113",
    ".311123....321113",
    ".311113333311113",
    ".3wB1133311Bw113",
    ".3BBB113311BBB113",
    ".311pBBp113.....",
    ".31133333113....",
    ".311111111113...",
    ".31222221111113.",
    ".31111111111113.",
    ".311111111133...",
    ".3111111133.....",
    ".311113333.333oo3",
    ".3133....333oo33.",
  ],
};

const HAMSTER: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    "................",
    "....33....33....",
    "...313....313...",
    "..3111333111113.",
    "..3111111111113.",
    "..31wB113Bw113..",
    "..31BB113BB113..",
    "..3111p3p1113...",
    "..3122222213....",
    "..31111111133...",
    "...3331333......",
    "................",
    "................",
    "................",
  ],
  child: [
    "................",
    "................",
    "...33......33...",
    "..313......313..",
    ".31113....31113.",
    ".311113333111113",
    ".3111111111113..",
    ".31wB1133Bw113..",
    ".3BBB1133BBB113.",
    ".311p2p3p2p113..",
    ".3122222222113..",
    ".311111111111133",
    ".3111111111133..",
    "..3111111133....",
    "...33113333.....",
    "................",
  ],
  teen: [
    "..33........33..",
    ".313........313.",
    "31113......31113",
    "311123....321113",
    "311113333311113.",
    "3wB1133311Bw113.",
    "3BBB113311BBB113",
    "311p2p3p2p113...",
    "31222222222113..",
    "311111111111113.",
    "31111111111133..",
    ".311111111133...",
    "..31111133......",
    "..3133..........",
    "................",
    "................",
  ],
  adult: [
    "..33............33",
    ".313............313",
    "31113..........31113",
    "311123........321113",
    "311113333333311113.",
    "3wB1133311Bw113....",
    "3BBB113311BBB113...",
    "311p2p3p2p113......",
    "31222222222113.....",
    "311111111111111133.",
    "31111111111111133..",
    ".311111111111133...",
    "..3111111111133....",
    "...331111133.......",
    "................",
    "................",
  ],
};

const OWL: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    "...33......33...",
    "..313........313",
    ".31113......31113",
    ".311111333111113.",
    ".311111111111113.",
    ".311wwy33ywwww113",
    ".311wBy33yBww113.",
    ".31111y3y11113...",
    ".311111y111113...",
    ".3111122211113...",
    ".311111111133....",
    "..31133311.......",
    "................",
    "................",
  ],
  child: [
    "................",
    "..33..........33",
    ".313..........313",
    "31113........31113",
    "31113........31113",
    "311111333333111113",
    "31111111111113....",
    "31wwy33ywww113....",
    "31wBy33yBww113....",
    "31111y3y11113.....",
    "311111y111113.....",
    "31222222211113....",
    "31111111111113....",
    ".3111111133.......",
    "..3133333.........",
    "................",
  ],
  teen: [
    "..33........33..",
    ".313........313.",
    "31113......31113",
    "31113......31113",
    "311111333111113.",
    "31111111111113..",
    "31wwy33ywww113..",
    "31wBy33yBww113..",
    "31111y3y11113...",
    "311111y111113...",
    "31222222211113..",
    "31111111111113..",
    "311111111111133.",
    ".31111111133....",
    ".31133311.......",
    "................",
  ],
  adult: [
    "..333........333.",
    ".31113......31113",
    ".31113......31113",
    ".31113......31113",
    ".31111333333111113",
    ".311111111111113.",
    ".31wwwy33ywwww113",
    ".31wwBy33yBwww113",
    ".311111y3y111113.",
    ".3111111y1111113.",
    ".3122222222111113",
    ".3111111111111113",
    ".31111111111111133",
    "..3111111111111133",
    "...3111111111133.",
    "....3133..3133...",
  ],
};

const BEAR: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "................",
    ".333........333.",
    "31113........31113",
    "311113......311113",
    "31111133333311113",
    "311111111111113.",
    "31wB1133Bw1113..",
    "3BBB113BBBB113..",
    "311112pBp1113...",
    "31222222213.....",
    "31111111113.....",
    "3111111111133...",
    ".33333333333....",
    "................",
    "................",
  ],
  child: [
    "................",
    ".333........333.",
    "31113........31113",
    "311113......311113",
    "311113333333111113",
    "31111111111113...",
    "31wB1133Bw113....",
    "3BBB1133BBB113...",
    "31111pBp11113....",
    "31222222213......",
    "311111111113.....",
    "311111111111133..",
    "3111111111133....",
    "31133333113......",
    "33.......33......",
    "................",
  ],
  teen: [
    "................",
    ".333........333.",
    "31113........31113",
    "31111333333311113",
    "311111111111113.",
    "31wB113311Bw113.",
    "3BBB113311BBB113",
    "31111pBp11113...",
    "312222222213....",
    "311111111113....",
    "311111111111133.",
    "31111111111133..",
    "311111111133....",
    "311113311113....",
    "3133.....3133...",
    "33.........33...",
  ],
  adult: [
    "..333........333.",
    ".31113......31113",
    ".311113....311113",
    ".311113333311113.",
    ".311111111113....",
    ".31wB1133Bw113...",
    ".3BBB1133BBB113..",
    ".31111pBp1113....",
    ".3122222222113...",
    ".311111111111133.",
    ".31111111111133..",
    ".3111111111133...",
    ".311111111133....",
    ".311113311113....",
    ".3133.....3133...",
    "..33.......33....",
  ],
};

const WOLF: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "....3....3......",
    "...313..313.....",
    "..31223..32213..",
    ".311111333111113",
    ".311111111111113",
    ".31yB1133yB113..",
    ".3BBB1133BBB113.",
    ".31112pBp1113...",
    ".31133B3311113..",
    ".311111111113...",
    ".322222221133...",
    ".31111111133....",
    "..3111133.......",
    "..313...........",
    "................",
  ],
  child: [
    "....3......3....",
    "...313....313...",
    "..31223..32213..",
    "..3112233322113.",
    "..3111111111113.",
    "..31yB1133yB113.",
    "..3BBB1133BBB113",
    "..3111pBBp1113..",
    "..3113B3B113....",
    "..3111111113....",
    "..3222221113....",
    "..3111111113....",
    "..31111111133...",
    "..3111111133....",
    "..3113311.......",
    "..33...3........",
  ],
  teen: [
    "...3......3.....",
    "..313....313....",
    ".31223..32213...",
    ".311123332113...",
    ".311111111113...",
    ".31yB113yB113...",
    ".3BBB1133BBB113.",
    ".311pBBp113.....",
    ".31133333113....",
    ".311111111113...",
    ".322222211113...",
    ".311111111113...",
    ".31111111133....",
    ".311113333......",
    ".31133...322g333",
    ".33.......22ggg.",
  ],
  adult: [
    "..3..........3..",
    ".313........313.",
    "31223........32213",
    "311123......321113",
    "311113333333111113",
    "31yB1133311yB113.",
    "3BBB113311BBB113.",
    "311pBBp113.......",
    "31133333113......",
    "311111111113.....",
    "32222221111113...",
    "31111111111113...",
    "31111111111133...",
    ".31111111133.....",
    ".311113333.333g33",
    ".3133....3322ggg3",
  ],
};

const PANDA: Record<Exclude<PetStage, "egg">, PixelGrid> = {
  baby: [
    "................",
    "...333....333...",
    "..3BBB3..3BBB3..",
    ".3BBBBB33BBBBB3.",
    ".3BBB3333BBB113.",
    ".3111133333111113",
    ".311wB113311Bw113",
    ".31BBB1133BBB113.",
    ".3111pp3pp1113...",
    ".311113B311113...",
    ".3111111111113...",
    "..3331111133.....",
    "...3333333.......",
    "................",
    "................",
    "................",
  ],
  child: [
    "................",
    "..333......333..",
    ".3BBB3....3BBB3.",
    "3BBBBB3..3BBBBB3",
    "3BBB113333BBB113",
    "311113333311113.",
    "31wB1133311Bw113",
    "3BBB113311BBB113",
    "3111pp3pp1113....",
    "311113B311113...",
    "311111111113....",
    "311111111111133.",
    "31111111111133..",
    ".31111111133....",
    ".333333333.......",
    "................",
  ],
  teen: [
    "..333........333.",
    ".3BBB3......3BBB3",
    "3BBBBB3....3BBBBB3",
    "3BBBB1333333BBB113",
    "311111111111113..",
    "31wB1133311Bw113.",
    "3BBB1133311BBB113",
    "311pp3BB3pp1113..",
    "31113333331113...",
    "311111111111113..",
    "31111111111111133",
    ".31111111111133..",
    "..3111111111133..",
    "..3331111133.....",
    "....3133333......",
    "................",
  ],
  adult: [
    "..333........333.",
    ".3BBB3......3BBB3",
    "3BBBBB3....3BBBBB3",
    "3BBBB113333BBBB113",
    "311111133333111113",
    "311wB113311Bw1113.",
    "3BBBB1133311BBBB113",
    "311pp3BBB3pp11113..",
    "31133333333111113..",
    "311111111111111133.",
    "311111111111111133.",
    ".3111111111111133..",
    "..31111111111133...",
    "..311111111133.....",
    "..3331111133.......",
    "....3133333........",
  ],
};

export const PET_SPRITES: Record<PetType, Record<Exclude<PetStage, "egg">, PixelGrid>> = {
  cat: CAT,
  dog: DOG,
  rabbit: RABBIT,
  fox: FOX,
  hamster: HAMSTER,
  owl: OWL,
  bear: BEAR,
  wolf: WOLF,
  panda: PANDA,
};

export function spriteFor(type: PetType, stage: PetStage): PixelGrid {
  if (stage === "egg") return EGG_SPRITE;
  return PET_SPRITES[type][stage];
}

// Blink overlay — paints over the typical eye row with the pet's
// primary color so it looks like the eyes are closed for a frame.
// Positions chosen to land on the eye band of every adult sprite.
export const BLINK_OVERLAY: PixelGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...111....111...",
  "...111....111...",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// ── Mood overlay ─────────────────────────────────────────────
// When sad, paint a downturned mouth + tear over the existing sprite.
// 16×16, only mouth/tear pixels — rest transparent.
export const SAD_OVERLAY: PixelGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....w..........",
  ".....w..........",
  "................",
  ".....BBB........",
  "....B...B.......",
  "................",
  "................",
  "................",
  "................",
];

// ── Accessory overlays ───────────────────────────────────────
// Same 16×16 grid, painted on top of the pet. Color codes:
//   r=red, b=blue, y=yellow, B=black, w=white, G=gold, P=purple, p=pink
// Accessory codes use letters distinct from sprite codes.
export type AccessoryGrid = string[];

export function accessoryColor(code: string): string | null {
  switch (code) {
    case ".": return null;
    case "r": return "#E76A6A";
    case "b": return "#7AAEE0";
    case "y": return "#FFD56B";
    case "G": return "#F2C84B";
    case "B": return "#1A1A1A";
    case "w": return "#FFFFFF";
    case "P": return "#A878D0";
    case "p": return "#F4A6BC";
    case "g": return "#A0A0A0";
    case "s": return "#FFE873";
    case "c": return "#74C9D6";
    case "n": return "#3D5DA8";
    default: return null;
  }
}

const A_RIBBON: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "....rrr..rrr....",
  "...rrrrrrrrr....",
  "....rrrrrrr.....",
  ".....rryrr......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const A_SCARF: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...nnnnnnnnnn...",
  "..nnnwnnwnnnnn..",
  "..nnnnnnnnnnnn..",
  "...nn......nn...",
  "....nn....nn....",
  "................",
  "................",
  "................",
];

const A_HAT: AccessoryGrid = [
  "................",
  "................",
  "....BBBBBBBB....",
  "....BBBBBBBB....",
  "....BBBBBBBB....",
  "..BBBBBBBBBBBB..",
  "..BBBrrrrrrBBB..",
  "..BBBBBBBBBBBB..",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const A_GLASSES: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "...BBBB..BBBB...",
  "..B....BB....B..",
  "..B.ww.BB.ww.B..",
  "..B.ww.BB.ww.B..",
  "..B....BB....B..",
  "...BBBB..BBBB...",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const A_NECKLACE: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..GGGGGGGGGGGG..",
  "...G........G...",
  "....G......G....",
  "....GcGGGGcG....",
  ".....GGGGGG.....",
  "................",
  "................",
];

const A_BELL: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..rrrrrrrrrrrr..",
  "................",
  ".......yy.......",
  "......yyyy......",
  ".......BB.......",
  "................",
  "................",
];

const A_CROWN: AccessoryGrid = [
  "................",
  "................",
  "...G..G..G......",
  "...G..G..G......",
  "..GG..GG.GG.....",
  "..GGGGGGGGGG....",
  "..GGrGGGGrGG....",
  "..GGGGGGGGGG....",
  "..GGGGGGGGGG....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const A_CAPE: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....PP..PP.....",
  "..PPPPPPPPPPPP..",
  "..PPPPPPPPPPPP..",
  "..PPPPPPPPPPPP..",
  "..PPwPPPPPPwPP..",
  "..PPPPPPPPPPPP..",
  "..PPPPPPPPPPPP..",
  "..PPP......PPP..",
  "..PP........PP..",
];

const A_WINGS: AccessoryGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "ww............ww",
  "wwww........wwww",
  "wwwwww....wwwwww",
  "wwwwwww..wwwwwww",
  "wwwwww....wwwwww",
  "wwww........wwww",
  "ww............ww",
  "................",
  "................",
];

export const ACCESSORY_SPRITES: Partial<Record<ItemId, AccessoryGrid>> = {
  ribbon: A_RIBBON,
  scarf: A_SCARF,
  hat: A_HAT,
  glasses: A_GLASSES,
  necklace: A_NECKLACE,
  bell: A_BELL,
  crown: A_CROWN,
  cape: A_CAPE,
  wings: A_WINGS,
};

// ── Background sprites ───────────────────────────────────────
// 16×16 painted as a backdrop layer. None = transparent (UI default).
export type BackgroundGrid = string[];

const BG_FOREST: BackgroundGrid = [
  "ccccccccccccccccc",
  "ccccccccccccccccc",
  "ccccc.ccc.cccccc",
  "cccc...c...ccccc",
  "ggggggggggggggggg",
  "g.g.g.gg.g.g.g.g",
  "ggggggggggggggggg",
  "ggggggggggggggggg",
  "ttttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
];

const BG_OCEAN: BackgroundGrid = [
  "ccccccccccccccccc",
  "ccccccccccccccccc",
  "ccccccccccccccccc",
  "ccccccccccccccccc",
  "wwww.....wwwwwwww",
  "wwwwwwwwwwwwwwwww",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
  "ssssssssssssssss",
];

const BG_SPACE: BackgroundGrid = [
  "BBBBBBBBBBBBBBBB",
  "BBwBBBBBBBBwBBBB",
  "BBBBBBBBwBBBBBBB",
  "BBBBwBBBBBBBBBwB",
  "BBBBBBBBBBBwBBBB",
  "BBwBBBBBBBBBBBBB",
  "BBBBBBwBBBBBBBwB",
  "BBBBBBBBBBwBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBwBBBBBBBwBBBBB",
  "BBBBBwBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
];

export const BACKGROUND_SPRITES: Record<Exclude<BackgroundId, "none">, BackgroundGrid> = {
  bgForest: BG_FOREST,
  bgOcean: BG_OCEAN,
  bgSpace: BG_SPACE,
};

export function backgroundColor(code: string): string | null {
  switch (code) {
    case ".": return null;
    case "c": return "#BFE0F0"; // sky cyan
    case "g": return "#3D8B3D"; // dark green
    case "t": return "#A37547"; // tree trunk / forest floor
    case "w": return "#FFFFFF";
    case "s": return "#3F86C0"; // ocean blue
    case "B": return "#0E0B25"; // space
    case "y": return "#FFE873";
    default: return null;
  }
}

// ── Item icons (24-item shop) ────────────────────────────────
// Tiny 12×12 sprites for the shop grid. Color coding inline per item.
export type ItemIconGrid = string[];
export type ItemIconRender = { grid: ItemIconGrid; resolve: (c: string) => string | null };

function colorMap(map: Record<string, string>): (c: string) => string | null {
  return (c: string) => (c === "." ? null : map[c] ?? null);
}

const I_FOOD: ItemIconRender = {
  grid: [
    "............",
    "............",
    "...BBBBBB...",
    "..BkkkkkkB..",
    "..BkkkkkkB..",
    "..BkkkkkkB..",
    "..BkkkkkkB..",
    "..BkkkkkkB..",
    "...BBBBBB...",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ B: "#5B3A1F", k: "#C58E5A" }),
};

const I_TREAT: ItemIconRender = {
  grid: [
    "............",
    "............",
    ".....pp.....",
    "....pppp....",
    "...pphhpp...",
    "...phhhhpp..",
    "...pphhpp...",
    "....pppp....",
    ".....pp.....",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ p: "#F08FA9", h: "#FFFFFF" }),
};

const I_CAKE: ItemIconRender = {
  grid: [
    "............",
    "....yyyy....",
    "....BBBB....",
    "...wpwpww...",
    "..wwwwwwww..",
    "..ppppppp...",
    "..wwwwwwww..",
    "..ppppppp...",
    "..wwwwwwww..",
    "..ppppppp...",
    "............",
    "............",
  ],
  resolve: colorMap({ y: "#FFD56B", B: "#5B3A1F", w: "#FFFFFF", p: "#F08FA9" }),
};

const I_RIBBON: ItemIconRender = {
  grid: [
    "............",
    "............",
    "...rr..rr...",
    "..rrrr.rrrr.",
    "..rrrrrrrrr.",
    "...rryyrr...",
    "..rrrrrrrrr.",
    "..rrrr.rrrr.",
    "...rr..rr...",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#E76A6A", y: "#FFD56B" }),
};

const I_SCARF: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..nnnnnnnnn.",
    "..nwnnnwnnn.",
    "..nnnnnnnnn.",
    "...nn...nn..",
    "....nn.nn...",
    ".....nnn....",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ n: "#3D5DA8", w: "#FFFFFF" }),
};

const I_HAT: ItemIconRender = {
  grid: [
    "............",
    "...BBBBBB...",
    "...BBBBBB...",
    "..BBBBBBBB..",
    "..BrrrrrrB..",
    "..BBBBBBBB..",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ B: "#1A1A1A", r: "#E76A6A" }),
};

const I_GLASSES: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..BBB..BBB..",
    ".B...BB...B.",
    ".B.w.BB.w.B.",
    "..BBB..BBB..",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ B: "#1A1A1A", w: "#FFFFFF" }),
};

const I_NECKLACE: ItemIconRender = {
  grid: [
    "............",
    "..GGGGGGGG..",
    ".G........G.",
    "..G......G..",
    "...G....G...",
    "....G..G....",
    "....cGGc....",
    ".....GG.....",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ G: "#F2C84B", c: "#74C9D6" }),
};

const I_BELL: ItemIconRender = {
  grid: [
    "............",
    "............",
    "...rrrrrr...",
    "...yyyyyy...",
    "..yyyyyyyy..",
    "..yyyyyyyy..",
    "..yyyyyyyy..",
    "...yyyyyy...",
    "....yyyy....",
    ".....BB.....",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#E76A6A", y: "#F2C84B", B: "#1A1A1A" }),
};

const I_CROWN: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..G..G..G...",
    "..G..G..G...",
    "..GGGGGGG...",
    "..GrGGrGG...",
    "..GGGGGGG...",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ G: "#F2C84B", r: "#E76A6A" }),
};

const I_CAPE: ItemIconRender = {
  grid: [
    "............",
    "...PP..PP...",
    "..PPPPPPPP..",
    "..PPPPPPPP..",
    "..PwPPPPwP..",
    "..PPPPPPPP..",
    "..PPP..PPP..",
    "..PP....PP..",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ P: "#A878D0", w: "#FFFFFF" }),
};

const I_WINGS: ItemIconRender = {
  grid: [
    "............",
    "............",
    "ww........ww",
    "www......www",
    "wwww....wwww",
    "wwwww..wwwww",
    "wwww....wwww",
    "www......www",
    "ww........ww",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ w: "#FFFFFF" }),
};

const I_CUSHION: ItemIconRender = {
  grid: [
    "............",
    "............",
    "............",
    "............",
    "..PPPPPPPP..",
    ".PPwPPPPwPP.",
    ".PPPPPPPPPP.",
    ".PPwPPPPwPP.",
    "..PPPPPPPP..",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ P: "#9D6BC0", w: "#FFFFFF" }),
};

const I_BED: ItemIconRender = {
  grid: [
    "............",
    "............",
    "............",
    "..wwwwwwww..",
    "..pppppppp..",
    "..pppppppp..",
    "..BBBBBBBB..",
    "..B......B..",
    "..B......B..",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ w: "#FFFFFF", p: "#F2BAD0", B: "#5B3A1F" }),
};

const I_HOUSE: ItemIconRender = {
  grid: [
    "............",
    "....rrrr....",
    "...rrrrrr...",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    "..yyyyyyyy..",
    "..y..yy..y..",
    "..y..yy..y..",
    "..y..yy..y..",
    "..yyyyyyyy..",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#C0533B", y: "#D9B57A" }),
};

const I_TOY_BALL: ItemIconRender = {
  grid: [
    "............",
    "............",
    "....rrrr....",
    "...rwwwwr...",
    "..rwwbbwwr..",
    "..rwbbwbwr..",
    "..rwbwbbwr..",
    "..rwwbbwwr..",
    "...rwwwwr...",
    "....rrrr....",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#E76A6A", w: "#FFFFFF", b: "#3D5DA8" }),
};

const I_TOY_YARN: ItemIconRender = {
  grid: [
    "............",
    "............",
    "....yyyy....",
    "...yyyyyy...",
    "..yyByyyyy..",
    "..yyByyByy..",
    "..yyyyyByy..",
    "..yByyyyyB..",
    "...yByyyB...",
    "....yyyy....",
    "............",
    "............",
  ],
  resolve: colorMap({ y: "#F0B5C5", B: "#A8627A" }),
};

const I_TOY_BONE: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..ww....ww..",
    ".wwww..wwww.",
    "..wwwwwwww..",
    "...wwwwww...",
    "..wwwwwwww..",
    ".wwww..wwww.",
    "..ww....ww..",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ w: "#F2EFE6" }),
};

const I_BOWL_BASIC: ItemIconRender = {
  grid: [
    "............",
    "............",
    "............",
    "............",
    "..gggggggg..",
    ".gpppppppppg",
    ".g........g.",
    ".g........g.",
    "..gggggggg..",
    "...gggggg...",
    "............",
    "............",
  ],
  resolve: colorMap({ g: "#9C9C9C", p: "#E0A87B" }),
};

const I_BOWL_PREMIUM: ItemIconRender = {
  grid: [
    "............",
    "............",
    "............",
    "............",
    "..GGGGGGGG..",
    ".GpppppppppG",
    ".G..hh..h.G.",
    ".G........G.",
    "..GGGGGGGG..",
    "...GGGGGG...",
    "............",
    "............",
  ],
  resolve: colorMap({ G: "#F2C84B", p: "#E0A87B", h: "#FFFFFF" }),
};

const I_BG_FOREST: ItemIconRender = {
  grid: [
    "ccccccccccccc",
    "ccc.cccc.ccc",
    "gggggggggggg",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
    "tttttttttttt",
  ],
  resolve: colorMap({ c: "#BFE0F0", g: "#3D8B3D", t: "#A37547" }),
};

const I_BG_OCEAN: ItemIconRender = {
  grid: [
    "ccccccccccccc",
    "ccccccccccccc",
    "wwwwwwwwwwwww",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
  ],
  resolve: colorMap({ c: "#BFE0F0", w: "#FFFFFF", s: "#3F86C0" }),
};

const I_BG_SPACE: ItemIconRender = {
  grid: [
    "BBwBBBBBBwBB",
    "BBBBBwBBBBBB",
    "BBBBBBBBBBwB",
    "BwBBBBBBBBBB",
    "BBBBBBwBBBBB",
    "BBBwBBBBBBBB",
    "BBBBBBBBwBBB",
    "BBwBBBBBBBBB",
    "BBBBBBwBBBBB",
    "BBBBBBBBBBBB",
    "BBBBBBBBBBBB",
    "BBBBBBBBBBBB",
  ],
  resolve: colorMap({ B: "#0E0B25", w: "#FFE873" }),
};

const I_NAMETAG: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..G......G..",
    "..GGG..GGG..",
    "..GGGGGGGG..",
    "..GwwwwwwG..",
    "..GwwwwwwG..",
    "..GwwwwwwG..",
    "..GGGGGGGG..",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ G: "#F2C84B", w: "#FFFFFF" }),
};

const I_SPARKLE: ItemIconRender = {
  grid: [
    "............",
    "....y...y...",
    ".y..y..yyy..",
    ".yyyyyy.y...",
    ".y.yyy......",
    "yyyyyyyyy...",
    "....yy......",
    "...yyyy.....",
    "..yy..yy....",
    ".yy....yy...",
    "............",
    "............",
  ],
  resolve: colorMap({ y: "#FFE873" }),
};

const I_DYE: ItemIconRender = {
  grid: [
    "............",
    "....BBB.....",
    "...PPPPP....",
    "..PPwwwPP...",
    "..PPwwwPP...",
    ".PPPPPPPPP..",
    ".PrrPPPPbP..",
    ".PrrPPPPbP..",
    ".PgPPPPPyP..",
    ".PgPPPPPyP..",
    ".PPPPPPPPP..",
    "............",
  ],
  resolve: colorMap({ B: "#5B3A1F", P: "#9D6BC0", w: "#FFFFFF", r: "#E76A6A", b: "#3D5DA8", g: "#3D8B3D", y: "#FFD56B" }),
};

export const ITEM_ICONS: Record<ItemId, ItemIconRender> = {
  food: I_FOOD,
  treat: I_TREAT,
  cake: I_CAKE,
  ribbon: I_RIBBON,
  scarf: I_SCARF,
  hat: I_HAT,
  glasses: I_GLASSES,
  necklace: I_NECKLACE,
  bell: I_BELL,
  crown: I_CROWN,
  cape: I_CAPE,
  wings: I_WINGS,
  cushion: I_CUSHION,
  bed: I_BED,
  house: I_HOUSE,
  toyBall: I_TOY_BALL,
  toyYarn: I_TOY_YARN,
  toyBone: I_TOY_BONE,
  bowlBasic: I_BOWL_BASIC,
  bowlPremium: I_BOWL_PREMIUM,
  bgForest: I_BG_FOREST,
  bgOcean: I_BG_OCEAN,
  bgSpace: I_BG_SPACE,
  nameTag: I_NAMETAG,
  sparkle: I_SPARKLE,
  dye: I_DYE,
};

// ── Pet room (game-feel main view) ───────────────────────────
// Default room is a cozy interior: wallpaper top-half, wood floor
// bottom-half. Renderer draws this, then overlays placed furniture,
// then the pet on top. When background = bgForest/bgOcean/bgSpace the
// outdoor background takes over the full canvas instead.

export const ROOM_WALL_COLOR = "#F5DDC0";
export const ROOM_WALL_TRIM = "#E8C9A0";
export const ROOM_WALL_DECOR = "#D9B380";
export const ROOM_FLOOR_COLOR = "#B98750";
export const ROOM_FLOOR_LINE = "#8E5E33";

// Placement grid is normalized 0..100 × 0..100. The renderer maps
// these onto the room canvas. y measured from the floor line up.
export type FurniturePlacement = {
  // Anchor on the floor: x = horizontal center 0..100, baseline = y from
  // floor (0 = sitting on floor). Sprite is drawn `size` wide and tall.
  x: number;
  y: number;
  size: number; // % of room width
};

export const FURNITURE_PLACEMENTS: Partial<Record<ItemId, FurniturePlacement>> = {
  cushion:     { x: 22, y: 0,  size: 22 },
  bed:         { x: 78, y: 0,  size: 30 },
  house:       { x: 50, y: 0,  size: 36 },
  toyBall:     { x: 12, y: 0,  size: 14 },
  toyYarn:     { x: 35, y: 0,  size: 14 },
  toyBone:     { x: 90, y: 0,  size: 14 },
  bowlBasic:   { x: 60, y: 0,  size: 16 },
  bowlPremium: { x: 60, y: 0,  size: 16 }, // overrides bowlBasic
};

// ── Status icons (HUD) ───────────────────────────────────────
// Tiny 12×12 icons next to each status bar.
const ICON_HUNGER: ItemIconRender = {
  grid: [
    "............",
    "....BB......",
    "...BkkB.....",
    "..BkkkkB....",
    "..BkrrkB....",
    "..BkrrkB....",
    "..BkkkkB....",
    "...BkkB.....",
    "....BB......",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ B: "#5B3A1F", k: "#FFCFA0", r: "#D24545" }),
};

const ICON_HAPPY: ItemIconRender = {
  grid: [
    "............",
    "...rr..rr...",
    "..rrrrrrrr..",
    "..rrrrrrrr..",
    "..rrwwrrrr..",
    "..rrrrrrrr..",
    "...rrrrrr...",
    "....rrrr....",
    ".....rr.....",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#F08FA9", w: "#FFFFFF" }),
};

const ICON_CLEAN: ItemIconRender = {
  grid: [
    "............",
    ".....b......",
    "....bbb.....",
    "....bbb.....",
    "...bbbbb....",
    "...bbwbb....",
    "..bbbwbbb...",
    "..bbbbbbb...",
    "...bbbbb....",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ b: "#5BAEEA", w: "#D6ECFA" }),
};

const ICON_EXP: ItemIconRender = {
  grid: [
    "............",
    "............",
    ".....y......",
    "....yyy.....",
    ".yyyyyyyyy..",
    "..yyyyyyy...",
    "...yywyy....",
    "..yyyyyyy...",
    "..yy...yy...",
    ".y......y...",
    "............",
    "............",
  ],
  resolve: colorMap({ y: "#F2C84B", w: "#FFF6C4" }),
};

export const STATUS_ICONS = {
  hunger: ICON_HUNGER,
  happiness: ICON_HAPPY,
  clean: ICON_CLEAN,
  exp: ICON_EXP,
};

// ── Interaction icons (game-feel buttons) ────────────────────
const II_FEED: ItemIconRender = {
  grid: [
    "............",
    "............",
    "............",
    "...BB..BB...",
    "..BkkBBkkB..",
    "..BkkkkkkB..",
    "..gggggggg..",
    "..g......g..",
    "..g......g..",
    "...gggggg...",
    "............",
    "............",
  ],
  resolve: colorMap({ B: "#5B3A1F", k: "#E0A87B", g: "#A8A8A8" }),
};

const II_PLAY: ItemIconRender = {
  grid: [
    "............",
    "............",
    "....rrrr....",
    "...rwwwwr...",
    "..rwwbbwwr..",
    "..rwbwwbwr..",
    "..rwbwwbwr..",
    "..rwwbbwwr..",
    "...rwwwwr...",
    "....rrrr....",
    "............",
    "............",
  ],
  resolve: colorMap({ r: "#E76A6A", w: "#FFFFFF", b: "#3D5DA8" }),
};

const II_WASH: ItemIconRender = {
  grid: [
    "............",
    ".....b......",
    "....bbb.....",
    "...bbbbb....",
    "...bbwbb....",
    "..bbbbbbb...",
    "..bbbbbbb...",
    "...bbbbb....",
    "............",
    "....b...b...",
    "...b...b....",
    "............",
  ],
  resolve: colorMap({ b: "#5BAEEA", w: "#D6ECFA" }),
};

const II_WALK: ItemIconRender = {
  grid: [
    "............",
    "...kk....kk.",
    "..kkkk..kkkk",
    ".kkkkkk.kkkk",
    ".kkkkkk.kkkk",
    "..kkkk..kkkk",
    "...kk....kk.",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ k: "#5B3A1F" }),
};

const II_PET: ItemIconRender = {
  grid: [
    "............",
    "............",
    "..k.........",
    "..kk.kk.....",
    "..kkkkkk....",
    "..kkkkkkk...",
    "...kkkkkk...",
    "...kkkkkk...",
    "....kkkk....",
    "....kkkk....",
    "............",
    "............",
  ],
  resolve: colorMap({ k: "#E0B080" }),
};

const II_TREAT: ItemIconRender = {
  grid: [
    "............",
    "............",
    "....kkkk....",
    "..kkBkkBkk..",
    ".kkkkkkkkkk.",
    ".kBkkBkkkBk.",
    ".kkkkkkBkkk.",
    ".kkBkkkkkkk.",
    "..kkkBkkkk..",
    "....kkkk....",
    "............",
    "............",
  ],
  resolve: colorMap({ k: "#E0A050", B: "#5B3A1F" }),
};

const II_SLEEP: ItemIconRender = {
  grid: [
    "............",
    "....BBB.....",
    "...B........",
    "..B......B..",
    ".B......BB..",
    ".B.....BB...",
    ".B....BB....",
    ".B...BB.....",
    ".B..BBBB....",
    "..B.........",
    "...BBB......",
    "............",
  ],
  resolve: colorMap({ B: "#7E61D2" }),
};

const II_TRAIN: ItemIconRender = {
  grid: [
    "............",
    "............",
    "....g....g..",
    "...gg....gg.",
    "..ggg....ggg",
    "..ggggggggg.",
    "..ggggggggg.",
    "..ggg....ggg",
    "...gg....gg.",
    "....g....g..",
    "............",
    "............",
  ],
  resolve: colorMap({ g: "#5B5B5B" }),
};

const II_WEAR: ItemIconRender = {
  grid: [
    "............",
    ".....k......",
    "....kkk.....",
    ".....k......",
    "....kkk.....",
    "...kkkkk....",
    "..kkkkkkk...",
    ".kkk...kkk..",
    "kkk.....kkk.",
    "............",
    "............",
    "............",
  ],
  resolve: colorMap({ k: "#5B3A1F" }),
};

export const INTERACTION_ICONS: Record<InteractionId | "wear", ItemIconRender> = {
  feed: II_FEED,
  play: II_PLAY,
  wash: II_WASH,
  walk: II_WALK,
  pet: II_PET,
  treat: II_TREAT,
  sleep: II_SLEEP,
  train: II_TRAIN,
  wear: II_WEAR,
};

// ── Tab icons ────────────────────────────────────────────────
const TAB_HOME: ItemIconRender = {
  grid: [
    "............",
    "....rrrr....",
    "...rrrrrr...",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    "..yyyyyyyy..",
    "..yywwwwwy..",
    "..yywwwwwy..",
    "..yywBBwwy..",
    "..yywBBwwy..",
    "..yyyyyyyy..",
    "............",
  ],
  resolve: colorMap({ r: "#C0533B", y: "#D9B57A", w: "#FFFFFF", B: "#5B3A1F" }),
};

const TAB_SHOP: ItemIconRender = {
  grid: [
    "............",
    "....k..k....",
    "...kk..kk...",
    "...k....k...",
    "..kkkkkkkk..",
    "..kkkkkkkk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kkkkkkkk..",
    "..kkkkkkkk..",
    "............",
  ],
  resolve: colorMap({ k: "#C68748" }),
};

const TAB_WARDROBE: ItemIconRender = {
  grid: [
    "............",
    ".....g......",
    "....ggg.....",
    ".....g......",
    "....kkk.....",
    "...kkkkk....",
    "..kkkkkkk...",
    ".kkk...kkk..",
    ".kk.....kk..",
    ".kk.....kk..",
    "............",
    "............",
  ],
  resolve: colorMap({ g: "#A0A0A0", k: "#5B3A1F" }),
};

const TAB_PLAYGROUND: ItemIconRender = {
  grid: [
    "............",
    "............",
    "...rrrr.....",
    "..rwwwwr....",
    "..rwbbwr....",
    "..rwbbwr....",
    "..rwwwwr.b..",
    "...rrrr..b..",
    ".........b..",
    "........bbb.",
    ".........b..",
    "............",
  ],
  resolve: colorMap({ r: "#E76A6A", w: "#FFFFFF", b: "#3D5DA8" }),
};

const TAB_VISIT: ItemIconRender = {
  grid: [
    "............",
    "..kkkkkkkk..",
    "..kkkkkkkk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kk..yykk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kk....kk..",
    "..kkkkkkkk..",
    "............",
  ],
  resolve: colorMap({ k: "#8E5E33", y: "#F2C84B" }),
};

const TAB_RANKING: ItemIconRender = {
  grid: [
    "............",
    "...yyyyyy...",
    "..ykkkkkky..",
    "..yk1111ky..",
    "..yk1111ky..",
    "..ykkkkkky..",
    "...yykkyy...",
    "....yyyy....",
    "...kkyykk...",
    "..kkkkkkkk..",
    "............",
    "............",
  ],
  resolve: colorMap({ y: "#F2C84B", k: "#A87838", "1": "#FFF6C4" }),
};

export type TabIconKey = "main" | "shop" | "wardrobe" | "playground" | "visit" | "ranking";

export const TAB_ICONS: Record<TabIconKey, ItemIconRender> = {
  main: TAB_HOME,
  shop: TAB_SHOP,
  wardrobe: TAB_WARDROBE,
  playground: TAB_PLAYGROUND,
  visit: TAB_VISIT,
  ranking: TAB_RANKING,
};

