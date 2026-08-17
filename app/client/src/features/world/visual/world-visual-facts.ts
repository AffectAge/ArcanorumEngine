import type {
  TerrainType,
  WorldHex,
  WorldVisualCatalog,
  WorldVisualConditionGroup,
  WorldVisualExpression,
} from '@arcanorum/shared';

type VisualFactValue =
  | number
  | 'land'
  | 'water'
  | 'ocean'
  | 'coastal_water'
  | 'sea'
  | 'lake';

export type WorldVisualFactResolver = {
  readonly value: (factId: string) => VisualFactValue;
  readonly number: (expression: WorldVisualExpression) => number;
};

export function createHexWorldVisualFactResolver(
  catalog: WorldVisualCatalog,
  hex: WorldHex,
  terrain: TerrainType,
  hexByCoordinate: ReadonlyMap<string, { readonly elevation: number }>,
): WorldVisualFactResolver {
  return createFactResolver(catalog, {
    'hex.elevation': hex.elevation,
    'hex.temperature': hex.temperature,
    'hex.rainfall': hex.rainfall,
    'hex.flow_accumulation': clampVisualScore(hex.flowAccumulation),
    'hex.terrain_role': terrain.category,
    'hex.terrain_kind': terrain.role,
    'neighbor.ruggedness': resolveRuggedness(hex.q, hex.r, hex.elevation, hexByCoordinate),
  });
}

export function matchesWorldVisualConditions(
  group: WorldVisualConditionGroup,
  facts: WorldVisualFactResolver,
): boolean {
  return group.all.every((condition) => {
    const actual = facts.value(condition.fact);
    switch (condition.operator) {
      case 'eq':
        return actual === condition.value;
      case 'gte':
        return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
      case 'lte':
        return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    }
  });
}

function createFactResolver(
  catalog: WorldVisualCatalog,
  sourceFacts: Readonly<Record<string, VisualFactValue>>,
): WorldVisualFactResolver {
  const signalById = new Map(catalog.signals.map((signal) => [signal.id, signal.expression]));
  const resolved = new Map<string, VisualFactValue>();
  const resolving = new Set<string>();

  function value(factId: string): VisualFactValue {
    const source = sourceFacts[factId];
    if (source !== undefined) {
      return source;
    }
    const cached = resolved.get(factId);
    if (cached !== undefined) {
      return cached;
    }
    const expression = signalById.get(factId);
    if (expression === undefined) {
      throw new Error(`Visual rule references an unknown fact: ${factId}`);
    }
    if (resolving.has(factId)) {
      throw new Error(`Visual signal dependency cycle includes ${factId}.`);
    }
    resolving.add(factId);
    const result = number(expression);
    resolving.delete(factId);
    resolved.set(factId, result);
    return result;
  }

  function number(expression: WorldVisualExpression): number {
    switch (expression.type) {
      case 'constant':
        return expression.value;
      case 'fact': {
        const result = value(expression.fact);
        if (typeof result !== 'number') {
          throw new Error(`Visual expression requires numeric fact: ${expression.fact}`);
        }
        return result;
      }
      case 'add':
        return clampVisualScore(expression.values.reduce((sum, item) => sum + number(item), 0));
      case 'multiply':
        return expression.values.reduce((product, item) => multiplyScores(product, number(item)), 1000);
      case 'subtract':
        return clampVisualScore(number(expression.left) - number(expression.right));
      case 'remap': {
        const input = number(expression.value);
        if (input <= expression.inputMin) {
          return 0;
        }
        if (input >= expression.inputMax) {
          return 1000;
        }
        return Math.floor(
          ((input - expression.inputMin) * 1000) / (expression.inputMax - expression.inputMin),
        );
      }
      case 'clamp':
        return Math.max(expression.min, Math.min(expression.max, number(expression.value)));
    }
  }

  return { value, number };
}

function resolveRuggedness(
  q: number,
  r: number,
  elevation: number,
  hexByCoordinate: ReadonlyMap<string, { readonly elevation: number }>,
): number {
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
  const maximumDifference = Math.max(
    0,
    ...offsets.map(([offsetQ, offsetR]) => {
      const neighbor = hexByCoordinate.get(`${q + offsetQ}:${r + offsetR}`);
      return neighbor === undefined ? 0 : Math.abs(elevation - neighbor.elevation);
    }),
  );
  return clampVisualScore(maximumDifference * 8);
}

function multiplyScores(left: number, right: number): number {
  return Math.floor((left * right) / 1000);
}

function clampVisualScore(value: number): number {
  return Math.max(0, Math.min(1000, value));
}
