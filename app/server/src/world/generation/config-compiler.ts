import type { WorldGenerationConfig } from '../../config.js';

export type CompiledWorldGenerationConfig = {
  readonly source: WorldGenerationConfig;
  readonly totalHexes: number;
  readonly targetLandHexes: number;
  readonly activityPermille: number;
  readonly coastRoughnessPermille: number;
  readonly riftStrengthPermille: number;
  readonly islandFrequencyPermille: number;
  readonly elevationCoolingPermille: number;
  readonly maximumLakeHexes: number;
  readonly minimumLandmassHexes: number;
  readonly usableLandHexes: number;
};

/** Converts author-friendly ratios into stable integer values used by the pipeline. */
export function compileWorldGenerationConfig(source: WorldGenerationConfig): CompiledWorldGenerationConfig {
  const totalHexes = source.width * source.height;
  const targetLandHexes = Math.round(totalHexes * source.topology.landCoverage);
  const protectedMargin = source.topology.outerOceanWidth + source.topology.edgeClearance;
  const usableWidth = source.width - protectedMargin * 2;
  const usableHeight = source.height - protectedMargin * 2;
  const usableHexes = Math.max(0, usableWidth) * Math.max(0, usableHeight);

  if (targetLandHexes > usableHexes) {
    throw new Error(
      `World generation requests ${targetLandHexes} land hexes but only ${usableHexes} fit inside the protected ocean margin.`,
    );
  }
  return {
    source,
    totalHexes,
    targetLandHexes,
    activityPermille: Math.round(source.tectonics.activity * 1000),
    coastRoughnessPermille: Math.round(source.topology.coastRoughness * 1000),
    riftStrengthPermille: Math.round(source.topology.riftStrength * 1000),
    islandFrequencyPermille: Math.round(source.topology.islandFrequency * 1000),
    elevationCoolingPermille: Math.round(source.climate.elevationCooling * 1000),
    maximumLakeHexes: Math.floor(totalHexes * source.hydrology.maximumLakeCoverage),
    minimumLandmassHexes: Math.max(2, Math.floor(Math.sqrt(totalHexes) / 64)),
    usableLandHexes: usableHexes,
  };
}
