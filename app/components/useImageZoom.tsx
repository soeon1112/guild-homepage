"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ImageZoomViewer } from "./ImageZoomViewer";

export function useImageZoom(): {
  open: (uri: string) => void;
  viewer: ReactNode;
} {
  const [uri, setUri] = useState<string | null>(null);
  const open = useCallback((u: string) => setUri(u), []);
  const close = useCallback(() => setUri(null), []);

  return {
    open,
    viewer: uri ? <ImageZoomViewer uri={uri} onClose={close} /> : null,
  };
}
