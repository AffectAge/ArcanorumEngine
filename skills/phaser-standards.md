# Phaser Standards

This skill defines how Phaser 4 is used in Revival. Phaser is the world renderer, camera/input surface, animation system, and client-side visual adapter. It is not the authoritative simulation, persistence layer, content compiler, or UI state owner.

The exact Phaser version in `package.json` is authoritative. Before relying on a version-sensitive API, check the matching official Phaser documentation and update this skill or the relevant local note when behavior differs.

## 1. Architectural boundary

```text
server / simulation
  authoritative state, commands, deterministic rules, events
              ↓ shared client contracts
client adapter
  snapshot/event subscription, intent commands, render projection
              ↓
Phaser
  scenes, tilemaps, sprites, cameras, input, tweens, effects, audio
```

Phaser MUST NOT:

- calculate authoritative combat, economy, production, population, diplomacy, or turn resolution;
- own the canonical world state;
- import React or Zustand into renderer-side classes;
- persist save data;
- generate gameplay IDs or random gameplay outcomes;
- decide whether a server command is valid;
- use animation completion, frame rate, wall-clock time, or pointer order as gameplay rules.

Phaser MAY:

- keep a render projection indexed by stable entity ID;
- interpolate or animate visual positions;
- perform non-authoritative hover/selection previews;
- translate pointer/keyboard/gamepad input into serializable player intents;
- render typed simulation events as effects, labels, sounds, and animations.

## 2. Game bootstrap

Create one `Phaser.Game` instance for the client runtime. Keep configuration explicit and pass scenes through the game config.

```ts
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { WorldScene } from "./scenes/WorldScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#000000",
  scene: [BootScene, PreloadScene, WorldScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  audio: {
    disableWebAudio: false,
  },
};

export function createPhaserGame(): Phaser.Game {
  return new Phaser.Game(config);
}
```

Rules:

- Do not instantiate Phaser during React render. Create and destroy it from a client lifecycle owner.
- Do not create multiple Game instances for one client unless an explicit embedding requirement exists.
- Keep the canvas parent and sizing policy owned by the client shell.
- Destroy the game and remove listeners when the client shell is disposed.
- Put startup-only work in `preBoot`/`postBoot` only when a scene cannot own it.

## 3. Scene architecture

Scenes are Phaser's lifecycle and rendering units. Every scene has a unique stable key. A scene may be large or small, but its responsibility must be explicit.

Recommended Revival scene roles:

```text
boot       → renderer/client prerequisites and tiny bootstrap assets
preload    → shared asset loading and progress display
world      → strategic map, map layers, world entities, world input
effects    → optional visual effects layer
debug      → optional diagnostics overlay
```

React owns menus, HUD windows, tooltips, forms, and interface-heavy panels. Do not create a Phaser scene for every React window. A dedicated Phaser UI scene is acceptable only for world-space labels/effects or a deliberately canvas-rendered overlay.

```ts
export class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "world" });
  }

  init(data: { readonly matchId: string }): void {
    this.matchId = data.matchId;
  }

  preload(): void {
    // Load only assets owned by this scene; shared assets belong in PreloadScene.
  }

  create(): void {
    this.createMapLayers();
    this.createRenderProjection();
    this.bindInput();
    this.bindClientEvents();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onDestroy, this);
  }

  update(_time: number, _delta: number): void {
    this.updatePresentation();
  }

  private onShutdown(): void {
    this.unbindClientEvents();
    this.tweens.killAll();
  }

  private onDestroy(): void {
    this.renderProjection.clear();
  }
}
```

Use scene `sleep`/`wake`, `pause`/`resume`, `start`/`stop`, or visibility controls intentionally. Do not reorder scenes to hide lifecycle mistakes. Scene rendering order is established by the scene list and explicit scene ownership.

## 4. Scene lifecycle and cleanup

Every subscription, timer, tween, input listener, camera listener, and external event bridge must have an owner and cleanup path.

```ts
private bindClientEvents(): void {
  this.clientEvents.on("UNIT_MOVED", this.handleUnitMoved, this);
}

private unbindClientEvents(): void {
  this.clientEvents.off("UNIT_MOVED", this.handleUnitMoved, this);
}
```

Prefer `once` for one-shot lifecycle work. Do not retain scene references in global services without clearing them on `shutdown` and `destroy`. A scene that is restarted must not double-register listeners or create duplicate world objects.

## 5. Asset loading

Phaser Loader uses string keys and per-scene queues. Assets must be loaded before use. The asset key is a stable runtime reference and must be unique within its asset type.

Recommended loading split:

```text
BootScene      → tiny loader UI assets and required client config
PreloadScene   → shared UI/world textures, fonts, audio, common atlases
WorldScene     → scenario/map-specific assets
Feature scene  → assets owned only by that feature
```

```ts
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "preload" });
  }

  preload(): void {
    this.load.image("world.terrain.atlas", "/assets/world/terrain.png");
    this.load.tilemapTiledJSON("world.scenario.default", "/assets/maps/default.json");
    this.load.audio("audio.ui", ["/assets/audio/ui.ogg", "/assets/audio/ui.mp3"]);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.events.emit("asset-progress", value);
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      throw new Error(`Required Phaser asset failed: ${file.key}`);
    });
  }

  create(): void {
    this.scene.start("world");
  }
}
```

Rules:

- Use stable namespaced keys such as `world.terrain.atlas`, `unit.infantry.sprite`, and `audio.ui`.
- Keep physical file paths in an asset manifest or loader owner, not in feature components.
- Never use a missing texture, fallback color, dummy sprite, or silent asset substitution for required content.
- Validate data-driven asset manifests before queueing them.
- Reuse shared loaded assets; do not load the same asset repeatedly from every scene.
- Remove large scene-owned caches only when ownership and reload behavior are explicit.
- Use loader events for progress and failures. A loading bar must not hide a failed required file.

## 6. Game Objects and render projections

Game Objects are visual/runtime objects belonging to a Scene. Create them from normalized render data and stable entity IDs.

```ts
type UnitRenderState = {
  readonly unitId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly spriteKey: string;
  readonly visible: boolean;
};

class UnitView {
  constructor(
    readonly unitId: string,
    readonly sprite: Phaser.GameObjects.Sprite,
  ) {}
}

function createUnitView(scene: Phaser.Scene, state: UnitRenderState): UnitView {
  const sprite = scene.add
    .sprite(state.tileX, state.tileY, state.spriteKey)
    .setName(`unit:${state.unitId}`)
    .setVisible(state.visible);

  return new UnitView(state.unitId, sprite);
}
```

Rules:

- The render projection is keyed by stable IDs, never by array position alone.
- Reconcile additions, updates, visibility changes, and removals explicitly.
- Do not recreate every sprite each tick. Update existing objects and destroy only removed entities.
- Keep authoritative values out of arbitrary Game Object custom fields unless they are clearly read-only render metadata.
- Use `depth` as a documented render ordering policy, not as a gameplay priority.
- Use `name` and data fields for debugging/render metadata, not as a substitute for domain identity.

## 7. Groups, Containers, Layers, and pooling

Use the simplest display structure that owns the responsibility:

| Need | Prefer |
|---|---|
| Many similar recyclable objects | `Group` or project pool |
| Shared transform for a small visual assembly | `Container` |
| Repeated map cells | `TilemapLayer` |
| Independent animated entity | `Sprite`/Game Object |
| Layered depth/visibility control | separate display layer or documented depth |

Groups are not displayable and do not provide transforms. Containers transform children but add per-child processing cost, especially when nested or interactive. Do not use Containers merely as organizational folders.

```ts
private readonly unitSprites = this.add.group({
  classType: Phaser.GameObjects.Sprite,
  maxSize: 500,
  active: false,
  runChildUpdate: false,
});

private acquireUnitSprite(key: string): Phaser.GameObjects.Sprite {
  const sprite = this.unitSprites.get(0, 0, key) as Phaser.GameObjects.Sprite | null;
  if (!sprite) {
    throw new Error("Unit sprite pool exhausted");
  }
  return sprite.setActive(true).setVisible(true);
}
```

Pooling is appropriate for frequent transient effects and bounded entity displays. It must not hide an incorrect entity count or create fake gameplay entities.

## 8. Tilemaps and hex maps

A `Tilemap` stores map data; a `TilemapLayer` renders it. Keep map data ownership separate from the renderer projection. Phaser supports orthogonal, isometric, hexagonal, and staggered orientations.

```ts
private createMapLayers(): void {
  const map = this.make.tilemap({ key: "world.scenario.default" });
  const tileset = map.addTilesetImage(
    "terrain",
    "world.terrain.atlas",
  );

  if (!tileset) {
    throw new Error("Required terrain tileset was not found");
  }

  const terrain = map.createLayer("terrain", tileset, 0, 0);
  if (!terrain) {
    throw new Error("Required terrain layer was not found");
  }

  this.terrainLayer = terrain;
}
```

Rules:

- Use `Tilemap`/`TilemapLayer` for grid-aligned repeated terrain and overlays.
- Use Object Layers or a separate render projection for cities, units, resources, and arbitrary world objects.
- Validate Tiled layer names, tilesets, orientation, dimensions, custom properties, and object metadata before rendering.
- Do not treat Tile custom properties as authoritative simulation state without a validated import boundary.
- Use separate layers for terrain, roads/rivers, selection, political overlay, and debug overlays when independent visibility/tint/depth is needed.
- Do not create one Sprite per hex unless the hex needs independent transform, animation, input, or lifecycle.
- For large maps, profile TilemapLayer culling and map-mode updates before adding manual per-tile loops.

### Hex picking

Use the map's coordinate conversion methods rather than duplicating hex math in input handlers.

```ts
private getHoveredTile(pointer: Phaser.Input.Pointer): Phaser.Tilemaps.Tile | null {
  const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  const tile = this.map.getTileAtWorldXY(point.x, point.y, true, this.cameras.main, this.terrainLayer);
  return tile ?? null;
}
```

For APIs/version combinations where the documented hex workflow uses `worldToTileXY`, pass both world coordinates together. Do not call separate `worldToTileX` and `worldToTileY` methods for hex picking when the API cannot resolve the hex from one coordinate alone.

## 9. Cameras and coordinate spaces

Use explicit coordinate spaces:

```text
screen / canvas coordinates
        ↓ camera transform
world coordinates
        ↓ tilemap conversion
tile / hex coordinates
```

```ts
const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
this.cameras.main.centerOn(worldPoint.x, worldPoint.y);
```

Rules:

- Set camera bounds to the actual world bounds before enabling panning.
- Clamp zoom to documented minimum/maximum values; never set zoom to zero.
- Use camera follow/deadzone/lerp for presentation only.
- Keep UI overlays on a camera or DOM layer that does not scroll with the strategic world.
- Use `scrollFactor(0, 0)` only for intentional screen-space world-rendered overlays.
- Convert pointer coordinates through the target camera before tile/entity picking, especially with multiple cameras.
- Do not use camera interpolation to alter authoritative movement or target selection.

```ts
this.cameras.main
  .setBounds(0, 0, mapWidth, mapHeight)
  .setZoom(1)
  .setRoundPixels(true);
```

## 10. Input and intent commands

Phaser has a unified pointer API across mouse and touch and provides keyboard/gamepad input. Enable input only on objects that need it.

```ts
const marker = this.add
  .image(worldX, worldY, "map.selection.marker")
  .setInteractive({ useHandCursor: true });

marker.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
  const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  this.clientGateway.sendIntent({
    type: "SELECT_HEX",
    hex: this.mapCoordinates.fromWorld(point.x, point.y),
  });
});
```

Rules:

- Input handlers translate physical input into typed client intents.
- The gateway validates/serializes the intent; the server validates the gameplay command.
- Do not call simulation functions directly from `pointerdown`, `keydown`, or drag handlers.
- Use `disableInteractive` for temporary state and `removeInteractive` when ownership ends.
- Choose hit areas deliberately; do not rely on a tiny visual texture for a difficult-to-hit control.
- Provide equivalent keyboard/controller paths for important actions where the client surface requires it.
- Keep hover, focus, selection, pressed, and disabled presentation states distinct.
- Do not assume topmost input behavior across scenes; configure `topOnly` and scene ordering intentionally.

## 11. Update loop and performance

`update(time, delta)` is for presentation updates that need a frame tick. It is not a second simulation loop.

```ts
update(_time: number, _delta: number): void {
  this.cameraController.update();
  this.renderProjection.flushDirtyViews();
}
```

Rules:

- Do not iterate every entity every frame when dirty flags, events, or visible-region queries can narrow the work.
- Do not allocate large arrays, textures, containers, or listeners in `update`.
- Do not scan the entire map for hover or selection every frame; convert the pointer to one tile/entity query.
- Use built-in camera culling and TilemapLayer culling before manual visibility systems.
- Profile representative large maps before replacing a built-in Phaser feature.
- Keep render-only interpolation in the client; never feed interpolated values back into simulation.
- Use Groups/pooling for high-churn transient objects and avoid unbounded particle/Game Object creation.

## 12. Animation and tweens

Use Phaser's Tween Manager for visual property changes. Centralize project motion presets and make reduced-motion settings available to the renderer.

```ts
function playSelectionPulse(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): void {
  scene.tweens.add({
    targets: target,
    alpha: { from: 0.65, to: 1 },
    duration: 180,
    ease: "Quad.Out",
    yoyo: true,
    repeat: 1,
  });
}
```

Rules:

- Never use tween callbacks to commit gameplay state.
- Kill or stop tweens when their target or scene is destroyed.
- Do not create duplicate looping tweens when a view receives repeated snapshots.
- Do not use continuous camera shake, flashing, or large zoom as the only state signal.
- Respect the UI/game reduced-motion setting. Replace non-essential movement with tint, outline, opacity, or immediate state changes.
- Use animation events for presentation sequencing only; keep event order independent from simulation resolution.

## 13. Audio

Use the Phaser Sound Manager through the project `AudioService` defined in `skills/ui-and-audio-standards.md`. Do not call raw sound keys from domain systems or scattered feature code.

```ts
this.audio.playUi("buttonConfirm");
this.audio.playMusic("music.strategy");
```

Rules:

- Use semantic sound IDs and central asset mapping.
- Separate UI, music, ambience, and world-effect volume buses.
- Handle browser audio unlock after a user gesture.
- Stop looping music/effects when their scene or ownership ends.
- Prefer audio sprites for related short UI/world effects when appropriate.
- Simulation emits events; the client audio adapter decides whether to play a sound.

## 14. Scale, resize, and DOM overlays

Choose a scale mode based on the client shell and map requirements. Test the game at the supported viewport sizes and device pixel ratios.

```ts
this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => {
  this.cameraController.resize(gameSize.width, gameSize.height);
});
```

Rules:

- Keep Phaser canvas sizing and React overlay sizing coordinated by one client shell.
- Do not place responsive React UI inside world coordinates.
- Use DOM Elements only for a deliberate Phaser-managed DOM overlay; otherwise React owns interface-heavy UI.
- Recompute camera viewport/bounds on resize when needed, but do not modify world coordinates merely because the viewport changed.
- Ensure pointer coordinate conversion uses the active canvas/camera after resize.

## 15. Events and bridges

Phaser Event Emitters are useful for scene-local lifecycle and renderer events. Use typed project gateways for client/server events.

```ts
type RenderEvent =
  | { readonly type: "UNIT_MOVED"; readonly unitId: string; readonly from: Hex; readonly to: Hex }
  | { readonly type: "COMBAT_RESOLVED"; readonly attackerId: string; readonly defenderId: string };

function handleRenderEvent(event: RenderEvent): void {
  switch (event.type) {
    case "UNIT_MOVED":
      animateUnitMove(event);
      return;
    case "COMBAT_RESOLVED":
      playCombatEffect(event);
      return;
  }
}
```

Do not use a global untyped event bus as a substitute for contracts. Avoid Phaser reserved event names for project events. Unsubscribe listeners at the owner lifecycle boundary.

## 16. Failure policy

Required renderer data must fail explicitly:

- missing map layer → load/startup error;
- missing tileset or asset key → load/startup error;
- invalid Tiled orientation/custom property → importer validation error;
- missing entity render definition → diagnostic and affected render path stops;
- unknown simulation event → explicit client error, not a silent no-op.

Do not render fake units, fallback textures, default colors, or placeholder maps to make an incomplete flow appear functional.

## 17. Testing and verification

Minimum checks by change type:

| Change | Checks |
|---|---|
| Scene lifecycle | start/sleep/wake/restart/destroy smoke test; listener cleanup |
| Asset loading | successful load, missing required asset, progress/error behavior |
| Tilemap/import | fixture validation, hex picking, layer/tileset failure, representative map performance |
| Camera/input | coordinate conversion, bounds/zoom, pointer and keyboard intent tests |
| Render projection | add/update/remove by stable ID, repeated snapshot idempotence |
| Animation | no duplicate tween, cleanup, reduced-motion branch |
| Audio | semantic routing, mute/buses, unlock, loop cleanup |
| React/Phaser integration | game creation/destruction, resize, overlay alignment, browser smoke test |

For visual changes, use Playwright screenshots or a documented manual check at representative viewport sizes. Do not treat a screenshot pass as proof of simulation correctness.

## Official documentation

- [Phaser Game](https://docs.phaser.io/phaser/concepts/game)
- [Phaser Scenes](https://docs.phaser.io/phaser/concepts/scenes)
- [Phaser Loader](https://docs.phaser.io/phaser/concepts/loader)
- [Phaser Game Objects](https://docs.phaser.io/phaser/concepts/gameobjects)
- [Phaser Input](https://docs.phaser.io/phaser/concepts/input)
- [Phaser Cameras](https://docs.phaser.io/phaser/concepts/cameras)
- [Phaser Tweens](https://docs.phaser.io/phaser/concepts/tweens)
- [Phaser Audio](https://docs.phaser.io/phaser/concepts/audio)
- [Phaser Events](https://docs.phaser.io/phaser/concepts/events)
- [Phaser Group](https://docs.phaser.io/phaser/concepts/gameobjects/group)
- [Phaser Container](https://docs.phaser.io/phaser/concepts/gameobjects/container)
- [Phaser Tilemap API](https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemap)
- [Phaser TilemapLayer API](https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemaplayer)
- [Phaser Hex Map reference in this repository](./phaser-hex-map-capabilities.md)
