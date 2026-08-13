import type Phaser from 'phaser';
import type { WorldBaseResponse } from '@arcanorum/shared';

const INITIAL_CAMERA_ZOOM = 0.55;
const MINIMUM_CAMERA_ZOOM = 0.15;
const MAXIMUM_CAMERA_ZOOM = 1.75;

/** Presentation-only camera state. It has no authority over world geometry. */
export class MapCameraController {
  private readonly mapWidthInPixels: number;
  private readonly mapHeightInPixels: number;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly world: WorldBaseResponse,
  ) {
    const { atlas } = world.geometry.terrain;
    const horizontalStep = (atlas.frameWidth + world.geometry.hexSideLength) / 2;
    this.mapWidthInPixels = (world.geometry.width - 1) * horizontalStep + atlas.frameWidth;
    this.mapHeightInPixels = world.geometry.height * atlas.frameHeight + atlas.frameHeight / 2;
  }

  initialize(): void {
    this.camera
      .setBounds(0, 0, this.mapWidthInPixels, this.mapHeightInPixels)
      .setRoundPixels(true)
      .centerOn(this.mapWidthInPixels / 2, this.mapHeightInPixels / 2)
      .setZoom(INITIAL_CAMERA_ZOOM);
  }

  reset(): void {
    this.camera.centerOn(this.mapWidthInPixels / 2, this.mapHeightInPixels / 2).setZoom(INITIAL_CAMERA_ZOOM);
  }

  panByScreenDelta(deltaX: number, deltaY: number): void {
    this.camera.setScroll(
      this.camera.scrollX - deltaX / this.camera.zoom,
      this.camera.scrollY - deltaY / this.camera.zoom,
    );
  }

  zoomAt(pointer: Phaser.Input.Pointer, deltaY: number): void {
    this.zoomAtScreenPoint(
      pointer.x,
      pointer.y,
      this.camera.zoom * Math.exp(-Math.max(-400, Math.min(400, deltaY)) * 0.002),
    );
  }

  zoomByFactorAt(screenX: number, screenY: number, factor: number): void {
    this.zoomAtScreenPoint(screenX, screenY, this.camera.zoom * factor);
  }

  zoomByFactorAtCenter(factor: number): void {
    this.zoomAtScreenPoint(this.camera.width / 2, this.camera.height / 2, this.camera.zoom * factor);
  }

  private zoomAtScreenPoint(screenX: number, screenY: number, targetZoom: number): void {
    const zoom = Math.max(MINIMUM_CAMERA_ZOOM, Math.min(MAXIMUM_CAMERA_ZOOM, targetZoom));
    const before = this.camera.getWorldPoint(screenX, screenY);
    this.camera.setZoom(zoom);
    const after = this.camera.getWorldPoint(screenX, screenY);
    this.camera.setScroll(this.camera.scrollX + before.x - after.x, this.camera.scrollY + before.y - after.y);
  }

  getVisibleChunkKeys(): Set<string> {
    const { atlas } = this.world.geometry.terrain;
    const horizontalStep = (atlas.frameWidth + this.world.geometry.hexSideLength) / 2;
    const view = this.camera.worldView;
    const minQ = Math.max(0, Math.floor(view.x / horizontalStep) - 2);
    const maxQ = Math.min(
      this.world.geometry.width - 1,
      Math.ceil((view.x + view.width) / horizontalStep) + 2,
    );
    const minR = Math.max(0, Math.floor(view.y / atlas.frameHeight) - 2);
    const maxR = Math.min(
      this.world.geometry.height - 1,
      Math.ceil((view.y + view.height) / atlas.frameHeight) + 2,
    );
    const result = new Set<string>();

    for (
      let chunkQ = Math.floor(minQ / this.world.chunkWidth);
      chunkQ <= Math.floor(maxQ / this.world.chunkWidth);
      chunkQ += 1
    ) {
      for (
        let chunkR = Math.floor(minR / this.world.chunkHeight);
        chunkR <= Math.floor(maxR / this.world.chunkHeight);
        chunkR += 1
      ) {
        result.add(`${chunkQ}:${chunkR}`);
      }
    }
    return result;
  }
}
