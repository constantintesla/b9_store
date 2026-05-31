import { useCallback, useEffect, useRef } from "react";

const SCAN_GAP_MS = 80;
const MIN_BARCODE_LENGTH = 3;

interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (code: string) => void;
  minLength?: number;
}

export function useBarcodeScanner({
  enabled = true,
  onScan,
  minLength = MIN_BARCODE_LENGTH,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    if (code.length >= minLength) {
      onScanRef.current(code);
    }
  }, [minLength]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;

      if (event.key === "Enter") {
        if (bufferRef.current.length > 0) {
          event.preventDefault();
          flush();
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTimeRef.current > SCAN_GAP_MS) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (!isEditable) {
        event.preventDefault();
      }
      bufferRef.current += event.key;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, flush]);
}
