import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { clampInteger, requiredCell, requiredNumber } from '../utils.js';

/** Simulates latitude bands, moisture advection, rain shadows, and runoff. */
export function calculateClimate(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  noise: (x: number, y: number) => number,
): void {
  const climate = configuration.source.climate;
  const seaLevel = configuration.source.relief.seaLevel;
  let humidity = cells.map((cell) => (cell.isLand ? 40 : climate.evaporationStrength));
  const rainfall = Array.from({ length: grid.size }, () => 0);

  for (let index = 0; index < grid.size; index += 1) {
    const cell = requiredCell(cells, index);
    const latitude = normalizedLatitude(cell.r, grid.height);
    const baseTemperature =
      climate.equatorialTemperature -
      Math.round((climate.equatorialTemperature - climate.polarTemperature) * latitude);
    const elevationCooling = Math.round(
      (Math.max(0, cell.elevation - seaLevel) * configuration.elevationCoolingPermille) / 1000,
    );
    cell.temperature = clampInteger(
      baseTemperature - elevationCooling + noise(cell.q / 19 + 41, cell.r / 19 - 61) * 18,
    );
  }

  for (let pass = 0; pass < climate.moistureTransportPasses; pass += 1) {
    const nextHumidity = Array.from({ length: grid.size }, () => 0);
    for (let index = 0; index < grid.size; index += 1) {
      const cell = requiredCell(cells, index);
      const evaporation = cell.isLand
        ? 0
        : Math.max(1, Math.floor(climate.evaporationStrength / climate.moistureTransportPasses));
      const available = requiredNumber(humidity, index) + evaporation;
      const transported = Math.floor((available * climate.windBandStrength) / 1000);
      nextHumidity[index] = requiredNumber(nextHumidity, index) + available - transported;
      const targets = downwindNeighbors(index, cell.r, grid);
      if (targets.length === 0) {
        nextHumidity[index] = requiredNumber(nextHumidity, index) + transported;
        continue;
      }
      const share = Math.floor(transported / targets.length);
      let remainder = transported - share * targets.length;
      for (const target of targets) {
        const targetCell = requiredCell(cells, target);
        const parcel = share + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        const rise = Math.max(0, targetCell.elevation - cell.elevation);
        const orographicRain = Math.min(
          parcel,
          targetCell.isLand
            ? Math.floor((rise * climate.orographicStrength) / 10_000) + Math.floor(parcel / 18)
            : 0,
        );
        rainfall[target] = requiredNumber(rainfall, target) + orographicRain;
        nextHumidity[target] = requiredNumber(nextHumidity, target) + parcel - orographicRain;
      }
    }
    humidity = nextHumidity;
  }

  for (let index = 0; index < grid.size; index += 1) {
    const cell = requiredCell(cells, index);
    if (!cell.isLand) {
      cell.rainfall = 1000;
      cell.runoff = 0;
      continue;
    }
    const waterNeighbor = grid.neighborsOf(index).some((neighbor) => !requiredCell(cells, neighbor).isLand);
    const localNoise = Math.round(
      noise(cell.q / 9 - 131, cell.r / 9 + 83) * climate.rainfallNoise,
    );
    cell.rainfall = clampInteger(
      45 + requiredNumber(rainfall, index) * 3 + (waterNeighbor ? 100 : 0) + localNoise,
    );
    const potentialEvaporation = Math.floor(
      (cell.temperature * climate.evaporationStrength) / 4000,
    );
    cell.runoff = Math.max(1, cell.rainfall - potentialEvaporation);
  }
}

function normalizedLatitude(r: number, height: number): number {
  return height <= 1 ? 0 : Math.abs((r * 2) / (height - 1) - 1);
}

function downwindNeighbors(index: number, r: number, grid: HexGrid): readonly number[] {
  const latitude = normalizedLatitude(r, grid.height);
  const eastward = latitude >= 0.28 && latitude < 0.68;
  const q = grid.coordinateAt(index).q;
  return grid
    .neighborsOf(index)
    .filter((neighbor) => {
      const neighborQ = grid.coordinateAt(neighbor).q;
      return eastward ? neighborQ > q : neighborQ < q;
    })
    .sort((left, right) => left - right);
}
