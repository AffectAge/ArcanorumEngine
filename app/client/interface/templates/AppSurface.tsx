import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./classNames";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
};

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

type StatusChipProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof statusChipClass> & {
    children: ReactNode;
  };

const statusChipClass = cva("inline-flex min-h-6 items-center justify-center rounded-[var(--arc-radius-sm)] border px-2 py-0.5 text-[11px] font-semibold leading-none", {
  variants: {
    tone: {
      active: "border-[var(--arc-color-success-border)] bg-[var(--arc-kit-success-soft)] text-[var(--arc-color-success-text)]",
      pending: "border-[var(--arc-color-warning-border)] bg-[var(--arc-kit-warning-soft)] text-[var(--arc-color-text)]",
      available: "border-[var(--arc-color-primary-border)] bg-[var(--arc-kit-info-soft)] text-[var(--arc-color-text)]",
      unavailable: "border-[var(--arc-color-danger-border)] bg-[var(--arc-kit-danger-soft)] text-[var(--arc-color-danger-text)]",
      locked: "border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-muted)] text-[var(--arc-kit-text-faint)]",
    },
  },
  defaultVariants: {
    tone: "available",
  },
});

export function AppToolbar({ children, className = "", ...props }: Props) {
  return (
    <div {...props} className={cn("mb-3 rounded-[var(--arc-radius-lg)] border border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-soft)] p-3 shadow-[var(--arc-shadow-inset-soft)]", className)}>
      {children}
    </div>
  );
}

export function AppSection({ children, className = "", ...props }: Props) {
  return (
    <section {...props} className={cn("min-h-0 rounded-[var(--arc-radius-lg)] border border-[var(--arc-kit-border)] bg-[var(--arc-kit-surface)] p-3 text-[var(--arc-kit-text)] shadow-[var(--arc-shadow-panel)]", className)}>
      {children}
    </section>
  );
}

export function AppCard({ children, className = "", ...props }: Props) {
  return (
    <div {...props} className={cn("rounded-[var(--arc-radius-md)] border border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-soft)] p-3 text-[var(--arc-kit-text)] shadow-[var(--arc-shadow-inset-soft)]", className)}>
      {children}
    </div>
  );
}

export function AppSectionHeader({ title, description, icon, actions, className = "", ...props }: SectionHeaderProps) {
  return (
    <div {...props} className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--arc-kit-text)]">
          {icon ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--arc-radius-sm)] border border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-control)] text-[var(--arc-color-gold)]">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </div>
        {description ? <div className="mt-1 text-xs text-[var(--arc-kit-text-muted)]">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AppEmptyState({ children, title, icon, action, className = "", ...props }: EmptyStateProps) {
  return (
    <div {...props} className={cn("rounded-[var(--arc-radius-md)] border border-dashed border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-surface-muted)] px-3 py-6 text-center text-sm text-[var(--arc-kit-text-muted)]", className)}>
      {icon ? <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[var(--arc-radius-md)] border border-[var(--arc-kit-border-muted)] bg-[var(--arc-kit-control)] text-[var(--arc-color-gold)]">{icon}</div> : null}
      {title ? <div className="font-semibold text-[var(--arc-kit-text)]">{title}</div> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function AppStatusChip({ children, tone = "available", className = "", ...props }: StatusChipProps) {
  return (
    <span {...props} className={cn(statusChipClass({ tone }), className)}>
      {children}
    </span>
  );
}
