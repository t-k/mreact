export type HeapComparator<T> = (left: T, right: T) => number;

export function peek<T>(heap: readonly T[]): T | null {
  return heap[0] ?? null;
}

export function push<T>(
  heap: T[],
  node: T,
  compare: HeapComparator<T>,
): void {
  heap.push(node);
  siftUp(heap, heap.length - 1, compare);
}

export function pop<T>(heap: T[], compare: HeapComparator<T>): T | null {
  const first = heap[0];
  if (first === undefined) {
    return null;
  }

  const last = heap.pop();
  if (last !== undefined && last !== first) {
    heap[0] = last;
    siftDown(heap, 0, compare);
  }

  return first;
}

function siftUp<T>(
  heap: T[],
  index: number,
  compare: HeapComparator<T>,
): void {
  const node = heap[index];
  if (node === undefined) {
    return;
  }

  while (index > 0) {
    const parentIndex = (index - 1) >>> 1;
    const parent = heap[parentIndex];
    if (parent === undefined || compare(node, parent) >= 0) {
      break;
    }

    heap[index] = parent;
    index = parentIndex;
  }

  heap[index] = node;
}

function siftDown<T>(
  heap: T[],
  index: number,
  compare: HeapComparator<T>,
): void {
  const length = heap.length;
  const node = heap[index];
  if (node === undefined) {
    return;
  }

  while (index < length >>> 1) {
    const leftIndex = (index << 1) + 1;
    const rightIndex = leftIndex + 1;
    let childIndex = leftIndex;
    let child = heap[leftIndex];
    const right = heap[rightIndex];

    if (child === undefined) {
      return;
    }
    if (right !== undefined && compare(right, child) < 0) {
      childIndex = rightIndex;
      child = right;
    }
    if (compare(node, child) <= 0) {
      break;
    }

    heap[index] = child;
    index = childIndex;
  }

  heap[index] = node;
}
