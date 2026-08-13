import type Phaser from 'phaser';
import type { WorldBaseResponse, WorldGeometryChunk } from '@arcanorum/shared';
import { compileVisualChunkPlan } from '../visual/compile-visual-chunk-plan.js';

/** Creates GPU-batched, immutable visual decorations for a streamed world chunk. */
export function createWorldVisualChunkLayers(
  scene: Phaser.Scene,
  world: WorldBaseResponse,
  chunk: WorldGeometryChunk,
): readonly Phaser.GameObjects.SpriteGPULayer[] {
  const plan = compileVisualChunkPlan(world, chunk);
  const { frameHeight, frameWidth } = world.geometry.terrain.atlas;
  const horizontalStep = (frameWidth + world.geometry.hexSideLength) / 2;

  return plan.layers.map((layerPlan) => {
    const layer = scene.add.spriteGPULayer(layerPlan.assetKey, layerPlan.sprites.length);
    layer
      .setDepth(layerPlan.depth)
      .setName(`world-visual:${chunk.chunkQ}:${chunk.chunkR}:${layerPlan.layerId}`);
    for (const sprite of layerPlan.sprites) {
      const x = sprite.q * horizontalStep + frameWidth / 2 + sprite.offsetX;
      const y =
        sprite.r * frameHeight + (sprite.q % 2) * (frameHeight / 2) + frameHeight / 2 + sprite.offsetY;
      const tint = sprite.tint ?? 0xffffff;
      layer.addMember({
        x,
        y,
        scaleX: sprite.scalePermille / 1000,
        scaleY: sprite.scalePermille / 1000,
        originX: 0.5,
        originY: 0.85,
        alpha: sprite.alphaPermille / 1000,
        tintBlend: sprite.tint === undefined ? 0 : 1,
        tintBottomLeft: tint,
        tintTopLeft: tint,
        tintBottomRight: tint,
        tintTopRight: tint,
      });
    }
    return layer;
  });
}
