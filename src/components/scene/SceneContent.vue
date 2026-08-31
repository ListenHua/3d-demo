<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import { gsap } from 'gsap'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import type { WebGLRenderer } from 'three'
import { markRaw, onBeforeUnmount, onMounted, watch } from 'vue'
import plotTextureUrl from '../../assets/images/plot.png'
import { SCENE_CONFIG } from '../../config/scene'
import type {
  ProjectedBounds,
  ProtectAreaDataset,
  ProtectSceneSelection,
} from '../../types/protect-area'
import {
  getSelectionCameraAction,
} from '../../utils/mapControls'
import { getSceneSelectionId } from '../../utils/sceneSelection'
import {
  createProtectAreaSceneGraph,
  disposeProtectAreaSceneGraph,
  updateProtectAreaTerrainUvs,
} from '../../utils/protectAreaScene'
import {
  createRasterTileGround,
  disposeRasterTileGround,
} from '../../utils/rasterTileGround'
import {
  createProtectAreaPointSceneGraph,
  disposeProtectAreaPointSceneGraph,
  setProtectAreaPointSelection,
  setProtectAreaPointVisibility,
  updateProtectAreaPointAnimation,
} from '../../utils/protectAreaPointScene'
import { useFeatureInteraction } from './useFeatureInteraction'
import { useSceneCamera } from './useSceneCamera'

const props = defineProps<{
  dataset: ProtectAreaDataset
  activeAreaId: string
  animateSelection: boolean
  selectedFeatureSelection: ProtectSceneSelection | null
}>()

const emit = defineEmits<{
  selectFeature: [selection: ProtectSceneSelection]
  clearFeatureSelection: []
  flightState: [isFlying: boolean]
  openPointDetail: [pointId: string]
  terrainHoverState: [isHovered: boolean]
  userCameraInteraction: []
}>()

const { renderer, sizes } = useTresContext()
const { onBeforeRender } = useLoop()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const webglRenderer = renderer.instance as WebGLRenderer
const groundSize = Math.max(
  props.dataset.bounds.width,
  props.dataset.bounds.depth,
) * SCENE_CONFIG.ground.sizeFactor
const rasterTileConfig = SCENE_CONFIG.ground.rasterTiles
const rasterTileElevationY = SCENE_CONFIG.feature.elevationKm + rasterTileConfig.elevationOffsetKm
const rasterTileGround = markRaw(createRasterTileGround({
  anisotropy: webglRenderer.capabilities.getMaxAnisotropy(),
  center: props.dataset.bounds.center,
  elevationY: rasterTileElevationY,
  enabled: rasterTileConfig.enabled,
  fallbackColor: rasterTileConfig.fallbackColor,
  fallbackOpacity: rasterTileConfig.fallbackOpacity,
  groundSize,
  invalidate: renderer.invalidate,
  level: rasterTileConfig.level,
  maxLevel: rasterTileConfig.maxLevel,
  maxTextureSize: webglRenderer.capabilities.maxTextureSize,
  maxTileCount: rasterTileConfig.maxTileCount,
  minLevel: rasterTileConfig.minLevel,
  opacity: rasterTileConfig.opacity,
  origin: props.dataset.origin,
  subdomains: rasterTileConfig.subdomains,
  targetTilesAcrossView: rasterTileConfig.targetTilesAcrossView,
  urlTemplate: rasterTileConfig.urlTemplate,
  viewPaddingRatio: rasterTileConfig.viewPaddingRatio,
}))
const terrainTexture = markRaw(new TextureLoader().load(
  plotTextureUrl,
  () => renderer.invalidate(),
))
terrainTexture.colorSpace = SRGBColorSpace
terrainTexture.wrapS = ClampToEdgeWrapping
terrainTexture.wrapT = ClampToEdgeWrapping
terrainTexture.magFilter = LinearFilter
terrainTexture.minFilter = LinearMipmapLinearFilter
terrainTexture.anisotropy = Math.min(
  webglRenderer.capabilities.getMaxAnisotropy(),
  8,
)
const sceneGraph = markRaw(createProtectAreaSceneGraph(
  props.dataset.areas,
  rasterTileGround.featureTexture ?? terrainTexture,
  rasterTileGround.textureBounds ?? undefined,
))
const featureVisualById = new Map(
  sceneGraph.visuals.map((visual) => [visual.featureId, visual]),
)
const areaById = new Map(props.dataset.areas.map((area) => [area.id, area]))
const featureById = new Map(props.dataset.features.map((feature) => [feature.id, feature]))
const pointSceneGraph = markRaw(createProtectAreaPointSceneGraph(props.dataset.points))
sceneGraph.group.add(pointSceneGraph.group)
setProtectAreaPointVisibility(pointSceneGraph, props.activeAreaId)
setProtectAreaPointSelection(
  pointSceneGraph,
  props.selectedFeatureSelection?.kind === 'point'
    ? props.selectedFeatureSelection.pointId
    : null,
)
let clearHoveredFeature = (): void => {}
let hasHoveredFeature = (): boolean => false
let refreshPointerHover = (): void => {}
let isMounted = false

const sceneCamera = useSceneCamera({
  dataset: props.dataset,
  hasHoveredFeature: () => hasHoveredFeature(),
  invalidate: renderer.invalidate,
  onFirstControlMovement: () => clearHoveredFeature(),
  onFlightState: (isFlying) => emit('flightState', isFlying),
  onUserCameraInteraction: () => emit('userCameraInteraction'),
  onViewSettled: () => refreshPointerHover(),
  reducedMotion,
  rendererElement: renderer.instance.domElement,
  viewport: sizes,
})
const { cameraPosition, cameraRef } = sceneCamera

let pointAnimationFrame: number | null = null
let lastPointAnimationAt = 0
let areaVisualSwitchCall: gsap.core.Tween | null = null
let lastRasterTileViewState: {
  distance: number
  intentKey: string
  targetX: number
  targetZ: number
} | null = null

function mergeProjectedBounds(bounds: ProjectedBounds[]): ProjectedBounds {
  const minX = Math.min(...bounds.map((item) => item.minX))
  const minZ = Math.min(...bounds.map((item) => item.minZ))
  const maxX = Math.max(...bounds.map((item) => item.maxX))
  const maxZ = Math.max(...bounds.map((item) => item.maxZ))

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

function getRasterTileBounds(): ProjectedBounds | null {
  const activeAreaBounds = areaById.get(props.activeAreaId)?.bounds
  const selectedFeatureBounds = props.selectedFeatureSelection
    ? featureById.get(props.selectedFeatureSelection.featureId)?.bounds
    : null

  const bounds: ProjectedBounds[] = []
  if (activeAreaBounds) bounds.push(activeAreaBounds)
  if (selectedFeatureBounds) bounds.push(selectedFeatureBounds)

  return bounds.length > 0 ? mergeProjectedBounds(bounds) : null
}

function getRasterTileIntentKey(): string {
  return [
    props.activeAreaId,
    props.selectedFeatureSelection?.featureId ?? '',
    props.selectedFeatureSelection?.kind ?? '',
    sizes.width.value,
    sizes.height.value,
  ].join(':')
}

function getRasterTilePriorityCenter(): [number, number] | undefined {
  const selectedFeatureCenter = props.selectedFeatureSelection
    ? featureById.get(props.selectedFeatureSelection.featureId)?.bounds.center
    : null
  const activeAreaCenter = areaById.get(props.activeAreaId)?.bounds.center

  return selectedFeatureCenter ?? activeAreaCenter ?? undefined
}

function shouldUpdateRasterTilesForCamera(force = false): boolean {
  const camera = cameraRef.value
  if (!camera) return false
  if (force) return true

  const distance = camera.position.distanceTo(sceneCamera.currentTarget)
  const intentKey = getRasterTileIntentKey()
  const targetX = sceneCamera.currentTarget.x
  const targetZ = sceneCamera.currentTarget.z
  const viewSizeHint = Math.max(distance, 0.1)
  const distanceDeltaRatio = lastRasterTileViewState
    ? Math.abs(distance - lastRasterTileViewState.distance) / Math.max(lastRasterTileViewState.distance, 0.1)
    : Number.POSITIVE_INFINITY
  const targetDelta = lastRasterTileViewState
    ? Math.hypot(
      targetX - lastRasterTileViewState.targetX,
      targetZ - lastRasterTileViewState.targetZ,
    )
    : Number.POSITIVE_INFINITY
  const shouldUpdate = (
    lastRasterTileViewState?.intentKey !== intentKey ||
    distanceDeltaRatio > 0.12 ||
    targetDelta > viewSizeHint * 0.18
  )

  if (shouldUpdate) {
    lastRasterTileViewState = { distance, intentKey, targetX, targetZ }
  }

  return shouldUpdate
}

function updateRasterTilesForCamera(force = false): void {
  if (!shouldUpdateRasterTilesForCamera(force)) return

  const bounds = getRasterTileBounds()
  if (!bounds) return

  const didUpdateTiles = rasterTileGround.updateView(
    bounds,
    getRasterTilePriorityCenter(),
    force,
  )
  if (didUpdateTiles && rasterTileGround.textureBounds) {
    updateProtectAreaTerrainUvs(
      sceneGraph,
      rasterTileGround.textureBounds,
    )
  }

  if (force) {
    const camera = cameraRef.value
    if (!camera) return

    lastRasterTileViewState = {
      distance: camera.position.distanceTo(sceneCamera.currentTarget),
      intentKey: getRasterTileIntentKey(),
      targetX: sceneCamera.currentTarget.x,
      targetZ: sceneCamera.currentTarget.z,
    }
  }
}

function getFeatureScaleY(featureId: string): number {
  return featureVisualById.get(featureId)?.group.scale.y ?? 1
}

function updatePointMarkers(timestamp = performance.now()): void {
  const camera = cameraRef.value
  if (!camera) return

  if (updateProtectAreaPointAnimation(
    pointSceneGraph,
    timestamp / 1_000,
    camera,
    sizes.height.value || window.innerHeight,
    reducedMotion.matches,
    getFeatureScaleY,
  )) {
    renderer.invalidate()
  }
}

function switchVisibleArea(areaId: string): void {
  setProtectAreaPointVisibility(pointSceneGraph, areaId)
  setProtectAreaPointSelection(
    pointSceneGraph,
    props.selectedFeatureSelection?.kind === 'point'
      ? props.selectedFeatureSelection.pointId
      : null,
  )
  updatePointMarkers()
  featureInteraction.applyAreaVisuals(areaId)
}

function runPointAnimation(timestamp: number): void {
  pointAnimationFrame = window.requestAnimationFrame(runPointAnimation)
  if (document.hidden) return

  const frameInterval = 1_000 / SCENE_CONFIG.monitoringPoint.maxFps
  if (timestamp - lastPointAnimationAt < frameInterval) return
  lastPointAnimationAt = timestamp
  updatePointMarkers(timestamp)
}

function startPointAnimation(): void {
  if (reducedMotion.matches || pointAnimationFrame !== null) return
  pointAnimationFrame = window.requestAnimationFrame(runPointAnimation)
}

function stopPointAnimation(): void {
  if (pointAnimationFrame !== null) {
    window.cancelAnimationFrame(pointAnimationFrame)
    pointAnimationFrame = null
  }
}

function handleReducedMotionChange(): void {
  stopPointAnimation()
  updatePointMarkers()
  startPointAnimation()
}

const featureInteraction = useFeatureInteraction({
  cameraRef: sceneCamera.cameraRef,
  currentTarget: sceneCamera.currentTarget,
  dataset: props.dataset,
  getActiveAreaId: () => props.activeAreaId,
  getHostElement: () => renderer.instance.domElement.parentElement,
  getSelectedSelection: () => props.selectedFeatureSelection,
  getViewportSize: sceneCamera.getViewportSize,
  invalidate: renderer.invalidate,
  isControlDragging: sceneCamera.isControlDragging,
  mapGesture: sceneCamera.mapGesture,
  onClearSelection: () => emit('clearFeatureSelection'),
  onHoverChange: (isHovered) => {
    sceneCamera.updateControlCursor()
    emit('terrainHoverState', isHovered)
  },
  onOpenPointDetail: (pointId) => emit('openPointDetail', pointId),
  onPointStateChange: () => updatePointMarkers(),
  onSelectFeature: (selection) => emit('selectFeature', selection),
  reducedMotion,
  rendererElement: renderer.instance.domElement,
  pointSceneGraph,
  sceneGraph,
})

clearHoveredFeature = () => featureInteraction.setHoveredFeature(null)
hasHoveredFeature = featureInteraction.hasHoveredFeature
refreshPointerHover = featureInteraction.refreshPointerHover
featureInteraction.applyAreaVisuals(props.activeAreaId, true)

watch(
  [
    () => props.activeAreaId,
    () => props.selectedFeatureSelection,
  ],
  ([areaId, selection], [previousAreaId, previousSelection]) => {
    areaVisualSwitchCall?.kill()
    areaVisualSwitchCall = null

    const cameraAction = getSelectionCameraAction({
      areaId,
      previousAreaId,
      previousReturnAreaId: previousSelection?.returnContext.areaId ?? null,
      previousReturnMode: previousSelection?.returnContext.mode ?? null,
      previousSelectionId: getSceneSelectionId(previousSelection),
      selectionId: getSceneSelectionId(selection),
    })
    const immediate = !props.animateSelection
    const shouldDeferAreaVisuals = (
      cameraAction === 'area' &&
      props.animateSelection &&
      !reducedMotion.matches &&
      previousAreaId !== undefined &&
      previousAreaId !== areaId
    )
    const visibleAreaId = shouldDeferAreaVisuals ? previousAreaId : areaId

    setProtectAreaPointVisibility(pointSceneGraph, visibleAreaId)
    setProtectAreaPointSelection(
      pointSceneGraph,
      selection?.kind === 'point' ? selection.pointId : null,
    )
    updatePointMarkers()

    if (
      !selection &&
      (cameraAction === 'area' || cameraAction === 'return-view')
    ) {
      featureInteraction.setHoveredFeature(null, immediate)
    }

    featureInteraction.syncSelectionVisuals(
      previousSelection,
      selection,
      visibleAreaId,
      immediate,
    )
    if (!isMounted) return

    sceneCamera.cancelIntro()
    updateRasterTilesForCamera(true)

    if (cameraAction === 'feature' && selection) {
      if (selection.kind === 'point') {
        if (!featureInteraction.updateFeatureCard(selection)) return
        featureInteraction.hideFeatureCard(true)
        sceneCamera.focusFeature(
          selection,
          previousSelection,
          props.animateSelection,
          featureInteraction.showFeatureCard,
        )
        return
      }

      if (!featureInteraction.updateFeatureCard(selection)) return
      featureInteraction.hideFeatureCard(true)
      sceneCamera.focusFeature(
        selection,
        previousSelection,
        props.animateSelection,
        featureInteraction.showFeatureCard,
      )
      return
    }

    if (cameraAction === 'area') {
      featureInteraction.hideFeatureCard()
      if (shouldDeferAreaVisuals) {
        areaVisualSwitchCall = gsap.delayedCall(
          SCENE_CONFIG.flight.areaVisualSwitchDelaySeconds,
          () => {
            areaVisualSwitchCall = null
            if (props.activeAreaId !== areaId) return
            switchVisibleArea(areaId)
          },
        )
      }
      sceneCamera.focusArea(areaId, props.animateSelection, previousAreaId, () => {
        if (!shouldDeferAreaVisuals || props.activeAreaId !== areaId) return
        if (!areaVisualSwitchCall) return
        areaVisualSwitchCall?.kill()
        areaVisualSwitchCall = null
        switchVisibleArea(areaId)
      })
      return
    }

    if (cameraAction === 'return-view' && previousSelection) {
      featureInteraction.hideFeatureCard()
      sceneCamera.restoreFeatureClickView(previousSelection, props.animateSelection)
      return
    }

    if (!selection && previousSelection) featureInteraction.hideFeatureCard()
  },
)

watch([sizes.width, sizes.height], ([width, height]) => {
  featureInteraction.resize(width, height)
  updatePointMarkers()
  if (!isMounted) return

  sceneCamera.scheduleResize(
    props.activeAreaId,
    props.selectedFeatureSelection !== null,
  )
  updateRasterTilesForCamera(true)
})

onBeforeRender(() => {
  sceneCamera.beforeRender()
  updateRasterTilesForCamera()
  featureInteraction.beforeRender()
})

onMounted(() => {
  isMounted = true
  featureInteraction.mount()
  sceneCamera.mount(props.activeAreaId)
  updateRasterTilesForCamera(true)
  updatePointMarkers()
  startPointAnimation()
  reducedMotion.addEventListener('change', handleReducedMotionChange)
})

onBeforeUnmount(() => {
  isMounted = false
  areaVisualSwitchCall?.kill()
  stopPointAnimation()
  reducedMotion.removeEventListener('change', handleReducedMotionChange)
  sceneCamera.dispose()
  featureInteraction.dispose()
  disposeProtectAreaPointSceneGraph(pointSceneGraph)
  disposeProtectAreaSceneGraph(sceneGraph)
  disposeRasterTileGround(rasterTileGround)
  terrainTexture.dispose()
})
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :far="SCENE_CONFIG.camera.far"
    :fov="SCENE_CONFIG.camera.fov"
    :near="SCENE_CONFIG.camera.near"
    :position="cameraPosition"
  />
  <TresHemisphereLight
    :args="[
      SCENE_CONFIG.light.skyColor,
      SCENE_CONFIG.light.groundColor,
      SCENE_CONFIG.light.intensity,
    ]"
  />

  <primitive :object="rasterTileGround.group" />
  <primitive :object="sceneGraph.group" />
</template>
