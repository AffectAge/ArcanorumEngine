import type { ReactNode } from "react";
import { X } from "lucide-react";
import { AppButton } from "./AppButton";
import { cn } from "./classNames";
import { GameChoiceGrid, type GameChoiceItem } from "./GameChoiceGrid";
export type { GameChoiceEffect, GameChoiceItem } from "./GameChoiceGrid";

type GameChoiceModalProps = {
  title: ReactNode;
  description?: ReactNode;
  choices: GameChoiceItem[];
  selectedId: string;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  selectedLabel?: ReactNode;
  closeLabel: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};

export function GameChoiceModal({
  title,
  description,
  choices,
  selectedId,
  confirmLabel,
  cancelLabel,
  selectedLabel,
  closeLabel,
  onSelect,
  onConfirm,
  onCancel,
  className = "",
}: GameChoiceModalProps) {
  return (
    <section className={cn("arc-kit-modal", className)} aria-labelledby="game-choice-modal-title">
      <button type="button" className="arc-kit-modal__close" aria-label={closeLabel} onClick={onCancel}>
        <X size={18} aria-hidden="true" />
      </button>
      <header className="arc-kit-modal__header">
        <h2 id="game-choice-modal-title">{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <GameChoiceGrid choices={choices} selectedId={selectedId} selectedLabel={selectedLabel} onSelect={onSelect} />
      <footer className="arc-kit-modal__actions">
        <AppButton type="button" variant="primary" size="lg" onClick={onConfirm} sound="action.confirm">
          {confirmLabel}
        </AppButton>
        <AppButton type="button" variant="ghost" size="lg" onClick={onCancel} sound="action.reject">
          {cancelLabel}
        </AppButton>
      </footer>
    </section>
  );
}
