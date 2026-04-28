// PetChatBox (web) — bottom-of-pet-room chat panel + intro modal.
// Mirrors dawnlight-app/src/components/PetChatBox.tsx. Calls
// /api/pet-chat (Next.js route) which proxies the Anthropic API.

"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import {
  isBadInput,
  PET_CHAT_INTRO,
  PET_CHAT_INTRO_FOOTER,
  PET_CHAT_MAX_HISTORY,
  PET_CHAT_MAX_INPUT_LEN,
  type PetChatMessage,
  type PetChatStats,
} from "@/src/lib/petChat";
import type { PetStage, PetType } from "@/src/lib/pets";

type Props = {
  ownerNickname: string;
  petType: PetType;
  petStage: PetStage;
  petName: string;
  stats: PetChatStats;
  petChatStarted: boolean;
  onSetPetBubble: (text: string | null) => void;
};

export const PetChatBox = memo(function PetChatBox({
  ownerNickname,
  petType,
  petStage,
  petName,
  stats,
  petChatStarted,
  onSetPetBubble,
}: Props) {
  const [introOpen, setIntroOpen] = useState(!petChatStarted);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<PetChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => onSetPetBubble(null), [onSetPetBubble]);

  const startChat = useCallback(async () => {
    setIntroOpen(false);
    try {
      await setDoc(
        doc(db, "users", ownerNickname, "pet", "current"),
        { petChatStarted: true },
        { merge: true },
      );
    } catch {
      // non-fatal
    }
  }, [ownerNickname]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (text.length > PET_CHAT_MAX_INPUT_LEN) {
      setErrorMsg("메시지가 너무 길어요");
      return;
    }
    if (isBadInput(text)) {
      setErrorMsg("펫이 이해할 수 없는 말이에요");
      return;
    }
    setErrorMsg(null);
    setDraft("");
    const userMsg: PetChatMessage = { role: "user", content: text };
    const nextHistory: PetChatMessage[] = [...history, userMsg].slice(-PET_CHAT_MAX_HISTORY);
    setHistory(nextHistory);
    setBusy(true);
    // No "..." typing indicator — leave the previous bubble (or nothing)
    // until the reply lands. Cleaner per user feedback.
    try {
      const r = await fetch("/api/pet-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname: ownerNickname,
          petType,
          petStage,
          petName,
          stats,
          history: nextHistory,
        }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        reply?: string;
        error?: string;
        detail?: string;
        hint?: string;
      };
      if (!r.ok || !data.ok) {
        if (data.error === "banned") setErrorMsg("대화 기능이 제한되었습니다");
        else if (data.error === "bad_input") setErrorMsg("펫이 이해할 수 없는 말이에요");
        else if (data.error?.includes("ANTHROPIC_API_KEY"))
          setErrorMsg(data.hint || "Vercel에 ANTHROPIC_API_KEY 환경변수 추가 + 재배포 필요");
        else
          setErrorMsg(
            `오류 (${r.status}): ${data.error || ""} ${data.detail ? "— " + data.detail : ""}`,
          );
        onSetPetBubble(null);
        return;
      }
      const reply = data.reply ?? "";
      const petMsg: PetChatMessage = { role: "pet", content: reply };
      const withReply: PetChatMessage[] = [...nextHistory, petMsg].slice(-PET_CHAT_MAX_HISTORY);
      setHistory(withReply);
      onSetPetBubble(reply);
    } catch {
      setErrorMsg("잠시 후 다시 시도해주세요");
      onSetPetBubble(null);
    } finally {
      setBusy(false);
      // disabled={busy} blurs the input while busy=true; refocus after
      // the re-render so the cursor stays in the input.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [draft, busy, history, ownerNickname, petType, petStage, petName, stats, onSetPetBubble]);

  return (
    <>
      {/* Minimal — no container bg / border. Just bare input + button. */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, PET_CHAT_MAX_INPUT_LEN))}
            placeholder="펫에게 말을 걸어보세요..."
            maxLength={PET_CHAT_MAX_INPUT_LEN}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            className="min-w-0 flex-1 rounded-full px-3 py-1.5 font-serif text-[12px] outline-none"
            style={{
              background: "rgba(11,8,33,0.65)",
              border: "1px solid rgba(216,150,200,0.30)",
              color: "#f4efff",
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded-full px-3 py-1.5 font-serif text-[12px] font-bold whitespace-nowrap disabled:opacity-50"
            style={{
              background: "#5a3a8a",
              color: "#FFE5C4",
              minWidth: 60,
            }}
          >
            {busy ? "..." : "전송"}
          </button>
        </div>
        {errorMsg ? (
          <p className="mt-1 text-center font-serif text-[11px]" style={{ color: "#FFB89A" }}>
            {errorMsg}
          </p>
        ) : null}
      </div>

      {introOpen ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
          style={{ background: "rgba(11,8,33,0.85)" }}
        >
          <div
            className="w-full max-w-[320px] rounded-2xl border p-5 font-serif"
            style={{
              background: "#1A0F3D",
              borderColor: "rgba(216,150,200,0.45)",
            }}
          >
            <h3 className="mb-3 text-center text-[16px] font-bold" style={{ color: "#f4efff" }}>
              {petName}와의 대화
            </h3>
            <p
              className="mb-3 text-center text-[13px] leading-[20px]"
              style={{ color: "#d8c8ec" }}
            >
              {PET_CHAT_INTRO[petType]}
            </p>
            <p
              className="mb-4 text-center text-[11px] italic"
              style={{ color: "#a89cc4" }}
            >
              {PET_CHAT_INTRO_FOOTER}
            </p>
            <button
              type="button"
              onClick={startChat}
              className="w-full rounded-lg py-2.5 text-[14px] font-bold text-white"
              style={{ background: "#7a4eb0" }}
            >
              대화 시작할까요?
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
});
