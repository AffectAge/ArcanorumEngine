import { Dialog } from "@headlessui/react";
import { motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AppButton } from "./AppButton";
import { playUiSound } from "../../lib/audio/uiSoundService";

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  modalKey?: string;
  className?: string;
  panelClassName?: string;
  zIndexClassName?: string;
  paddingClassName?: string;
};

type AppModalHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
};

export function AppModal({
  open,
  onClose,
  children,
  modalKey,
  className = "",
  panelClassName = "",
  zIndexClassName = "z-[205]",
  paddingClassName = "p-4 md:p-6",
}: AppModalProps) {
  const modalClassName = modalKey ? `arc-modal arc-modal--${modalKey}` : "arc-modal";

  useEffect(() => {
    if (open) playUiSound("modal.open");
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} className={`relative ${zIndexClassName} ${modalClassName} ${className}`}>
      <motion.div aria-hidden="true" className="fixed inset-0 bg-[var(--arc-modal-backdrop)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className={`fixed inset-0 ${paddingClassName}`}>
        <Dialog.Panel
          as={motion.div}
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.99 }}
          className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--arc-modal-border)] bg-[var(--arc-modal-panel)] p-4 shadow-[var(--arc-shadow-panel)] ${panelClassName}`}
        >
          <div className="pointer-events-none absolute inset-0 opacity-20 [background:var(--arc-modal-ornament)]" />
          {children}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export function AppModalHeader({ title, description, actions, onClose, closeDisabled = false }: AppModalHeaderProps) {
  return (
    <div className="arc-modal-header relative z-10 mb-3 rounded-xl border border-[var(--arc-modal-border)] bg-gradient-to-b from-[var(--arc-modal-header-top)] to-[var(--arc-modal-header-bottom)] px-4 py-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Dialog.Title className="arc-modal-header-title font-display truncate text-2xl tracking-wide text-[var(--arc-modal-text)]">{title}</Dialog.Title>
          {description ? <span className="arc-modal-header-description mt-1 block text-xs text-[var(--arc-modal-text-soft)]">{description}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <AppButton
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={closeDisabled}
            sound="modal.close"
            className="arc-modal-close-button border-[var(--arc-modal-close-border)] bg-[var(--arc-modal-close-bg)] text-[var(--arc-modal-close-text)] hover:border-[var(--arc-modal-close-hover-border)] hover:bg-[var(--arc-modal-close-hover-bg)] hover:text-[var(--arc-modal-close-hover-text)]"
          >
            <X size={16} />
          </AppButton>
        </div>
      </div>
    </div>
  );
}
