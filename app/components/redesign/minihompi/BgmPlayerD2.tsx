"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Pause, Play, Volume2 } from "lucide-react";

// dawnlight2 미니홈피 1단계 — 음표만 트리거 + 짙은 베이지 박스.
// 동작/구조는 cosmic BgmPlayer와 동일 (YouTube iframe API,
// onReady/onStateChange, volume control). 색·테두리·shadow만 cream/peach 톤.

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  getVolume?: () => number;
  getVideoData?: () => { title?: string; author?: string };
  destroy: () => void;
};

type YTPlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars?: Record<string, number>;
    events?: {
      onReady?: () => void;
      onStateChange?: (e: { data: number }) => void;
    };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTPlayerConstructor };
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export function BgmPlayerD2({ bgmUrl }: { bgmUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(60);
  const [trackInfo, setTrackInfo] = useState<{ title: string; artist: string }>({
    title: "배경음악",
    artist: "",
  });

  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const videoId = bgmUrl ? extractYouTubeId(bgmUrl) : null;

  useEffect(() => {
    if (!videoId || !hostRef.current) return;
    let cancelled = false;
    const host = hostRef.current;
    const target = document.createElement("div");
    host.appendChild(target);

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) return;
      try {
        playerRef.current = new window.YT.Player(target, {
          videoId,
          playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              try {
                const d = playerRef.current?.getVideoData?.();
                if (d?.title) {
                  setTrackInfo({
                    title: d.title,
                    artist: d.author ?? "",
                  });
                }
                playerRef.current?.setVolume(volume);
              } catch {}
            },
            onStateChange: (e) => {
              if (cancelled) return;
              if (e.data === 1) setPlaying(true);
              else if (e.data === 2 || e.data === 0) setPlaying(false);
            },
          },
        });
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      setPlaying(false);
      setReady(false);
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const togglePlay = () => {
    if (!ready || !playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    try {
      playerRef.current?.setVolume(v);
    } catch {}
  };

  if (!videoId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="배경음악 플레이어"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:scale-105"
        style={{
          background: "rgba(255, 255, 255, 0.45)",
          border: "1px solid rgba(140, 100, 60, 0.28)",
          backdropFilter: "blur(8px)",
          boxShadow: playing
            ? "0 0 14px rgba(244,168,122,0.6), inset 0 0 8px rgba(255,229,196,0.35)"
            : "0 2px 8px rgba(80,40,10,0.12)",
          color: "#5a3a1a",
        }}
      >
        <Music className="h-4 w-4" aria-hidden />
        {playing && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(244,168,122,0.7)",
              animation: "pulse-ring 2.2s cubic-bezier(0,0,0.2,1) infinite",
            }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 top-12 z-40 w-[260px] max-w-[calc(100vw-2rem)] rounded-2xl p-4"
            style={{
              background: "#e8d8b8",
              border: "1px solid rgba(140, 100, 60, 0.32)",
              boxShadow: "0 8px 22px rgba(80,40,10,0.22)",
              color: "#3a2a1a",
            }}
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    "conic-gradient(from 45deg, #fef5e6, #f4a87a, #c89060, #f4a87a, #fef5e6)",
                  animation: playing ? "orbit-rotate 8s linear infinite" : undefined,
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: "#f5e8d0" }}
                >
                  <Music className="h-3.5 w-3.5" style={{ color: "#5a3a1a" }} aria-hidden />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-serif text-sm"
                  style={{ color: "#3a2a1a" }}
                >
                  {trackInfo.title}
                </p>
                {trackInfo.artist && (
                  <p
                    className="truncate font-serif text-[11px] italic"
                    style={{ color: "rgba(90,58,26,0.65)" }}
                  >
                    {trackInfo.artist}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-center">
              <button
                type="button"
                aria-label={playing ? "일시정지" : "재생"}
                onClick={togglePlay}
                disabled={!ready}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #fef5e6, #f4a87a)",
                  boxShadow: "0 2px 8px rgba(244,168,122,0.5)",
                  color: "#3a2a1a",
                }}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px]" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Volume2
                className="h-3 w-3"
                style={{ color: "rgba(90,58,26,0.65)" }}
                aria-hidden
              />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                aria-label="볼륨"
                className="parchment-range flex-1"
              />
              <span
                className="w-6 text-right font-serif text-[10px]"
                style={{ color: "rgba(90,58,26,0.65)" }}
              >
                {volume}
              </span>
            </div>

            <style jsx>{`
              .parchment-range {
                -webkit-appearance: none;
                height: 3px;
                background: linear-gradient(
                  to right,
                  #c89060 0%,
                  #c89060 ${volume}%,
                  rgba(140, 100, 60, 0.22) ${volume}%,
                  rgba(140, 100, 60, 0.22) 100%
                );
                border-radius: 999px;
                outline: none;
              }
              .parchment-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fef5e6;
                box-shadow: 0 0 6px rgba(244, 168, 122, 0.7);
                cursor: pointer;
                border: 1px solid #c89060;
              }
              .parchment-range::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fef5e6;
                box-shadow: 0 0 6px rgba(244, 168, 122, 0.7);
                cursor: pointer;
                border: 1px solid #c89060;
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={hostRef}
        aria-hidden
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
