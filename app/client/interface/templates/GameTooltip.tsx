import type { ReactNode } from "react";
import type { Placement } from "@floating-ui/react";
import { Tooltip } from "../Tooltip";
import { cn } from "./classNames";

type GameTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  disabled?: boolean;
  className?: string;
  referenceClassName?: string;
};

export function GameTooltip({ content, children, placement = "top", disabled = false, className = "", referenceClassName = "inline-flex" }: GameTooltipProps) {
  return (
    <Tooltip
      content={content}
      placement={placement}
      variant="compact"
      disabled={disabled}
      contentClassName={cn("arc-kit-simple-tooltip", className)}
      referenceClassName={referenceClassName}
    >
      {children}
    </Tooltip>
  );
}
