import { useRef, type CSSProperties, type ChangeEvent } from "react";
import { Palette } from "lucide-react";
import { cn } from "./classNames";

type GameColorPickerButtonProps = {
  value: string;
  label: string;
  disabled?: boolean;
  showValue?: boolean;
  onChange: (value: string) => void;
  className?: string;
};

export function GameColorPickerButton({ value, label, disabled = false, showValue = true, onChange, className = "" }: GameColorPickerButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const colorInputValue = isColorInputValue(value) ? value : undefined;

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.currentTarget.value);
  }

  return (
    <span className={cn("arc-kit-color-picker", className)} style={{ "--arc-kit-picker-color": value } as CSSProperties}>
      <input ref={inputRef} type="color" className="sr-only" value={colorInputValue} disabled={disabled} aria-label={label} onChange={handleInputChange} />
      <button type="button" className="arc-kit-color-picker__button" disabled={disabled} aria-label={label} onClick={() => inputRef.current?.click()}>
        <span className="arc-kit-color-picker__paint" aria-hidden="true" />
        <Palette size={14} aria-hidden="true" />
        {showValue ? <span className="arc-kit-color-picker__value">{value}</span> : null}
      </button>
    </span>
  );
}

function isColorInputValue(value: string): boolean {
  return /^#[\da-f]{6}$/i.test(value);
}
