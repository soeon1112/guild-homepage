"use client";

import { useRef } from "react";
import { useImageZoom } from "./useImageZoom";

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
  const { open, viewer } = useImageZoom();

  return (
    <>
      <button
        type="button"
        className="comment-image-btn"
        onClick={() => open(url)}
      >
        <img src={url} alt="" className="comment-image" />
      </button>
      {viewer}
    </>
  );
}
