import type { ReactNode } from "react";
import { cn } from "./classNames";

type GameActionBarProps = {
  title?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function GameActionBar({ title, leading, actions, className = "" }: GameActionBarProps) {
  return (
    <div className={cn("arc-kit-action-bar", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        {title ? <div className="font-display truncate text-lg font-bold tracking-wide text-[var(--arc-kit-gold-strong)]">{title}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
