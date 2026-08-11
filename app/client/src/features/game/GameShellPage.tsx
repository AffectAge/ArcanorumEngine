import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../state/auth-store.js';
import { Button } from '../../ui/Button.js';

export function GameShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const player = useAuthStore((state) => state.player);
  const logout = useAuthStore((state) => state.logout);
  const logoutAll = useAuthStore((state) => state.logoutAll);

  if (player === undefined) {
    return null;
  }

  async function leaveCurrentSession(): Promise<void> {
    await logout();
    await navigate('/login', { replace: true });
  }

  async function leaveAllSessions(): Promise<void> {
    await logoutAll();
    await navigate('/login', { replace: true });
  }

  return (
    <main className="game-shell" aria-label={t('game.shellLabel')}>
      <header className="game-shell__header">
        <div>
          <p className="game-shell__eyebrow">{t('app.name')}</p>
          <dl className="game-shell__identity">
            <div>
              <dt>{t('game.player')}</dt>
              <dd>{player.login}</dd>
            </div>
            <div>
              <dt>{t('game.country')}</dt>
              <dd>{player.countryName}</dd>
            </div>
          </dl>
        </div>
        <div className="game-shell__actions">
          <Button type="button" variant="secondary" onClick={() => void leaveCurrentSession()}>
            {t('auth.actions.logout')}
          </Button>
          <Button type="button" variant="danger" onClick={() => void leaveAllSessions()}>
            {t('auth.actions.logoutAll')}
          </Button>
        </div>
      </header>
    </main>
  );
}
