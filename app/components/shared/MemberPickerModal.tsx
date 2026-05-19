"use client";

// Shared member-picker modal — extracted from `app/album/page.tsx` so
// the album upload form AND the album viewer's edit form mount the
// same selector (single source of truth, byte-identical UX). The body
// is a verbatim move of the original `MemberPickerModal` definition
// (the export here keeps the same function name + props), only the
// cosmic / dl2 surface tokens are reused as before.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useBackdropClose } from "@/src/lib/useBackdropClose";

// "우리 길원들" / "기타" — pre-canned group tags so users can tag the
// whole guild or "other" without picking individual members.
const SPECIAL_TAGS = ["우리 길원들", "기타"];

export function MemberPickerModal({
  initial,
  dl2 = false,
  onClose,
  onDone,
}: {
  initial: string[];
  dl2?: boolean;
  onClose: () => void;
  onDone: (selected: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [members, setMembers] = useState<string[]>([]);
  const backdropHandlers = useBackdropClose(onClose);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const nicks = snap.docs
          .filter((d) => typeof d.data().password === "string")
          .map((d) => d.id);
        const all = [...nicks, ...SPECIAL_TAGS];
        // Sort: English block first (a-z), then Korean (가나다…). Within
        // each block we use the matching locale collator so case and
        // jamo composition follow standard alphabet order. "기타" /
        // "우리 길원들" fall into the Korean block at their natural
        // alphabetical positions.
        const isKorean = (s: string) => /^[ㄱ-ㆎ가-힯]/.test(s);
        all.sort((a, b) => {
          const aK = isKorean(a);
          const bK = isKorean(b);
          if (aK !== bK) return aK ? 1 : -1;
          return a.localeCompare(b, aK ? "ko-KR" : "en");
        });
        if (!cancelled) setMembers(all);
      } catch (e) {
        console.error(e);
        if (!cancelled) setMembers([...SPECIAL_TAGS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.toLowerCase().includes(q));
  }, [members, search]);

  const toggle = (n: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  // Portal-mount — see AlbumPhotoViewer above. Same trap.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={dl2 ? "minihome-modal dl2-album-upload" : "minihome-modal"}
      {...backdropHandlers}
    >
      <div
        className="minihome-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <h3 className="minihome-modal-title">출연자 선택</h3>
        <input
          className="minihome-input"
          placeholder="닉네임 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            margin: "8px 0",
            // dl2: 잉크 남색 옅은 테두리. cosmic: 보라 0.18.
            border: dl2
              ? "1px solid rgba(42,69,112,0.2)"
              : "1px solid rgba(216,150,200,0.18)",
            borderRadius: 8,
            // dl2: 흰색 패널. cosmic: 트랜스페런트 위 보라 행.
            background: dl2 ? "#ffffff" : "transparent",
          }}
        >
          {filtered.length === 0 ? (
            <p
              style={{
                padding: 24,
                textAlign: "center",
                fontStyle: "italic",
                fontSize: 12,
                // dl2: 잉크 남색 soft. cosmic: 보라 0.7.
                color: dl2 ? "#5a7090" : "rgba(200,168,233,0.7)",
              }}
            >
              일치하는 닉네임이 없어요
            </p>
          ) : (
            filtered.map((n) => {
              const checked = selected.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggle(n)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    // dl2: 선택은 옅은 피치, 미선택은 투명(흰 패널 위).
                    // cosmic: 선택 코랄 0.12, 미선택 투명.
                    background: dl2
                      ? checked
                        ? "rgba(255,212,184,0.5)"
                        : "transparent"
                      : checked
                        ? "rgba(255,181,167,0.12)"
                        : "transparent",
                    border: "none",
                    // dl2: 잉크 남색 옅은 구분선. cosmic: 보라.
                    borderBottom: dl2
                      ? "1px solid rgba(42,69,112,0.12)"
                      : "1px solid rgba(216,150,200,0.08)",
                    cursor: "pointer",
                    // dl2: 잉크 갈색 (선택은 진하게). cosmic: cream/보라.
                    color: dl2
                      ? "#5c3a1f"
                      : checked
                        ? "#FFE5C4"
                        : "rgba(200,168,233,0.85)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: dl2 ? (checked ? 600 : 500) : 400,
                    textAlign: "left",
                  }}
                >
                  <span style={{ width: 18 }}>{checked ? "☑" : "☐"}</span>
                  <span style={{ flex: 1 }}>{n}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="minihome-modal-actions">
          <button
            className="minihome-btn"
            onClick={() => onDone(Array.from(selected))}
          >
            완료{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          <button className="minihome-btn minihome-btn-cancel" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
