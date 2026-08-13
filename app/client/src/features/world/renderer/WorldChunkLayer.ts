import Phaser from 'phaser';
import type { WorldBaseResponse, WorldGeometryChunk, WorldHex } from '@arcanorum/shared';
import { getWorldChunk } from '../../../api/world-api.js';
import { createWorldVisualChunkLayers } from './WorldVisualChunkLayer.js';

type RenderedChunk = {
  readonly terrain: Phaser.Tilemaps.TilemapLayer;
  readonly rivers: Phaser.Tilemaps.TilemapLayer;
  readonly visuals: readonly Phaser.GameObjects.SpriteGPULayer[];
  readonly hexes: ReadonlyMap<string, WorldHex>;
};

/**
 * Streaming render projection for immutable geography. Chunks are fetched from
 * the server, checked against the selected geometry revision, then represented
 * by Phaser tilemap layers only while they remain near the camera.
 */
export class WorldChunkLayer {
  private readonly renderedChunks = new Map<string, RenderedChunk>();
  private readonly loadingChunks = new Set<string>();
  private disposed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: WorldBaseResponse,
    private readonly onFailure: (message: string) => void,
    private readonly onChunkRendered: () => void,
  ) {}

  refresh(visibleKeys: ReadonlySet<string>): void {
    if (this.disposed) {
      return;
    }
    for (const [key, rendered] of this.renderedChunks) {
      if (visibleKeys.has(key)) {
        continue;
      }
      rendered.terrain.destroy(true);
      rendered.rivers.destroy(true);
      destroyVisualLayers(rendered.visuals);
      this.renderedChunks.delete(key);
    }

    for (const key of visibleKeys) {
      if (this.renderedChunks.has(key) || this.loadingChunks.has(key)) {
        continue;
      }
      const [rawChunkQ, rawChunkR] = key.split(':');
      if (rawChunkQ === undefined || rawChunkR === undefined) {
        this.onFailure(`World chunk key is invalid: ${key}`);
        continue;
      }
      const chunkQ = Number(rawChunkQ);
      const chunkR = Number(rawChunkR);
      if (!Number.isInteger(chunkQ) || !Number.isInteger(chunkR)) {
        this.onFailure(`World chunk key is invalid: ${key}`);
        continue;
      }
      this.loadChunk(key, chunkQ, chunkR);
    }
  }

  getHex(q: number, r: number): WorldHex | undefined {
    const chunkKey = `${Math.floor(q / this.world.chunkWidth)}:${Math.floor(r / this.world.chunkHeight)}`;
    return this.renderedChunks.get(chunkKey)?.hexes.get(`${q}:${r}`);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const rendered of this.renderedChunks.values()) {
      rendered.terrain.destroy(true);
      rendered.rivers.destroy(true);
      destroyVisualLayers(rendered.visuals);
    }
    this.renderedChunks.clear();
    this.loadingChunks.clear();
  }

  private loadChunk(key: string, chunkQ: number, chunkR: number): void {
    this.loadingChunks.add(key);
    void getWorldChunk(chunkQ, chunkR)
      .then((response) => {
        this.loadingChunks.delete(key);
        if (this.disposed) {
          return;
        }
        if (
          response.worldName !== this.world.worldName ||
          response.geometryRevision !== this.world.geometryRevision
        ) {
          this.onFailure('WORLD_GEOMETRY_REVISION_CHANGED');
          return;
        }
        if (!this.scene.sys.isActive() || this.renderedChunks.has(key)) {
          return;
        }
        this.renderChunk(response.chunk);
      })
      .catch((error: unknown) => {
        this.loadingChunks.delete(key);
        if (!this.disposed && this.scene.sys.isActive()) {
          this.onFailure(error instanceof Error ? error.message : String(error));
        }
      });
  }

  private renderChunk(chunk: WorldGeometryChunk): void {
    const map = createTilemap(this.scene, this.world, chunk);
    const terrain = requiredLayer(map, 'terrain', 'world-terrain');
    const rivers = requiredLayer(map, 'rivers', 'world-river');
    const visuals = createWorldVisualChunkLayers(this.scene, this.world, chunk);
    const { atlas } = this.world.geometry.terrain;
    const x = chunk.originQ * ((atlas.frameWidth + this.world.geometry.hexSideLength) / 2);
    const y = chunk.originR * atlas.frameHeight + (chunk.originQ % 2) * (atlas.frameHeight / 2);
    terrain.setPosition(x, y).setDepth(0);
    rivers.setPosition(x, y).setDepth(1);
    this.renderedChunks.set(`${chunk.chunkQ}:${chunk.chunkR}`, {
      terrain,
      rivers,
      visuals,
      hexes: new Map(chunk.hexes.map((hex) => [`${hex.q}:${hex.r}`, hex])),
    });
    this.onChunkRendered();
  }
}

function destroyVisualLayers(layers: readonly Phaser.GameObjects.SpriteGPULayer[]): void {
  for (const layer of layers) {
    layer.destroy();
  }
}

function createTilemap(
  scene: Phaser.Scene,
  world: WorldBaseResponse,
  chunk: WorldGeometryChunk,
): Phaser.Tilemaps.Tilemap {
  const { atlas, overlays } = world.geometry.terrain;
  const riverAtlas = overlays.find((overlay) => overlay.role === 'river');
  if (riverAtlas === undefined) {
    throw new Error('World response does not define a river overlay atlas.');
  }
  const terrainFrames = new Map(
    world.geometry.terrain.terrainTypes.map((terrain) => [terrain.id, terrain.frame]),
  );
  const riverMasks = createRiverMasks(chunk);
  const data = {
    height: chunk.height,
    width: chunk.width,
    infinite: false,
    orientation: 'hexagonal',
    renderorder: 'right-down',
    staggeraxis: 'x',
    staggerindex: 'odd',
    hexsidelength: world.geometry.hexSideLength,
    tiledversion: '1.11.0',
    type: 'map',
    version: '1.10',
    tileheight: atlas.frameHeight,
    tilewidth: atlas.frameWidth,
    layers: [
      {
        data: chunk.hexes.map((hex) => {
          const frame = terrainFrames.get(hex.terrainId);
          if (frame === undefined) {
            throw new Error(`Missing terrain frame: ${hex.terrainId}`);
          }
          return frame + 1;
        }),
        height: chunk.height,
        width: chunk.width,
        id: 1,
        name: 'terrain',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        x: 0,
        y: 0,
      },
      {
        data: chunk.hexes.map((hex) => (riverMasks.get(`${hex.q}:${hex.r}`) ?? 0) + atlas.columns + 1),
        height: chunk.height,
        width: chunk.width,
        id: 2,
        name: 'rivers',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: 1,
    tilesets: [
      {
        columns: atlas.columns,
        firstgid: 1,
        image: atlas.url,
        imageheight: atlas.frameHeight,
        imagewidth: atlas.frameWidth * atlas.columns,
        margin: 0,
        name: 'world-terrain',
        spacing: 0,
        tilecount: atlas.columns,
        tileheight: atlas.frameHeight,
        tilewidth: atlas.frameWidth,
      },
      {
        columns: riverAtlas.columns,
        firstgid: atlas.columns + 1,
        image: riverAtlas.url,
        imageheight: riverAtlas.frameHeight * riverAtlas.rows,
        imagewidth: riverAtlas.frameWidth * riverAtlas.columns,
        margin: 0,
        name: 'world-river',
        spacing: 0,
        tilecount: riverAtlas.columns * riverAtlas.rows,
        tileheight: riverAtlas.frameHeight,
        tilewidth: riverAtlas.frameWidth,
      },
    ],
  };
  const parsed = Phaser.Tilemaps.Parsers.Parse(
    `world.chunk.${chunk.chunkQ}.${chunk.chunkR}`,
    Phaser.Tilemaps.Formats.TILED_JSON,
    data,
    atlas.frameWidth,
    atlas.frameHeight,
    false,
  );
  if (parsed === null) {
    throw new Error(`Chunk ${chunk.chunkQ}:${chunk.chunkR} could not be parsed.`);
  }
  const map = new Phaser.Tilemaps.Tilemap(scene, parsed);
  if (
    map.addTilesetImage('world-terrain', atlas.key, atlas.frameWidth, atlas.frameHeight, 0, 0, 1) === null ||
    map.addTilesetImage(
      'world-river',
      riverAtlas.key,
      riverAtlas.frameWidth,
      riverAtlas.frameHeight,
      0,
      0,
      atlas.columns + 1,
    ) === null
  ) {
    throw new Error('Chunk could not bind required tilesets.');
  }
  return map;
}

function requiredLayer(
  map: Phaser.Tilemaps.Tilemap,
  name: string,
  tileset: string,
): Phaser.Tilemaps.TilemapLayer {
  const layer = map.createLayer(name, tileset, 0, 0);
  if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
    throw new Error(`Chunk ${name} layer could not be created.`);
  }
  return layer;
}

function createRiverMasks(chunk: WorldGeometryChunk): ReadonlyMap<string, number> {
  const masks = new Map<string, number>();
  for (const river of chunk.rivers) {
    addRiverMask(masks, river.fromQ, river.fromR, river.toQ, river.toR);
    addRiverMask(masks, river.toQ, river.toR, river.fromQ, river.fromR);
  }
  return masks;
}

function addRiverMask(
  masks: Map<string, number>,
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
): void {
  const offsets: ReadonlyArray<readonly [number, number]> =
    fromQ % 2 === 0
      ? [
          [0, -1],
          [1, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
          [-1, -1],
        ]
      : [
          [0, -1],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
        ];
  const direction = offsets.findIndex(([q, r]) => fromQ + q === toQ && fromR + r === toR);
  if (direction === -1) {
    throw new Error(`River edge is not adjacent: ${fromQ}:${fromR} -> ${toQ}:${toR}`);
  }
  const key = `${fromQ}:${fromR}`;
  masks.set(key, (masks.get(key) ?? 0) | (1 << direction));
}
