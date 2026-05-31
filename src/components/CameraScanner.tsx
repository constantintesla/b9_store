import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface CameraScannerProps {
  open: boolean;
  title?: string;
  onResult: (code: string) => void;
  onClose: () => void;
}

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

export function CameraScanner({
  open,
  title = "Сканирование",
  onResult,
  onClose,
}: CameraScannerProps) {
  const uid = useId().replace(/:/g, "");
  const regionId = `camera-scanner-${uid}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!open) {
      void stop();
      setError("");
      return;
    }

    let cancelled = false;
    const scanner = new Html5Qrcode(regionId, {
      formatsToSupport: FORMATS,
      verbose: false,
    });
    scannerRef.current = scanner;

    void (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decoded) => {
            onResult(decoded);
            void stop();
            onClose();
          },
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
  }, [open, onClose, onResult, regionId, stop]);

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
        <p className="muted camera-hint">Наведите камеру на QR или штрихкод</p>
      </div>
    </div>
  );
}
