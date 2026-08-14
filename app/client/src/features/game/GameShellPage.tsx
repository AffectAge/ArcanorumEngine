import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldBaseResponse, WorldHex } from '@arcanorum/shared';
import { connectGameEventStream } from '../../api/game-events.js';
import { getGameSnapshot, getWorldBase, joinGame } from '../../api/world-api.js';
import { useAuthStore } from '../../state/auth-store.js';
import { useGameStore } from '../../state/game-store.js';
import { Button } from '../../ui/Button.js';
import { HexTooltip } from '../world/HexTooltip.js';
import { WorldRenderer } from '../world/WorldRenderer.js';

export function GameShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const player = useAuthStore((state) => state.player);
  const logout = useAuthStore((state) => state.logout);
  const logoutAll = useAuthStore((state) => state.logoutAll);
  const setGameSnapshot = useGameStore((state) => state.setSnapshot);
  const applyGameEvents = useGameStore((state) => state.applyEvents);
  const clearGameState = useGameStore((state) => state.clear);
  const [world, setWorld] = useState<WorldBaseResponse | undefined>();
  const [worldError, setWorldError] = useState<string | undefined>();
  const [selectedHex, setSelectedHex] = useState<WorldHex | undefined>();
  const [joinedWorld, setJoinedWorld] = useState(false);

  const resyncGameSnapshot = useCallback((): void => {
    void getGameSnapshot()
      .then(setGameSnapshot)
      .catch((error: unknown) => {
        setWorldError(error instanceof Error ? error.message : String(error));
      });
  }, [setGameSnapshot]);

  useEffect(() => {
    let active = true;

    void Promise.all([getWorldBase(), joinGame()])
      .then(([loadedWorld, snapshot]) => {
        if (active) {
          setWorld(loadedWorld);
          setSelectedHex(undefined);
          setGameSnapshot(snapshot);
          setJoinedWorld(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setWorldError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!joinedWorld) {
      return undefined;
    }

    return connectGameEventStream({
      onSnapshot: setGameSnapshot,
      onEvents: (events) => {
        if (!applyGameEvents(events)) {
          resyncGameSnapshot();
        }
      },
      onError: () => undefined,
    });
  }, [applyGameEvents, joinedWorld, resyncGameSnapshot, setGameSnapshot]);

  if (player === undefined) {
    return null;
  }

  async function leaveCurrentSession(): Promise<void> {
    await logout();
    clearGameState();
    await navigate('/login', { replace: true });
  }

  async function leaveAllSessions(): Promise<void> {
    await logoutAll();
    clearGameState();
    await navigate('/login', { replace: true });
  }

  const selectHex = useCallback((hex: WorldHex): void => {
    setSelectedHex(hex);
  }, []);

  return (
    <main className="game-shell" aria-label={t('game.shellLabel')}>
      <section className="game-shell__map-region" aria-label={t('game.map.regionLabel')}>
        {worldError === undefined && world === undefined ? (
          <p className="game-shell__map-status" aria-live="polite">
            {t('game.map.loading')}
          </p>
        ) : null}
        {worldError !== undefined ? (
          <p className="game-shell__map-error" role="alert">
            {t('game.map.error')}: {worldError}
          </p>
        ) : null}
        {world === undefined ? null : (
          <WorldRenderer
            world={world}
            ariaLabel={t('game.map.canvasLabel', { worldName: world.worldName })}
            failureLabel={t('game.map.renderError')}
            onHexSelect={selectHex}
          />
        )}
      </section>
      {world === undefined || selectedHex === undefined ? null : (
        <HexTooltip hex={selectedHex} world={world} />
      )}
      <header className="game-shell__hud">
        <div className="game-shell__identity-panel">
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
