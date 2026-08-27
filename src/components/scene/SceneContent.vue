<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { WebGLRenderer } from 'three'
import { markRaw, onBeforeUnmount, onMounted, watch } from 'vue'
import plotTextureUrl from '../../assets/images/plot.png'
import { SCENE_CONFIG } from '../../config/scene'
import type {
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
} from '../../utils/protectAreaScene'
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
  terrainHoverState: [isHovered: boolean]
  userCameraInteraction: []
}>()

const { renderer, sizes } = useTresContext()
const { onBeforeRender } = useLoop()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const webglRenderer = renderer.instance as WebGLRenderer
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
  terrainTexture,
))
const featureVisualById = new Map(
  sceneGraph.visuals.map((visual) => [visual.featureId, visual]),
)
const pointSceneGraph = markRaw(createProtectAreaPointSceneGraph(props.dataset.points))
sceneGraph.group.add(pointSceneGraph.group)
setProtectAreaPointVisibility(pointSceneGraph, props.activeAreaId)
setProtectAreaPointSelection(
  pointSceneGraph,
  props.selectedFeatureSelection?.kind === 'point'
    ? props.selectedFeatureSelection.pointId
    : null,
)
const groundSize = Math.max(
  props.dataset.bounds.width,
  props.dataset.bounds.depth,
) * SCENE_CONFIG.ground.sizeFactor
const groundPosition = new Vector3(
  props.dataset.bounds.center[0],
  -SCENE_CONFIG.feature.depthKm,
  props.dataset.bounds.center[1],
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
    const cameraAction = getSelectionCameraAction({
      areaId,
      previousAreaId,
      previousReturnAreaId: previousSelection?.returnContext.areaId ?? null,
      previousReturnMode: previousSelection?.returnContext.mode ?? null,
      previousSelectionId: getSceneSelectionId(previousSelection),
      selectionId: getSceneSelectionId(selection),
    })
    const immediate = !props.animateSelection
    setProtectAreaPointVisibility(pointSceneGraph, areaId)
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
      areaId,
      immediate,
    )
    if (!isMounted) return

    sceneCamera.cancelIntro()

    if (cameraAction === 'feature' && selection) {
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
      sceneCamera.focusArea(areaId, props.animateSelection, previousAreaId)
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
})

onBeforeRender(() => {
  sceneCamera.beforeRender()
  featureInteraction.beforeRender()
})

onMounted(() => {
  isMounted = true
  featureInteraction.mount()
  sceneCamera.mount(props.activeAreaId)
  updatePointMarkers()
  startPointAnimation()
  reducedMotion.addEventListener('change', handleReducedMotionChange)
})

onBeforeUnmount(() => {
  isMounted = false
  stopPointAnimation()
  reducedMotion.removeEventListener('change', handleReducedMotionChange)
  sceneCamera.dispose()
  featureInteraction.dispose()
  disposeProtectAreaPointSceneGraph(pointSceneGraph)
  disposeProtectAreaSceneGraph(sceneGraph)
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
  <TresFog
    :args="[
      SCENE_CONFIG.ground.color,
      SCENE_CONFIG.fog.nearKm,
      SCENE_CONFIG.fog.farKm,
    ]"
  />

  <TresHemisphereLight
    :args="[
      SCENE_CONFIG.light.skyColor,
      SCENE_CONFIG.light.groundColor,
      SCENE_CONFIG.light.intensity,
    ]"
  />

  <TresMesh :position="groundPosition" :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
    <TresPlaneGeometry :args="[groundSize, groundSize]" />
    <TresMeshStandardMaterial
      :color="SCENE_CONFIG.ground.color"
      :metalness="SCENE_CONFIG.ground.metalness"
      :roughness="SCENE_CONFIG.ground.roughness"
    />
  </TresMesh>
  <primitive :object="sceneGraph.group" />
</template>
