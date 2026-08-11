import type { ReactNode } from "react";
import { cn } from "./classNames";

export type GameResourceItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  icon?: ReactNode;
};

type GameResourcePanelProps = {
  title: ReactNode;
  resources: GameResourceItem[];
  className?: string;
};

export function GameResourcePanel({ title, resources, className = "" }: GameResourcePanelProps) {
  return (
    <section className={cn("arc-kit-panel", className)}>
      <h3 className="arc-kit-section-title">{title}</h3>
      <div className="grid gap-2">
        {resources.map((resource) => (
          <div key={resource.id} className="arc-kit-resource-row">
            <span className="flex min-w-0 items-center gap-2">
              {resource.icon ? <span className="text-[var(--arc-color-gold)]">{resource.icon}</span> : null}
              <span className="truncate">{resource.label}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <strong>{resource.value}</strong>
              {resource.delta ? <span>{resource.delta}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
