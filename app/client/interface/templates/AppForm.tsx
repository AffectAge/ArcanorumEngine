import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "./classNames";

type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

type AppInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

type AppToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function AppField({ label, hint, error, children, className = "" }: FieldProps) {
  return (
    <label className={cn("block", className)}>
      {label ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--arc-color-text-muted)]">{label}</span> : null}
      {children}
      <span className="mt-1 flex min-h-4 items-center justify-between gap-2 text-[11px]">
        <span className={error ? "text-[var(--arc-color-danger-ink)]" : "text-[var(--arc-color-text-muted)]"}>{error ?? hint}</span>
      </span>
    </label>
  );
}

export function AppInput({ invalid = false, className = "", ...props }: AppInputProps) {
  return (
    <span
      className={cn(
        "arc-app-field-frame block w-full rounded-[var(--arc-radius-md)] border bg-[var(--arc-kit-control)] shadow-[var(--arc-shadow-inset-soft)] transition focus-within:ring-2 focus-within:ring-[var(--arc-color-focus-ring)]",
        invalid ? "border-[var(--arc-color-danger-ink)]" : "border-[var(--arc-color-brown-dark)] focus-within:border-[var(--arc-color-primary-top)]",
        props.disabled && "opacity-50",
        className,
      )}
      data-invalid={invalid ? "true" : "false"}
      data-disabled={props.disabled ? "true" : "false"}
    >
      <input
        {...props}
        className="arc-app-field-control w-full border-0 bg-transparent px-3 py-2 text-sm text-[var(--arc-kit-text)] outline-none placeholder:text-[var(--arc-kit-text-faint)] disabled:opacity-50"
      />
    </span>
  );
}

export function AppTextarea({ invalid = false, className = "", ...props }: AppTextareaProps) {
  return (
    <span
      className={cn(
        "arc-app-field-frame block w-full rounded-[var(--arc-radius-md)] border bg-[var(--arc-kit-control)] shadow-[var(--arc-shadow-inset-soft)] transition focus-within:ring-2 focus-within:ring-[var(--arc-color-focus-ring)]",
        invalid ? "border-[var(--arc-color-danger-ink)]" : "border-[var(--arc-color-brown-dark)] focus-within:border-[var(--arc-color-primary-top)]",
        props.disabled && "opacity-50",
        className,
      )}
      data-invalid={invalid ? "true" : "false"}
      data-disabled={props.disabled ? "true" : "false"}
    >
      <textarea
        {...props}
        className="arc-app-field-control block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm text-[var(--arc-kit-text)] outline-none placeholder:text-[var(--arc-kit-text-faint)] disabled:opacity-50"
      />
    </span>
  );
}

export function AppToggle({ checked, onChange, label, description, disabled = false, className = "" }: AppToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "arc-app-toggle flex w-full items-center justify-between gap-3 rounded-[var(--arc-radius-md)] border border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-soft)] px-3 py-2 text-left shadow-[var(--arc-shadow-inset-soft)] outline-none transition hover:border-[var(--arc-color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--arc-color-focus-ring)] disabled:opacity-50",
        className,
      )}
      aria-pressed={checked}
    >
      <span>
        <span className="block text-sm font-semibold text-[var(--arc-kit-text)]">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-[var(--arc-kit-text-muted)]">{description}</span> : null}
      </span>
      <span
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
          checked ? "border-[var(--arc-color-primary-border)] bg-[var(--arc-color-primary-top)]" : "border-[var(--arc-color-brown-dark)] bg-[var(--arc-color-paper-toolbar)]"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full transition ${
            checked ? "translate-x-6 bg-[var(--arc-color-text)]" : "translate-x-1 bg-[var(--arc-color-paper-soft)]"
          }`}
        />
      </span>
    </button>
  );
}
