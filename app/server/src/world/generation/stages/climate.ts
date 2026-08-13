import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { clampInteger, requiredCell, requiredNumber } from '../utils.js';

/** Assigns non-authoring climate layers before hydrology consumes rainfall. */
export function calculateClimate(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  noise: (x: number, y: number) => number,
): void {
  const humidity = Array.from({ length: grid.size }, () => 0);
  const westToEast = configuration.climate.prevailingWind === 'west_to_east';
  const columns = Array.from({ length: grid.width }, (_, index) =>
    westToEast ? index : grid.width - index - 1,
  );

  for (const q of columns) {
    for (let r = 0; r < grid.height; r += 1) {
      const index = grid.indexOf(q, r);
      const cell = requiredCell(cells, index);
      const upwind = grid
        .neighborsOf(index)
        .filter((neighbor) =>
          westToEast ? grid.coordinateAt(neighbor).q < q : grid.coordinateAt(neighbor).q > q,
        );
      const incomingHumidity =
        upwind.length === 0
          ? 420
          : Math.round(
              upwind.reduce((total, neighbor) => total + requiredNumber(humidity, neighbor), 0) /
                upwind.length,
            );
      const upwindElevation =
        upwind.length === 0
          ? configuration.seaLevel
          : Math.round(
              upwind.reduce((total, neighbor) => total + requiredCell(cells, neighbor).elevation, 0) /
                upwind.length,
            );
      const latitude = grid.height === 1 ? 0 : Math.abs((r / (grid.height - 1)) * 2 - 1);
      const baseTemperature =
        configuration.climate.equatorialTemperature -
        (configuration.climate.equatorialTemperature - configuration.climate.polarTemperature) * latitude;
      const elevationCooling =
        Math.max(0, cell.elevation - configuration.seaLevel) * configuration.climate.elevationCooling;
      cell.temperature = clampInteger(
        baseTemperature - elevationCooling + noise(q / 17 + 41, r / 17 - 61) * 24,
      );

      if (!cell.isLand) {
        cell.rainfall = 1000;
        humidity[index] = 1000;
        continue;
      }

      const hasWaterNeighbor = grid
        .neighborsOf(index)
        .some((neighbor) => !requiredCell(cells, neighbor).isLand);
      const humidAir = Math.max(incomingHumidity, hasWaterNeighbor ? 720 : 0);
      const orographicRain = Math.max(0, cell.elevation - upwindElevation) * 0.72;
      const rainfall =
        70 +
        humidAir * 0.34 +
        orographicRain +
        noise(q / 9 - 131, r / 9 + 83) * configuration.climate.rainfallNoise;
      cell.rainfall = clampInteger(rainfall);
      humidity[index] = clampInteger(humidAir * 0.9 - cell.rainfall * 0.56 + (hasWaterNeighbor ? 150 : 0));
    }
  }
}
