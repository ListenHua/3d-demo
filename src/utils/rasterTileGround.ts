import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import type { Material, Texture } from 'three'
import type { GeoPosition, ProjectedBounds } from '../types/protect-area'

export interface GeographicBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface RasterTileAddress {
  x: number
  y: number
  z: number
}

interface TileRange {
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
  columns: number
  rows: number
}

interface TileGrid extends TileRange {
  bounds: GeographicBounds
  tiles: RasterTileAddress[]
  z: number
}

export interface RasterTileGridDebugInfo {
  columns: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  rows: number
  z: number
}

export interface RasterTileGroundOptions {
  anisotropy: number
  center: [number, number]
  elevationY: number
  enabled: boolean
  fallbackColor: string
  fallbackOpacity: number
  groundSize: number
  invalidate: () => void
  level: number
  maxLevel: number
  maxTextureSize: number
  maxTileCount: number
  minLevel: number
  opacity: number
  origin: GeoPosition
  subdomains: readonly string[]
  targetTilesAcrossView: number
  urlTemplate: string
  viewPaddingRatio: number
}

export interface RasterTileGroundGraph {
  currentGrid: TileGrid | null
  featureTexture: Texture | null
  featureCanvas: HTMLCanvasElement | null
  featureContext: CanvasRenderingContext2D | null
  group: Group
  level: number | null
  projectWorldToFeatureUv: ((x: number, z: number) => [number, number]) | null
  surfaceMesh: Mesh | null
  tileMeshes: Map<string, Mesh>
  tileLoadEpoch: number
  tileRetryTimers: number[]
  textureBounds: ProjectedBounds | null
  tileCount: number
  updateView: (
    bounds: ProjectedBounds,
    priorityCenter?: GeoPosition,
    forceReload?: boolean,
  ) => boolean
}

const EPSILON = 1e-10
const KILOMETRES_PER_LONGITUDE_DEGREE = 111.32
const KILOMETRES_PER_LATITUDE_DEGREE = 110.57
const MAX_WEB_MERCATOR_LATITUDE = 85.05112878
const TILE_SIZE = 256
const MAX_CONCURRENT_TILE_LOADS = 8
const TILE_LOAD_RETRY_DELAYS_MS = [800, 1_800, 3_200] as const
const GCJ_A = 6378245
const GCJ_EE = 0.00669342162296594323

export function getWebMercatorTileAddress(
  longitude: number,
  latitude: number,
  level: number,
): RasterTileAddress {
  const latitudeRad = (
    clamp(latitude, -MAX_WEB_MERCATOR_LATITUDE, MAX_WEB_MERCATOR_LATITUDE) *
    Math.PI
  ) / 180
  const scale = 2 ** level
  const maxX = 2 ** level - 1
  const maxY = 2 ** level - 1

  return {
    x: clamp(Math.floor(((longitude + 180) / 360) * scale), 0, maxX),
    y: clamp(
      Math.floor(
        ((1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) / 2) *
        scale,
      ),
      0,
      maxY,
    ),
    z: level,
  }
}

export function getWebMercatorTileBounds(
  tile: RasterTileAddress,
): GeographicBounds {
  const scale = 2 ** tile.z
  const west = (tile.x / scale) * 360 - 180
  const east = ((tile.x + 1) / scale) * 360 - 180

  return {
    west,
    south: webMercatorTileYToLatitude(tile.y + 1, scale),
    east,
    north: webMercatorTileYToLatitude(tile.y, scale),
  }
}

export function wgs84ToGcj02([longitude, latitude]: GeoPosition): GeoPosition {
  if (isOutsideChina(longitude, latitude)) return [longitude, latitude]

  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35)
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35)
  const radLatitude = (latitude / 180) * Math.PI
  let magic = Math.sin(radLatitude)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLatitude = (deltaLatitude * 180) / (
    ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI
  )
  deltaLongitude = (deltaLongitude * 180) / (
    (GCJ_A / sqrtMagic) * Math.cos(radLatitude) * Math.PI
  )

  return [longitude + deltaLongitude, latitude + deltaLatitude]
}

export function gcj02ToWgs84(position: GeoPosition): GeoPosition {
  if (isOutsideChina(position[0], position[1])) return position

  const transformed = wgs84ToGcj02(position)

  return [
    position[0] * 2 - transformed[0],
    position[1] * 2 - transformed[1],
  ]
}

export function createSquareProjectedBounds(
  center: [number, number],
  size: number,
): ProjectedBounds {
  const halfSize = size / 2

  return {
    minX: center[0] - halfSize,
    minZ: center[1] - halfSize,
    maxX: center[0] + halfSize,
    maxZ: center[1] + halfSize,
    width: size,
    depth: size,
    center,
  }
}

export function createRasterTileGridDebugInfo(
  bounds: GeographicBounds,
  preferredLevel: number,
  minLevel: number,
  maxTileCount: number,
  maxTextureSize: number,
): RasterTileGridDebugInfo {
  const grid = resolveTileGrid(
    bounds,
    preferredLevel,
    minLevel,
    maxTileCount,
    maxTextureSize,
  )

  return {
    columns: grid.columns,
    maxX: grid.maxX,
    maxY: grid.maxY,
    minX: grid.minX,
    minY: grid.minY,
    rows: grid.rows,
    z: grid.z,
  }
}

export function projectGeographicPositionToRasterUv(
  position: GeoPosition,
  grid: RasterTileGridDebugInfo,
): [number, number] {
  const [longitude, latitude] = wgs84ToGcj02(position)
  const scale = 2 ** grid.z
  const latitudeRad = (
    clamp(latitude, -MAX_WEB_MERCATOR_LATITUDE, MAX_WEB_MERCATOR_LATITUDE) *
    Math.PI
  ) / 180
  const tileX = ((longitude + 180) / 360) * scale
  const tileY = (
    (1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) /
    2
  ) * scale

  return [
    (tileX - grid.minX) / grid.columns,
    1 - (tileY - grid.minY) / grid.rows,
  ]
}

export function createRasterTileGround(
  options: RasterTileGroundOptions,
): RasterTileGroundGraph {
  const group = new Group()
  group.name = 'amap-raster-tile-ground'
  group.add(createFallbackGroundMesh(options))
  const featureCanvas = document.createElement('canvas')
  const featureContext = featureCanvas.getContext('2d')
  const featureTexture = options.enabled ? new CanvasTexture(featureCanvas) : null
  if (featureTexture) configureTexture(featureTexture, options.anisotropy)
  const surfaceMesh = featureTexture
    ? createRasterGroundSurfaceMesh(featureTexture, options)
    : null
  if (surfaceMesh) group.add(surfaceMesh)
  const tileMeshes = new Map<string, Mesh>()
  const graph: RasterTileGroundGraph = {
    currentGrid: null,
    featureTexture,
    featureCanvas: featureTexture ? featureCanvas : null,
    featureContext,
    group,
    level: null,
    projectWorldToFeatureUv: (x, z) => {
      if (!graph.currentGrid) return [0, 0]

      return projectWorldToRasterUv(x, z, graph.currentGrid, options.origin)
    },
    surfaceMesh,
    tileMeshes,
    tileLoadEpoch: 0,
    tileRetryTimers: [],
    textureBounds: null,
    tileCount: 0,
    updateView: (bounds, priorityCenter, forceReload) => updateRasterTileGroundView(
      graph,
      options,
      bounds,
      priorityCenter,
      forceReload,
    ),
  }

  if (!options.enabled) {
    graph.featureTexture = null
    graph.featureCanvas = null
    graph.featureContext = null
    graph.projectWorldToFeatureUv = null
    graph.surfaceMesh = null
    return graph
  }

  const groundBounds = createSquareProjectedBounds(options.center, options.groundSize)
  graph.updateView(groundBounds)

  return graph
}

export function disposeRasterTileGround(graph: RasterTileGroundGraph): void {
  clearTileRetryTimers(graph)

  graph.group.traverse((object) => {
    if (!(object instanceof Mesh)) return

    object.geometry.dispose()

    if (Array.isArray(object.material)) {
      object.material.forEach(disposeMaterialWithTexture)
      return
    }

    disposeMaterialWithTexture(object.material)
  })
}

function updateRasterTileGroundView(
  graph: RasterTileGroundGraph,
  options: RasterTileGroundOptions,
  bounds: ProjectedBounds,
  priorityCenter?: GeoPosition,
  forceReload = false,
): boolean {
  if (!options.enabled) return false

  const viewBounds = expandProjectedBounds(bounds, options.viewPaddingRatio)
  const geographicBounds = projectedBoundsToGeographicBounds(viewBounds, options.origin)
  const preferredLevel = getPreferredTileLevel(viewBounds, options)
  const grid = resolveTileGrid(
    geographicBounds,
    preferredLevel,
    options.minLevel,
    options.maxTileCount,
    Math.max(TILE_SIZE, options.maxTextureSize),
  )
  const nextKey = getTileGridKey(grid)

  if (
    !forceReload &&
    graph.currentGrid &&
    getTileGridKey(graph.currentGrid) === nextKey
  ) return false

  graph.currentGrid = grid
  graph.level = grid.z
  graph.tileCount = grid.count
  graph.textureBounds = geographicBoundsToProjectedBounds(grid.bounds, options.origin)

  updateRasterGroundSurfaceMesh(graph, graph.textureBounds, options.elevationY)
  updateFeatureTexture(graph, grid, options, priorityCenter)
  options.invalidate()

  return true
}

function createRasterGroundSurfaceMesh(
  texture: Texture,
  options: RasterTileGroundOptions,
): Mesh {
  const material = new MeshBasicMaterial({
    color: '#ffffff',
    fog: false,
    map: texture,
    opacity: options.opacity,
    transparent: options.opacity < 1,
  })
  material.depthWrite = false

  const geometry = new PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)

  const mesh = new Mesh(geometry, material)
  mesh.name = 'amap-raster-tile-surface'
  mesh.position.set(options.center[0], options.elevationY, options.center[1])
  mesh.renderOrder = -10
  mesh.raycast = () => {}

  return mesh
}

function updateRasterGroundSurfaceMesh(
  graph: RasterTileGroundGraph,
  bounds: ProjectedBounds,
  elevationY: number,
): void {
  if (!graph.surfaceMesh) return

  graph.surfaceMesh.geometry.dispose()
  const geometry = new PlaneGeometry(bounds.width, bounds.depth)
  geometry.rotateX(-Math.PI / 2)
  graph.surfaceMesh.geometry = geometry
  graph.surfaceMesh.position.set(bounds.center[0], elevationY, bounds.center[1])
}

function updateFeatureTexture(
  graph: RasterTileGroundGraph,
  grid: TileGrid,
  options: RasterTileGroundOptions,
  priorityCenter?: GeoPosition,
): void {
  if (!graph.featureCanvas || !graph.featureContext || !graph.featureTexture) return

  clearTileRetryTimers(graph)
  const loadEpoch = graph.tileLoadEpoch + 1
  graph.tileLoadEpoch = loadEpoch
  graph.featureCanvas.width = grid.columns * TILE_SIZE
  graph.featureCanvas.height = grid.rows * TILE_SIZE
  graph.featureContext.fillStyle = options.fallbackColor
  graph.featureContext.fillRect(0, 0, graph.featureCanvas.width, graph.featureCanvas.height)
  graph.featureTexture.needsUpdate = true

  const tiles = sortTilesByPriority(grid.tiles, grid, options.origin, priorityCenter)
  let activeLoads = 0
  let nextTileIndex = 0

  const pumpQueue = (): void => {
    if (graph.currentGrid !== grid || graph.tileLoadEpoch !== loadEpoch) return

    while (
      activeLoads < MAX_CONCURRENT_TILE_LOADS &&
      nextTileIndex < tiles.length
    ) {
      const tile = tiles[nextTileIndex]
      nextTileIndex += 1
      if (!tile) continue

      activeLoads += 1
      loadFeatureTileImage(graph, grid, tile, options, loadEpoch, 0, () => {
        activeLoads -= 1
        pumpQueue()
      })
    }
  }

  pumpQueue()
}

function clearTileRetryTimers(graph: RasterTileGroundGraph): void {
  graph.tileRetryTimers.forEach((timer) => window.clearTimeout(timer))
  graph.tileRetryTimers = []
}

function sortTilesByPriority(
  tiles: RasterTileAddress[],
  grid: TileGrid,
  origin: GeoPosition,
  priorityCenter?: GeoPosition,
): RasterTileAddress[] {
  if (!priorityCenter) return [...tiles]

  const [u, v] = projectWorldToRasterUv(priorityCenter[0], priorityCenter[1], grid, origin)
  const priorityTileX = grid.minX + u * grid.columns
  const priorityTileY = grid.minY + (1 - v) * grid.rows

  return [...tiles].sort((first, second) => {
    const firstDistance = Math.hypot(
      first.x + 0.5 - priorityTileX,
      first.y + 0.5 - priorityTileY,
    )
    const secondDistance = Math.hypot(
      second.x + 0.5 - priorityTileX,
      second.y + 0.5 - priorityTileY,
    )

    return firstDistance - secondDistance
  })
}

function loadFeatureTileImage(
  graph: RasterTileGroundGraph,
  grid: TileGrid,
  tile: RasterTileAddress,
  options: RasterTileGroundOptions,
  loadEpoch: number,
  attempt = 0,
  onDone: () => void,
): void {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.onload = () => {
    if (graph.currentGrid !== grid || graph.tileLoadEpoch !== loadEpoch) return

    graph.featureContext?.drawImage(
      image,
      (tile.x - grid.minX) * TILE_SIZE,
      (tile.y - grid.minY) * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
    )
    if (graph.featureTexture) graph.featureTexture.needsUpdate = true
    options.invalidate()
    onDone()
  }
  image.onerror = () => {
    if (graph.currentGrid !== grid || graph.tileLoadEpoch !== loadEpoch) return

    const retryDelay = TILE_LOAD_RETRY_DELAYS_MS[attempt]
    if (retryDelay !== undefined) {
      const retryTimer = window.setTimeout(() => {
        if (graph.currentGrid === grid && graph.tileLoadEpoch === loadEpoch) {
          loadFeatureTileImage(
            graph,
            grid,
            tile,
            options,
            loadEpoch,
            attempt + 1,
            onDone,
          )
        }
      }, retryDelay)
      graph.tileRetryTimers.push(retryTimer)
      return
    }

    options.invalidate()
    onDone()
  }
  image.src = createTileUrl(options.urlTemplate, tile, options)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function expandProjectedBounds(
  bounds: ProjectedBounds,
  paddingRatio: number,
): ProjectedBounds {
  const padding = Math.max(bounds.width, bounds.depth) * paddingRatio
  const minX = bounds.minX - padding
  const minZ = bounds.minZ - padding
  const maxX = bounds.maxX + padding
  const maxZ = bounds.maxZ + padding

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

function getPreferredTileLevel(
  bounds: ProjectedBounds,
  options: RasterTileGroundOptions,
): number {
  const longestSideKm = Math.max(bounds.width, bounds.depth, 0.001)
  const latitudeScale = Math.max(Math.cos((options.origin[1] * Math.PI) / 180), 0.2)
  const earthCircumferenceAtLatitudeKm = 40_075.016686 * latitudeScale
  const estimatedLevel = Math.round(Math.log2(
    (earthCircumferenceAtLatitudeKm * options.targetTilesAcrossView) /
    longestSideKm,
  ))

  return clamp(
    Math.max(estimatedLevel, options.level),
    options.minLevel,
    options.maxLevel,
  )
}

function getTileGridKey(grid: TileGrid): string {
  return `${grid.z}/${grid.minX}/${grid.minY}/${grid.maxX}/${grid.maxY}`
}

function webMercatorTileYToLatitude(y: number, scale: number): number {
  return (
    Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) *
    180
  ) / Math.PI
}

function isOutsideChina(longitude: number, latitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function gcjBoundsToWgs84Bounds(bounds: GeographicBounds): GeographicBounds {
  const corners = [
    gcj02ToWgs84([bounds.west, bounds.north]),
    gcj02ToWgs84([bounds.east, bounds.north]),
    gcj02ToWgs84([bounds.east, bounds.south]),
    gcj02ToWgs84([bounds.west, bounds.south]),
  ]
  const longitudes = corners.map((corner) => corner[0])
  const latitudes = corners.map((corner) => corner[1])

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  }
}

function createFallbackGroundMesh(options: RasterTileGroundOptions): Mesh {
  const geometry = new PlaneGeometry(options.groundSize, options.groundSize, 1, 1)
  geometry.rotateX(-Math.PI / 2)

  const material = new MeshBasicMaterial({
    color: options.fallbackColor,
    fog: false,
    opacity: options.fallbackOpacity,
    transparent: options.fallbackOpacity < 1,
  })
  material.depthWrite = false

  const mesh = new Mesh(geometry, material)
  mesh.name = 'local-fallback-ground-surface'
  mesh.position.set(options.center[0], options.elevationY - 0.0005, options.center[1])
  mesh.renderOrder = -20
  mesh.raycast = () => {}

  return mesh
}

function getLongitudeScale(origin: GeoPosition): number {
  return KILOMETRES_PER_LONGITUDE_DEGREE * Math.cos((origin[1] * Math.PI) / 180)
}

function transformLatitude(x: number, y: number): number {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  result += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3

  return result
}

function transformLongitude(x: number, y: number): number {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  result += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3

  return result
}

function projectedBoundsToGeographicBounds(
  bounds: ProjectedBounds,
  origin: GeoPosition,
): GeographicBounds {
  const longitudeScale = getLongitudeScale(origin)
  const west = origin[0] + bounds.minX / longitudeScale
  const east = origin[0] + bounds.maxX / longitudeScale
  const north = origin[1] - bounds.minZ / KILOMETRES_PER_LATITUDE_DEGREE
  const south = origin[1] - bounds.maxZ / KILOMETRES_PER_LATITUDE_DEGREE

  return {
    west: Math.min(west, east),
    south: Math.min(south, north),
    east: Math.max(west, east),
    north: Math.max(south, north),
  }
}

function geographicBoundsToProjectedBounds(
  bounds: GeographicBounds,
  origin: GeoPosition,
): ProjectedBounds {
  const longitudeScale = getLongitudeScale(origin)
  const minX = (bounds.west - origin[0]) * longitudeScale
  const maxX = (bounds.east - origin[0]) * longitudeScale
  const minZ = -(bounds.north - origin[1]) * KILOMETRES_PER_LATITUDE_DEGREE
  const maxZ = -(bounds.south - origin[1]) * KILOMETRES_PER_LATITUDE_DEGREE

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

function projectedPositionToGeographicPosition(
  x: number,
  z: number,
  origin: GeoPosition,
): GeoPosition {
  const longitudeScale = getLongitudeScale(origin)

  return [
    origin[0] + x / longitudeScale,
    origin[1] - z / KILOMETRES_PER_LATITUDE_DEGREE,
  ]
}

function projectWorldToRasterUv(
  x: number,
  z: number,
  grid: TileGrid,
  origin: GeoPosition,
): [number, number] {
  return projectGeographicPositionToRasterUv(
    projectedPositionToGeographicPosition(x, z, origin),
    grid,
  )
}

function getTileRange(bounds: GeographicBounds, level: number): TileRange {
  const northWest = wgs84ToGcj02([bounds.west, bounds.north])
  const southEast = wgs84ToGcj02([bounds.east, bounds.south])
  const minAddress = getWebMercatorTileAddress(northWest[0], northWest[1], level)
  const maxAddress = getWebMercatorTileAddress(
    southEast[0] - EPSILON,
    southEast[1] + EPSILON,
    level,
  )
  const maxX = 2 ** level - 1
  const maxY = 2 ** level - 1
  const minX = clamp(Math.min(minAddress.x, maxAddress.x), 0, maxX)
  const maxTileX = clamp(Math.max(minAddress.x, maxAddress.x), 0, maxX)
  const minY = clamp(Math.min(minAddress.y, maxAddress.y), 0, maxY)
  const maxTileY = clamp(Math.max(minAddress.y, maxAddress.y), 0, maxY)
  const columns = maxTileX - minX + 1
  const rows = maxTileY - minY + 1

  return {
    minX,
    minY,
    maxX: maxTileX,
    maxY: maxTileY,
    count: columns * rows,
    columns,
    rows,
  }
}

function resolveTileGrid(
  bounds: GeographicBounds,
  preferredLevel: number,
  minLevel: number,
  maxTileCount: number,
  maxTextureSize: number,
): TileGrid {
  const minimumLevel = Math.max(1, minLevel)

  for (let level = preferredLevel; level >= minimumLevel; level -= 1) {
    const range = getTileRange(bounds, level)
    const fitsTileBudget = range.count <= maxTileCount
    const fitsTextureBudget = (
      range.columns * TILE_SIZE <= maxTextureSize &&
      range.rows * TILE_SIZE <= maxTextureSize
    )

    if (fitsTileBudget && fitsTextureBudget) {
      return createTileGrid(level, range)
    }
  }

  return createTileGrid(minimumLevel, getTileRange(bounds, minimumLevel))
}

function createTileGrid(
  level: number,
  range: TileRange,
): TileGrid {
  const tiles: RasterTileAddress[] = []

  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      tiles.push({ x, y, z: level })
    }
  }

  return {
    ...range,
    bounds: gcjBoundsToWgs84Bounds(mergeTileBounds(
      getWebMercatorTileBounds({ x: range.minX, y: range.minY, z: level }),
      getWebMercatorTileBounds({ x: range.maxX, y: range.maxY, z: level }),
    ),
    ),
    tiles,
    z: level,
  }
}

function mergeTileBounds(
  northWest: GeographicBounds,
  southEast: GeographicBounds,
): GeographicBounds {
  return {
    west: northWest.west,
    north: northWest.north,
    east: southEast.east,
    south: southEast.south,
  }
}

function createTileUrl(
  template: string,
  tile: RasterTileAddress,
  options: Pick<RasterTileGroundOptions, 'subdomains'>,
): string {
  const subdomain = options.subdomains.length > 0
    ? options.subdomains[(tile.x + tile.y + tile.z) % options.subdomains.length]
    : ''

  return template
    .replace('{s}', subdomain ?? '')
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
    .replace('{z}', String(tile.z))
}

function configureTexture(texture: Texture, anisotropy: number): void {
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = Math.min(anisotropy, 8)
}

function disposeMaterialWithTexture(material: Material): void {
  const maybeTextured = material as Material & { map?: Texture | null }
  maybeTextured.map?.dispose()
  material.dispose()
}
