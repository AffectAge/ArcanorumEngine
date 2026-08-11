import type { ReactNode } from "react";
import { cn } from "./classNames";

export type GameTechNode = {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  state?: "selected" | "available" | "locked";
};

type GameTechTreePreviewProps = {
  title: ReactNode;
  nodes: GameTechNode[];
  className?: string;
};

export function GameTechTreePreview({ title, nodes, className = "" }: GameTechTreePreviewProps) {
  return (
    <section className={cn("arc-kit-tech", className)}>
      <h3 className="arc-kit-section-title">{title}</h3>
      <div className="arc-kit-tech__graph" aria-label={String(title)}>
        {nodes.map((node) => (
          <button key={node.id} type="button" className={cn("arc-kit-tech-node", node.state && `arc-kit-tech-node--${node.state}`)}>
            {node.icon ? <span className="arc-kit-tech-node__icon">{node.icon}</span> : null}
            <span className="min-w-0">
              <span className="block truncate">{node.label}</span>
              {node.meta ? <span className="block text-[11px] text-[var(--arc-kit-text-muted)]">{node.meta}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
