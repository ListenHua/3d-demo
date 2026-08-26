import { difference, union } from 'polyclip-ts'
import {
  MIN_RENDER_POLYGON_AREA_KM2,
  PROTECT_AREA_TYPE_DEFINITIONS,
} from '../config/protectArea'
import type {
  GeoPosition,
  ProjectedPolygon,
  ProjectedProtectFeature,
} from '../types/protect-area'

type BooleanPoint = [number, number]
type BooleanRing = BooleanPoint[]
type BooleanPolygon = BooleanRing[]
type BooleanMultiPolygon = BooleanPolygon[]

function cloneRing(ring: GeoPosition[]): BooleanRing {
  return ring.map(([x, z]) => [x, z])
}

function toBooleanMultiPolygon(polygons: ProjectedPolygon[]): BooleanMultiPolygon {
  return polygons.map((polygon) => [
    cloneRing(polygon.outer),
    ...polygon.holes.map(cloneRing),
  ])
}

function getRingArea(ring: BooleanRing): number {
  let twiceArea = 0

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    if (!current || !next) continue
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }

  return Math.abs(twiceArea) / 2
}

function hasRenderableArea(polygon: BooleanPolygon): boolean {
  const [outer, ...holes] = polygon
  if (!outer || outer.length < 4) return false

  const area = getRingArea(outer) - holes.reduce(
    (total, hole) => total + getRingArea(hole),
    0,
  )
  return area > MIN_RENDER_POLYGON_AREA_KM2
}

function toProjectedPolygons(multiPolygon: BooleanMultiPolygon): ProjectedPolygon[] {
  return multiPolygon.filter(hasRenderableArea).flatMap(([outer, ...holes]) => {
    if (!outer) return []

    return [{
      outer: outer.map(([x, z]) => [x, z]),
      holes: holes
        .filter((hole) => hole.length >= 4)
        .map((hole) => hole.map(([x, z]) => [x, z])),
    }]
  })
}

function getSourceGeometry(feature: ProjectedProtectFeature): BooleanMultiPolygon {
  const geometry = toBooleanMultiPolygon(feature.polygons)
  return geometry.length ? union(geometry) : []
}

function getOriginalGeometry(
  features: ProjectedProtectFeature[],
): Map<string, ProjectedPolygon[]> {
  return new Map(features.map((feature) => [feature.id, feature.polygons]))
}

export function getVisibleFeaturePolygons(
  features: ProjectedProtectFeature[],
): Map<string, ProjectedPolygon[]> {
  const orderedFeatures = features
    .map((feature, sourceIndex) => ({ feature, sourceIndex }))
    .sort((left, right) => (
      PROTECT_AREA_TYPE_DEFINITIONS[right.feature.type].renderPriority -
        PROTECT_AREA_TYPE_DEFINITIONS[left.feature.type].renderPriority ||
      left.sourceIndex - right.sourceIndex
    ))
  const visiblePolygons = new Map<string, ProjectedPolygon[]>()
  let occupiedGeometry: BooleanMultiPolygon = []

  try {
    for (const { feature } of orderedFeatures) {
      const sourceGeometry = getSourceGeometry(feature)
      const visibleGeometry = occupiedGeometry.length
        ? difference(sourceGeometry, occupiedGeometry)
        : sourceGeometry

      visiblePolygons.set(feature.id, toProjectedPolygons(visibleGeometry))
      occupiedGeometry = occupiedGeometry.length
        ? union(occupiedGeometry, sourceGeometry)
        : sourceGeometry
    }
  } catch (error) {
    console.warn('[ProtectAreaClip] Failed to clip overlapping features.', error)
    return getOriginalGeometry(features)
  }

  return visiblePolygons
}
