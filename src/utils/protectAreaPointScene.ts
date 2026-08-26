import {
  BufferGeometry,
  ConeGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three'
import { gsap } from 'gsap'
import {
  PROTECT_POINT_STATUSES,
  PROTECT_POINT_STATUS_DEFINITIONS,
} from '../config/protectArea'
import { SCENE_CONFIG } from '../config/scene'
import type { PointGrowthStatus, ProtectAreaPoint } from '../types/protect-area'

interface ProtectAreaPointBatch {
  areaId: string
  hitMesh: InstancedMesh
  mesh: InstancedMesh
  phases: number[]
  pointIds: string[]
  points: ProtectAreaPoint[]
  status: PointGrowthStatus
}

interface ProtectAreaPointShadowBatch {
  areaId: string
  mesh: InstancedMesh
  phases: number[]
  points: ProtectAreaPoint[]
}

interface PointHoverScaleState {
  value: number
}

export interface ProtectAreaPointSceneGraph {
  activeAreaId: string | null
  batches: ProtectAreaPointBatch[]
  geometry: BufferGeometry
  group: Group
  hitMaterial: MeshBasicMaterial
  hoverScaleByPointId: Map<string, PointHoverScaleState>
  hoveredPointId: string | null
  materials: Map<PointGrowthStatus, MeshBasicMaterial>
  pointById: Map<string, ProtectAreaPoint>
  selectedPointId: string | null
  shadowBatches: ProtectAreaPointShadowBatch[]
  shadowGeometry: PlaneGeometry
  shadowMaterial: MeshBasicMaterial
  shadowTexture: DataTexture
}

const instanceMatrix = new Matrix4()
const instancePosition = new Vector3()
const instanceQuaternion = new Quaternion()
const instanceScale = new Vector3()
const hitScale = new Vector3()
const rotationQuaternion = new Quaternion()
const yAxis = new Vector3(0, 1, 0)

function getPointPhase(pointId: string): number {
  let hash = 2166136261
  for (const character of pointId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2
}

function applyFacetBrightness(geometry: BufferGeometry): void {
  const normal = geometry.getAttribute('normal')
  const colors: number[] = []
  const brightness = SCENE_CONFIG.monitoringPoint.facetBrightness
  const sideBrightness: number[] = [
    brightness.light,
    brightness.middle,
    brightness.dark,
  ]

  for (let index = 0; index < normal.count; index += 1) {
    const normalY = normal.getY(index)
    let value: number = brightness.middle

    if (Math.abs(normalY) < 0.9) {
      const angle = (Math.atan2(normal.getZ(index), normal.getX(index)) + Math.PI * 2) % (
        Math.PI * 2
      )
      const sector = Math.floor((angle + Math.PI / 3) / (Math.PI * 2 / 3)) % 3
      value = sideBrightness[sector]
    }
    colors.push(value, value, value)
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
}

function createShadowTexture(): DataTexture {
  const size = SCENE_CONFIG.monitoringPoint.shadowTextureSizePx
  const data = new Uint8Array(size * size * 4)
  const center = (size - 1) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.min(Math.hypot(x - center, y - center) / center, 1)
      const alpha = Math.round((1 - distance) ** 2 * 255)
      const offset = (y * size + x) * 4
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
      data[offset + 3] = alpha
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function createPointBatch(
  areaId: string,
  points: ProtectAreaPoint[],
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  hitMaterial: MeshBasicMaterial,
  status: PointGrowthStatus,
): ProtectAreaPointBatch {
  const mesh = new InstancedMesh(geometry, material, points.length)
  const hitMesh = new InstancedMesh(geometry, hitMaterial, points.length)
  const pointIds = points.map((point) => point.id)

  mesh.name = `${areaId}-${status}-monitoring-point-markers`
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.renderOrder = 1_000
  mesh.userData.areaId = areaId
  mesh.userData.isMonitoringPoint = true
  mesh.userData.pointIds = pointIds

  hitMesh.name = `${areaId}-${status}-monitoring-point-hits`
  hitMesh.instanceMatrix.setUsage(DynamicDrawUsage)
  hitMesh.frustumCulled = false
  hitMesh.userData.areaId = areaId
  hitMesh.userData.isMonitoringPoint = true
  hitMesh.userData.pointIds = pointIds

  return {
    areaId,
    hitMesh,
    mesh,
    phases: points.map((point) => getPointPhase(point.id)),
    pointIds,
    points,
    status,
  }
}

function createShadowBatch(
  areaId: string,
  points: ProtectAreaPoint[],
  geometry: PlaneGeometry,
  material: MeshBasicMaterial,
): ProtectAreaPointShadowBatch {
  const mesh = new InstancedMesh(geometry, material, points.length)
  mesh.name = `${areaId}-monitoring-point-shadows`
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.renderOrder = 999
  mesh.userData.areaId = areaId
  mesh.userData.isMonitoringPointShadow = true
  mesh.visible = false
  mesh.raycast = () => undefined
  return {
    areaId,
    mesh,
    phases: points.map((point) => getPointPhase(point.id)),
    points,
  }
}

export function createProtectAreaPointSceneGraph(
  points: ProtectAreaPoint[],
): ProtectAreaPointSceneGraph {
  const group = new Group()
  const geometry = new ConeGeometry(0.5, 1, 3, 1, false).toNonIndexed()
  geometry.rotateZ(Math.PI)
  applyFacetBrightness(geometry)

  const materials = new Map<PointGrowthStatus, MeshBasicMaterial>(
    PROTECT_POINT_STATUSES.map((status) => [
      status,
      new MeshBasicMaterial({
        color: PROTECT_POINT_STATUS_DEFINITIONS[status].color,
        fog: false,
        side: DoubleSide,
        toneMapped: false,
        vertexColors: true,
      }),
    ]),
  )
  const hitMaterial = new MeshBasicMaterial({
    side: DoubleSide,
    visible: false,
  })
  const shadowTexture = createShadowTexture()
  const shadowGeometry = new PlaneGeometry(1, 1)
  shadowGeometry.scale(1, 0.58, 1)
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadowMaterial = new MeshBasicMaterial({
    color: '#000000',
    depthWrite: false,
    fog: false,
    map: shadowTexture,
    opacity: SCENE_CONFIG.monitoringPoint.shadowOpacity,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
  })
  const pointById = new Map(points.map((point) => [point.id, point]))
  const pointsByAreaAndStatus = new Map<string, Map<PointGrowthStatus, ProtectAreaPoint[]>>()
  const pointsByArea = new Map<string, ProtectAreaPoint[]>()

  group.name = 'protect-area-monitoring-points'
  for (const point of points) {
    const areaPoints = pointsByArea.get(point.areaId) ?? []
    areaPoints.push(point)
    pointsByArea.set(point.areaId, areaPoints)

    const statusMap = pointsByAreaAndStatus.get(point.areaId) ?? new Map()
    const statusPoints = statusMap.get(point.growthStatus) ?? []
    statusPoints.push(point)
    statusMap.set(point.growthStatus, statusPoints)
    pointsByAreaAndStatus.set(point.areaId, statusMap)
  }

  const batches = Array.from(pointsByAreaAndStatus).flatMap(([areaId, statusMap]) => (
    PROTECT_POINT_STATUSES.flatMap((status) => {
      const statusPoints = statusMap.get(status) ?? []
      const material = materials.get(status)
      return statusPoints.length && material
        ? [createPointBatch(
            areaId,
            statusPoints,
            geometry,
            material,
            hitMaterial,
            status,
          )]
        : []
    })
  ))
  const shadowBatches = Array.from(pointsByArea, ([areaId, areaPoints]) => (
    createShadowBatch(areaId, areaPoints, shadowGeometry, shadowMaterial)
  ))
  for (const batch of shadowBatches) group.add(batch.mesh)
  for (const batch of batches) {
    group.add(batch.mesh, batch.hitMesh)
  }

  return {
    activeAreaId: null,
    batches,
    geometry,
    group,
    hitMaterial,
    hoverScaleByPointId: new Map(),
    hoveredPointId: null,
    materials,
    pointById,
    selectedPointId: null,
    shadowBatches,
    shadowGeometry,
    shadowMaterial,
    shadowTexture,
  }
}

export function setProtectAreaPointVisibility(
  sceneGraph: ProtectAreaPointSceneGraph,
  activeAreaId: string,
): void {
  sceneGraph.activeAreaId = activeAreaId
  for (const batch of sceneGraph.batches) {
    const isActive = batch.areaId === activeAreaId
    batch.mesh.visible = isActive
    batch.hitMesh.visible = isActive
    batch.mesh.layers.set(isActive ? 0 : 1)
    batch.hitMesh.layers.set(isActive ? 0 : 1)
  }
  for (const batch of sceneGraph.shadowBatches) {
    const isActive = batch.areaId === activeAreaId
    batch.mesh.visible = isActive
    batch.mesh.layers.set(isActive ? 0 : 1)
  }
}

export function setProtectAreaPointHover(
  sceneGraph: ProtectAreaPointSceneGraph,
  pointId: string | null,
  immediate = false,
): void {
  const previousPointId = sceneGraph.hoveredPointId
  if (previousPointId === pointId) return
  sceneGraph.hoveredPointId = pointId

  function transitionPointScale(targetPointId: string, isHovered: boolean): void {
    const state = sceneGraph.hoverScaleByPointId.get(targetPointId) ?? { value: 1 }
    const targetScale = isHovered ? SCENE_CONFIG.monitoringPoint.hoverScale : 1
    sceneGraph.hoverScaleByPointId.set(targetPointId, state)
    gsap.killTweensOf(state)

    if (immediate) {
      state.value = targetScale
      if (!isHovered) sceneGraph.hoverScaleByPointId.delete(targetPointId)
      return
    }

    const motion = SCENE_CONFIG.monitoringPoint.hoverMotion
    const fullScaleDistance = SCENE_CONFIG.monitoringPoint.hoverScale - 1
    const remainingRatio = Math.min(
      Math.abs(targetScale - state.value) / fullScaleDistance,
      1,
    )
    const duration = (
      isHovered ? motion.enterDurationSeconds : motion.leaveDurationSeconds
    ) * remainingRatio

    gsap.to(state, {
      duration,
      ease: isHovered ? motion.enterEase : motion.leaveEase,
      overwrite: true,
      value: targetScale,
      onComplete: () => {
        if (!isHovered) sceneGraph.hoverScaleByPointId.delete(targetPointId)
      },
    })
  }

  if (previousPointId) transitionPointScale(previousPointId, false)
  if (pointId) transitionPointScale(pointId, true)
}

export function setProtectAreaPointSelection(
  sceneGraph: ProtectAreaPointSceneGraph,
  pointId: string | null,
): void {
  sceneGraph.selectedPointId = pointId
}

export function updateProtectAreaPointAnimation(
  sceneGraph: ProtectAreaPointSceneGraph,
  elapsedSeconds: number,
  camera: PerspectiveCamera,
  viewportHeight: number,
  reducedMotion: boolean,
  getFeatureScaleY: (featureId: string) => number,
): boolean {
  const activeBatches = sceneGraph.batches.filter(
    (item) => item.areaId === sceneGraph.activeAreaId,
  )
  if (!activeBatches.length || viewportHeight <= 0) return false

  const config = SCENE_CONFIG.monitoringPoint
  const bobFrequency = (Math.PI * 2) / config.bobDurationSeconds

  for (const batch of activeBatches) {
    for (let index = 0; index < batch.points.length; index += 1) {
      const point = batch.points[index]
      const phase = batch.phases[index]
      const featureScaleY = getFeatureScaleY(point.featureId)
      const terrainTopY = (
        SCENE_CONFIG.feature.elevationKm + SCENE_CONFIG.feature.depthKm
      ) * featureScaleY
      const markerAnchorY = terrainTopY + config.offsetAboveTerrainKm
      const distance = camera.position.distanceTo(
        instancePosition.set(point.position[0], markerAnchorY, point.position[1]),
      )
      const worldUnitsPerPixel = (
        2 * Math.tan((camera.fov * Math.PI) / 360) * distance
      ) / viewportHeight
      const hoverScale = sceneGraph.hoverScaleByPointId.get(point.id)?.value ?? 1
      const interactionScale = point.id === sceneGraph.selectedPointId
        ? config.selectedScale
        : hoverScale
      const markerWidth = config.markerWidthPx * worldUnitsPerPixel * interactionScale
      const markerHeight = config.markerHeightPx * worldUnitsPerPixel * interactionScale
      const bobOffset = reducedMotion
        ? 0
        : Math.sin(elapsedSeconds * bobFrequency + phase) * config.bobAmplitudeKm
      const rotation = reducedMotion
        ? phase
        : elapsedSeconds * config.rotationSpeedRad + phase

      instancePosition.set(
        point.position[0],
        markerAnchorY + bobOffset + markerHeight / 2,
        point.position[1],
      )
      rotationQuaternion.setFromAxisAngle(yAxis, rotation)
      instanceQuaternion.copy(rotationQuaternion)
      instanceScale.set(markerWidth, markerHeight, markerWidth)
      instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale)
      batch.mesh.setMatrixAt(index, instanceMatrix)

      hitScale.copy(instanceScale).multiplyScalar(config.hitScale)
      instanceMatrix.compose(instancePosition, instanceQuaternion, hitScale)
      batch.hitMesh.setMatrixAt(index, instanceMatrix)
    }

    batch.mesh.instanceMatrix.needsUpdate = true
    batch.hitMesh.instanceMatrix.needsUpdate = true
    batch.mesh.boundingSphere = null
    batch.hitMesh.boundingSphere = null
  }

  const shadowBatch = sceneGraph.shadowBatches.find(
    (item) => item.areaId === sceneGraph.activeAreaId,
  )
  if (shadowBatch) {
    for (let index = 0; index < shadowBatch.points.length; index += 1) {
      const point = shadowBatch.points[index]
      const phase = shadowBatch.phases[index]
      const featureScaleY = getFeatureScaleY(point.featureId)
      const featureTopY = (
        SCENE_CONFIG.feature.elevationKm + SCENE_CONFIG.feature.depthKm
      ) * featureScaleY + config.shadowElevationKm
      const distance = camera.position.distanceTo(
        instancePosition.set(point.position[0], featureTopY, point.position[1]),
      )
      const worldUnitsPerPixel = (
        2 * Math.tan((camera.fov * Math.PI) / 360) * distance
      ) / viewportHeight
      const bobProgress = reducedMotion
        ? 0
        : Math.sin(elapsedSeconds * bobFrequency + phase)
      const shadowSize = config.shadowSizePx * worldUnitsPerPixel * (
        reducedMotion
          ? 1
          : 1 + ((bobProgress + 1) / 2) * config.shadowBobScale
      )

      instancePosition.set(point.position[0], featureTopY, point.position[1])
      instanceQuaternion.identity()
      instanceScale.setScalar(shadowSize)
      instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale)
      shadowBatch.mesh.setMatrixAt(index, instanceMatrix)
    }

    shadowBatch.mesh.instanceMatrix.needsUpdate = true
    shadowBatch.mesh.boundingSphere = null
  }
  return true
}

export function disposeProtectAreaPointSceneGraph(
  sceneGraph: ProtectAreaPointSceneGraph,
): void {
  for (const state of sceneGraph.hoverScaleByPointId.values()) {
    gsap.killTweensOf(state)
  }
  sceneGraph.hoverScaleByPointId.clear()
  sceneGraph.geometry.dispose()
  for (const material of sceneGraph.materials.values()) material.dispose()
  sceneGraph.hitMaterial.dispose()
  sceneGraph.shadowGeometry.dispose()
  sceneGraph.shadowMaterial.dispose()
  sceneGraph.shadowTexture.dispose()
  sceneGraph.group.clear()
}
