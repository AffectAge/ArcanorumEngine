import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type AuthShellProps = {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  const { t } = useTranslation();

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="auth-panel__eyebrow">{t('app.name')}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-panel__description">{description}</p>
        {children}
        <footer className="auth-panel__footer">{footer}</footer>
      </section>
    </main>
  );
}
