import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "./classNames";

export type GameDropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type GameDropdownFieldProps = {
  label: string;
  value: string;
  options: GameDropdownOption[];
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  placeholder?: string;
};

export function GameDropdownField({ label, value, options, onChange, hint, error, invalid = false, disabled = false, className = "", name, placeholder }: GameDropdownFieldProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);
  const selectedOption = options.find((option) => option.value === value);
  const selectedEnabledIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedEnabledIndex);
  const hasError = Boolean(error) || invalid;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(selectedEnabledIndex);
  }, [open, selectedEnabledIndex]);

  const commitOption = (option: GameDropdownOption) => {
    if (option.disabled || disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (enabledOptions.length === 0) return;
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) return enabledOptions.length - 1;
      if (next >= enabledOptions.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = enabledOptions[activeIndex];
      if (option) commitOption(option);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn("arc-kit-text-field arc-kit-dropdown-field", className)}
      data-open={open ? "true" : "false"}
      data-invalid={hasError ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
    >
      <span id={labelId} className="arc-kit-text-field__label">
        {label}
      </span>
      <span className="arc-kit-text-field__frame arc-kit-dropdown-field__frame">
        <button
          ref={buttonRef}
          type="button"
          className="arc-kit-dropdown-field__button"
          disabled={disabled}
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleKeyDown}
        >
          <span className={cn("arc-kit-dropdown-field__button-label", selectedOption ? "" : "arc-kit-dropdown-field__button-label--placeholder")}>
            {selectedOption?.label ?? placeholder ?? ""}
          </span>
        </button>
        <ChevronDown className="arc-kit-select-field__icon arc-kit-dropdown-field__chevron" size={16} aria-hidden="true" />
      </span>
      {open ? (
        <div id={listboxId} className="arc-kit-dropdown-field__menu" role="listbox" aria-labelledby={labelId}>
          <div className="arc-kit-dropdown-field__list">
            {options.map((option) => {
              const enabledIndex = enabledOptions.findIndex((entry) => entry.value === option.value);
              const active = enabledIndex === activeIndex;
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className="arc-kit-dropdown-field__option"
                  data-active={active ? "true" : "false"}
                  data-selected={selected ? "true" : "false"}
                  onMouseEnter={() => {
                    if (enabledIndex >= 0) setActiveIndex(enabledIndex);
                  }}
                  onClick={() => commitOption(option)}
                >
                  <span>{option.label}</span>
                  <Check className="arc-kit-dropdown-field__check" size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <span className="arc-kit-text-field__message">{error ?? hint ?? ""}</span>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
