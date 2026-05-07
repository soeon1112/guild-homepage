"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import { josa, truncate } from "@/src/lib/text";

// dawnlight2 미니홈피 1단계 — 키워드 박스 (베이지 + 피치).
// logic은 cosmic KeywordsSection 1:1 동일 (Firestore subscribe / add /
// delete / 권한 / activity 로그). # 앞 작대기 (Feather) 없음, pill /
// 입력란 색만 양피지·피치 톤으로.

type Keyword = {
  id: string;
  text: string;
  authorNickname: string;
  createdAt: Timestamp | null;
};

type Props = {
  memberId: string;
  targetNickname: string | null;
  loginNick: string | null;
  isOwner: boolean;
};

const MAX_LEN = 20;

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function KeywordsSectionD2({
  memberId,
  targetNickname,
  loginNick,
  isOwner,
}: Props) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!targetNickname) return;
    const q = query(
      collection(db, "users", targetNickname, "keywords"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setKeywords(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            text: typeof data.text === "string" ? data.text : "",
            authorNickname:
              typeof data.authorNickname === "string"
                ? data.authorNickname
                : "",
            createdAt: data.createdAt ?? null,
          };
        }),
      );
    });
    return () => unsub();
  }, [targetNickname]);

  const handleAdd = async () => {
    if (!targetNickname || !loginNick) return;
    const text = normalize(input);
    if (!text) return;
    if (text.length > MAX_LEN + 1) {
      alert(`키워드는 ${MAX_LEN}자 이내로 입력해주세요.`);
      return;
    }
    if (keywords.some((k) => k.text === text)) {
      alert("이미 같은 키워드가 있어요.");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", targetNickname, "keywords"), {
        text,
        authorNickname: loginNick,
        createdAt: serverTimestamp(),
      });
      await logActivity(
        "keyword",
        targetNickname,
        `${targetNickname}님의 키워드 '${truncate(text, 15)}'${josa(text, "이/가")} 추가되었어요`,
        `/members/${memberId}`,
      );
      setInput("");
    } catch (e) {
      console.error(e);
      alert("키워드 추가에 실패했어요.");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!targetNickname || !isOwner) return;
    if (!confirm("이 키워드를 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "users", targetNickname, "keywords", id));
    } catch (e) {
      console.error(e);
      alert("삭제에 실패했어요.");
    }
  };

  const canAdd = !!loginNick && !!targetNickname && !isOwner;

  return (
    <div
      className="mt-4 w-full rounded-xl px-3 py-3"
      style={{
        background: "rgba(58, 42, 26, 0.05)",
        border: "1px solid rgba(140, 100, 60, 0.28)",
      }}
    >
      {keywords.length === 0 ? (
        <p
          className="text-center font-serif text-[12px] italic leading-relaxed"
          style={{ color: "rgba(90, 58, 26, 0.65)" }}
        >
          아직 키워드가 없어요.
          <br />이 별에게 키워드를 선물해보세요 ✨
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-2">
          {keywords.map((k) => (
            <div key={k.id} className="group flex flex-col items-center">
              <div
                title={`by ${k.authorNickname}`}
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-all hover:scale-105"
                style={{
                  background: "rgba(244, 168, 122, 0.18)",
                  borderColor: "rgba(160, 120, 70, 0.32)",
                  color: "#5a3a1a",
                  fontFamily: "'Noto Serif KR', serif",
                }}
              >
                <span>{k.text}</span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleDelete(k.id)}
                    aria-label="키워드 삭제"
                    className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[12px] leading-none transition-all hover:bg-[rgba(244,168,122,0.4)]"
                    style={{ color: "rgba(90,58,26,0.7)" }}
                  >
                    ×
                  </button>
                )}
              </div>
              <span
                className="mt-0.5 font-serif text-[10px] italic transition-opacity opacity-50 sm:opacity-0 sm:group-hover:opacity-70"
                style={{ color: "rgba(90,58,26,0.6)" }}
              >
                by {k.authorNickname}
              </span>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd();
            }}
            placeholder="#키워드 입력"
            maxLength={MAX_LEN + 1}
            className="w-full max-w-[180px] rounded-full px-3 py-1.5 font-serif text-[12px] focus:outline-none"
            style={{
              background: "rgba(255, 255, 255, 0.45)",
              border: "1px solid rgba(140, 100, 60, 0.28)",
              color: "#3a2a1a",
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !input.trim()}
            className="shrink-0 rounded-full px-3 py-1.5 font-serif text-[11px] tracking-wider transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "rgba(244, 168, 122, 0.32)",
              border: "1px solid rgba(160, 120, 70, 0.32)",
              color: "#5a3a1a",
            }}
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}
