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
export type CrustKind = 'continental' | 'oceanic';
export type LandmassKindHint = 'continent' | 'island';

export type MutableHex = {
  readonly q: number;
  readonly r: number;
  elevation: number;
  isLand: boolean;
  terrainId: string;
  temperature: number;
  rainfall: number;
  runoff: number;
  flowAccumulation: number;
  plateId: number;
  crustKind: CrustKind;
  tectonicUplift: number;
  tectonicSubsidence: number;
  landmassKindHint: LandmassKindHint | undefined;
  landmassOrdinal: number | undefined;
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
  readonly filledElevation: readonly number[];
  readonly flowTarget: readonly number[];
};

export type Plate = {
  readonly id: number;
  readonly seedIndex: number;
  readonly motionQ: number;
  readonly motionR: number;
};

export type PlateModel = {
  readonly plates: readonly Plate[];
  readonly ownerByIndex: readonly number[];
  readonly boundaryDistance: readonly number[];
  readonly islandPotential: readonly number[];
};

export type LandTopology = {
  readonly selectedCandidate: number;
  readonly selectedScore: number;
  readonly candidateCount: number;
  readonly landHexCount: number;
  readonly componentCount: number;
  readonly discardedMicroIslandCount: number;
  readonly largestLandmassSharePermille: number;
  readonly coastlineEdges: number;
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
