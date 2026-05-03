"use client";

// "나는 새벽빛에 어울리는 별일까?" — branching self-check.
// Visibility gated to GUILD_TEST_ADMIN_NICKNAME via canSeeGuildTest().
// On completion, writes one doc per attempt to `guildTestResults` so
// the admin page (/admin/guild-test-results) can render full
// walkthroughs and aggregates. Re-takes are kept (history append).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  QUESTIONS,
  RESULTS,
  MAX_QUESTIONS,
  canSeeGuildTest,
  answersToPath,
  type QuestionId,
  type ResultKey,
  type NextStep,
} from "@/src/lib/guildTest";

type Answer = { q: QuestionId; opt: "A" | "B" };
type Phase =
  | { kind: "intro" }
  | { kind: "question"; id: QuestionId }
  | { kind: "result"; key: ResultKey };

export default function GuildTestPage() {
  const router = useRouter();
  const { nickname, ready } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [transitionKey, setTransitionKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Save when the result phase first appears.
  useEffect(() => {
    if (phase.kind !== "result" || !nickname) return;
    if (savedAt) return; // already saved this attempt
    const result = phase.key;
    setSaving(true);
    addDoc(collection(db, "guildTestResults"), {
      nickname,
      answers: answersToPath(answers),
      result,
      resultName: RESULTS[result].name,
      createdAt: serverTimestamp(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
    })
      .then(() => {
        setSavedAt(Date.now());
      })
      .catch((err) => {
        console.error("[guild-test] save failed", err);
        setSaveError("결과 저장에 실패했어요. 잠시 후 다시 시도해주세요.");
      })
      .finally(() => setSaving(false));
  }, [phase, answers, nickname, savedAt]);

  if (!ready) return null;
  if (!canSeeGuildTest(nickname)) {
    return (
      <div className="guildtest-shell">
        <div className="guildtest-card guildtest-locked">
          <div className="guildtest-locked-emoji">🌌</div>
          <div className="guildtest-locked-text">
            아직 준비 중인 페이지예요.
            <br />
            메인으로 돌아가주세요.
          </div>
          <Link href="/" className="guildtest-locked-btn">
            메인으로
          </Link>
        </div>
      </div>
    );
  }

  const handlePick = (questionId: QuestionId, opt: "A" | "B", next: NextStep) => {
    setAnswers((prev) => {
      // If user goes back & re-picks, prune any answers after the re-picked one.
      const idx = prev.findIndex((a) => a.q === questionId);
      const trimmed = idx === -1 ? prev : prev.slice(0, idx);
      return [...trimmed, { q: questionId, opt }];
    });
    setTransitionKey((k) => k + 1);
    if (next.type === "result") {
      setPhase({ kind: "result", key: next.key });
    } else {
      setPhase({ kind: "question", id: next.id });
    }
  };

  const handleRestart = () => {
    setPhase({ kind: "intro" });
    setAnswers([]);
    setSavedAt(null);
    setSaveError(null);
    setTransitionKey((k) => k + 1);
  };

  return (
    <div className="guildtest-shell">
      {phase.kind === "intro" && (
        <IntroPanel
          nickname={nickname}
          onStart={() => {
            setAnswers([]);
            setPhase({ kind: "question", id: "Q1" });
            setTransitionKey((k) => k + 1);
          }}
          onClose={() => router.push("/")}
        />
      )}

      {phase.kind === "question" && (
        <QuestionPanel
          key={transitionKey}
          questionId={phase.id}
          answeredCount={answers.length}
          onPick={handlePick}
          onClose={() => router.push("/")}
        />
      )}

      {phase.kind === "result" && (
        <ResultPanel
          key={transitionKey}
          resultKey={phase.key}
          saving={saving}
          saved={!!savedAt}
          saveError={saveError}
          onRestart={handleRestart}
          onClose={() => router.push("/")}
        />
      )}
    </div>
  );
}

// ── Intro ────────────────────────────────────────────────────
function IntroPanel({
  nickname,
  onStart,
  onClose,
}: {
  nickname: string | null;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="guildtest-card guildtest-intro">
      <div className="guildtest-intro-emoji">🌙</div>
      <h1 className="guildtest-intro-title">
        잠시 마음을 들여다볼 시간이에요
      </h1>
      <p className="guildtest-intro-sub">
        {nickname ? `${nickname}님,` : ""} 솔직한 마음으로 답해주세요.
        <br />
        결과는 저희끼리만 봐요. ✨
      </p>
      <button type="button" className="guildtest-primary-btn" onClick={onStart}>
        시작하기
      </button>
      <button type="button" className="guildtest-ghost-btn" onClick={onClose}>
        나중에
      </button>
    </div>
  );
}

// ── Question ─────────────────────────────────────────────────
function QuestionPanel({
  questionId,
  answeredCount,
  onPick,
  onClose,
}: {
  questionId: QuestionId;
  answeredCount: number;
  onPick: (q: QuestionId, opt: "A" | "B", next: NextStep) => void;
  onClose: () => void;
}) {
  const q = QUESTIONS[questionId];
  // Progress = position in the current path. Cap denom at MAX_QUESTIONS
  // so the bar fills monotonically across any branch.
  const progressPct = Math.min(
    100,
    Math.round(((answeredCount + 1) / MAX_QUESTIONS) * 100),
  );

  return (
    <div className="guildtest-card guildtest-question">
      <ProgressDots
        current={answeredCount + 1}
        total={MAX_QUESTIONS}
        pct={progressPct}
      />
      <h2 className="guildtest-question-text">{q.text}</h2>
      <div className="guildtest-options">
        {q.options.map((o) => (
          <button
            key={o.key}
            type="button"
            className="guildtest-option"
            onClick={() => onPick(q.id, o.key, o.next)}
          >
            <span className="guildtest-option-key">{o.key}</span>
            <span className="guildtest-option-label">{o.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="guildtest-ghost-btn" onClick={onClose}>
        나중에 다시 할게요
      </button>
    </div>
  );
}

function ProgressDots({
  current,
  total,
  pct,
}: {
  current: number;
  total: number;
  pct: number;
}) {
  const dots = useMemo(() => Array.from({ length: total }), [total]);
  return (
    <div className="guildtest-progress">
      <div className="guildtest-progress-bar" aria-hidden>
        <div
          className="guildtest-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="guildtest-progress-dots" aria-hidden>
        {dots.map((_, i) => (
          <span
            key={i}
            className={
              "guildtest-progress-dot" +
              (i < current ? " is-on" : "")
            }
          />
        ))}
      </div>
    </div>
  );
}

// ── Result ───────────────────────────────────────────────────
function ResultPanel({
  resultKey,
  saving,
  saved,
  saveError,
  onRestart,
  onClose,
}: {
  resultKey: ResultKey;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
  onRestart: () => void;
  onClose: () => void;
}) {
  const r = RESULTS[resultKey];
  return (
    <div className="guildtest-card guildtest-result">
      <span className="guildtest-result-burst" aria-hidden />
      <div className="guildtest-result-emoji">{r.emoji}</div>
      <div className="guildtest-result-body">
        {r.body.map((para, i) => (
          <p key={i} className="guildtest-result-para">
            {para.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        ))}
      </div>
      <div className="guildtest-result-meta">
        {saving && "저장 중..."}
        {!saving && saved && "✓ 마음 잘 받았어요"}
        {saveError && (
          <span className="guildtest-result-error">{saveError}</span>
        )}
      </div>
      <div className="guildtest-result-actions">
        <button
          type="button"
          className="guildtest-ghost-btn"
          onClick={onRestart}
        >
          다시 하기
        </button>
        <button
          type="button"
          className="guildtest-primary-btn"
          onClick={onClose}
        >
          메인으로
        </button>
      </div>
    </div>
  );
}
