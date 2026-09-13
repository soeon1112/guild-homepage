"use client";

import { useEffect, useState } from "react";

// 사진 묶음(Phase 4) — 카톡 스타일 확대 뷰어. 기존 각 채팅/DM 화면의
// 단일 viewerUri(고정 오버레이, 스와이프 X)를 대체한다. 배열 전체를
// 받아 터치 스와이프 + 키보드 화살표 + 좌우 버튼으로 넘긴다.

type Props = {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
};

const SWIPE_THRESHOLD = 50;

export function GalleryViewer({ urls, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(urls.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [urls.length, onClose]);

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(urls.length - 1, i + 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.9)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (deltaX > SWIPE_THRESHOLD) goPrev();
        else if (deltaX < -SWIPE_THRESHOLD) goNext();
        setTouchStartX(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[index]}
        alt=""
        className="max-h-[85vh] max-w-[92vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {urls.length > 1 && (
        <div
          className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-semibold text-white"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          {index + 1} / {urls.length}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 text-2xl text-white"
      >
        ✕
      </button>

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="이전 사진"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-3xl text-white"
        >
          ←
        </button>
      )}
      {index < urls.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="다음 사진"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl text-white"
        >
          →
        </button>
      )}
    </div>
  );
}
