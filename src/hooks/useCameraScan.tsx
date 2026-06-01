import { useCallback, useState } from "react";
import { CameraScanner } from "../components/CameraScanner";

export interface ScanOptions {
  /** Массовое сканирование без закрытия камеры после каждого кода. */
  continuous?: boolean;
}

export function useCameraScan() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Сканирование");
  const [continuous, setContinuous] = useState(false);
  const [handler, setHandler] = useState<((code: string) => void) | null>(
    null,
  );

  const startScan = useCallback(
    (
      scanTitle: string,
      onCode: (code: string) => void,
      options?: ScanOptions,
    ) => {
      setTitle(scanTitle);
      setContinuous(options?.continuous ?? false);
      setHandler(() => onCode);
      setOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    setHandler(null);
    setContinuous(false);
  }, []);

  const scanner = (
    <CameraScanner
      open={open}
      title={title}
      continuous={continuous}
      onClose={close}
      onResult={(code) => handler?.(code)}
    />
  );

  return { startScan, scanner, isOpen: open };
}
