import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

export interface SearchComboboxProps<T> {
  placeholder?: string;
  minLength?: number;
  debounceMs?: number;
  disabled?: boolean;
  onSearch: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  getOptionKey: (item: T) => string | number;
  getLabel: (item: T) => string;
  getHint?: (item: T) => string;
  isOptionDisabled?: (item: T) => boolean;
}

export function SearchCombobox<T>({
  placeholder = "Поиск…",
  minLength = 2,
  debounceMs = 300,
  disabled = false,
  onSearch,
  onSelect,
  getOptionKey,
  getLabel,
  getHint,
  isOptionDisabled,
}: SearchComboboxProps<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [highlight, setHighlight] = useState(0);
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  const runSearch = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const results = await onSearch(q);
        setOptions(results);
        setHighlight(0);
        setOpen(true);
      } catch {
        setOptions([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [onSearch],
  );

  useEffect(() => {
    if (disabled) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < minLength) {
      setOptions([]);
      setOpen(trimmed.length > 0);
      setLoading(false);
      return;
    }
    void runSearch(trimmed);
  }, [debouncedQuery, minLength, disabled, runSearch]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selectItem = (item: T) => {
    if (isOptionDisabled?.(item)) return;
    onSelect(item);
    setQuery("");
    setOptions([]);
    setOpen(false);
  };

  const enabledOptions = options.filter((o) => !isOptionDisabled?.(o));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter" && open && enabledOptions.length > 0) {
      e.preventDefault();
      const idx = Math.min(highlight, enabledOptions.length - 1);
      selectItem(enabledOptions[idx]);
      return;
    }
    if (!open || enabledOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, enabledOptions.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    }
  };

  const showHint =
    query.trim().length > 0 && query.trim().length < minLength;
  const showEmpty =
    open &&
    !loading &&
    debouncedQuery.trim().length >= minLength &&
    options.length === 0;
  const showList = open && !loading && options.length > 0;

  return (
    <div className="search-combobox" ref={rootRef}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => {
          if (query.trim().length >= minLength && options.length > 0) {
            setOpen(true);
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length >= minLength) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combobox-dropdown" id={listId} role="listbox">
          {loading && <div className="combobox-message">Поиск…</div>}
          {showHint && (
            <div className="combobox-message">
              Введите ещё {minLength - query.trim().length} симв.
            </div>
          )}
          {showEmpty && (
            <div className="combobox-message">Ничего не найдено</div>
          )}
          {showList &&
            options.map((item) => {
              const key = getOptionKey(item);
              const optionDisabled = isOptionDisabled?.(item) ?? false;
              const enabledIndex = enabledOptions.findIndex(
                (o) => getOptionKey(o) === key,
              );
              const isHighlighted =
                !optionDisabled && enabledIndex === highlight;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  className={`combobox-option ${isHighlighted ? "highlighted" : ""} ${optionDisabled ? "disabled" : ""}`}
                  disabled={optionDisabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => {
                    if (!optionDisabled && enabledIndex >= 0) {
                      setHighlight(enabledIndex);
                    }
                  }}
                >
                  <span>{getLabel(item)}</span>
                  {getHint && (
                    <small className="muted">{getHint(item)}</small>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
