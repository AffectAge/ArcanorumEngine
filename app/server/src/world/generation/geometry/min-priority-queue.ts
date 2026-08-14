type QueueEntry = { readonly index: number; readonly elevation: number };

/** Stable tie-breaking by hex index keeps every graph priority traversal deterministic. */
export class MinPriorityQueue {
  private readonly values: QueueEntry[] = [];

  isEmpty(): boolean {
    return this.values.length === 0;
  }

  push(value: QueueEntry): void {
    this.values.push(value);
    let childIndex = this.values.length - 1;
    while (childIndex > 0) {
      const parentIndex = Math.floor((childIndex - 1) / 2);
      const child = requiredHeapEntry(this.values, childIndex);
      const parent = requiredHeapEntry(this.values, parentIndex);
      if (compareQueueEntries(child, parent) >= 0) {
        break;
      }
      this.values[childIndex] = parent;
      this.values[parentIndex] = child;
      childIndex = parentIndex;
    }
  }

  pop(): QueueEntry | undefined {
    const root = this.values[0];
    const final = this.values.pop();
    if (root === undefined || final === undefined) {
      return undefined;
    }
    if (this.values.length === 0) {
      return root;
    }
    this.values[0] = final;
    let parentIndex = 0;
    while (true) {
      const leftIndex = parentIndex * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallest = parentIndex;
      const parent = requiredHeapEntry(this.values, parentIndex);
      const left = this.values[leftIndex];
      const right = this.values[rightIndex];
      if (left !== undefined && compareQueueEntries(left, parent) < 0) {
        smallest = leftIndex;
      }
      const candidate = requiredHeapEntry(this.values, smallest);
      if (right !== undefined && compareQueueEntries(right, candidate) < 0) {
        smallest = rightIndex;
      }
      if (smallest === parentIndex) {
        return root;
      }
      const child = requiredHeapEntry(this.values, smallest);
      this.values[parentIndex] = child;
      this.values[smallest] = parent;
      parentIndex = smallest;
    }
  }
}

function requiredHeapEntry(values: readonly QueueEntry[], index: number): QueueEntry {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Priority queue index is out of bounds: ${index}.`);
  }
  return value;
}

function compareQueueEntries(left: QueueEntry, right: QueueEntry): number {
  return left.elevation - right.elevation || left.index - right.index;
}
