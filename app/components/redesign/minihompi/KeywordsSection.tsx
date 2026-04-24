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

export function KeywordsSection({ memberId, targetNickname, loginNick, isOwner }: Props) {
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
              typeof data.authorNickname === "string" ? data.authorNickname : "",
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
        `${targetNickname}님에게 키워드가 추가되었습니다`,
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
    <div className="mt-4 w-full max-w-md px-2">
      {keywords.length === 0 ? (
        <p className="text-center font-serif text-[12px] italic leading-relaxed text-text-sub/70">
          아직 키워드가 없어요.
          <br />이 별에게 키워드를 선물해보세요 ✨
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-2 sm:gap-x-2 sm:gap-y-2">
          {keywords.map((k) => (
            <div
              key={k.id}
              className="group flex flex-col items-center"
            >
              <div
                title={`by ${k.authorNickname}`}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all hover:scale-105 sm:px-2.5 sm:py-1 sm:text-[12px]"
                style={{
                  background: "rgba(26, 15, 61, 0.5)",
                  borderColor: "rgba(216, 150, 200, 0.35)",
                  color: "#FFB5A7",
                  fontFamily: "'Noto Serif KR', serif",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 0 0 rgba(255,181,167,0)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow =
                    "0 0 12px rgba(255,181,167,0.4)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.boxShadow =
                    "0 0 0 rgba(255,181,167,0)")
                }
              >
                <span>{k.text}</span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleDelete(k.id)}
                    aria-label="키워드 삭제"
                    className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[12px] leading-none text-text-sub/70 transition-all hover:bg-nebula-pink/20 hover:text-stardust sm:h-4 sm:w-4 sm:text-[13px]"
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="mt-0.5 font-serif text-[9px] italic text-text-sub transition-opacity opacity-50 sm:text-[10px] sm:opacity-0 sm:group-hover:opacity-70">
                by {k.authorNickname}
              </span>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd();
            }}
            placeholder="#키워드를 입력해주세요"
            maxLength={MAX_LEN + 1}
            className="w-full max-w-[220px] rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3 py-1.5 font-serif text-[12px] text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !input.trim()}
            className="shrink-0 rounded-full px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "rgba(26, 15, 61, 0.5)",
              border: "1px solid rgba(255, 181, 167, 0.5)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "inset 0 0 10px rgba(255,181,167,0.15)",
            }}
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}
