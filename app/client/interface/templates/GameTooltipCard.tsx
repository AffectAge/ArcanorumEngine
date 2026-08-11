import type { ReactNode } from "react";
import { Pin } from "lucide-react";
import { cn } from "./classNames";

type GameTooltipCardProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  rows?: Array<{ label: ReactNode; value: ReactNode }>;
  pinHint?: ReactNode;
  className?: string;
};

export function GameTooltipCard({ title, eyebrow, description, icon, rows = [], pinHint, className = "" }: GameTooltipCardProps) {
  return (
    <div className={cn("arc-kit-tooltip", className)} role="tooltip">
      <div className="arc-kit-tooltip__header">
        {icon ? <span className="arc-kit-tooltip__icon">{icon}</span> : null}
        <div className="min-w-0">
          {eyebrow ? <div className="arc-kit-eyebrow">{eyebrow}</div> : null}
          <div className="arc-kit-tooltip__title">{title}</div>
        </div>
      </div>
      {description ? <p className="arc-kit-tooltip__description">{description}</p> : null}
      {rows.length ? (
        <div className="arc-kit-tooltip__rows">
          {rows.map((row, index) => (
            <div key={index} className="arc-kit-info-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {pinHint ? (
        <div className="arc-kit-tooltip__footer">
          <Pin size={13} aria-hidden="true" />
          <span>{pinHint}</span>
        </div>
      ) : null}
    </div>
  );
}
