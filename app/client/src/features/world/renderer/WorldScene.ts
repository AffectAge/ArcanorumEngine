import Phaser from 'phaser';
import type { WorldBaseResponse, WorldHex } from '@arcanorum/shared';
import { findHexCoordinateAtWorldPosition } from '../hex-picker.js';
import { MapCameraController } from './MapCameraController.js';
import { MapInputController } from './MapInputController.js';
import { WorldChunkLayer } from './WorldChunkLayer.js';

const CHUNK_REFRESH_INTERVAL_MS = 125;

/** Phaser adapter for the map only; authoritative state stays on the server. */
export class WorldScene extends Phaser.Scene {
  private cameraController: MapCameraController | undefined;
  private chunkLayer: WorldChunkLayer | undefined;
  private inputController: MapInputController | undefined;
  private pendingSelection: { readonly q: number; readonly r: number } | undefined;
  private failed = false;
  private lastChunkRefresh = 0;

  constructor(
    private readonly world: WorldBaseResponse,
    private readonly onFailure: (message: string) => void,
    private readonly onHexSelect: (hex: WorldHex) => void,
  ) {
    super({ key: 'world' });
  }

  preload(): void {
    const { atlas, overlays } = this.world.geometry.terrain;
    const riverAtlas = overlays.find((overlay) => overlay.role === 'river');
    if (riverAtlas === undefined) {
      throw new Error('World response does not define a river overlay atlas.');
    }
    this.load.spritesheet(atlas.key, atlas.url, {
      frameWidth: atlas.frameWidth,
      frameHeight: atlas.frameHeight,
    });
    this.load.spritesheet(riverAtlas.key, riverAtlas.url, {
      frameWidth: riverAtlas.frameWidth,
      frameHeight: riverAtlas.frameHeight,
    });
    for (const asset of this.world.geometry.visuals.assets) {
      this.load.image(asset.key, asset.url);
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileLoadError, this);
  }

  create(): void {
    this.cameraController = new MapCameraController(this.cameras.main, this.world);
    this.cameraController.initialize();
    this.chunkLayer = new WorldChunkLayer(
      this,
      this.world,
      (message) => this.fail(message),
      () => this.resolvePendingSelection(),
    );
    this.inputController = new MapInputController(this, {
      onPan: (deltaX, deltaY) => this.requiredCameraController().panByScreenDelta(deltaX, deltaY),
      onZoom: (pointer, deltaY) => this.requiredCameraController().zoomAt(pointer, deltaY),
      onPinch: (screenX, screenY, factor) =>
        this.requiredCameraController().zoomByFactorAt(screenX, screenY, factor),
      onClick: (pointer) => this.selectHex(pointer),
    });
    this.inputController.bind();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.refreshChunks();
  }

  override update(time: number): void {
    if (time - this.lastChunkRefresh >= CHUNK_REFRESH_INTERVAL_MS) {
      this.refreshChunks();
    }
  }

  /** Returns whether a DOM keyboard shortcut was handled by this render scene. */
  handleKeyboardShortcut(key: string): boolean {
    if (this.cameraController === undefined) {
      return false;
    }
    if (key === '0') {
      this.cameraController.reset();
      return true;
    }
    if (key === '+' || key === '=') {
      this.cameraController.zoomByFactorAtCenter(1.2);
      return true;
    }
    if (key === '-' || key === '_') {
      this.cameraController.zoomByFactorAtCenter(1 / 1.2);
      return true;
    }
    return false;
  }

  private onFileLoadError(file: Phaser.Loader.File): void {
    this.fail(`Required map asset failed to load: ${file.key}`);
  }

  private selectHex(pointer: Phaser.Input.Pointer): void {
    pointer.updateWorldPoint(this.cameras.main);
    const coordinate = findHexCoordinateAtWorldPosition(this.world.geometry, pointer.worldX, pointer.worldY);
    if (coordinate === undefined) {
      return;
    }
    const hex = this.chunkLayer?.getHex(coordinate.q, coordinate.r);
    if (hex !== undefined) {
      this.onHexSelect(hex);
      return;
    }
    this.pendingSelection = coordinate;
  }

  private resolvePendingSelection(): void {
    const coordinate = this.pendingSelection;
    if (coordinate === undefined) {
      return;
    }
    const hex = this.chunkLayer?.getHex(coordinate.q, coordinate.r);
    if (hex === undefined) {
      return;
    }
    this.pendingSelection = undefined;
    this.onHexSelect(hex);
  }

  private refreshChunks(): void {
    this.lastChunkRefresh = this.time.now;
    this.chunkLayer?.refresh(this.requiredCameraController().getVisibleChunkKeys());
  }

  private onShutdown(): void {
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileLoadError, this);
    this.inputController?.dispose();
    this.inputController = undefined;
    this.chunkLayer?.dispose();
    this.chunkLayer = undefined;
    this.cameraController = undefined;
    this.pendingSelection = undefined;
  }

  private requiredCameraController(): MapCameraController {
    if (this.cameraController === undefined) {
      throw new Error('World camera controller is not initialized.');
    }
    return this.cameraController;
  }

  private fail(message: string): void {
    if (!this.failed) {
      this.failed = true;
      this.onFailure(message);
      this.scene.stop();
    }
  }
}
