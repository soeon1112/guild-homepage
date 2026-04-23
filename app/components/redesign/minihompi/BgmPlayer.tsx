"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Pause, Play, Volume2 } from "lucide-react";

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

export function BgmPlayer({ bgmUrl }: { bgmUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
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
      {/* Round trigger */}
      <button
        type="button"
        aria-label="배경음악 플레이어"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full text-stardust transition-all duration-300 hover:scale-105"
        style={{
          background: "rgba(26, 15, 61, 0.55)",
          border: "1px solid rgba(216, 150, 200, 0.35)",
          backdropFilter: "blur(14px)",
          boxShadow: playing
            ? "0 0 14px rgba(216,150,200,0.8), inset 0 0 8px rgba(255,229,196,0.25)"
            : "0 0 10px rgba(216,150,200,0.35)",
        }}
      >
        <Music className="h-4 w-4" aria-hidden />
        {playing && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-nebula-pink/70"
              style={{
                animation: "pulse-ring 2.2s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-peach-accent/60"
              style={{
                animation:
                  "pulse-ring 2.2s cubic-bezier(0,0,0.2,1) 0.7s infinite",
              }}
            />
          </>
        )}
      </button>

      {/* Hover tooltip */}
      <AnimatePresence>
        {!open && hovered && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-nebula-pink/30 bg-abyss-deep/95 px-2.5 py-1 font-serif text-[10px] tracking-wider text-stardust backdrop-blur-md"
          >
            {playing ? "재생 중" : "배경음악 재생"}
            <span
              aria-hidden
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-nebula-pink/30 bg-abyss-deep/95"
            />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 top-12 z-40 w-[260px] rounded-2xl p-4"
            style={{
              background: "rgba(26, 15, 61, 0.85)",
              border: "1px solid rgba(216, 150, 200, 0.25)",
              backdropFilter: "blur(20px)",
              boxShadow:
                "0 12px 32px rgba(11,8,33,0.55), 0 0 22px rgba(107,75,168,0.3)",
            }}
          >
            {/* Track info */}
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    "conic-gradient(from 45deg, #FFE5C4, #D896C8, #6B4BA8, #D896C8, #FFE5C4)",
                  animation: playing ? "orbit-rotate 8s linear infinite" : undefined,
                }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-abyss-deep">
                  <Music className="h-3.5 w-3.5 text-stardust" aria-hidden />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-serif text-sm"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, #FFE5C4, #D896C8)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                  }}
                >
                  {trackInfo.title}
                </p>
                {trackInfo.artist && (
                  <p className="truncate font-serif text-[11px] italic text-text-sub">
                    {trackInfo.artist}
                  </p>
                )}
              </div>
            </div>

            {/* Play/Pause */}
            <div className="mb-3 flex items-center justify-center">
              <button
                type="button"
                aria-label={playing ? "일시정지" : "재생"}
                onClick={togglePlay}
                disabled={!ready}
                className="flex h-9 w-9 items-center justify-center rounded-full text-abyss-deep transition-all duration-200 hover:scale-105 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                  boxShadow: "0 0 12px rgba(255,181,167,0.5)",
                }}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px]" />
                )}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Volume2 className="h-3 w-3 text-text-sub" aria-hidden />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                aria-label="볼륨"
                className="nebula-range flex-1"
              />
              <span className="w-6 text-right font-serif text-[10px] text-text-sub">
                {volume}
              </span>
            </div>

            <style jsx>{`
              .nebula-range {
                -webkit-appearance: none;
                height: 3px;
                background: linear-gradient(
                  to right,
                  #d896c8 0%,
                  #d896c8 ${volume}%,
                  rgba(200, 168, 233, 0.2) ${volume}%,
                  rgba(200, 168, 233, 0.2) 100%
                );
                border-radius: 999px;
                outline: none;
              }
              .nebula-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #ffe5c4;
                box-shadow: 0 0 6px rgba(255, 229, 196, 0.8);
                cursor: pointer;
                border: 1px solid #ffb5a7;
              }
              .nebula-range::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #ffe5c4;
                box-shadow: 0 0 6px rgba(255, 229, 196, 0.8);
                cursor: pointer;
                border: 1px solid #ffb5a7;
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden iframe host */}
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
