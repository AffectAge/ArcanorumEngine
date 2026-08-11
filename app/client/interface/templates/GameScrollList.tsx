import type { ReactNode } from "react";

export type GameScrollListItem = {
  id: string;
  label: ReactNode;
  value?: ReactNode;
};

type GameScrollListProps = {
  ariaLabel: string;
  items: GameScrollListItem[];
};

export function GameScrollList({ ariaLabel, items }: GameScrollListProps) {
  return (
    <div className="arc-kit-scroll-demo">
      <div className="arc-kit-scroll-demo__content arc-scrollbar" role="list" aria-label={ariaLabel}>
        {items.map((item) => (
          <div key={item.id} className="arc-kit-scroll-demo__row" role="listitem">
            <span>{item.label}</span>
            {item.value ? <strong>{item.value}</strong> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
