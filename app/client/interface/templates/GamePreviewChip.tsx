import type { CSSProperties, ReactNode } from "react";
import { cn } from "./classNames";

type GamePreviewChipProps = {
  src?: string | null;
  color?: string | null;
  label?: string;
  emptyLabel?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function GamePreviewChip({ src, color, label, emptyLabel, children, className = "" }: GamePreviewChipProps) {
  const style = color ? ({ "--arc-kit-preview-chip-fill": color } as CSSProperties) : undefined;
  const isEmpty = !src && !color && !children;
  return (
    <span
      className={cn("arc-kit-preview-chip", isEmpty && "arc-kit-preview-chip--empty", className)}
      style={style}
      aria-label={label}
    >
      {src ? <img src={src} alt="" aria-hidden="true" /> : children ?? emptyLabel ?? null}
    </span>
  );
}

type GamePreviewChipGroupProps = {
  color?: string | null;
  src?: string | null;
  label?: string;
  emptyLabel?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function GamePreviewChipGroup({ color, src, label, emptyLabel, children, className = "" }: GamePreviewChipGroupProps) {
  return (
    <span className={cn("arc-kit-preview-chip-group", className)}>
      {color ? <GamePreviewChip color={color} /> : <GamePreviewChip className="arc-kit-preview-chip--placeholder" />}
      {children ? <GamePreviewChip>{children}</GamePreviewChip> : <GamePreviewChip src={src} label={label} emptyLabel={emptyLabel} />}
    </span>
  );
}
