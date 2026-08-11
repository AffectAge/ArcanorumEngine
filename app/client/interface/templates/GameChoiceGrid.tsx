import type { CSSProperties, ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "./classNames";

export type GameChoiceEffect = {
  id: string;
  label: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  labelColor?: string;
  valueColor?: string;
};

export type GameChoiceItem = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  effects?: Array<ReactNode | GameChoiceEffect>;
  disabled?: boolean;
  accentColor?: string;
};

type GameChoiceGridProps = {
  choices: GameChoiceItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  selectedLabel?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

export function GameChoiceGrid({ choices, selectedId, onSelect, selectedLabel, ariaLabel, className = "" }: GameChoiceGridProps) {
  return (
    <div className={cn("arc-kit-choice-grid", className)} role={ariaLabel ? "listbox" : undefined} aria-label={ariaLabel}>
      {choices.map((choice) => {
        const selected = choice.id === selectedId;
        const style = choice.accentColor
          ? ({ "--arc-kit-choice-accent": choice.accentColor } as CSSProperties)
          : undefined;
        return (
          <button
            key={choice.id}
            type="button"
            className={cn("arc-kit-choice-card", selected && "arc-kit-choice-card--selected")}
            style={style}
            disabled={choice.disabled}
            onClick={() => onSelect(choice.id)}
            aria-pressed={selected}
            role={ariaLabel ? "option" : undefined}
            aria-selected={ariaLabel ? selected : undefined}
          >
            {selected ? (
              <span className="arc-kit-choice-card__check">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
            ) : null}
            {choice.icon ? <span className="arc-kit-choice-card__icon">{choice.icon}</span> : null}
            <span className="arc-kit-choice-card__title">{choice.title}</span>
            <span className="arc-kit-choice-card__description">{choice.description}</span>
            {choice.effects?.length ? (
              <span className="arc-kit-choice-card__effects">
                {choice.effects.map((effect, index) => renderChoiceEffect(effect, index))}
              </span>
            ) : null}
            {selected && selectedLabel ? <span className="arc-kit-choice-card__action">{selectedLabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function renderChoiceEffect(effect: ReactNode | GameChoiceEffect, index: number) {
  if (!isChoiceEffect(effect)) return <span key={index}>{effect}</span>;
  const style = {
    ...(effect.labelColor ? { "--arc-kit-choice-effect-label-color": effect.labelColor } : {}),
    ...(effect.valueColor ? { "--arc-kit-choice-effect-value-color": effect.valueColor } : {}),
  } as CSSProperties;
  return (
    <span key={effect.id} className="arc-kit-choice-effect-row" style={style}>
      <span className="arc-kit-choice-effect-row__label">
        {effect.icon ? <span className="arc-kit-choice-effect-row__icon">{effect.icon}</span> : null}
        <span>{effect.label}</span>
      </span>
      {effect.value ? <strong>{effect.value}</strong> : null}
    </span>
  );
}

function isChoiceEffect(effect: ReactNode | GameChoiceEffect): effect is GameChoiceEffect {
  return typeof effect === "object" && effect != null && "label" in effect;
}
