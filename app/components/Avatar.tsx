"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { avatarUrl, partUrl } from "@/src/lib/avatarAssets";

export type BodyType =
  | "adult_female"
  | "adult_male"
  | "child_female"
  | "child_male";

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "adult_female", label: "성인 여자" },
  { value: "adult_male", label: "성인 남자" },
  { value: "child_female", label: "어린이 여자" },
  { value: "child_male", label: "어린이 남자" },
];

const VALID_BODIES: BodyType[] = BODY_TYPES.map((b) => b.value);

export function isBodyType(v: string | null | undefined): v is BodyType {
  return VALID_BODIES.includes(v as BodyType);
}

const CANVAS_W = 500;
const CANVAS_H = 800;

type Coord = readonly [number, number, number, number];
const FEATURE_COORDS: Record<
  BodyType,
  { eyes: Coord; mouth: Coord; cheeks: Coord }
> = {
  adult_female: {
    eyes: [224, 164, 55, 27],
    mouth: [241, 197, 22, 13],
    cheeks: [225, 183, 52, 22],
  },
  adult_male: {
    eyes: [222, 78, 56, 27],
    mouth: [238, 113, 25, 13],
    cheeks: [223, 96, 56, 23],
  },
  child_female: {
    eyes: [223, 415, 54, 27],
    mouth: [241, 445, 19, 11],
    cheeks: [226, 436, 49, 18],
  },
  child_male: {
    eyes: [223, 407, 59, 29],
    mouth: [242, 439, 20, 13],
    cheeks: [226, 429, 53, 20],
  },
};

export type AvatarData = {
  avatarBody?: string;
  avatarEyes?: string;
  avatarMouth?: string;
  avatarCheeks?: string;
  avatarHair?: string;
  avatarTop?: string;
  avatarBottom?: string;
  avatarShoes?: string;
  avatarAccessories?: string;
  bodySelected?: boolean;
  points?: number;
  mbti?: string;
};

function pctX(v: number) {
  return `${(v / CANVAS_W) * 100}%`;
}
function pctY(v: number) {
  return `${(v / CANVAS_H) * 100}%`;
}

export default function Avatar({
  data,
  className,
}: {
  data: AvatarData | null;
  className?: string;
}) {
  const rawBody = data?.avatarBody;
  if (!isBodyType(rawBody)) return null;
  const body: BodyType = rawBody;
  const { eyes, mouth, cheeks } = FEATURE_COORDS[body];
  const hair = data?.avatarHair || "";
  const top = data?.avatarTop || "";
  const bottom = data?.avatarBottom || "";
  const shoes = data?.avatarShoes || "";
  const accessories = data?.avatarAccessories || "";
  const eyesName = data?.avatarEyes || "";
  const mouthName = data?.avatarMouth || "";
  const cheeksName = data?.avatarCheeks || "";

  const agePrefix = body.startsWith("adult") ? "adult" : "child";
  const genderPrefix = body.endsWith("female") ? "female" : "male";

  // Base body has 4 variants depending on hair/clothes equipped:
  //   case 1 (no hair, no clothes): default <body> — has stock hair + outfit
  //   case 2 (hair, no clothes):    bald_<body>  — stock outfit, no hair
  //   case 3 (no hair, clothes):    noclothes_<body> — stock hair, undies only
  //   case 4 (hair + clothes):      undressed_<body> — bald + undies
  // Fashion layers (top/bottom/shoes/accessories) and the hair layer
  // are stacked on top in that order; face features (eyes/cheeks/mouth)
  // sit on top of hair so a fringe doesn't cover them.
  const hasClothes = !!(top || bottom || shoes || accessories);
  const bodyId = hair
    ? hasClothes
      ? `undressed_${body}`
      : `bald_${body}`
    : hasClothes
      ? `noclothes_${body}`
      : body;
  const bodySrc = avatarUrl("bodies", bodyId);
  const topSrc = top ? partUrl(body, "tops", top) : "";
  const bottomSrc = bottom ? partUrl(body, "bottoms", bottom) : "";
  const shoesSrc = shoes ? partUrl(body, "shoes", shoes) : "";
  const accessoriesSrc = accessories
    ? partUrl(body, "accessories", accessories)
    : "";
  const hairSrc = hair
    ? avatarUrl("hair", `${genderPrefix}_${hair}_${agePrefix}`)
    : "";
  const eyesSrc = eyesName ? avatarUrl("eyes", eyesName) : "";
  const mouthSrc = mouthName ? avatarUrl("mouths", mouthName) : "";
  const cheeksSrc = cheeksName ? avatarUrl("cheeks", cheeksName) : "";

  const bodyClass = `avatar-${body}`;
  const classes =
    "avatar " + bodyClass + (className ? ` ${className}` : "");

  return (
    <div className={classes}>
      <div className="avatar-canvas">
        <img
          src={bodySrc}
          alt=""
          className="avatar-layer avatar-layer-full"
          draggable={false}
        />
        {topSrc && (
          <img
            src={topSrc}
            alt=""
            className="avatar-layer avatar-layer-full"
            draggable={false}
          />
        )}
        {bottomSrc && (
          <img
            src={bottomSrc}
            alt=""
            className="avatar-layer avatar-layer-full"
            draggable={false}
          />
        )}
        {shoesSrc && (
          <img
            src={shoesSrc}
            alt=""
            className="avatar-layer avatar-layer-full"
            draggable={false}
          />
        )}
        {accessoriesSrc && (
          <img
            src={accessoriesSrc}
            alt=""
            className="avatar-layer avatar-layer-full"
            draggable={false}
          />
        )}
        {hairSrc && (
          <img
            src={hairSrc}
            alt=""
            className="avatar-layer avatar-layer-full"
            draggable={false}
          />
        )}
        {eyesSrc && (
          <img
            src={eyesSrc}
            alt=""
            className="avatar-layer"
            draggable={false}
            style={{
              left: pctX(eyes[0]),
              top: pctY(eyes[1]),
              width: pctX(eyes[2]),
              height: pctY(eyes[3]),
            }}
          />
        )}
        {cheeksSrc && (
          <img
            src={cheeksSrc}
            alt=""
            className="avatar-layer"
            draggable={false}
            style={{
              left: pctX(cheeks[0]),
              top: pctY(cheeks[1]),
              width: pctX(cheeks[2]),
              height: pctY(cheeks[3]),
            }}
          />
        )}
        {mouthSrc && (
          <img
            src={mouthSrc}
            alt=""
            className="avatar-layer"
            draggable={false}
            style={{
              left: pctX(mouth[0]),
              top: pctY(mouth[1]),
              width: pctX(mouth[2]),
              height: pctY(mouth[3]),
            }}
          />
        )}
      </div>
    </div>
  );
}

export function useAvatarData(
  nickname: string | null | undefined,
): AvatarData | null {
  const [entry, setEntry] = useState<{
    key: string;
    data: AvatarData | null;
  }>({ key: "", data: null });

  useEffect(() => {
    if (!nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      if (!snap.exists()) {
        setEntry({ key: nickname, data: null });
        return;
      }
      const d = snap.data();
      setEntry({
        key: nickname,
        data: {
          avatarBody: typeof d.avatarBody === "string" ? d.avatarBody : "",
          avatarEyes: typeof d.avatarEyes === "string" ? d.avatarEyes : "",
          avatarMouth: typeof d.avatarMouth === "string" ? d.avatarMouth : "",
          avatarCheeks:
            typeof d.avatarCheeks === "string" ? d.avatarCheeks : "",
          avatarHair: typeof d.avatarHair === "string" ? d.avatarHair : "",
          avatarTop: typeof d.avatarTop === "string" ? d.avatarTop : "",
          avatarBottom:
            typeof d.avatarBottom === "string" ? d.avatarBottom : "",
          avatarShoes:
            typeof d.avatarShoes === "string" ? d.avatarShoes : "",
          avatarAccessories:
            typeof d.avatarAccessories === "string"
              ? d.avatarAccessories
              : "",
          bodySelected: d.bodySelected === true,
          points: typeof d.points === "number" ? d.points : 0,
          mbti: typeof d.mbti === "string" ? d.mbti : "",
        },
      });
    });
    return () => unsub();
  }, [nickname]);

  if (!nickname) return null;
  if (entry.key !== nickname) return null;
  return entry.data;
}
