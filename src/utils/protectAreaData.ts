import { PROTECT_AREA_TRANSFORM_CONFIG } from '../config/protectArea'
import type {
  GeoPosition,
  PointGrowthStatus,
  ProjectedPolygon,
  ProtectAreaDataset,
  ProtectAreaPoint,
  ProtectAreaPointSource,
} from '../types/protect-area'
import { getVisibleFeaturePolygons } from './protectAreaClip'
import {
  createGeoProjector,
  projectProtectAreaDataset,
} from './protectAreaGeo'

const POINT_GROWTH_STATUSES = new Set<PointGrowthStatus>([
  'attention',
  'good',
  'normal',
])

function pointsEqual(left: GeoPosition, right: GeoPosition): boolean {
  return left[0] === right[0] && left[1] === right[1]
}

function squaredSegmentDistance(
  point: GeoPosition,
  start: GeoPosition,
  end: GeoPosition,
): number {
  let x = start[0]
  let z = start[1]
  const deltaX = end[0] - x
  const deltaZ = end[1] - z

  if (deltaX !== 0 || deltaZ !== 0) {
    const progress = (
      (point[0] - x) * deltaX + (point[1] - z) * deltaZ
    ) / (deltaX ** 2 + deltaZ ** 2)

    if (progress > 1) {
      x = end[0]
      z = end[1]
    } else if (progress > 0) {
      x += deltaX * progress
      z += deltaZ * progress
    }
  }

  return (point[0] - x) ** 2 + (point[1] - z) ** 2
}

function simplifyOpenLine(
  points: GeoPosition[],
  squaredTolerance: number,
): GeoPosition[] {
  if (points.length <= 2) return points.slice()

  let furthestIndex = -1
  let furthestDistance = squaredTolerance

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredSegmentDistance(
      points[index],
      points[0],
      points[points.length - 1],
    )
    if (distance > furthestDistance) {
      furthestDistance = distance
      furthestIndex = index
    }
  }

  if (furthestIndex < 0) return [points[0], points[points.length - 1]]

  const left = simplifyOpenLine(points.slice(0, furthestIndex + 1), squaredTolerance)
  const right = simplifyOpenLine(points.slice(furthestIndex), squaredTolerance)
  return [...left.slice(0, -1), ...right]
}

function createCyclicArc(
  points: GeoPosition[],
  startIndex: number,
  endIndex: number,
): GeoPosition[] {
  const arc: GeoPosition[] = []

  for (let index = startIndex; ; index = (index + 1) % points.length) {
    arc.push(points[index])
    if (index === endIndex) return arc
  }
}

function findFurthestPointIndex(points: GeoPosition[], sourceIndex: number): number {
  let furthestIndex = sourceIndex
  let furthestDistance = -1

  for (let index = 0; index < points.length; index += 1) {
    const deltaX = points[sourceIndex][0] - points[index][0]
    const deltaZ = points[sourceIndex][1] - points[index][1]
    const distance = deltaX ** 2 + deltaZ ** 2
    if (distance > furthestDistance) {
      furthestDistance = distance
      furthestIndex = index
    }
  }

  return furthestIndex
}

function roundCoordinate(value: number, precision: number): number {
  const multiplier = 10 ** precision
  const rounded = Math.round(value * multiplier) / multiplier
  return Object.is(rounded, -0) ? 0 : rounded
}

function closeAndRoundRing(points: GeoPosition[], precision: number): GeoPosition[] {
  const rounded: GeoPosition[] = []

  for (const point of points) {
    const next: GeoPosition = [
      roundCoordinate(point[0], precision),
      roundCoordinate(point[1], precision),
    ]
    if (!rounded.length || !pointsEqual(rounded[rounded.length - 1], next)) {
      rounded.push(next)
    }
  }

  if (rounded.length > 1 && pointsEqual(rounded[0], rounded[rounded.length - 1])) {
    rounded.pop()
  }
  if (rounded.length < 3) return []

  rounded.push([...rounded[0]])
  return rounded
}

function simplifyClosedRing(
  ring: GeoPosition[],
  tolerance: number,
  precision: number,
): GeoPosition[] {
  const openRing = pointsEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring.slice()
  if (openRing.length <= 3) return closeAndRoundRing(openRing, precision)

  const firstAnchor = findFurthestPointIndex(openRing, 0)
  const secondAnchor = findFurthestPointIndex(openRing, firstAnchor)
  const squaredTolerance = tolerance ** 2
  const firstArc = simplifyOpenLine(
    createCyclicArc(openRing, firstAnchor, secondAnchor),
    squaredTolerance,
  )
  const secondArc = simplifyOpenLine(
    createCyclicArc(openRing, secondAnchor, firstAnchor),
    squaredTolerance,
  )

  return closeAndRoundRing(
    [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)],
    precision,
  )
}

function getRingArea(ring: GeoPosition[]): number {
  let twiceArea = 0

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(twiceArea) / 2
}

function getPolygonArea(polygon: ProjectedPolygon): number {
  return getRingArea(polygon.outer) - polygon.holes.reduce(
    (total, ring) => total + getRingArea(ring),
    0,
  )
}

function isPointInRing(point: GeoPosition, ring: GeoPosition[]): boolean {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    const intersects = (
      (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) &&
      point[0] < (
        (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) /
          (previousPoint[1] - currentPoint[1]) + currentPoint[0]
      )
    )
    if (intersects) inside = !inside
  }

  return inside
}

function isPointInPolygons(point: GeoPosition, polygons: ProjectedPolygon[]): boolean {
  return polygons.some((polygon) => (
    isPointInRing(point, polygon.outer) &&
    !polygon.holes.some((ring) => isPointInRing(point, ring))
  ))
}

function assertPointSources(value: unknown): asserts value is ProtectAreaPointSource[] {
  if (!Array.isArray(value)) throw new Error('Monitoring point data must be an array')

  for (const point of value as Array<Partial<ProtectAreaPointSource>>) {
    if (
      typeof point.id !== 'string' ||
      typeof point.name !== 'string' ||
      typeof point.areaId !== 'string' ||
      typeof point.featureId !== 'string' ||
      typeof point.longitude !== 'number' ||
      typeof point.latitude !== 'number' ||
      !Array.isArray(point.species) ||
      typeof point.plantingAreaHa !== 'number' ||
      typeof point.plantCount !== 'number' ||
      !POINT_GROWTH_STATUSES.has(point.growthStatus as PointGrowthStatus) ||
      typeof point.surveyDate !== 'string' ||
      point.source !== 'mock'
    ) {
      throw new Error(`Invalid monitoring point source: ${String(point.id ?? 'unknown')}`)
    }
  }
}

function simplifyVisiblePolygons(dataset: ProtectAreaDataset): void {
  const config = PROTECT_AREA_TRANSFORM_CONFIG
  let inputArea = 0
  let outputArea = 0

  for (const area of dataset.areas) {
    const visiblePolygons = getVisibleFeaturePolygons(area.features)

    for (const feature of area.features) {
      const input = visiblePolygons.get(feature.id) ?? []
      const output = input.flatMap((polygon) => {
        const outer = simplifyClosedRing(
          polygon.outer,
          config.simplifyToleranceKm,
          config.coordinatePrecision,
        )
        if (outer.length < 4) return []

        return [{
          outer,
          holes: polygon.holes
            .map((ring) => simplifyClosedRing(
              ring,
              config.simplifyToleranceKm,
              config.coordinatePrecision,
            ))
            .filter((ring) => ring.length >= 4),
        }]
      })

      inputArea += input.reduce((total, polygon) => total + getPolygonArea(polygon), 0)
      outputArea += output.reduce((total, polygon) => total + getPolygonArea(polygon), 0)
      feature.polygons = output
    }
  }

  const areaDeltaRatio = Math.abs(outputArea - inputArea) / inputArea
  if (areaDeltaRatio > config.maxAreaDeltaRatio) {
    throw new Error(`Simplified area delta ${areaDeltaRatio} exceeds configured limit`)
  }
}

function projectPointSources(
  dataset: ProtectAreaDataset,
  value: unknown,
): ProtectAreaPoint[] {
  assertPointSources(value)
  const project = createGeoProjector(dataset.origin)
  const featureById = new Map(dataset.features.map((feature) => [feature.id, feature]))
  const pointIds = new Set<string>()

  return value.map((source) => {
    if (pointIds.has(source.id)) throw new Error(`Duplicate monitoring point id: ${source.id}`)
    pointIds.add(source.id)

    const feature = featureById.get(source.featureId)
    if (!feature || feature.areaId !== source.areaId) {
      throw new Error(`Invalid feature relation for monitoring point ${source.id}`)
    }

    const projected = project([source.longitude, source.latitude])
    const position: GeoPosition = [
      roundCoordinate(projected[0], PROTECT_AREA_TRANSFORM_CONFIG.coordinatePrecision),
      roundCoordinate(projected[1], PROTECT_AREA_TRANSFORM_CONFIG.coordinatePrecision),
    ]
    if (!isPointInPolygons(position, feature.polygons)) {
      throw new Error(`Monitoring point ${source.id} is outside feature ${feature.id}`)
    }

    return {
      ...source,
      featureType: feature.type,
      position,
    }
  })
}

export function prepareProtectAreaDataset(
  protectAreaSource: unknown,
  pointSource: unknown,
): ProtectAreaDataset {
  const dataset = projectProtectAreaDataset(protectAreaSource)
  simplifyVisiblePolygons(dataset)
  dataset.points = projectPointSources(dataset, pointSource)
  return dataset
}
