import { forwardRef, type ForwardedRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./classNames";

type BaseGameTextFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  invalid?: boolean;
  className?: string;
};

type GameTextInputProps = BaseGameTextFieldProps &
  InputHTMLAttributes<HTMLInputElement> & {
    multiline?: false;
  };

type GameTextAreaProps = BaseGameTextFieldProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true;
  };

export type GameTextFieldProps = GameTextInputProps | GameTextAreaProps;

export const GameTextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, GameTextFieldProps>(
  function GameTextField({ label, hint, error, invalid = false, className = "", multiline, ...props }, ref) {
    const hasError = Boolean(error) || invalid;
    return (
      <label className={cn("arc-kit-text-field", className)} data-invalid={hasError ? "true" : "false"} data-disabled={props.disabled ? "true" : "false"}>
        <span className="arc-kit-text-field__label">{label}</span>
        <span className="arc-kit-text-field__frame">
          {multiline ? (
            <textarea
              {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
              ref={ref as ForwardedRef<HTMLTextAreaElement>}
              className="arc-kit-text-field__control arc-kit-text-field__control--textarea"
            />
          ) : (
            <input
              {...(props as InputHTMLAttributes<HTMLInputElement>)}
              ref={ref as ForwardedRef<HTMLInputElement>}
              className="arc-kit-text-field__control"
            />
          )}
        </span>
        <span className="arc-kit-text-field__message">{error ?? hint ?? ""}</span>
      </label>
    );
  },
);
