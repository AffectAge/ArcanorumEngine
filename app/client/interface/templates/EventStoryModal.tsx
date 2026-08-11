import { Dialog } from "@headlessui/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useUiText } from "../../i18n/useUiText";

type EventStoryOption = {
  id: string;
  label: string;
  description?: string | null;
  effects?: string[];
  buttonColor?: string | null;
  buttonTone?: "default" | "primary" | "danger" | "warning" | null;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
};

type EventStoryModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  quote?: string | null;
  imageUrl?: string | null;
  imageCaption?: string | null;
  categoryLabel?: string | null;
  importantLabel?: string | null;
  accentColor?: string | null;
  options?: EventStoryOption[];
  emptyState?: ReactNode;
  zIndexClassName?: string;
};

export function EventStoryModal({
  open,
  onClose,
  title,
  subtitle,
  body,
  quote,
  imageUrl,
  imageCaption,
  categoryLabel,
  importantLabel,
  accentColor = "var(--arc-color-gold)",
  options = [],
  emptyState,
  zIndexClassName = "z-[190]",
}: EventStoryModalProps) {
  const { t } = useUiText();

  return (
    <Dialog open={open} onClose={onClose} className={`arc-modal arc-modal--events relative ${zIndexClassName}`}>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 bg-[var(--arc-modal-backdrop)] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4 md:p-8">
        <Dialog.Panel
          as={motion.div}
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.99 }}
          className="relative flex max-h-[min(88vh,760px)] w-[min(94vw,1120px)] flex-col overflow-hidden rounded-xl border border-[var(--arc-color-gold-soft)] bg-[var(--arc-color-panel)] shadow-[var(--arc-shadow-panel)]"
        >
          <div className="pointer-events-none absolute inset-0 opacity-20 [background:var(--arc-modal-ornament)]" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1"
            style={{ background: `linear-gradient(90deg, transparent, ${accentColor ?? "var(--arc-color-gold)"}, transparent)` }}
          />
          <div className="relative z-10 border-b border-[var(--arc-color-gold-soft)] bg-gradient-to-b from-[var(--arc-color-header-top)] to-[var(--arc-color-header-bottom)] px-12 py-4 text-center">
            <Dialog.Title className="font-display text-2xl font-semibold tracking-wide text-[var(--arc-color-text)]">{title}</Dialog.Title>
            {subtitle ? <div className="mt-1 text-sm text-[var(--arc-color-text-soft)]">{subtitle}</div> : null}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--arc-color-gold)] bg-[var(--arc-overlay-30)] text-[var(--arc-color-gold)] transition hover:bg-[var(--arc-overlay-50)]"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative z-10 grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.05fr)]">
            <div className="relative min-h-[260px] border-b border-[var(--arc-color-gold-soft)] bg-[var(--arc-color-panel-soft)] lg:border-b-0 lg:border-r">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[260px] items-center justify-center bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--arc-color-gold)_20%,transparent),color-mix(in_srgb,var(--arc-color-panel-soft)_96%,black)_70%)]">
                  <Sparkles size={78} className="text-[var(--arc-color-gold)]" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex flex-wrap gap-2">
                  {categoryLabel ? (
                    <span className="rounded-md border border-[var(--arc-color-gold)] bg-[var(--arc-overlay-45)] px-2 py-1 text-[11px] text-[var(--arc-color-text-soft)]">
                      {categoryLabel}
                    </span>
                  ) : null}
                  {importantLabel ? (
                    <span className="rounded-md border border-[var(--arc-color-gold)] bg-[var(--arc-color-gold)] px-2 py-1 text-[11px] text-[var(--arc-color-text-paper)]">
                      {importantLabel}
                    </span>
                  ) : null}
                </div>
                {imageCaption ? <div className="mt-2 text-xs text-[var(--arc-color-text-soft)]">{imageCaption}</div> : null}
              </div>
            </div>

            <div className="arc-scrollbar min-h-0 overflow-auto bg-[var(--arc-color-paper)] p-5 text-[var(--arc-color-text-paper)]">
              {emptyState ?? (
                <>
                  {body ? <div className="text-base leading-7 text-[var(--arc-color-text-paper)]">{body}</div> : null}
                  {quote ? (
                    <div className="mt-5 border-y border-[var(--arc-color-brown)] py-4 text-sm italic leading-6 text-[var(--arc-color-text-muted)]">
                      {quote}
                    </div>
                  ) : null}
                  <div className="mt-6 grid gap-3">
                    {options.map((option) => {
                      const buttonColor = option.buttonColor && /^#[0-9A-Fa-f]{6}$/.test(option.buttonColor) ? option.buttonColor : "var(--arc-color-primary-top)";
                      const toneClassName = getEventButtonToneClassName(option.buttonTone ?? "default");
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={option.disabled}
                          onClick={option.onClick}
                          style={
                            option.buttonTone
                              ? undefined
                              : {
                                  backgroundColor: `${buttonColor}cc`,
                                  borderColor: `${buttonColor}aa`,
                                }
                          }
                          className={`group rounded-lg border px-4 py-3 text-center shadow-[var(--arc-shadow-inset-button)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${toneClassName}`}
                        >
                          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--arc-color-text)]">
                            <CheckCircle2 size={15} className="text-[var(--arc-color-gold)]" />
                            {option.pending ? t("common.pending") : option.label}
                          </div>
                          {option.description ? <div className="mt-1 text-xs leading-5 text-[var(--arc-color-text-soft)]">{option.description}</div> : null}
                          {option.effects && option.effects.length > 0 ? (
                            <div className="mt-2 text-xs text-[var(--arc-color-text-soft)]">{option.effects.join(", ")}</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

function getEventButtonToneClassName(tone: NonNullable<EventStoryOption["buttonTone"]>): string {
  if (tone === "primary") {
    return "border-[var(--arc-color-gold)] bg-[var(--arc-color-primary-top)]";
  }
  if (tone === "danger") {
    return "border-[var(--arc-color-danger-border)] bg-[var(--arc-color-danger-top)]";
  }
  if (tone === "warning") {
    return "border-[var(--arc-color-warning-border)] bg-[var(--arc-color-warning-top)]";
  }
  return "border-[var(--arc-color-gold-soft)] bg-[var(--arc-overlay-45)]";
}
