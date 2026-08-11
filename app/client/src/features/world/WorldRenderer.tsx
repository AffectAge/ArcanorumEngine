import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { WorldMapResponse } from '@arcanorum/shared';

type WorldRendererProps = {
  readonly world: WorldMapResponse;
  readonly ariaLabel: string;
  readonly failureLabel: string;
};

const INITIAL_CAMERA_ZOOM = 0.55;
const MINIMUM_CAMERA_ZOOM = 0.15;
const MAXIMUM_CAMERA_ZOOM = 1.75;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

type PinchGesture = {
  readonly distance: number;
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
    input: {
      activePointers: 2,
    },
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
  private pinchGesture: PinchGesture | undefined;
  private mapWidthInPixels = 0;
  private mapHeightInPixels = 0;
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
    const { atlas, biomeAtlas } = this.world.map.terrain;
    const riverAtlas = requiredRiverAtlas(this.world);

    this.load.spritesheet(atlas.key, atlas.url, {
      frameWidth: atlas.frameWidth,
      frameHeight: atlas.frameHeight,
    });
    this.load.spritesheet(biomeAtlas.key, biomeAtlas.url, {
      frameWidth: biomeAtlas.frameWidth,
      frameHeight: biomeAtlas.frameHeight,
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
      const biomeLayer = createBiomeLayer(map, this.world);
      const riverLayer = createRiverLayer(map, this.world);

      terrainLayer.setDepth(0);
      biomeLayer.setDepth(1);
      riverLayer.setDepth(2);
      this.configureCamera(map);
      this.bindCameraInput();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private configureCamera(map: Phaser.Tilemaps.Tilemap): void {
    this.mapWidthInPixels = map.widthInPixels;
    this.mapHeightInPixels = map.heightInPixels;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.mapWidthInPixels, this.mapHeightInPixels);
    this.resetCamera();
    camera.setRoundPixels(true);
  }

  private bindCameraInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onPointerWheel, this);
    this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyboardDown, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch && this.tryStartPinch()) {
      return;
    }

    this.startDrag(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.updatePinch()) {
      return;
    }

    if (this.dragPointerId !== pointer.id || this.dragOrigin === undefined || !pointer.isDown) {
      return;
    }

    const zoom = this.cameras.main.zoom;
    this.cameras.main.setScroll(
      this.dragOrigin.scrollX - (pointer.x - this.dragOrigin.x) / zoom,
      this.dragOrigin.scrollY - (pointer.y - this.dragOrigin.y) / zoom,
    );
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const wasPinching = this.pinchGesture !== undefined;
    this.pinchGesture = undefined;

    if (this.dragPointerId === pointer.id) {
      this.clearDrag();
    }

    if (wasPinching) {
      const remainingPointer = this.getActiveTouchPointers()[0];
      if (remainingPointer !== undefined) {
        this.startDrag(remainingPointer);
      }
    }
  }

  private onPointerWheel(
    pointer: Phaser.Input.Pointer,
    _currentlyOver: readonly Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    const boundedDelta = Math.max(-400, Math.min(400, deltaY));
    const requestedZoom = this.cameras.main.zoom * Math.exp(-boundedDelta * WHEEL_ZOOM_SENSITIVITY);
    this.setZoomAtScreenPoint(pointer.x, pointer.y, requestedZoom);
  }

  private onKeyboardDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        this.zoomAtViewportCenter(1.2);
        return;
      case '-':
      case '_':
        event.preventDefault();
        this.zoomAtViewportCenter(1 / 1.2);
        return;
      case '0':
        event.preventDefault();
        this.resetCamera();
        return;
      default:
        return;
    }
  }

  private tryStartPinch(): boolean {
    const [firstPointer, secondPointer] = this.getActiveTouchPointers();
    if (firstPointer === undefined || secondPointer === undefined) {
      return false;
    }

    const distance = pointerDistance(firstPointer, secondPointer);
    if (distance === 0) {
      return false;
    }

    this.clearDrag();
    this.pinchGesture = { distance };
    return true;
  }

  private updatePinch(): boolean {
    if (this.pinchGesture === undefined) {
      return false;
    }

    const [firstPointer, secondPointer] = this.getActiveTouchPointers();
    if (firstPointer === undefined || secondPointer === undefined) {
      this.pinchGesture = undefined;
      return false;
    }

    const distance = pointerDistance(firstPointer, secondPointer);
    if (distance === 0) {
      return true;
    }

    const midpoint = pointerMidpoint(firstPointer, secondPointer);
    this.setZoomAtScreenPoint(
      midpoint.x,
      midpoint.y,
      this.cameras.main.zoom * (distance / this.pinchGesture.distance),
    );
    this.pinchGesture = { distance };
    return true;
  }

  private getActiveTouchPointers(): readonly Phaser.Input.Pointer[] {
    return [this.input.pointer1, this.input.pointer2].filter((pointer) => pointer.isDown && pointer.wasTouch);
  }

  private startDrag(pointer: Phaser.Input.Pointer): void {
    this.dragPointerId = pointer.id;
    this.dragOrigin = {
      x: pointer.x,
      y: pointer.y,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
    };
  }

  private clearDrag(): void {
    this.dragPointerId = undefined;
    this.dragOrigin = undefined;
  }

  private zoomAtViewportCenter(zoomMultiplier: number): void {
    const camera = this.cameras.main;
    this.setZoomAtScreenPoint(
      camera.x + camera.width / 2,
      camera.y + camera.height / 2,
      camera.zoom * zoomMultiplier,
    );
  }

  private setZoomAtScreenPoint(screenX: number, screenY: number, requestedZoom: number): void {
    const camera = this.cameras.main;
    const zoom = clampCameraZoom(requestedZoom);
    if (Math.abs(zoom - camera.zoom) < Number.EPSILON) {
      return;
    }

    const localX = screenX - camera.x;
    const localY = screenY - camera.y;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const worldX = camera.scrollX + originX + (localX - originX) / camera.zoom;
    const worldY = camera.scrollY + originY + (localY - originY) / camera.zoom;

    camera.setZoom(zoom);
    camera.setScroll(
      worldX - originX - (localX - originX) / zoom,
      worldY - originY - (localY - originY) / zoom,
    );
  }

  private resetCamera(): void {
    const camera = this.cameras.main;
    camera.centerOn(this.mapWidthInPixels / 2, this.mapHeightInPixels / 2);
    camera.setZoom(INITIAL_CAMERA_ZOOM);
  }

  private onShutdown(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onPointerWheel, this);
    this.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyboardDown, this);
    this.clearDrag();
    this.pinchGesture = undefined;
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

function clampCameraZoom(value: number): number {
  return Math.max(MINIMUM_CAMERA_ZOOM, Math.min(MAXIMUM_CAMERA_ZOOM, value));
}

function pointerDistance(left: Phaser.Input.Pointer, right: Phaser.Input.Pointer): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointerMidpoint(
  left: Phaser.Input.Pointer,
  right: Phaser.Input.Pointer,
): { readonly x: number; readonly y: number } {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function createTilemap(scene: Phaser.Scene, world: WorldMapResponse): Phaser.Tilemaps.Tilemap {
  const atlas = world.map.terrain.atlas;
  const biomeAtlas = world.map.terrain.biomeAtlas;
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
    atlas.columns + biomeAtlas.columns + 1,
  );
  const biomeTileset = map.addTilesetImage(
    'world-biome',
    biomeAtlas.key,
    biomeAtlas.frameWidth,
    biomeAtlas.frameHeight,
    0,
    0,
    atlas.columns + 1,
  );

  if (terrainTileset === null || biomeTileset === null || riverTileset === null) {
    throw new Error('Generated world could not bind its required tile atlas.');
  }

  return map;
}

function createBiomeLayer(
  map: Phaser.Tilemaps.Tilemap,
  world: WorldMapResponse,
): Phaser.Tilemaps.TilemapLayer {
  const layer = map.createLayer('biomes', 'world-biome', 0, 0);
  if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
    throw new Error('Generated world biome layer could not be created.');
  }
  return layer;
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
  const biomeFrameById = new Map(map.terrain.biomeTypes.map((biomeType) => [biomeType.id, biomeType.frame]));
  const riverMasks = createRiverMasks(world);
  const terrainData = map.hexes.map((hex) => {
    const frame = terrainFrameById.get(hex.terrainId);
    if (frame === undefined) {
      throw new Error(`Map references terrain without an atlas frame: ${hex.terrainId}`);
    }
    return frame + 1;
  });
  const biomeData = map.hexes.map((hex) => {
    if (hex.biomeId === undefined) {
      return 0;
    }
    const frame = biomeFrameById.get(hex.biomeId);
    if (frame === undefined) {
      throw new Error(`Map references biome without an atlas frame: ${hex.biomeId}`);
    }
    return frame + map.terrain.atlas.columns + 1;
  });
  const riverData = map.hexes.map(
    (hex) =>
      (riverMasks.get(`${hex.q}:${hex.r}`) ?? 0) +
      map.terrain.atlas.columns +
      map.terrain.biomeAtlas.columns +
      1,
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
        data: biomeData,
        height: map.height,
        id: 2,
        name: 'biomes',
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
        id: 3,
        name: 'rivers',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: map.width,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 4,
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
        columns: map.terrain.biomeAtlas.columns,
        firstgid: map.terrain.atlas.columns + 1,
        image: map.terrain.biomeAtlas.url,
        imageheight: map.terrain.biomeAtlas.frameHeight,
        imagewidth: map.terrain.biomeAtlas.frameWidth * map.terrain.biomeAtlas.columns,
        margin: 0,
        name: 'world-biome',
        spacing: 0,
        tilecount: map.terrain.biomeAtlas.columns,
        tileheight: map.terrain.biomeAtlas.frameHeight,
        tilewidth: map.terrain.biomeAtlas.frameWidth,
      },
      {
        columns: riverAtlas.columns,
        firstgid: map.terrain.atlas.columns + map.terrain.biomeAtlas.columns + 1,
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
