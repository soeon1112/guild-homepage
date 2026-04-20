"use client";

import { useEffect, useRef, useState } from "react";

export function CommentImageAttach({
  file,
  setFile,
  disabled,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    if (file) {
      setFile(null);
    } else {
      inputRef.current?.click();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`comment-attach-btn${file ? " has-file" : ""}`}
        aria-label={file ? "첨부 제거" : "이미지 첨부"}
        title={file ? "첨부 제거" : "이미지 첨부"}
      >
        <span aria-hidden="true">📷</span>
      </button>
    </>
  );
}

export function CommentImageView({ url }: { url: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="comment-image-btn"
        onClick={() => setOpen(true)}
      >
        <img src={url} alt="" className="comment-image" />
      </button>
      {open && (
        <div
          className="comment-image-lightbox"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="comment-image-lightbox-close"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <img
            src={url}
            alt=""
            className="comment-image-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
