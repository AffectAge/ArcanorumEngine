import { cn } from "./classNames";

type GameSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
};

export function GameSwitch({ checked, onChange, ariaLabel, disabled = false, className = "" }: GameSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-state={checked ? "checked" : "unchecked"}
      className={cn("arc-kit-switch", className)}
      onClick={() => onChange(!checked)}
    >
      <span className="arc-kit-switch__thumb" />
    </button>
  );
}
