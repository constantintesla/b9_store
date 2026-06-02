import { useCallback, useEffect, useRef } from "react";

const SCAN_GAP_MS = 100;
const IDLE_FLUSH_MS = 100;
const MIN_BARCODE_LENGTH = 3;
const DEFAULT_DUPLICATE_MS = 1500;

interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (code: string) => void;
  minLength?: number;
  /** Игнорировать повтор того же кода в течение N мс. */
  duplicateMs?: number;
}

export function useBarcodeScanner({
  enabled = true,
  onScan,
  minLength = MIN_BARCODE_LENGTH,
  duplicateMs = DEFAULT_DUPLICATE_MS,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const emitScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (code.length < minLength) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < duplicateMs) {
        return;
      }
      lastScanRef.current = { code, at: now };
      onScanRef.current(code);
    },
    [minLength, duplicateMs],
  );

  const flush = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const code = bufferRef.current;
    bufferRef.current = "";
    if (code.trim().length >= minLength) {
      emitScan(code);
    }
  }, [minLength, emitScan]);

  const scheduleIdleFlush = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      flush();
    }, IDLE_FLUSH_MS);
  }, [flush]);

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = "";
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

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

      // Ручной ввод в поля — не смешивать с USB-сканером
      if (isEditable) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTimeRef.current > SCAN_GAP_MS) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      event.preventDefault();
      bufferRef.current += event.key;
      scheduleIdleFlush();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [enabled, flush, scheduleIdleFlush]);
}
