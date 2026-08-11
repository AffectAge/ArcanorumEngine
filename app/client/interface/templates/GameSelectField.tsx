import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./classNames";

export type GameSelectOption = {
  value: string;
  label: string;
};

type GameSelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  invalid?: boolean;
  options: GameSelectOption[];
  className?: string;
};

export const GameSelectField = forwardRef<HTMLSelectElement, GameSelectFieldProps>(
  function GameSelectField({ label, hint, error, invalid = false, options, className = "", ...props }, ref) {
    const hasError = Boolean(error) || invalid;
    return (
      <label className={cn("arc-kit-text-field arc-kit-select-field", className)} data-invalid={hasError ? "true" : "false"} data-disabled={props.disabled ? "true" : "false"}>
        <span className="arc-kit-text-field__label">{label}</span>
        <span className="arc-kit-text-field__frame">
          <select {...props} ref={ref} className="arc-kit-text-field__control arc-kit-select-field__control">
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="arc-kit-select-field__icon" size={16} aria-hidden="true" />
        </span>
        <span className="arc-kit-text-field__message">{error ?? hint ?? ""}</span>
      </label>
    );
  },
);
