import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "./classNames";

export type GameDetailSection = {
  title: ReactNode;
  rows: Array<{ label: ReactNode; value: ReactNode; icon?: ReactNode }>;
};

type GameDetailPanelProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  favoriteLabel?: string;
  sections: GameDetailSection[];
  footer?: ReactNode;
  className?: string;
};

export function GameDetailPanel({ title, subtitle, description, icon, favoriteLabel, sections, footer, className = "" }: GameDetailPanelProps) {
  return (
    <aside className={cn("arc-kit-panel", className)}>
      <div className="arc-kit-panel__header">
        {icon ? <span className="arc-kit-panel__emblem">{icon}</span> : null}
        <div className="min-w-0">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {favoriteLabel ? (
          <button type="button" className="arc-kit-icon-button ml-auto" aria-label={favoriteLabel}>
            <Star size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="arc-kit-panel__content">
        {description ? <p className="arc-kit-panel__description">{description}</p> : null}
        {sections.map((section, index) => (
          <section key={index} className="arc-kit-panel__section">
            <h4>{section.title}</h4>
            <div className="arc-kit-panel__rows">
              {section.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="arc-kit-info-row">
                  <span className="flex min-w-0 items-center gap-2">
                    {row.icon ? <span className="text-[var(--arc-color-gold)]">{row.icon}</span> : null}
                    <span className="truncate">{row.label}</span>
                  </span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {footer ? <footer className="arc-kit-panel__footer">{footer}</footer> : null}
    </aside>
  );
}
