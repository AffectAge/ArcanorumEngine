import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { WorldBaseResponse, WorldHex } from '@arcanorum/shared';
import { WorldScene } from './renderer/WorldScene.js';

type WorldRendererProps = {
  readonly world: WorldBaseResponse;
  readonly ariaLabel: string;
  readonly failureLabel: string;
  readonly onHexSelect: (hex: WorldHex) => void;
};

/** React lifecycle bridge; the scene owns all Phaser rendering details. */
export function WorldRenderer({ world, ariaLabel, failureLabel, onHexSelect }: WorldRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | undefined>(undefined);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const parent = rootRef.current;
    if (parent === null) {
      throw new Error('World renderer root is missing.');
    }
    setError(undefined);
    const scene = new WorldScene(world, (message) => setError(message), onHexSelect);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#000000',
      scene: [scene],
      input: { activePointers: 2 },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, roundPixels: true },
    });
    return () => {
      game.destroy(true);
      if (sceneRef.current === scene) {
        sceneRef.current = undefined;
      }
      parent.replaceChildren();
    };
  }, [world, onHexSelect]);

  if (error !== undefined) {
    return (
      <p className="world-renderer__error" role="alert">
        {failureLabel}: {error}
      </p>
    );
  }
  return (
    <div
      ref={rootRef}
      className="world-renderer"
      role="application"
      aria-label={ariaLabel}
      aria-keyshortcuts="0 + -"
      tabIndex={0}
      onPointerDown={() => rootRef.current?.focus()}
      onKeyDown={(event) => {
        if (sceneRef.current?.handleKeyboardShortcut(event.key)) {
          event.preventDefault();
        }
      }}
    />
  );
}
