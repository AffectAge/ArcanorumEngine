import type { ReactNode, WheelEventHandler } from "react";
import { cn } from "./classNames";

export type GameTabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

type GameTabsProps = {
  tabs: GameTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  onWheel?: WheelEventHandler<HTMLDivElement>;
  ariaLabel: string;
  className?: string;
};

export function GameTabs({ tabs, activeId, onChange, onWheel, ariaLabel, className = "" }: GameTabsProps) {
  return (
    <div className={cn("arc-kit-tabs", className)} role="tablist" aria-label={ariaLabel} onWheel={onWheel}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn("arc-kit-tab", active && "arc-kit-tab--active")}
          >
            {tab.icon ? <span className="arc-kit-tab__icon">{tab.icon}</span> : null}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
