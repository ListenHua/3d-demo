import type {
  AreaType,
  GeoPosition,
  ProjectedBounds,
  ProjectedPolygon,
  ProjectedProtectFeature,
  ProtectAreaDataset,
  ProtectAreaFeatureCollection,
  ProtectAreaGeoFeature,
  ProtectAreaGroup,
} from '../types/protect-area'
import { getAreaTypeFromAlias } from '../config/protectArea'

const KILOMETRES_PER_LONGITUDE_DEGREE = 111.32
const KILOMETRES_PER_LATITUDE_DEGREE = 110.57

export function normalizeAreaType(rawType: string): AreaType {
  const areaType = getAreaTypeFromAlias(rawType)

  if (!areaType) {
    throw new Error(`Unsupported protected area type: ${rawType}`)
  }

  return areaType
}

export function createGeoProjector(origin: GeoPosition) {
  const longitudeScale =
    KILOMETRES_PER_LONGITUDE_DEGREE * Math.cos((origin[1] * Math.PI) / 180)

  return ([longitude, latitude]: GeoPosition): GeoPosition => {
    const x = (longitude - origin[0]) * longitudeScale
    const z = -(latitude - origin[1]) * KILOMETRES_PER_LATITUDE_DEGREE

    return [Object.is(x, -0) ? 0 : x, Object.is(z, -0) ? 0 : z]
  }
}

function assertFeatureCollection(value: unknown): asserts value is ProtectAreaFeatureCollection {
  if (!value || typeof value !== 'object') {
    throw new Error('Protected area data must be a GeoJSON object')
  }

  const collection = value as Partial<ProtectAreaFeatureCollection>

  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Protected area data must be a GeoJSON FeatureCollection')
  }

  for (const feature of collection.features) {
    if (
      feature?.type !== 'Feature' ||
      feature.geometry?.type !== 'MultiPolygon' ||
      !Array.isArray(feature.geometry.coordinates) ||
      !feature.properties?.BHDBM ||
      !feature.properties?.BHDMC
    ) {
      throw new Error('Every protected area feature must be a named MultiPolygon')
    }
  }
}

function collectPositions(feature: ProtectAreaGeoFeature): GeoPosition[] {
  return feature.geometry.coordinates.flatMap((polygon) => polygon.flatMap((ring) => ring))
}

function createBounds(positions: GeoPosition[]): ProjectedBounds {
  if (positions.length === 0) {
    throw new Error('Cannot calculate bounds for an empty geometry')
  }

  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const [x, z] of positions) {
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }

  return {
    minX,
    minZ,
    maxX,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
  }
}

function mergeBounds(bounds: ProjectedBounds[]): ProjectedBounds {
  return createBounds(
    bounds.flatMap((bound) => [
      [bound.minX, bound.minZ] as GeoPosition,
      [bound.maxX, bound.maxZ] as GeoPosition,
    ]),
  )
}

function getDatasetOrigin(features: ProtectAreaGeoFeature[]): GeoPosition {
  const geoBounds = createBounds(features.flatMap(collectPositions))
  return geoBounds.center
}

function projectFeature(
  feature: ProtectAreaGeoFeature,
  featureIndex: number,
  project: ReturnType<typeof createGeoProjector>,
): ProjectedProtectFeature {
  const polygons: ProjectedPolygon[] = feature.geometry.coordinates.map(([outer, ...holes]) => {
    if (!outer) {
      throw new Error(`Feature ${feature.properties.BHDBM} contains an empty polygon`)
    }

    return {
      outer: outer.map(project),
      holes: holes.map((ring) => ring.map(project)),
    }
  })
  const positions = polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]).flat()

  return {
    id: `${feature.properties.BHDBM}-${featureIndex}`,
    areaId: feature.properties.BHDBM,
    rawType: feature.properties.BHDLX,
    type: normalizeAreaType(feature.properties.BHDLX),
    area: Number(feature.properties.MJ) || 0,
    polygons,
    bounds: createBounds(positions),
  }
}

export function projectProtectAreaDataset(value: unknown): ProtectAreaDataset {
  assertFeatureCollection(value)

  const origin = getDatasetOrigin(value.features)
  const project = createGeoProjector(origin)
  const projectedFeatures = value.features.map((feature, index) =>
    projectFeature(feature, index, project),
  )
  const areaMap = new Map<string, ProtectAreaGroup>()

  value.features.forEach((feature, index) => {
    const projectedFeature = projectedFeatures[index]

    if (!projectedFeature) return

    const areaId = feature.properties.BHDBM
    const current = areaMap.get(areaId)

    if (current) {
      current.features.push(projectedFeature)
      current.totalArea = Number((current.totalArea + projectedFeature.area).toFixed(2))
      current.types = Array.from(new Set([...current.types, projectedFeature.type]))
      current.bounds = mergeBounds([...current.features.map((item) => item.bounds)])
      return
    }

    areaMap.set(areaId, {
      id: areaId,
      index: areaMap.size,
      name: feature.properties.BHDMC,
      province: String(feature.properties.PXZQMC ?? ''),
      city: String(feature.properties.CXZQMC ?? ''),
      county: String(feature.properties.FXZQMC ?? ''),
      species: String(feature.properties.WZMC ?? ''),
      totalArea: Number(projectedFeature.area.toFixed(2)),
      features: [projectedFeature],
      types: [projectedFeature.type],
      bounds: projectedFeature.bounds,
    })
  })

  return {
    name: value.name ?? '保护区功能划分区',
    origin,
    bounds: mergeBounds(projectedFeatures.map((feature) => feature.bounds)),
    areas: Array.from(areaMap.values()),
    features: projectedFeatures,
    points: [],
  }
}
