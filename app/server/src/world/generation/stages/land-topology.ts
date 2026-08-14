import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { makeLand, makeWater } from '../geometry/topology.js';
import type { LandTopology, MutableHex, PlateModel } from '../types.js';
import { requiredCell } from '../utils.js';
import {
  createLandCandidate,
  type CandidateLandComponent,
  type LandCandidate,
  type LandCandidateNoise,
} from './land-candidates.js';

/** Selects the best of a bounded candidate set; generation never retries indefinitely. */
export function createLandTopology(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
  plateModel: PlateModel,
  candidateNoises: readonly LandCandidateNoise[],
): LandTopology {
  const candidates = candidateNoises.map((noise, attemptIndex) =>
    createLandCandidate(attemptIndex, grid, configuration, edgeDistance, plateModel, noise),
  );
  const selected = [...candidates].sort(compareCandidates)[0];
  if (selected === undefined) {
    throw new Error('Configuration requires at least one deterministic land candidate.');
  }

  applyCandidate(cells, selected, configuration);
  assignTopologyIdentities(cells, selected.components);
  return {
    selectedCandidate: selected.attemptIndex,
    selectedScore: selected.score,
    candidateCount: candidates.length,
    landHexCount: selected.landHexCount,
    componentCount: selected.components.length,
    discardedMicroIslandCount: selected.discardedMicroIslandCount,
    largestLandmassSharePermille: selected.largestLandmassSharePermille,
    coastlineEdges: selected.coastlineEdges,
  };
}

function compareCandidates(left: LandCandidate, right: LandCandidate): number {
  return right.score - left.score || left.attemptIndex - right.attemptIndex;
}

function applyCandidate(
  cells: readonly MutableHex[],
  candidate: LandCandidate,
  configuration: CompiledWorldGenerationConfig,
): void {
  const landElevation =
    configuration.source.relief.seaLevel + configuration.source.relief.continentalBaseElevation;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    if (candidate.mask[index] === true) {
      makeLand(cell, landElevation);
      cell.crustKind = 'continental';
      continue;
    }
    makeWater(cell, configuration.source.relief.seaLevel);
    cell.crustKind = 'oceanic';
    cell.landmassKindHint = undefined;
    cell.landmassOrdinal = undefined;
  }
}

function assignTopologyIdentities(
  cells: readonly MutableHex[],
  components: readonly CandidateLandComponent[],
): void {
  const largest = components[0];
  if (largest === undefined) {
    throw new Error('Emergent topology has no largest land component.');
  }
  const continentThreshold = Math.max(1, Math.floor(largest.indexes.length * 0.13));
  const continentComponents = components
    .filter((component) => component.indexes.length >= continentThreshold)
    .sort((left, right) => left.firstIndex - right.firstIndex);
  const islandComponents = components
    .filter((component) => component.indexes.length < continentThreshold)
    .sort((left, right) => left.firstIndex - right.firstIndex);

  for (const [kind, selected] of [
    ['continent', continentComponents],
    ['island', islandComponents],
  ] as const) {
    for (let index = 0; index < selected.length; index += 1) {
      const component = selected[index];
      if (component === undefined) {
        throw new Error(`Emergent ${kind} component is missing: ${index}.`);
      }
      for (const cellIndex of component.indexes) {
        const cell = requiredCell(cells, cellIndex);
        cell.landmassKindHint = kind;
        cell.landmassOrdinal = index + 1;
      }
    }
  }
}
