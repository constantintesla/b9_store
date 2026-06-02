import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import type { Html5QrcodeCameraScanConfig } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePlatform } from "../hooks/usePlatform";

export type ScanProfile = "barcode" | "qr" | "all";

interface CameraScannerProps {
  open: boolean;
  title?: string;
  scanProfile?: ScanProfile;
  /** Не закрывать после первого кода — для массового сканирования товаров. */
  continuous?: boolean;
  onResult: (code: string) => void;
  onClose: () => void;
}

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

/** Розница: EAN/UPC + Code128 — меньше ложных срабатываний, быстрее на слабых планшетах. */
const BARCODE_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
];

const QR_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.AZTEC,
];

function formatsForProfile(profile: ScanProfile) {
  if (profile === "barcode") return BARCODE_FORMATS;
  if (profile === "qr") return QR_FORMATS;
  return ALL_FORMATS;
}

function duplicateMsForProfile(profile: ScanProfile, mobile: boolean) {
  if (profile === "barcode") return mobile ? 900 : 1200;
  return 700;
}

function cameraScanConfig(
  profile: ScanProfile,
  mobile: boolean,
): Html5QrcodeCameraScanConfig {
  const config: Html5QrcodeCameraScanConfig = {
    fps: profile === "barcode" ? (mobile ? 24 : 20) : 15,
    disableFlip: false,
    aspectRatio: mobile ? 1.7777777778 : undefined,
    videoConstraints: mobile
      ? {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        }
      : undefined,
  };

  // Линейные штрихкоды: весь кадр (узкий qrbox заставляет «водить» камерой)
  if (profile !== "barcode") {
    config.qrbox = (viewfinderWidth, viewfinderHeight) => ({
      width: Math.floor(Math.min(viewfinderWidth * 0.92, mobile ? 560 : 480)),
      height: Math.floor(
        Math.min(Math.max(viewfinderHeight * 0.5, 160), mobile ? 360 : 280),
      ),
    });
  }

  return config;
}

export function CameraScanner({
  open,
  title = "Сканирование",
  scanProfile = "all",
  continuous = false,
  onResult,
  onClose,
}: CameraScannerProps) {
  const { isMobile } = usePlatform();
  const uid = useId().replace(/:/g, "");
  const regionId = `camera-scanner-${uid}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const duplicateMsRef = useRef(duplicateMsForProfile(scanProfile, isMobile));
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState("");

  duplicateMsRef.current = duplicateMsForProfile(scanProfile, isMobile);

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
      const duplicateMs = duplicateMsRef.current;
      if (last && last.code === code && now - last.at < duplicateMs) {
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
    const formats = formatsForProfile(scanProfile);
    const scanner = new Html5Qrcode(regionId, {
      formatsToSupport: formats,
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = scanner;

    const cameraConfig = isMobile
      ? { facingMode: { ideal: "environment" } }
      : { facingMode: "environment" };

    void (async () => {
      try {
        await scanner.start(
          cameraConfig,
          cameraScanConfig(scanProfile, isMobile),
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
  }, [open, regionId, scanProfile, isMobile, stop, handleDecode]);

  const hint =
    scanProfile === "barcode"
      ? continuous
        ? "Держите штрихкод в кадре — сканируйте подряд, закройте ✕"
        : isMobile
          ? "Держите упаковку в кадре 20–30 см, без движения"
          : "Наведите на штрихкод"
      : continuous
        ? "Сканируйте подряд — окно закроется кнопкой ✕"
        : "Наведите камеру на QR";

  if (!open) return null;

  const fullscreen = isMobile;
  const fullFrameBarcode = scanProfile === "barcode";

  return (
    <div
      className={`camera-overlay${fullscreen ? " camera-overlay--mobile" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="camera-modal">
        <header className="camera-header">
          <h2>{title}</h2>
          <button type="button" className="camera-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="camera-viewport-wrap">
          <div id={regionId} className="camera-viewport" />
          {fullFrameBarcode && (
            <div className="camera-barcode-guide" aria-hidden>
              <div className="camera-barcode-guide-line" />
              <span className="camera-barcode-guide-label">
                Штрихкод в зоне линии
              </span>
            </div>
          )}
        </div>
        {error && <div className="error-msg">{error}</div>}
        {continuous && lastCode && (
          <div className="status-msg camera-last-scan">
            Последний: <code>{lastCode}</code>
          </div>
        )}
        <p className="muted camera-hint">{hint}</p>
      </div>
    </div>
  );
}
