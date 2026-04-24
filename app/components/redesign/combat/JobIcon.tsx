import type { SVGProps } from "react";

/**
 * Tiny stroke-only SVG icons for each job (v0 origin + extras for this project).
 * All use currentColor so we can tint them with gradient wrappers.
 */
export function JobIcon({
  job,
  size = 14,
  ...props
}: { job: string; size?: number } & SVGProps<SVGSVGElement>) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  switch (job) {
    case "검술":
      return (
        <svg {...common}>
          <path d="M14 4 L20 4 L20 10 L9 21 L6 21 L6 18 Z" />
          <path d="M6 18 L3 21" />
        </svg>
      );
    case "대검":
      return (
        <svg {...common}>
          <path d="M12 2 L15 6 L15 16 L12 20 L9 16 L9 6 Z" />
          <path d="M6 18 L18 18" />
          <path d="M12 20 L12 22" />
        </svg>
      );
    case "수도":
      return (
        <svg {...common}>
          <path d="M5 10 L5 17 C5 18.5 6 19 7 19 L17 19 C18 19 19 18.5 19 17 L19 11 C19 9.5 18 9 17 9 L14 9 L14 7 C14 6 13 5 12 5 C11 5 10 6 10 7 L10 9 L8 9 L8 8 C8 7 7 6 6 6 C5 6 4 7 4 8 L4 10 Z" />
          <path d="M9 12 L15 12" />
        </svg>
      );
    case "격가":
      return (
        <svg {...common}>
          <circle cx="8" cy="12" r="4" />
          <circle cx="16" cy="12" r="4" />
          <path d="M8 8 L8 16 M16 8 L16 16" />
        </svg>
      );
    case "전사":
      return (
        <svg {...common}>
          <path d="M12 3 L19 6 L19 12 C19 16 16 19 12 21 C8 19 5 16 5 12 L5 6 Z" />
          <path d="M12 8 L12 16" />
          <path d="M9 12 L15 12" />
        </svg>
      );
    case "음유":
      return (
        <svg {...common}>
          <path d="M8 4 L16 4 L16 9 C16 14 13 19 9 21 C7 21 6 20 6 18 C6 16 7 14 9 13 C11 12 14 11 14 8 Z" />
          <path d="M10 9 L10 16" />
        </svg>
      );
    case "악사":
      // musician (music note) — similar spirit to 음유 but distinct
      return (
        <svg {...common}>
          <path d="M9 17 L9 5 L17 3 L17 15" />
          <circle cx="7" cy="17" r="2.4" />
          <circle cx="15" cy="15" r="2.4" />
        </svg>
      );
    case "댄서":
      // flowing figure / ribbon
      return (
        <svg {...common}>
          <path d="M6 5 C10 7 14 9 18 5" />
          <path d="M6 12 C10 14 14 10 18 12" />
          <path d="M6 19 C10 21 14 17 18 19" />
        </svg>
      );
    case "화법":
      return (
        <svg {...common}>
          <path d="M12 21 L12 11" />
          <path d="M12 11 C10 10 9 8 10 6 C11 5 12 5 12 7 C13 5 14 5 14 6 C15 8 14 10 12 11 Z" />
          <circle cx="12" cy="4" r="0.8" fill="currentColor" />
        </svg>
      );
    case "빙결":
      return (
        <svg {...common}>
          <path d="M12 3 L12 21" />
          <path d="M4.5 7 L19.5 17" />
          <path d="M19.5 7 L4.5 17" />
          <path d="M12 6 L10 4 M12 6 L14 4" />
          <path d="M12 18 L10 20 M12 18 L14 20" />
        </svg>
      );
    case "전격":
      // lightning bolt
      return (
        <svg {...common}>
          <path d="M13 2 L5 14 L11 14 L9 22 L19 9 L13 9 Z" />
        </svg>
      );
    case "암흑":
      // crescent moon with dark spark
      return (
        <svg {...common}>
          <path d="M19 13 C19 17 16 20 12 20 C8 20 5 17 5 13 C5 9 8 6 12 6 C11 8 11 12 13 14 C15 16 18 15 19 13 Z" />
          <circle cx="16" cy="8" r="0.8" fill="currentColor" />
          <circle cx="8" cy="10" r="0.6" fill="currentColor" />
        </svg>
      );
    case "힐러":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8 L12 16 M8 12 L16 12" />
        </svg>
      );
    case "도적":
      return (
        <svg {...common}>
          <path d="M13 3 L17 7 L9 15 L6 15 L6 12 Z" />
          <path d="M6 15 L3 18" />
          <path d="M13 3 L19 3 L19 9" />
        </svg>
      );
    case "듀블":
      // dual blades / crossed X
      return (
        <svg {...common}>
          <path d="M5 5 L14 14 L14 17 L11 17 L2 8 Z" />
          <path d="M19 5 L10 14 L10 17 L13 17 L22 8 Z" />
        </svg>
      );
    case "궁수":
      // regular short bow with small arrow (smaller/tighter than 장궁)
      return (
        <svg {...common}>
          <path d="M9 7 C12 10 12 14 9 17" />
          <path d="M9 7 L9 17" />
          <path d="M10 12 L17 12" />
          <path d="M15 10 L17 12 L15 14" />
        </svg>
      );
    case "장궁":
      return (
        <svg {...common}>
          <path d="M6 3 C12 7 12 17 6 21" />
          <path d="M6 3 L6 21" strokeDasharray="2 2" />
          <path d="M9 12 L20 12" />
          <path d="M17 9 L20 12 L17 15" />
        </svg>
      );
    case "석궁":
      // crossbow — vertical bow pierced by horizontal wooden stock through its center
      return (
        <svg {...common}>
          <path d="M6 4 C10 8 10 16 6 20" />
          <path d="M6 4 L6 20" />
          <path d="M3 12 L20 12" />
          <path d="M18 10 L20 10 L20 14 L18 14 Z" />
        </svg>
      );
    case "사제":
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="3" />
          <path d="M12 10 L12 21" />
          <path d="M8 14 L16 14" />
        </svg>
      );
    case "법사":
      // wand with sparkle (magic wand)
      return (
        <svg {...common}>
          <path d="M5 21 L15 11" />
          <path d="M13 9 L17 13" />
          <path d="M18 5 L18 9 M16 7 L20 7" />
          <circle cx="14" cy="14" r="0.7" fill="currentColor" />
          <circle cx="8" cy="8" r="0.6" fill="currentColor" />
        </svg>
      );
    case "기사":
      // knight helm with visor slit
      return (
        <svg {...common}>
          <path d="M6 10 C6 7 8 5 12 5 C16 5 18 7 18 10 L18 15 C18 18 16 20 12 20 C8 20 6 18 6 15 Z" />
          <path d="M6 12 L18 12" />
          <path d="M9 15 L11 15 M13 15 L15 15" />
          <path d="M12 5 L12 3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3 L14 9 L20 9 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 L10 9 Z" />
        </svg>
      );
  }
}

/** Parse a hellStage string ("지옥5", "지옥15", "매어 이하") to a number floor 0-15. */
export function parseAbyssFloor(hellStage: string | undefined | null): number {
  if (!hellStage) return 0;
  const m = hellStage.match(/지옥\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export const ABYSS_MAX = 15;
