export type GeoPosition = [number, number]
export type WorldPosition2D = [number, number]
export type WorldPosition3D = [number, number, number]
export type GeoLinearRing = GeoPosition[]
export type GeoPolygonCoordinates = GeoLinearRing[]
export type GeoMultiPolygonCoordinates = GeoPolygonCoordinates[]

export interface ProtectAreaProperties {
  BHDLX: string
  MJ: number
  BHDMC: string
  BHDBM: string
  PXZQMC?: string
  CXZQMC?: string
  FXZQMC?: string
  WZMC?: string
  [key: string]: unknown
}

export interface ProtectAreaGeoFeature {
  type: 'Feature'
  properties: ProtectAreaProperties
  geometry: {
    type: 'MultiPolygon'
    coordinates: GeoMultiPolygonCoordinates
  }
}

export interface ProtectAreaFeatureCollection {
  type: 'FeatureCollection'
  name?: string
  features: ProtectAreaGeoFeature[]
}

export type AreaType = 'buffer' | 'core' | 'experiment' | 'rescue'
export type PointGrowthStatus = 'attention' | 'good' | 'normal'

export interface ProjectedBounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  width: number
  depth: number
  center: [number, number]
}

export interface ProjectedPolygon {
  outer: GeoPosition[]
  holes: GeoPosition[][]
}

export interface ProjectedProtectFeature {
  id: string
  areaId: string
  rawType: string
  type: AreaType
  area: number
  polygons: ProjectedPolygon[]
  bounds: ProjectedBounds
}

export interface ProtectAreaGroup {
  id: string
  index: number
  name: string
  province: string
  city: string
  county: string
  species: string
  totalArea: number
  features: ProjectedProtectFeature[]
  types: AreaType[]
  bounds: ProjectedBounds
}

export interface ProtectAreaDataset {
  name: string
  origin: GeoPosition
  bounds: ProjectedBounds
  areas: ProtectAreaGroup[]
  features: ProjectedProtectFeature[]
  points: ProtectAreaPoint[]
}

export interface ProtectAreaPointSource {
  id: string
  name: string
  areaId: string
  featureId: string
  longitude: number
  latitude: number
  species: string[]
  description: string
  habitat: string
  monitoringMethod: string
  plantingAreaHa: number
  plantCount: number
  growthStatus: PointGrowthStatus
  riskNote: string
  speciesImageUrl: string
  speciesImageUrls: string[]
  surveyDate: string
  source: 'mock'
}

export interface ProtectAreaPoint extends ProtectAreaPointSource {
  featureType: AreaType
  position: WorldPosition2D
}

export interface FeatureReturnContext {
  areaId: string
  mode: 'area' | 'view'
  view: {
    position: WorldPosition3D
    target: WorldPosition3D
  }
}

export interface ProtectFeatureSelection {
  kind: 'feature'
  areaId: string
  featureId: string
  point: WorldPosition3D
  returnContext: FeatureReturnContext
}

export interface ProtectPointSelection {
  kind: 'point'
  areaId: string
  featureId: string
  pointId: string
  point: WorldPosition3D
  returnContext: FeatureReturnContext
}

export type ProtectSceneSelection = ProtectFeatureSelection | ProtectPointSelection
