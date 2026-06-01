import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface CameraScannerProps {
  open: boolean;
  title?: string;
  /** Не закрывать после первого кода — для массового сканирования товаров. */
  continuous?: boolean;
  onResult: (code: string) => void;
  onClose: () => void;
}

/** Все форматы, которые поддерживает html5-qrcode. */
const ALL_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.MAXICODE,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
];

const DUPLICATE_MS = 700;

export function CameraScanner({
  open,
  title = "Сканирование",
  continuous = false,
  onResult,
  onClose,
}: CameraScannerProps) {
  const uid = useId().replace(/:/g, "");
  const regionId = `camera-scanner-${uid}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState("");

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const handleDecode = useCallback(
    (decoded: string) => {
      const code = decoded.trim();
      if (!code) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < DUPLICATE_MS) {
        return;
      }
      lastScanRef.current = { code, at: now };
      setLastCode(code);
      onResultRef.current(code);

      if (!continuous) {
        void stop();
        onCloseRef.current();
      }
    },
    [continuous, stop],
  );

  useEffect(() => {
    if (!open) {
      void stop();
      setError("");
      setLastCode("");
      lastScanRef.current = null;
      return;
    }

    let cancelled = false;
    const scanner = new Html5Qrcode(regionId, {
      formatsToSupport: ALL_FORMATS,
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = scanner;

    void (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            disableFlip: false,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.floor(Math.min(viewfinderWidth * 0.92, 480)),
              height: Math.floor(
                Math.min(Math.max(viewfinderHeight * 0.42, 120), 220),
              ),
            }),
          },
          handleDecode,
          () => undefined,
        );
        if (cancelled) await stop();
      } catch (e) {
        const msg = String(e);
        setError(
          msg.includes("NotAllowed") || msg.includes("Permission")
            ? "Разрешите доступ к камере в настройках телефона"
            : msg,
        );
      }
    })();

    return () => {
      cancelled = true;
      void stop();
    };
  }, [open, regionId, stop, handleDecode]);

  if (!open) return null;

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true">
      <div className="camera-modal">
        <header className="camera-header">
          <h2>{title}</h2>
          <button type="button" className="camera-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div id={regionId} className="camera-viewport" />
        {error && <div className="error-msg">{error}</div>}
        {continuous && lastCode && (
          <div className="status-msg camera-last-scan">
            Последний: <code>{lastCode}</code>
          </div>
        )}
        <p className="muted camera-hint">
          {continuous
            ? "Сканируйте подряд — окно закроется кнопкой ✕"
            : "Наведите камеру на QR или штрихкод"}
        </p>
      </div>
    </div>
  );
}
