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

export function CommentImageView({
  url,
  reserveBox,
}: {
  url: string;
  // NewHomeChat(홈 채팅) 초기 하단 스크롤 fix 전용 옵션 — 이미지가 실제
  // 로드되기 전까지 <img>에 크기가 없어(.comment-image 는 max-width/
  // max-height 만 지정) 로드 완료 시점에 reflow(CLS)가 나고, 이 reflow가
  // 홈 채팅의 auto-pin 정착 게이트 이후에 발생하면 재교정이 스킵돼
  // 스크롤이 어중간한 위치에 멈추는 버그로 이어졌다. true 일 때만 로드
  // 전에도 고정된 정사각 박스(폭 240px)를 미리 예약해 그 reflow를
  // 없앤다 — 다른 8개 호출부(게시판/앨범/미니홈피/길드챗/기존 채팅
  // 패널)는 이 prop 을 넘기지 않아 기존 렌더링 그대로 유지된다.
  reserveBox?: boolean;
}) {
  const { open, viewer } = useImageZoom();

  return (
    <>
      <button
        type="button"
        className="comment-image-btn"
        onClick={() => open(url)}
      >
        <img
          src={url}
          alt=""
          className="comment-image"
          style={
            reserveBox
              ? {
                  width: 240,
                  maxWidth: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "contain",
                }
              : undefined
          }
        />
      </button>
      {viewer}
    </>
  );
}
