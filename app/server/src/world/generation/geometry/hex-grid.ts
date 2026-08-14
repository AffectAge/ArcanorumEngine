export class HexGrid {
  readonly size: number;
  private readonly neighbors: readonly (readonly number[])[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.neighbors = Array.from({ length: this.size }, (_, index) => this.createNeighbors(index));
  }

  indexOf(q: number, r: number): number {
    if (q < 0 || r < 0 || q >= this.width || r >= this.height) {
      throw new Error(`Hex coordinate is outside the world: ${q}:${r}.`);
    }
    return r * this.width + q;
  }

  coordinateAt(index: number): { readonly q: number; readonly r: number } {
    if (index < 0 || index >= this.size) {
      throw new Error(`Hex index is outside the world: ${index}.`);
    }
    return { q: index % this.width, r: Math.floor(index / this.width) };
  }

  neighborsOf(index: number): readonly number[] {
    const neighbors = this.neighbors[index];
    if (neighbors === undefined) {
      throw new Error(`Hex index is outside the world: ${index}.`);
    }
    return neighbors;
  }

  isBoundary(index: number): boolean {
    const { q, r } = this.coordinateAt(index);
    return q === 0 || r === 0 || q === this.width - 1 || r === this.height - 1;
  }

  distancesFromBoundary(): readonly number[] {
    const distances = Array.from({ length: this.size }, () => -1);
    const queue = Array.from({ length: this.size }, (_, index) => index).filter((index) =>
      this.isBoundary(index),
    );
    for (const index of queue) {
      distances[index] = 0;
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = requiredNumber(queue, cursor, 'Boundary-distance queue unexpectedly ended.');
      const currentDistance = requiredNumber(distances, current, 'Boundary distance is missing.');
      for (const neighbor of this.neighborsOf(current)) {
        if (requiredNumber(distances, neighbor, 'Boundary distance is missing.') === -1) {
          distances[neighbor] = currentDistance + 1;
          queue.push(neighbor);
        }
      }
    }

    if (distances.some((distance) => distance < 0)) {
      throw new Error('Boundary distance did not reach every hex.');
    }
    return distances;
  }

  distanceBetween(leftIndex: number, rightIndex: number): number {
    const left = this.coordinateAt(leftIndex);
    const right = this.coordinateAt(rightIndex);
    const leftCubeX = left.q;
    const leftCubeZ = left.r - (left.q - (left.q & 1)) / 2;
    const leftCubeY = -leftCubeX - leftCubeZ;
    const rightCubeX = right.q;
    const rightCubeZ = right.r - (right.q - (right.q & 1)) / 2;
    const rightCubeY = -rightCubeX - rightCubeZ;
    return Math.max(
      Math.abs(leftCubeX - rightCubeX),
      Math.abs(leftCubeY - rightCubeY),
      Math.abs(leftCubeZ - rightCubeZ),
    );
  }

  indexesWithinRadius(center: number, radius: number): readonly number[] {
    const result: number[] = [];
    const distances = new Map<number, number>([[center, 0]]);
    const queue = [center];
    let cursor = 0;

    while (cursor < queue.length) {
      const current = requiredNumber(queue, cursor++, 'Hex radius queue unexpectedly ended.');
      const distance = distances.get(current);
      if (distance === undefined) {
        throw new Error(`Hex radius distance is missing for ${current}.`);
      }
      result.push(current);
      if (distance === radius) {
        continue;
      }
      for (const neighbor of this.neighborsOf(current)) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, distance + 1);
          queue.push(neighbor);
        }
      }
    }
    return result;
  }

  private createNeighbors(index: number): readonly number[] {
    const { q, r } = this.coordinateAt(index);
    const offsets: ReadonlyArray<readonly [number, number]> =
      q % 2 === 0
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
    return offsets.flatMap(([deltaQ, deltaR]) => {
      const neighborQ = q + deltaQ;
      const neighborR = r + deltaR;
      return neighborQ < 0 || neighborR < 0 || neighborQ >= this.width || neighborR >= this.height
        ? []
        : [neighborR * this.width + neighborQ];
    });
  }
}

function requiredNumber(values: readonly number[], index: number, message: string): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
