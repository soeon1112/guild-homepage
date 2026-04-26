"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, Lock, Unlock } from "lucide-react";
import { JobIcon } from "./JobIcon";

export type Challenge = "있음" | "다소 있음" | "없음";

export type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

export type CharacterValues = {
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: Challenge;
  runeBuilds: RuneBuild[];
};

export type CharacterFormInitial = {
  id: string | null;
  nickname: string;
  job: string;
  combatPower: string;
  hellStage: string;
  challenge: Challenge;
  runeBuilds: Array<{ name: string; dps: string; isPublic: boolean }>;
};

type RuneBuildDraft = {
  key: string;
  name: string;
  dps: string;
  isPublic: boolean;
};

const JOBS = [
  "대검",
  "검술",
  "궁수",
  "장궁",
  "석궁",
  "화법",
  "빙결",
  "전격",
  "법사",
  "힐러",
  "사제",
  "수도",
  "암흑",
  "음유",
  "악사",
  "댄서",
  "도적",
  "듀블",
  "격가",
  "전사",
  "기사",
];

const HELL_STAGES = [
  "매어 이하",
  "지옥1",
  "지옥2",
  "지옥3",
  "지옥4",
  "지옥5",
  "지옥6",
  "지옥7",
  "지옥8",
  "지옥9",
  "지옥10",
  "지옥11",
  "지옥12",
  "지옥13",
  "지옥14",
  "지옥15",
];

const CHALLENGES: Challenge[] = ["있음", "다소 있음", "없음"];

export const CHARACTER_FORM_JOBS = JOBS;
export const CHARACTER_FORM_HELL_STAGES = HELL_STAGES;

function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyCharacterForm(): CharacterFormInitial {
  return {
    id: null,
    nickname: "",
    job: JOBS[0],
    combatPower: "",
    hellStage: HELL_STAGES[0],
    challenge: "있음",
    runeBuilds: [],
  };
}

export function CharacterForm({
  open,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initial: CharacterFormInitial;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: CharacterValues) => void;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [job, setJob] = useState(initial.job);
  const [combatPower, setCombatPower] = useState(initial.combatPower);
  const [hellStage, setHellStage] = useState(initial.hellStage);
  const [challenge, setChallenge] = useState<Challenge>(initial.challenge);
  const [builds, setBuilds] = useState<RuneBuildDraft[]>(
    initial.runeBuilds.map((b) => ({ key: makeKey(), ...b })),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset when initial changes (e.g. opening for edit on a different character)
  useEffect(() => {
    setNickname(initial.nickname);
    setJob(initial.job);
    setCombatPower(initial.combatPower);
    setHellStage(initial.hellStage);
    setChallenge(initial.challenge);
    setBuilds(initial.runeBuilds.map((b) => ({ key: makeKey(), ...b })));
    setLocalError(null);
  }, [initial]);

  // Lock body scroll + Esc
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, submitting]);

  const handleAddBuild = () => {
    setBuilds((prev) => [
      ...prev,
      { key: makeKey(), name: "", dps: "", isPublic: true },
    ]);
  };

  const handleUpdateBuild = (
    key: string,
    patch: Partial<Omit<RuneBuildDraft, "key">>,
  ) => {
    setBuilds((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    );
  };

  const handleRemoveBuild = (key: string) => {
    setBuilds((prev) => prev.filter((b) => b.key !== key));
  };

  const handleSubmit = () => {
    const nick = nickname.trim();
    const cp = parseFloat(combatPower.replace(/,/g, ""));

    if (!nick) {
      setLocalError("캐릭터 닉네임을 입력해주세요.");
      return;
    }
    if (!Number.isFinite(cp) || cp < 0) {
      setLocalError("투력을 숫자로 입력해주세요.");
      return;
    }

    const runeBuilds: RuneBuild[] = [];
    for (const b of builds) {
      const bname = b.name.trim();
      if (!bname) {
        setLocalError("룬 조합 이름을 입력해주세요.");
        return;
      }
      const dps = parseFloat(b.dps.replace(/,/g, ""));
      if (!Number.isFinite(dps) || dps < 0) {
        setLocalError(`"${bname}" 룬 조합의 DPS를 숫자로 입력해주세요.`);
        return;
      }
      runeBuilds.push({ name: bname, dps, isPublic: b.isPublic });
    }

    setLocalError(null);
    onSubmit({
      nickname: nick,
      job,
      combatPower: cp,
      hellStage,
      challenge,
      runeBuilds,
    });
  };

  const displayError = error ?? localError;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={submitting ? undefined : onClose}
          className="modal-safe-frame fixed inset-0 z-[80] flex items-center justify-center"
          style={{
            background: "rgba(11, 8, 33, 0.75)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={initial.id ? "캐릭터 수정" : "캐릭터 추가"}
        >
          <motion.div
            initial={{ scale: 0.95, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 18, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl"
            style={{
              background: "rgba(26, 15, 61, 0.95)",
              border: "1px solid rgba(216, 150, 200, 0.3)",
              boxShadow:
                "0 20px 60px rgba(11, 8, 33, 0.6), 0 0 40px rgba(107, 75, 168, 0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex shrink-0 items-center justify-between border-b border-nebula-pink/20 px-5 py-4"
              style={{
                background:
                  "linear-gradient(90deg, rgba(61,46,107,0.35) 0%, rgba(61,46,107,0.15) 60%, transparent 100%)",
              }}
            >
              <h3
                className="font-serif text-base tracking-wider"
                style={{
                  fontFamily: "'Noto Serif KR', serif",
                  backgroundImage:
                    "linear-gradient(135deg, #FFE5C4, #D896C8)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                  filter: "drop-shadow(0 0 6px rgba(216,150,200,0.3))",
                }}
              >
                {initial.id ? "캐릭터 수정" : "캐릭터 추가"}
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="닫기"
                className="flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20 disabled:opacity-50"
                style={{
                  background: "rgba(11,8,33,0.6)",
                  border: "1px solid rgba(216,150,200,0.3)",
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="nebula-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              <Field label="캐릭터 닉네임">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={submitting}
                  maxLength={30}
                  placeholder="캐릭터 이름"
                  className="w-full rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3.5 py-2 font-serif text-[13px] text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="직업">
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stardust"
                    >
                      <JobIcon job={job} size={14} />
                    </span>
                    <select
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      disabled={submitting}
                      className="w-full appearance-none rounded-full border border-nebula-pink/30 bg-abyss-deep/60 py-2 pl-9 pr-8 font-serif text-[13px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                    >
                      {JOBS.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field label="투력">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={combatPower}
                    onChange={(e) => setCombatPower(e.target.value)}
                    disabled={submitting}
                    placeholder="예: 6500"
                    className="w-full rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3.5 py-2 font-mono text-[13px] tabular-nums text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="지옥 단계">
                  <select
                    value={hellStage}
                    onChange={(e) => setHellStage(e.target.value)}
                    disabled={submitting}
                    className="w-full appearance-none rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3.5 py-2 font-serif text-[13px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                  >
                    {HELL_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="도전">
                  <select
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value as Challenge)}
                    disabled={submitting}
                    className="w-full appearance-none rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3.5 py-2 font-serif text-[13px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
                  >
                    {CHALLENGES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Rune builds */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-[10px] uppercase tracking-[0.3em] text-text-sub">
                    룬 조합
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBuild}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-2.5 py-1 font-serif text-[10px] tracking-wider text-stardust backdrop-blur-md transition-colors hover:border-nebula-pink/60 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3 text-peach-accent" />
                    추가
                  </button>
                </div>

                {builds.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-nebula-pink/20 bg-abyss-deep/30 px-3 py-3 text-center font-serif text-[11px] italic text-text-sub/70">
                    등록된 룬 조합이 없습니다
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {builds.map((b) => (
                      <li
                        key={b.key}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-nebula-pink/15 bg-abyss-deep/45 p-2.5 backdrop-blur-md"
                      >
                        <input
                          type="text"
                          value={b.name}
                          onChange={(e) =>
                            handleUpdateBuild(b.key, { name: e.target.value })
                          }
                          disabled={submitting}
                          maxLength={30}
                          placeholder="조합 이름"
                          className="min-w-0 flex-1 rounded-full border border-nebula-pink/25 bg-abyss-deep/60 px-3 py-1.5 font-serif text-[12px] text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={b.dps}
                          onChange={(e) =>
                            handleUpdateBuild(b.key, { dps: e.target.value })
                          }
                          disabled={submitting}
                          placeholder="DPS"
                          className="w-24 rounded-full border border-nebula-pink/25 bg-abyss-deep/60 px-3 py-1.5 font-mono text-[12px] tabular-nums text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBuild(b.key, { isPublic: !b.isPublic })
                          }
                          disabled={submitting}
                          aria-label={b.isPublic ? "공개" : "비공개"}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
                            b.isPublic
                              ? "border-peach-accent/50 text-peach-accent hover:border-peach-accent"
                              : "border-nebula-pink/25 text-text-sub hover:border-nebula-pink/50 hover:text-stardust"
                          }`}
                          title={
                            b.isPublic ? "공개 (클릭 시 비공개)" : "비공개 (클릭 시 공개)"
                          }
                        >
                          {b.isPublic ? (
                            <Unlock className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBuild(b.key)}
                          disabled={submitting}
                          aria-label="삭제"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-text-sub transition-colors hover:text-[#E8A8B8]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {displayError && (
                <p className="rounded-lg border border-[#E8A8B8]/40 bg-[#E8A8B8]/10 px-3 py-2 text-center font-serif text-[11px] italic text-[#E8A8B8]">
                  {displayError}
                </p>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-nebula-pink/20 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-4 py-2 font-serif text-[11px] tracking-wider text-text-sub transition-colors hover:text-stardust disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full px-5 py-2 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                  boxShadow: "0 0 14px rgba(255, 181, 167, 0.5)",
                }}
              >
                {submitting ? "저장 중..." : initial.id ? "저장" : "추가"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-serif text-[10px] uppercase tracking-[0.25em] text-text-sub">
        {label}
      </span>
      {children}
    </label>
  );
}
