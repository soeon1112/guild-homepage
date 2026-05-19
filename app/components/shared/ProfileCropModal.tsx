"use client";

// Profile photo crop modal — opened from ProfileSection / ProfileSectionD2
// when the user picks a non-square photo for their avatar. Locked to 1:1
// aspect, drag-to-pan + pinch/scroll-to-zoom via react-easy-crop. On
// confirm we paint the cropped area onto a canvas and hand the parent
// a JPEG Blob, which goes through the existing handleImageUpload path
// (uploadBytes + Firestore update). Same component is consumed by both
// cosmic and dl2 callers — `dawnlight2` toggles the surface palette.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { Area } from "react-easy-crop";
import { useBackdropClose } from "@/src/lib/useBackdropClose";

type Props = {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
  dawnlight2?: boolean;
};

export default function ProfileCropModal({
  file,
  onCancel,
  onConfirm,
  dawnlight2 = false,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPx, setCroppedPx] = useState<Area | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const backdropHandlers = useBackdropClose(onCancel, !submitting);

  // Object URL for the picked file. Revoked on unmount so we don't leak
  // a Blob handle when the user closes the modal without confirming.
  const imageSrc = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(
    () => () => {
      URL.revokeObjectURL(imageSrc);
    },
    [imageSrc],
  );

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setCroppedPx(areaPx);
  }, []);

  const handleConfirm = async () => {
    if (!croppedPx || submitting) return;
    setSubmitting(true);
    try {
      const blob = await renderCroppedJpeg(imageSrc, croppedPx);
      await onConfirm(blob);
    } catch (e) {
      console.error(e);
      alert("이미지 자르기에 실패했습니다.");
      setSubmitting(false);
    }
  };

  // Escape closes — only when not mid-upload so we don't lose the user's
  // crop while a network request is in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  if (typeof document === "undefined") return null;

  // dl2 = cream/navy 양피지 톤. cosmic = abyss/stardust 보라 톤. Both share
  // the same crop area (black bg + 1:1 mask) so the photo composition
  // reads identically; only the chrome (close / confirm / slider) flips.
  const navy = "#2a4570";
  const cream = "#fef5e6";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="프로필 사진 자르기"
      {...backdropHandlers}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Crop surface — react-easy-crop fills its parent. Square box at
            min(92vw, 460px) so the 1:1 mask shows the user the exact frame
            their avatar will use. */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            background: "#000",
            borderRadius: dawnlight2 ? 8 : 12,
            overflow: "hidden",
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            showGrid
          />
        </div>

        {/* Zoom slider — desktop trackpads + mobile that don't pinch get
            an explicit control. min/max chosen to allow generous zoom-in
            (3x) without ever zooming so far out that the image leaves the
            frame (1x). step 0.05 for smooth dragging. */}
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="확대/축소"
          style={{
            width: "100%",
            accentColor: dawnlight2 ? navy : "#FFB5A7",
          }}
        />

        {/* Hint + actions row */}
        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 12,
            color: dawnlight2 ? cream : "rgba(216,150,200,0.85)",
            fontFamily: dawnlight2 ? undefined : "var(--font-noto-serif-kr), serif",
            fontStyle: dawnlight2 ? "normal" : "italic",
          }}
        >
          드래그로 위치 · 슬라이더로 확대
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
              background: "transparent",
              border: dawnlight2
                ? `1px solid ${cream}`
                : "1px solid rgba(200,168,233,0.5)",
              color: cream,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !croppedPx}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting || !croppedPx ? "not-allowed" : "pointer",
              opacity: submitting || !croppedPx ? 0.5 : 1,
              background: dawnlight2
                ? navy
                : "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              border: "none",
              color: dawnlight2 ? cream : "#0b0821",
            }}
          >
            {submitting ? "업로드 중..." : "확인"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Paint the user's selected crop region onto a fresh canvas at native
// pixel size and hand back a JPEG Blob. Quality 0.92 matches what
// browsers default to for HEIC/JPEG re-encode and keeps avatar files
// well under 1 MB even for 4K source photos.
async function renderCroppedJpeg(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
