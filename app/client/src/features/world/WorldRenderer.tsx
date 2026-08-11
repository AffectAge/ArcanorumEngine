import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { WorldMapResponse } from '@arcanorum/shared';

type WorldRendererProps = {
  readonly world: WorldMapResponse;
  readonly ariaLabel: string;
  readonly failureLabel: string;
};

export function WorldRenderer({ world, ariaLabel, failureLabel }: WorldRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const parent = rootRef.current;
    if (parent === null) {
      throw new Error('World renderer root is missing.');
    }

    setError(undefined);
    const game = createWorldGame(parent, world, (message) => setError(message));

    return () => {
      game.destroy(true);
      parent.replaceChildren();
    };
  }, [world]);

  if (error !== undefined) {
    return (
      <p className="world-renderer__error" role="alert">
        {failureLabel}: {error}
      </p>
    );
  }

  return <div ref={rootRef} className="world-renderer" role="img" aria-label={ariaLabel} />;
}

function createWorldGame(
  parent: HTMLDivElement,
  world: WorldMapResponse,
  onFailure: (message: string) => void,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#000000',
    scene: [new WorldScene(world, onFailure)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      roundPixels: true,
    },
  });
}

class WorldScene extends Phaser.Scene {
  private failed = false;
  private dragPointerId: number | undefined;
  private dragOrigin:
    | { readonly x: number; readonly y: number; readonly scrollX: number; readonly scrollY: number }
    | undefined;

  constructor(
    private readonly world: WorldMapResponse,
    private readonly onFailure: (message: string) => void,
  ) {
    super({ key: 'world' });
  }

  preload(): void {
    const { atlas } = this.world.map.terrain;
    const riverAtlas = requiredRiverAtlas(this.world);

    this.load.spritesheet(atlas.key, atlas.url, {
      frameWidth: atlas.frameWidth,
      frameHeight: atlas.frameHeight,
    });
    this.load.spritesheet(riverAtlas.key, riverAtlas.url, {
      frameWidth: riverAtlas.frameWidth,
      frameHeight: riverAtlas.frameHeight,
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.fail(`Required map asset failed to load: ${file.key}`);
    });
  }

  create(): void {
    if (this.failed) {
      return;
    }

    try {
      const map = createTilemap(this, this.world);
      const terrainLayer = createTerrainLayer(map, this.world);
      const riverLayer = createRiverLayer(map, this.world);

      terrainLayer.setDepth(0);
      riverLayer.setDepth(1);
      this.configureCamera(map);
      this.bindPanningInput();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private configureCamera(map: Phaser.Tilemaps.Tilemap): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    camera.setZoom(0.55);
    camera.setRoundPixels(true);
  }

  private bindPanningInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragPointerId = pointer.id;
      this.dragOrigin = {
        x: pointer.x,
        y: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== pointer.id || this.dragOrigin === undefined || !pointer.isDown) {
        return;
      }

      const zoom = this.cameras.main.zoom;
      this.cameras.main.setScroll(
        this.dragOrigin.scrollX - (pointer.x - this.dragOrigin.x) / zoom,
        this.dragOrigin.scrollY - (pointer.y - this.dragOrigin.y) / zoom,
      );
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.dragPointerId === pointer.id) {
        this.dragPointerId = undefined;
        this.dragOrigin = undefined;
      }
    });
  }

  private onShutdown(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN);
    this.input.off(Phaser.Input.Events.POINTER_MOVE);
    this.input.off(Phaser.Input.Events.POINTER_UP);
    this.tweens.killAll();
  }

  private fail(message: string): void {
    if (this.failed) {
      return;
    }
    this.failed = true;
    console.error(message);
    this.onFailure(message);
    this.scene.stop();
  }
}

function createTilemap(scene: Phaser.Scene, world: WorldMapResponse): Phaser.Tilemaps.Tilemap {
  const atlas = world.map.terrain.atlas;
  const riverAtlas = requiredRiverAtlas(world);
  const mapData = Phaser.Tilemaps.Parsers.Parse(
    'world.generated',
    Phaser.Tilemaps.Formats.TILED_JSON,
    createTiledMapData(world),
    atlas.frameWidth,
    atlas.frameHeight,
    false,
  );

  if (mapData === null) {
    throw new Error('Generated world could not be parsed into a Phaser Tilemap.');
  }

  const map = new Phaser.Tilemaps.Tilemap(scene, mapData);
  const terrainTileset = map.addTilesetImage(
    'world-terrain',
    atlas.key,
    atlas.frameWidth,
    atlas.frameHeight,
    0,
    0,
    1,
  );
  const riverTileset = map.addTilesetImage(
    'world-river',
    riverAtlas.key,
    riverAtlas.frameWidth,
    riverAtlas.frameHeight,
    0,
    0,
    atlas.columns + 1,
  );

  if (terrainTileset === null || riverTileset === null) {
    throw new Error('Generated world could not bind its required tile atlas.');
  }

  return map;
}

function createTerrainLayer(
  map: Phaser.Tilemaps.Tilemap,
  world: WorldMapResponse,
): Phaser.Tilemaps.TilemapLayer {
  const layer = map.createLayer('terrain', 'world-terrain', 0, 0);
  if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
    throw new Error('Generated world terrain layer could not be created.');
  }
  return layer;
}

function createRiverLayer(
  map: Phaser.Tilemaps.Tilemap,
  world: WorldMapResponse,
): Phaser.Tilemaps.TilemapLayer {
  const layer = map.createLayer('rivers', 'world-river', 0, 0);
  if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
    throw new Error('Generated world river layer could not be created.');
  }
  return layer;
}

function createTiledMapData(world: WorldMapResponse): object {
  const { map } = world;
  const terrainFrameById = new Map(
    map.terrain.terrainTypes.map((terrainType) => [terrainType.id, terrainType.frame]),
  );
  const riverMasks = createRiverMasks(world);
  const terrainData = map.hexes.map((hex) => {
    const frame = terrainFrameById.get(hex.terrainId);
    if (frame === undefined) {
      throw new Error(`Map references terrain without an atlas frame: ${hex.terrainId}`);
    }
    return frame + 1;
  });
  const riverData = map.hexes.map(
    (hex) => (riverMasks.get(`${hex.q}:${hex.r}`) ?? 0) + map.terrain.atlas.columns + 1,
  );
  const riverAtlas = requiredRiverAtlas(world);

  return {
    compressionlevel: -1,
    height: map.height,
    width: map.width,
    infinite: false,
    layers: [
      {
        data: terrainData,
        height: map.height,
        id: 1,
        name: 'terrain',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: map.width,
        x: 0,
        y: 0,
      },
      {
        data: riverData,
        height: map.height,
        id: 2,
        name: 'rivers',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: map.width,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: 1,
    orientation: 'hexagonal',
    renderorder: 'right-down',
    staggeraxis: map.staggerAxis,
    staggerindex: map.staggerIndex,
    hexsidelength: map.hexSideLength,
    tiledversion: '1.11.0',
    tileheight: map.terrain.atlas.frameHeight,
    tilewidth: map.terrain.atlas.frameWidth,
    type: 'map',
    version: '1.10',
    tilesets: [
      {
        columns: map.terrain.atlas.columns,
        firstgid: 1,
        image: map.terrain.atlas.url,
        imageheight: map.terrain.atlas.frameHeight,
        imagewidth: map.terrain.atlas.frameWidth * map.terrain.atlas.columns,
        margin: 0,
        name: 'world-terrain',
        spacing: 0,
        tilecount: map.terrain.atlas.columns,
        tileheight: map.terrain.atlas.frameHeight,
        tilewidth: map.terrain.atlas.frameWidth,
      },
      {
        columns: riverAtlas.columns,
        firstgid: map.terrain.atlas.columns + 1,
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
}

function createRiverMasks(world: WorldMapResponse): ReadonlyMap<string, number> {
  const masks = new Map<string, number>();

  for (const river of world.map.rivers) {
    addRiverMaskBit(masks, river.fromQ, river.fromR, river.toQ, river.toR);
    addRiverMaskBit(masks, river.toQ, river.toR, river.fromQ, river.fromR);
  }

  return masks;
}

function addRiverMaskBit(
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
  const direction = offsets.findIndex(([deltaQ, deltaR]) => fromQ + deltaQ === toQ && fromR + deltaR === toR);

  if (direction === -1) {
    throw new Error(`River edge is not adjacent: ${fromQ}:${fromR} -> ${toQ}:${toR}`);
  }

  const key = `${fromQ}:${fromR}`;
  masks.set(key, (masks.get(key) ?? 0) | (1 << direction));
}

function requiredRiverAtlas(world: WorldMapResponse) {
  const atlas = world.map.terrain.overlays.find((overlay) => overlay.role === 'river');
  if (atlas === undefined) {
    throw new Error('World response does not define a river overlay atlas.');
  }
  return atlas;
}
