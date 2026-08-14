import type {
  WorldGenerationDiagnostics,
  WorldHex,
  WorldLandmass,
  WorldRiverEdge,
  WorldWaterBody,
} from '@arcanorum/shared';

export type TerrainRole = 'ocean' | 'coastal_water' | 'sea' | 'lake' | 'land';
export type TerrainRoleIndex = Readonly<Record<TerrainRole, string>>;
export type WaterKind = 'ocean' | 'sea' | 'lake';

export type MutableHex = {
  readonly q: number;
  readonly r: number;
  elevation: number;
  isLand: boolean;
  terrainId: string;
  temperature: number;
  rainfall: number;
  flowAccumulation: number;
  plannedWaterKind: Exclude<WaterKind, 'ocean'> | undefined;
  plannedWaterId: string | undefined;
  landmassId: string | undefined;
  waterBodyId: string | undefined;
};

export type HexComponent = {
  readonly indexes: readonly number[];
  readonly firstIndex: number;
  readonly touchesBoundary: boolean;
};

export type HydrologyResult = {
  readonly rivers: readonly WorldRiverEdge[];
  readonly maximumFlowAccumulation: number;
};

export type ContinentAxis = {
  readonly start: MapPosition;
  readonly end: MapPosition;
  readonly width: number;
};

export type ContinentPlan = {
  readonly center: MapPosition;
  readonly axes: readonly ContinentAxis[];
};

export type ContinentShape = {
  readonly axes: readonly ContinentAxis[];
};

export type MapPosition = {
  readonly x: number;
  readonly y: number;
};

export type TopologyResult = {
  readonly discardedMicroIslandCount: number;
};

export type GeneratedWorld = {
  readonly hexes: readonly WorldHex[];
  readonly rivers: readonly WorldRiverEdge[];
  readonly landmasses: readonly WorldLandmass[];
  readonly waterBodies: readonly WorldWaterBody[];
  readonly diagnostics: WorldGenerationDiagnostics;
};
