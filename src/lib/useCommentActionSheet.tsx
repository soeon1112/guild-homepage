"use client";

// useCommentActionSheet — 댓글/사진/방명록 등 짧은 본문에 ⋯ 액션 시트.
//
// 카톡식 바텀시트 (모바일에선 full-width, 데스크탑은 max-width 400 가운데).
//   • 본인 글: 답글 / 복사 / 삭제 (red)
//   • 남의 글: 답글 / 복사
//
// 사용:
//   const { open, sheet } = useCommentActionSheet();
//   <>
//     {comments.map((c) => (
//       <Row key={c.id}>
//         ...
//         <button onClick={() => open({
//           content: c.text,
//           isMine: c.uid === me,
//           onReply: () => focusInput(c.id),
//           onDelete: () => deleteComment(c.id),
//         })}>⋯</button>
//       </Row>
//     ))}
//     {sheet}
//   </>
//
// theme: 'cream' (dl2 톤, default) / 'cosmic' (abyss 톤). 4영역 마이그레이션
// 진행 중 cosmic 가 남아 있는 영역에서만 명시.

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type CommentActionTheme = "cream" | "cosmic";

export type CommentActionContext = {
  content: string;
  isMine: boolean;
  // optional — 미제공 시 답글 항목 비노출. 대대댓글이 없는 시스템(방명록의
  // 대댓글)에서 답글 항목을 숨기기 위함.
  onReply?: () => void;
  onDelete?: () => void;
  theme?: CommentActionTheme;
};

const DL2_CREAM = "#fef5e6";
const DL2_INK_BROWN = "#5c3a1f";
const DL2_DIVIDER = "rgba(92, 58, 31, 0.12)";
const COSMIC_BG = "#1a0f3d";
const COSMIC_TEXT = "#f4efff";
const COSMIC_DIVIDER = "rgba(216, 150, 200, 0.15)";
const DELETE_RED = "#c44545";

export function useCommentActionSheet(): {
  open: (ctx: CommentActionContext) => void;
  sheet: ReactNode;
} {
  const [ctx, setCtx] = useState<CommentActionContext | null>(null);
  const close = useCallback(() => setCtx(null), []);

  const open = useCallback((next: CommentActionContext) => {
    setCtx(next);
  }, []);

  // Escape 닫기. 시트 떠 있을 때만 listener 부착.
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, close]);

  const handleReply = useCallback(() => {
    if (!ctx?.onReply) return;
    const fn = ctx.onReply;
    setCtx(null);
    fn();
  }, [ctx]);

  const handleCopy = useCallback(async () => {
    if (!ctx) return;
    const content = ctx.content;
    setCtx(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      }
    } catch {
      // 복사 실패 무시 (silent — 사용자가 다시 시도)
    }
  }, [ctx]);

  const handleDelete = useCallback(() => {
    if (!ctx?.onDelete) return;
    const onDelete = ctx.onDelete;
    setCtx(null);
    // 시트 close → confirm. 다음 microtask 에서 띄워 visual flicker 회피.
    setTimeout(() => {
      if (typeof window !== "undefined" && window.confirm("정말 삭제할까요?")) {
        onDelete();
      }
    }, 0);
  }, [ctx]);

  const theme: CommentActionTheme = ctx?.theme ?? "cream";
  const isCream = theme === "cream";
  const sheetBg = isCream ? DL2_CREAM : COSMIC_BG;
  const textColor = isCream ? DL2_INK_BROWN : COSMIC_TEXT;
  const dividerBg = isCream ? DL2_DIVIDER : COSMIC_DIVIDER;
  const pressBg = isCream ? "rgba(92,58,31,0.06)" : "rgba(255,255,255,0.06)";

  // SSR guard — Portal 은 client only.
  const canPortal = typeof document !== "undefined";

  const sheet =
    canPortal &&
    createPortal(
      <AnimatePresence>
        {ctx && (
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.42)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 400,
                background: sheetBg,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingTop: 4,
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.18)",
              }}
            >
              {ctx.onReply && (
                <>
                  <SheetButton
                    label="답글"
                    color={textColor}
                    pressBg={pressBg}
                    onClick={handleReply}
                  />
                  <Divider color={dividerBg} />
                </>
              )}
              <SheetButton
                label="복사"
                color={textColor}
                pressBg={pressBg}
                onClick={handleCopy}
              />
              {ctx.isMine && ctx.onDelete && (
                <>
                  <Divider color={dividerBg} />
                  <SheetButton
                    label="삭제"
                    color={DELETE_RED}
                    pressBg="rgba(196,69,69,0.08)"
                    onClick={handleDelete}
                  />
                </>
              )}
              <div style={{ height: 6, background: dividerBg }} />
              <SheetButton
                label="취소"
                color={textColor}
                pressBg={pressBg}
                onClick={close}
                bold
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    );

  return { open, sheet };
}

function SheetButton({
  label,
  color,
  pressBg,
  onClick,
  bold = false,
}: {
  label: string;
  color: string;
  pressBg: string;
  onClick: () => void;
  bold?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "16px 20px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 16,
        fontWeight: bold ? 600 : 500,
        color,
        textAlign: "center",
        transition: "background 0.12s",
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = pressBg;
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
      onTouchStart={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = pressBg;
      }}
      onTouchEnd={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function Divider({ color }: { color: string }) {
  return <div style={{ height: 1, background: color, margin: "0 16px" }} />;
}
