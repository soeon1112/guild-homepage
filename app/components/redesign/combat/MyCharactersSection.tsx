"use client";

import { motion } from "framer-motion";
import { Pencil, Plus, Trash2, Lock } from "lucide-react";
import { JobIcon, parseAbyssFloor, ABYSS_MAX } from "./JobIcon";

type Challenge = "있음" | "다소 있음" | "없음";

type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

export type MyCharacter = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: Challenge;
  runeBuilds?: RuneBuild[];
};

export function MyCharactersSection({
  characters,
  ready,
  owner,
  onAdd,
  onEdit,
  onDelete,
}: {
  characters: MyCharacter[];
  ready: boolean;
  owner: string | null;
  onAdd: () => void;
  onEdit: (c: MyCharacter) => void;
  onDelete: (c: MyCharacter) => void;
}) {
  return (
    <section className="mb-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            className="font-serif leading-none"
            style={{
              fontFamily: "'Noto Serif KR', serif",
              fontSize: "clamp(22px, 4vw, 28px)",
              fontWeight: 300,
              letterSpacing: "0.06em",
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            내 캐릭터
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
            My Characters · {characters.length}
          </p>
        </div>

        {ready && owner && (
          <button
            type="button"
            onClick={onAdd}
            className="group relative inline-flex items-center gap-1.5 rounded-full border border-peach-accent/40 bg-abyss-deep/50 px-3.5 py-1.5 font-serif text-xs tracking-wider text-stardust backdrop-blur-md transition-all hover:border-peach-accent hover:-translate-y-0.5"
            style={{
              boxShadow:
                "0 0 14px rgba(255, 181, 167, 0.18), inset 0 1px 0 rgba(255, 229, 196, 0.08)",
            }}
          >
            <Plus className="h-3.5 w-3.5 text-peach-accent" />
            <span>캐릭터 추가</span>
          </button>
        )}
      </div>

      {!ready ? null : !owner ? (
        <p className="rounded-2xl border border-nebula-pink/15 bg-abyss-deep/30 px-6 py-10 text-center font-serif text-sm italic text-text-sub backdrop-blur-md">
          로그인하면 내 캐릭터를 관리할 수 있습니다
        </p>
      ) : characters.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-nebula-pink/20 bg-abyss-deep/25 px-6 py-10 text-center font-serif text-sm italic text-text-sub backdrop-blur-md">
          아직 등록된 캐릭터가 없습니다. 위 버튼을 눌러 첫 캐릭터를 추가해보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {characters.map((c, i) => (
            <MyCharacterCard
              key={c.id}
              char={c}
              index={i}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MyCharacterCard({
  char,
  index,
  onEdit,
  onDelete,
}: {
  char: MyCharacter;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const floor = parseAbyssFloor(char.hellStage);
  const progress = Math.min(floor / ABYSS_MAX, 1);
  const challengeColor =
    char.challenge === "있음"
      ? {
          bg: "rgba(168, 232, 192, 0.18)",
          border: "rgba(168, 232, 192, 0.45)",
          fg: "#A8E8C0",
          glyph: "✓",
          label: "있음",
        }
      : char.challenge === "없음"
        ? {
            bg: "rgba(232, 168, 184, 0.18)",
            border: "rgba(232, 168, 184, 0.45)",
            fg: "#E8A8B8",
            glyph: "✕",
            label: "없음",
          }
        : {
            bg: "rgba(255, 229, 142, 0.18)",
            border: "rgba(255, 229, 142, 0.45)",
            fg: "#FFE58E",
            glyph: "△",
            label: "다소 있음",
          };

  const builds = char.runeBuilds ?? [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3) }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-2xl border border-nebula-pink/20 bg-abyss-deep/40 p-4 backdrop-blur-xl transition-all sm:p-5"
      style={{
        boxShadow:
          "0 6px 24px rgba(11, 8, 33, 0.4), inset 0 1px 0 rgba(255, 229, 196, 0.04), inset 0 0 30px rgba(107, 75, 168, 0.08)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(circle, rgba(216, 150, 200, 0.18) 0%, transparent 70%)",
        }}
      />

      {/* Top row: name + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-stardust"
            style={{
              background:
                "linear-gradient(135deg, rgba(107, 75, 168, 0.5), rgba(216, 150, 200, 0.3))",
              border: "1px solid rgba(216, 150, 200, 0.35)",
              boxShadow: "inset 0 0 8px rgba(255, 229, 196, 0.1)",
            }}
          >
            <JobIcon job={char.job} size={16} />
          </span>
          <div className="flex flex-col">
            <h3
              className="font-serif text-base tracking-wide text-stardust"
              style={{ fontFamily: "'Noto Serif KR', serif" }}
            >
              {char.nickname}
            </h3>
            <span className="font-serif text-[10px] tracking-wider text-text-sub">
              직업 · {char.job}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="수정"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-text-sub backdrop-blur-sm transition-colors hover:border-nebula-pink/40 hover:text-stardust"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="삭제"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-text-sub backdrop-blur-sm transition-colors hover:border-[#E8A8B8]/45 hover:text-[#E8A8B8]"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Middle: power number */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-serif text-[10px] uppercase tracking-[0.25em] text-text-sub">
          투력
        </span>
        <span
          className="font-mono text-2xl font-medium tabular-nums sm:text-[28px]"
          style={{
            backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            filter: "drop-shadow(0 0 8px rgba(216, 150, 200, 0.35))",
          }}
        >
          {(char.combatPower || 0).toLocaleString()}
        </span>
      </div>

      {/* Abyss progress */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between font-serif text-[10px] tracking-wider text-text-sub">
          <span>지옥 진행도</span>
          <span className="text-stardust">
            {floor > 0 ? `지옥 ${floor}` : "미도전"}
            <span className="text-text-sub/70"> / {ABYSS_MAX}</span>
          </span>
        </div>
        <AbyssProgressBar progress={progress} delay={index * 0.1} />
      </div>

      {/* Challenge + rune builds */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="font-serif text-[10px] tracking-wider text-text-sub">
          도전
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider"
          style={{
            background: challengeColor.bg,
            border: `1px solid ${challengeColor.border}`,
            color: challengeColor.fg,
          }}
        >
          <span
            aria-hidden
            className="flex h-4 w-4 items-center justify-center rounded-full font-semibold"
            style={{
              background: `${challengeColor.fg}22`,
              color: challengeColor.fg,
            }}
          >
            {challengeColor.glyph}
          </span>
          {challengeColor.label}
        </span>
      </div>

      {builds.length > 0 && (
        <div className="mt-3 border-t border-nebula-pink/15 pt-3">
          <div className="mb-2 font-serif text-[10px] uppercase tracking-[0.3em] text-text-sub">
            룬 조합
          </div>
          <ul className="flex flex-col gap-1.5">
            {builds.map((b, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-nebula-pink/15 bg-abyss-deep/40 px-3 py-1.5"
              >
                <div className="flex items-center gap-2">
                  {!b.isPublic && (
                    <Lock
                      className="h-3 w-3 text-text-sub/70"
                      aria-label="비공개"
                    />
                  )}
                  <span className="font-serif text-[12px] text-stardust">
                    {b.name}
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-text-sub">
                  DPS {b.dps.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.article>
  );
}

function AbyssProgressBar({
  progress,
  delay,
}: {
  progress: number;
  delay?: number;
}) {
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{
        background: "rgba(107, 75, 168, 0.18)",
        boxShadow: "inset 0 1px 2px rgba(11, 8, 33, 0.5)",
      }}
    >
      <motion.div
        initial={{ width: "0%" }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 1.1, delay: delay ?? 0, ease: "easeOut" }}
        className="relative h-full rounded-full"
        style={{
          background: "linear-gradient(90deg, #6B4BA8 0%, #D896C8 60%, #FFB5A7 100%)",
          boxShadow: "0 0 10px rgba(216, 150, 200, 0.55)",
        }}
      >
        {progress > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full"
            style={{
              background: "#FFE5C4",
              boxShadow: "0 0 8px #FFE5C4, 0 0 14px rgba(255, 181, 167, 0.8)",
              animation: "twinkle 2s ease-in-out infinite",
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
