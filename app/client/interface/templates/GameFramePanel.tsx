import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";

type GameFramePanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function GameFramePanel({ children, className = "", ...props }: GameFramePanelProps) {
  return (
    <div {...props} className={cn("arc-kit-frame-panel", className)}>
      {children}
    </div>
  );
}
