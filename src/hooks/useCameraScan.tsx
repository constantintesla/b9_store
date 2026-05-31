import { useCallback, useState } from "react";
import { CameraScanner } from "../components/CameraScanner";

export function useCameraScan() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Сканирование");
  const [handler, setHandler] = useState<((code: string) => void) | null>(
    null,
  );

  const startScan = useCallback(
    (scanTitle: string, onCode: (code: string) => void) => {
      setTitle(scanTitle);
      setHandler(() => onCode);
      setOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    setHandler(null);
  }, []);

  const scanner = (
    <CameraScanner
      open={open}
      title={title}
      onClose={close}
      onResult={(code) => handler?.(code)}
    />
  );

  return { startScan, scanner, isOpen: open };
}
