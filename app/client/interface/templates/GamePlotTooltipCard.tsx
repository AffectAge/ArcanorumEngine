import { isValidElement, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./classNames";

export type GamePlotTooltipTone = "default" | "positive" | "negative" | "warning" | "info" | "muted";

export type GamePlotTooltipYield = {
  id: string;
  icon: ReactNode;
  value: ReactNode;
  label?: ReactNode;
  color?: string;
};

export type GamePlotTooltipRow = {
  id?: string;
  label?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: GamePlotTooltipTone;
};

export type GamePlotTooltipSection = {
  title: ReactNode;
  rows: Array<ReactNode | GamePlotTooltipRow>;
  icon?: ReactNode;
  empty?: ReactNode;
};

export type GamePlotTooltipMapTagGroup = {
  id: string;
  label: ReactNode;
  tags: ReactNode[];
};

export type GamePlotTooltipMovement = {
  title: ReactNode;
  cost: ReactNode;
  baseCost?: ReactNode;
  stopOnEnter?: boolean;
  stopLabel?: ReactNode;
  rows?: GamePlotTooltipRow[];
};

export type GamePlotTooltipData = {
  title: ReactNode;
  subtitle?: ReactNode;
  location?: ReactNode;
  route?: ReactNode;
  geography?: GamePlotTooltipSection;
  ownership?: GamePlotTooltipSection;
  yields?: GamePlotTooltipYield[];
  resource?: {
    icon: ReactNode;
    name: ReactNode;
    description?: ReactNode;
    color?: string;
  };
  ownerLines?: ReactNode[];
  movement?: GamePlotTooltipMovement;
  tagGroups?: GamePlotTooltipMapTagGroup[];
  sections?: GamePlotTooltipSection[];
  emptyState?: {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
  };
};

type GamePlotTooltipCardProps = {
  data?: GamePlotTooltipData;
  title?: ReactNode;
  subtitle?: ReactNode;
  location?: ReactNode;
  route?: ReactNode;
  yields?: GamePlotTooltipYield[];
  resource?: {
    icon: ReactNode;
    name: ReactNode;
    description?: ReactNode;
  };
  ownerLines?: ReactNode[];
  sections?: GamePlotTooltipSection[];
  density?: "compact" | "normal" | "detailed";
  pinned?: boolean;
  className?: string;
};

export type GamePlotTooltipPositionerProps = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  children: ReactNode;
  offset?: number;
  padding?: number;
  className?: string;
};

export function GamePlotTooltipPositioner({
  open,
  anchor,
  children,
  offset = 18,
  padding = 12,
  className = "",
}: GamePlotTooltipPositionerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current || typeof window === "undefined") {
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    const fitsRight = anchor.x + offset + rect.width + padding <= window.innerWidth;
    const fitsBottom = anchor.y + offset + rect.height + padding <= window.innerHeight;
    const left = fitsRight
      ? anchor.x + offset
      : Math.max(padding, anchor.x - rect.width - offset);
    const top = fitsBottom
      ? anchor.y + offset
      : Math.max(padding, anchor.y - rect.height - offset);
    setStyle({
      left: Math.min(Math.max(padding, left), Math.max(padding, window.innerWidth - rect.width - padding)),
      top: Math.min(Math.max(padding, top), Math.max(padding, window.innerHeight - rect.height - padding)),
      visibility: "visible",
    });
  }, [anchor, offset, open, padding, children]);

  if (!open || !anchor) return null;

  return (
    <div ref={ref} className={cn("arc-kit-plot-tooltip-positioner", className)} style={style}>
      {children}
    </div>
  );
}

export function GamePlotTooltipCard({
  data,
  title,
  subtitle,
  location,
  route,
  yields = [],
  resource,
  ownerLines = [],
  sections = [],
  density = "normal",
  pinned = false,
  className = "",
}: GamePlotTooltipCardProps) {
  const tooltipData = useMemo<GamePlotTooltipData>(() => data ?? {
    title: title ?? "",
    subtitle,
    location,
    route,
    yields,
    resource,
    ownerLines,
    sections,
  }, [data, location, ownerLines, resource, route, sections, subtitle, title, yields]);

  if (tooltipData.emptyState) {
    return (
      <div
        className={cn("arc-kit-plot-tooltip", `arc-kit-plot-tooltip--${density}`, pinned && "arc-kit-plot-tooltip--pinned", className)}
        role="tooltip"
      >
        <div className="arc-kit-plot-tooltip__empty">
          {tooltipData.emptyState.icon ? <span className="arc-kit-plot-tooltip__empty-icon">{tooltipData.emptyState.icon}</span> : null}
          <div className="arc-kit-plot-tooltip__title">{tooltipData.emptyState.title}</div>
          {tooltipData.emptyState.description ? <div className="arc-kit-plot-tooltip__subtitle">{tooltipData.emptyState.description}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("arc-kit-plot-tooltip", `arc-kit-plot-tooltip--${density}`, pinned && "arc-kit-plot-tooltip--pinned", className)}
      role="tooltip"
    >
      <div className="arc-kit-plot-tooltip__title">{tooltipData.title}</div>
      {tooltipData.subtitle ? <div className="arc-kit-plot-tooltip__subtitle">{tooltipData.subtitle}</div> : null}
      {tooltipData.location ? <div className="arc-kit-plot-tooltip__line">{tooltipData.location}</div> : null}
      {tooltipData.route ? <div className="arc-kit-plot-tooltip__line">{tooltipData.route}</div> : null}

      {tooltipData.geography ? <TooltipSection section={tooltipData.geography} variant="geography" /> : null}
      {tooltipData.ownership ? <TooltipSection section={tooltipData.ownership} variant="ownership" /> : null}

      {tooltipData.movement ? <MovementSection movement={tooltipData.movement} /> : null}

      {tooltipData.yields?.length ? (
        <div className="arc-kit-plot-tooltip__yields">
          {tooltipData.yields.map((item) => (
            <div key={item.id} className="arc-kit-plot-tooltip__yield" title={typeof item.label === "string" ? item.label : undefined}>
              <span className="arc-kit-plot-tooltip__yield-icon" style={item.color ? { color: item.color } : undefined}>{item.icon}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {tooltipData.resource ? (
        <div className="arc-kit-plot-tooltip__resource">
          <span className="arc-kit-plot-tooltip__resource-icon" style={tooltipData.resource.color ? { color: tooltipData.resource.color } : undefined}>{tooltipData.resource.icon}</span>
          <span>
            <strong>{tooltipData.resource.name}</strong>
            {tooltipData.resource.description ? <span>{tooltipData.resource.description}</span> : null}
          </span>
        </div>
      ) : null}

      {tooltipData.ownerLines?.length ? (
        <div className="arc-kit-plot-tooltip__owners">
          {tooltipData.ownerLines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      ) : null}

      {tooltipData.tagGroups?.length ? (
        <section className="arc-kit-plot-tooltip__section">
          <div className="arc-kit-plot-tooltip__tag-groups">
            {tooltipData.tagGroups.map((group) => (
              <div key={group.id} className="arc-kit-plot-tooltip__tag-group">
                <span>{group.label}</span>
                <div>
                  {group.tags.map((tag, index) => (
                    <em key={index}>{tag}</em>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tooltipData.sections?.map((section, index) => (
        <TooltipSection key={index} section={section} />
      ))}
    </div>
  );
}

function MovementSection({ movement }: { movement: GamePlotTooltipMovement }) {
  return (
    <section className="arc-kit-plot-tooltip__movement">
      <div className="arc-kit-plot-tooltip__movement-main">
        <span>{movement.title}</span>
        <strong>{movement.cost}</strong>
      </div>
      {movement.baseCost || movement.stopOnEnter ? (
        <div className="arc-kit-plot-tooltip__movement-meta">
          {movement.baseCost ? <span>{movement.baseCost}</span> : null}
          {movement.stopOnEnter && movement.stopLabel ? <span data-tone="warning">{movement.stopLabel}</span> : null}
        </div>
      ) : null}
      {movement.rows?.length ? (
        <div className="arc-kit-plot-tooltip__rows">
          {movement.rows.map((row, index) => <TooltipRow key={row.id ?? index} row={row} />)}
        </div>
      ) : null}
    </section>
  );
}

function TooltipSection({ section, variant }: { section: GamePlotTooltipSection; variant?: "geography" | "ownership" }) {
  return (
    <section className={cn("arc-kit-plot-tooltip__section", variant && `arc-kit-plot-tooltip__section--${variant}`)}>
      <div className="arc-kit-plot-tooltip__section-title">
        <span className="arc-kit-plot-tooltip__section-title-label">
          {section.icon ? <span className="arc-kit-plot-tooltip__section-icon">{section.icon}</span> : null}
          <span>{section.title}</span>
        </span>
      </div>
      <div className="arc-kit-plot-tooltip__section-rows">
        {section.rows.length
          ? section.rows.map((row, rowIndex) => (
              isTooltipRow(row)
                ? <TooltipRow key={row.id ?? rowIndex} row={row} />
                : <div key={rowIndex}>{row}</div>
            ))
          : section.empty ? <div>{section.empty}</div> : null}
      </div>
    </section>
  );
}

function isTooltipRow(row: ReactNode | GamePlotTooltipRow): row is GamePlotTooltipRow {
  return typeof row === "object" && row != null && !isValidElement(row) && ("label" in row || "value" in row || "detail" in row);
}

function TooltipRow({ row }: { row: GamePlotTooltipRow }) {
  return (
    <div className="arc-kit-plot-tooltip__row" data-tone={row.tone ?? "default"}>
      {row.icon ? <span className="arc-kit-plot-tooltip__row-icon">{row.icon}</span> : null}
      {row.label ? <span className="arc-kit-plot-tooltip__row-label">{row.label}</span> : null}
      {row.value ? <strong>{row.value}</strong> : null}
      {row.detail ? <small>{row.detail}</small> : null}
    </div>
  );
}
