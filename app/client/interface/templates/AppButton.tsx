import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./classNames";
import { playUiSound, type UiSoundEventName } from "../../lib/audio/uiSoundService";

type AppButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success" | "warning" | "selected";
type AppButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> &
  VariantProps<typeof buttonClass> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: ReactNode;
  className?: string;
  sound?: UiSoundEventName | false;
};

const buttonClass = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-[var(--arc-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--arc-color-bg)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--arc-color-primary-border)] bg-gradient-to-b from-[var(--arc-color-primary-top)] to-[var(--arc-color-primary-bottom)] font-semibold text-[var(--arc-color-text)] shadow-[var(--arc-shadow-inset-button)] hover:brightness-110",
        secondary:
          "border-[var(--arc-kit-border)] bg-[var(--arc-kit-control)] text-[var(--arc-kit-text)] shadow-[var(--arc-shadow-inset-soft)] hover:border-[var(--arc-color-gold)] hover:text-[var(--arc-color-text)]",
        danger:
          "border-[var(--arc-color-danger-border)] bg-gradient-to-b from-[var(--arc-color-danger-top)] to-[var(--arc-color-danger-bottom)] font-semibold text-[var(--arc-color-danger-text)] shadow-[var(--arc-shadow-inset-button)] hover:brightness-110",
        ghost:
          "border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-soft)] text-[var(--arc-kit-text-muted)] hover:border-[var(--arc-color-gold)] hover:bg-[var(--arc-kit-control-hover)] hover:text-[var(--arc-color-text)]",
        success:
          "border-[var(--arc-color-success-border)] bg-gradient-to-b from-[var(--arc-color-success-top)] to-[var(--arc-color-success-bottom)] font-semibold text-[var(--arc-color-success-text)] shadow-[var(--arc-shadow-inset-button)] hover:brightness-110",
        warning:
          "border-[var(--arc-color-warning-border)] bg-gradient-to-b from-[var(--arc-color-warning-top)] to-[var(--arc-color-warning-bottom)] font-semibold text-[var(--arc-color-text-paper)] shadow-[var(--arc-shadow-inset-button)] hover:brightness-110",
        selected:
          "border-[var(--arc-color-gold)] bg-gradient-to-b from-[var(--arc-color-primary-top)] to-[var(--arc-color-primary-bottom)] font-semibold text-[var(--arc-color-text)] shadow-[var(--arc-kit-selected-glow)]",
      },
      size: {
        xs: "h-7 rounded-[var(--arc-radius-sm)] px-2 text-[11px]",
        sm: "h-8 rounded-[var(--arc-radius-sm)] px-2.5 text-xs",
        md: "h-10 rounded-[var(--arc-radius-md)] px-3 text-sm",
        lg: "h-11 rounded-[var(--arc-radius-md)] px-5 text-sm",
        icon: "h-10 w-10 rounded-[var(--arc-radius-sm)] p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export function AppButton({ variant = "secondary", size = "md", icon, children, className, onClick, sound = "button.click", ...props }: Props) {
  return (
    <button
      {...props}
      data-arc-button=""
      data-variant={variant}
      onClick={(event) => {
        if (!event.defaultPrevented && !props.disabled && sound) playUiSound(sound);
        onClick?.(event);
      }}
      className={cn(buttonClass({ variant, size }), className)}
    >
      {icon ? <span className="arc-button-icon">{icon}</span> : null}
      {children ? <span className="arc-button-label">{children}</span> : null}
    </button>
  );
}
