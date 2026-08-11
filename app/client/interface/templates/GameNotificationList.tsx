import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./classNames";

export type GameNotificationItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  dismissLabel: string;
};

type GameNotificationListProps = {
  title: ReactNode;
  showAllLabel?: ReactNode;
  notifications: GameNotificationItem[];
  onDismiss?: (id: string) => void;
  className?: string;
};

export function GameNotificationList({ title, showAllLabel, notifications, onDismiss, className = "" }: GameNotificationListProps) {
  return (
    <section className={cn("arc-kit-panel", className)}>
      <h3 className="arc-kit-section-title">{title}</h3>
      <div className="grid gap-1.5">
        {notifications.map((notification) => (
          <div key={notification.id} className="arc-kit-notification-row">
            <span className="flex min-w-0 items-center gap-2">
              {notification.icon ? <span className="text-[var(--arc-color-gold)]">{notification.icon}</span> : null}
              <span className="truncate">{notification.label}</span>
            </span>
            {onDismiss ? (
              <button type="button" className="arc-kit-icon-button arc-kit-icon-button--compact" aria-label={notification.dismissLabel} onClick={() => onDismiss(notification.id)}>
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {showAllLabel ? <button type="button" className="arc-kit-panel__full-action">{showAllLabel}</button> : null}
    </section>
  );
}
