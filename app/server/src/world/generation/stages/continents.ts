import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import {
  distanceToSegment,
  interpolatePosition,
  mapPosition,
  offsetPosition,
  translatePosition,
} from '../geometry/math.js';
import { makeLand, makeWater } from '../geometry/topology.js';
import type { SeededRandom } from '../random.js';
import type { ContinentAxis, ContinentPlan, ContinentShape, MapPosition, MutableHex } from '../types.js';
import {
  maximum,
  minimum,
  randomBetween,
  randomBetweenInteger,
  requiredCell,
  requiredNumber,
  shuffle,
  smoothstep,
} from '../utils.js';

export function createContinentPlans(
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
): readonly ContinentPlan[] {
  const radius = calculateContinentRadius(configuration);
  const shapes = Array.from({ length: configuration.continentCount }, () => {
    const center = { x: 0, y: 0 };
    const axisCount = randomBetweenInteger(
      random,
      configuration.continentalAxes.minimumCount,
      configuration.continentalAxes.maximumCount,
    );
    const primaryAngle = random.nextFloat() * Math.PI * 2;
    const primaryLength =
      radius *
      randomBetween(
        random,
        configuration.continentalAxes.primaryLengthMinimumFactor,
        configuration.continentalAxes.primaryLengthMaximumFactor,
      );
    const primaryWidth =
      radius *
      randomBetween(
        random,
        configuration.continentalAxes.widthMinimumFactor,
        configuration.continentalAxes.widthMaximumFactor,
      );
    const primaryStart = offsetPosition(center, primaryAngle + Math.PI, primaryLength / 2);
    const primaryEnd = offsetPosition(center, primaryAngle, primaryLength / 2);
    const axes: ContinentAxis[] = [{ start: primaryStart, end: primaryEnd, width: primaryWidth }];

    for (let axisIndex = 1; axisIndex < axisCount; axisIndex += 1) {
      const anchor = interpolatePosition(primaryStart, primaryEnd, 0.2 + random.nextFloat() * 0.6);
      const direction =
        primaryAngle + (random.nextFloat() < 0.5 ? -1 : 1) * (0.45 + random.nextFloat() * 0.9);
      const length =
        radius *
        randomBetween(
          random,
          configuration.continentalAxes.branchLengthMinimumFactor,
          configuration.continentalAxes.branchLengthMaximumFactor,
        );
      axes.push({
        start: anchor,
        end: offsetPosition(anchor, direction, length),
        width: primaryWidth * (0.62 + random.nextFloat() * 0.28),
      });
    }

    return { axes };
  });
  const minimumSeparation = Math.max(configuration.continentMinimumSeparation, Math.ceil(radius));
  const centers = selectContinentCenters(grid, shapes, configuration, minimumSeparation, random);

  return shapes.map((shape, index) => {
    const centerIndex = requiredNumber(centers, index);
    const center = mapPosition(grid.coordinateAt(centerIndex));
    return {
      center,
      axes: shape.axes.map((axis) => ({
        start: translatePosition(axis.start, center),
        end: translatePosition(axis.end, center),
        width: axis.width,
      })),
    };
  });
}

export function applyContinentalLand(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  plans: readonly ContinentPlan[],
  edgeDistance: readonly number[],
  noise: (x: number, y: number) => number,
): void {
  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    const distanceToEdge = requiredNumber(edgeDistance, index);
    if (distanceToEdge <= configuration.outerOcean.hardWidth) {
      makeWater(cell, configuration.seaLevel);
      continue;
    }

    const position = mapPosition(cell);
    const warpedPosition = {
      x:
        position.x +
        noise(
          cell.q / configuration.continentalAxes.domainWarpScale + 151,
          cell.r / configuration.continentalAxes.domainWarpScale - 89,
        ) *
          configuration.continentalAxes.domainWarpAmount,
      y:
        position.y +
        noise(
          cell.q / configuration.continentalAxes.domainWarpScale - 173,
          cell.r / configuration.continentalAxes.domainWarpScale + 113,
        ) *
          configuration.continentalAxes.domainWarpAmount,
    };
    const axisStrength = maximum(
      plans.flatMap((plan) =>
        plan.axes.map((axis) =>
          smoothstep(0, 1, 1 - distanceToSegment(warpedPosition, axis.start, axis.end) / axis.width),
        ),
      ),
    );
    const planCenterDistances = plans
      .map((plan) => Math.hypot(position.x - plan.center.x, position.y - plan.center.y))
      .sort((left, right) => left - right);
    const closestPlanDistance = planCenterDistances[0];
    const nextPlanDistance = planCenterDistances[1];
    if (closestPlanDistance === undefined || nextPlanDistance === undefined) {
      throw new Error('World generation requires at least two continent plans.');
    }
    const separationInfluence = smoothstep(
      0,
      configuration.continentalAxes.separationWidth,
      nextPlanDistance - closestPlanDistance,
    );
    const coastBand = smoothstep(0.02, 0.7, axisStrength) * smoothstep(1, 0.15, axisStrength);
    const macro = noise(
      cell.q / configuration.coastNoise.macroScale + 41,
      cell.r / configuration.coastNoise.macroScale - 67,
    );
    const bays = noise(
      cell.q / configuration.coastNoise.bayScale - 211,
      cell.r / configuration.coastNoise.bayScale + 127,
    );
    const detail = noise(
      cell.q / configuration.coastNoise.detailScale + 307,
      cell.r / configuration.coastNoise.detailScale - 251,
    );
    const landPotential =
      (axisStrength +
        macro * configuration.coastNoise.macroAmplitude * coastBand +
        (bays * configuration.coastNoise.bayAmplitude + detail * configuration.coastNoise.detailAmplitude) *
          coastBand) *
      separationInfluence;

    if (landPotential <= configuration.continentalAxes.landThreshold) {
      makeWater(cell, configuration.seaLevel);
      continue;
    }

    makeLand(cell, configuration.seaLevel + 26 + landPotential * 320);
  }
}

function calculateContinentRadius(configuration: WorldGenerationConfig): number {
  const requestedArea = configuration.width * configuration.height * configuration.continentCoverage;
  return Math.max(4, Math.sqrt(requestedArea / (configuration.continentCount * Math.PI)) * 1.08);
}

function selectContinentCenters(
  grid: HexGrid,
  shapes: readonly ContinentShape[],
  configuration: WorldGenerationConfig,
  minimumSeparation: number,
  random: SeededRandom,
): readonly number[] {
  const candidateSets = shapes.map((shape) =>
    shuffle(
      Array.from({ length: grid.size }, (_, index) => index).filter((index) =>
        continentShapeFitsInsideWorld(shape, mapPosition(grid.coordinateAt(index)), grid, configuration),
      ),
      random,
    ),
  );
  const firstCandidates = candidateSets[0];
  if (firstCandidates === undefined) {
    throw new Error('World generation did not create any continent placement candidates.');
  }

  for (let attempt = 0; attempt < Math.min(64, firstCandidates.length); attempt += 1) {
    const first = firstCandidates[attempt];
    if (first === undefined) {
      break;
    }
    const centers = [first];

    for (let shapeIndex = 1; shapeIndex < shapes.length; shapeIndex += 1) {
      const candidates = candidateSets[shapeIndex];
      if (candidates === undefined) {
        throw new Error(`World generation is missing candidates for continent shape ${shapeIndex}.`);
      }
      let nextCenter: number | undefined;
      let greatestMinimumDistance = -1;
      for (const candidate of candidates) {
        const nearestCenterDistance = minimum(
          centers.map((center) => grid.distanceBetween(center, candidate)),
        );
        const candidatePosition = mapPosition(grid.coordinateAt(candidate));
        const hasWaterGap = centers.every((center, previousShapeIndex) => {
          const previousShape = shapes[previousShapeIndex];
          if (previousShape === undefined) {
            throw new Error(`World generation is missing continent shape ${previousShapeIndex}.`);
          }
          const currentShape = shapes[shapeIndex];
          if (currentShape === undefined) {
            throw new Error(`World generation is missing continent shape ${shapeIndex}.`);
          }
          return continentShapesHaveWaterGap(
            previousShape,
            mapPosition(grid.coordinateAt(center)),
            currentShape,
            candidatePosition,
            configuration.continentalPlacement.edgeClearance,
          );
        });
        if (
          nearestCenterDistance >= minimumSeparation &&
          hasWaterGap &&
          nearestCenterDistance > greatestMinimumDistance
        ) {
          nextCenter = candidate;
          greatestMinimumDistance = nearestCenterDistance;
        }
      }
      if (nextCenter === undefined) {
        break;
      }
      centers.push(nextCenter);
    }

    if (centers.length === shapes.length) {
      return centers;
    }
  }

  throw new Error(
    `World generation cannot place ${shapes.length} complete continent shapes with separation ${minimumSeparation} on this map.`,
  );
}

function continentShapeFitsInsideWorld(
  shape: ContinentShape,
  center: MapPosition,
  grid: HexGrid,
  configuration: WorldGenerationConfig,
): boolean {
  const safetyMargin =
    configuration.outerOcean.hardWidth +
    configuration.continentalPlacement.edgeClearance +
    configuration.continentalAxes.domainWarpAmount;
  const maximumX = grid.width - 1;
  const maximumY = grid.height - 0.5;

  return shape.axes.every((axis) =>
    [axis.start, axis.end].every((endpoint) => {
      const translated = translatePosition(endpoint, center);
      const requiredClearance = axis.width + safetyMargin;
      return (
        translated.x - requiredClearance >= 0 &&
        translated.x + requiredClearance <= maximumX &&
        translated.y - requiredClearance >= 0 &&
        translated.y + requiredClearance <= maximumY
      );
    }),
  );
}

function continentShapesHaveWaterGap(
  leftShape: ContinentShape,
  leftCenter: MapPosition,
  rightShape: ContinentShape,
  rightCenter: MapPosition,
  waterGap: number,
): boolean {
  return leftShape.axes.every((leftAxis) =>
    rightShape.axes.every((rightAxis) => {
      const translatedLeft = translateAxis(leftAxis, leftCenter);
      const translatedRight = translateAxis(rightAxis, rightCenter);
      return (
        distanceBetweenSegments(translatedLeft, translatedRight) >
        translatedLeft.width + translatedRight.width + waterGap
      );
    }),
  );
}

function translateAxis(axis: ContinentAxis, center: MapPosition): ContinentAxis {
  return {
    start: translatePosition(axis.start, center),
    end: translatePosition(axis.end, center),
    width: axis.width,
  };
}

function distanceBetweenSegments(left: ContinentAxis, right: ContinentAxis): number {
  if (segmentsIntersect(left.start, left.end, right.start, right.end)) {
    return 0;
  }

  return minimum([
    distanceToSegment(left.start, right.start, right.end),
    distanceToSegment(left.end, right.start, right.end),
    distanceToSegment(right.start, left.start, left.end),
    distanceToSegment(right.end, left.start, left.end),
  ]);
}

function segmentsIntersect(
  firstStart: MapPosition,
  firstEnd: MapPosition,
  secondStart: MapPosition,
  secondEnd: MapPosition,
): boolean {
  const first = crossProduct(firstStart, firstEnd, secondStart);
  const second = crossProduct(firstStart, firstEnd, secondEnd);
  const third = crossProduct(secondStart, secondEnd, firstStart);
  const fourth = crossProduct(secondStart, secondEnd, firstEnd);

  return (
    Math.max(Math.min(first, second), Math.min(third, fourth)) <= 0 &&
    Math.min(Math.max(first, second), Math.max(third, fourth)) >= 0
  );
}

function crossProduct(start: MapPosition, end: MapPosition, point: MapPosition): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}
