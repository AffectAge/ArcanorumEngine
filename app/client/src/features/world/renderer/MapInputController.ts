import Phaser from 'phaser';

type DragOrigin = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
};

type MapInputHandlers = {
  readonly onPan: (deltaX: number, deltaY: number) => void;
  readonly onZoom: (pointer: Phaser.Input.Pointer, deltaY: number) => void;
  readonly onPinch: (screenX: number, screenY: number, factor: number) => void;
  readonly onClick: (pointer: Phaser.Input.Pointer) => void;
};

/** Owns every Phaser input subscription and detaches them with the scene. */
export class MapInputController {
  private dragOrigin: DragOrigin | undefined;
  private dragDistance = 0;
  private pinchDistance: number | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly handlers: MapInputHandlers,
  ) {}

  bind(): void {
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onPointerWheel, this);
  }

  dispose(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onPointerWheel, this);
    this.dragOrigin = undefined;
    this.dragDistance = 0;
    this.pinchDistance = undefined;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.dragOrigin = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
    this.dragDistance = 0;
    this.pinchDistance = this.getPinchDistance();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const pinch = this.getPinchDistance();
    if (pinch !== undefined) {
      if (this.pinchDistance !== undefined && this.pinchDistance > 0) {
        const midpoint = this.getPinchMidpoint();
        this.handlers.onPinch(midpoint.x, midpoint.y, pinch / this.pinchDistance);
      }
      this.pinchDistance = pinch;
      this.dragOrigin = undefined;
      return;
    }
    const origin = this.dragOrigin;
    if (origin === undefined || origin.pointerId !== pointer.id || !pointer.isDown) {
      return;
    }
    const deltaX = pointer.x - origin.x;
    const deltaY = pointer.y - origin.y;
    this.dragDistance += Math.hypot(deltaX, deltaY);
    this.handlers.onPan(deltaX, deltaY);
    this.dragOrigin = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const origin = this.dragOrigin;
    this.dragOrigin = undefined;
    this.pinchDistance = undefined;
    if (origin === undefined || origin.pointerId !== pointer.id || this.dragDistance > 8) {
      return;
    }
    this.handlers.onClick(pointer);
  }

  private onPointerWheel(
    pointer: Phaser.Input.Pointer,
    _objects: readonly Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    this.handlers.onZoom(pointer, deltaY);
  }

  private getPinchDistance(): number | undefined {
    const first = this.scene.input.pointer1;
    const second = this.scene.input.pointer2;
    if (!first.isDown || !second.isDown) {
      return undefined;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private getPinchMidpoint(): { readonly x: number; readonly y: number } {
    const first = this.scene.input.pointer1;
    const second = this.scene.input.pointer2;
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }
}
