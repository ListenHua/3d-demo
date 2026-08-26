import { gsap } from 'gsap'
import {
  Box2,
  type Curve,
  MOUSE,
  PerspectiveCamera,
  TOUCH,
  Vector2,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { shallowRef, type Ref } from 'vue'
import { SCENE_CONFIG } from '../../config/scene'
import type {
  ProjectedBounds,
  ProtectAreaDataset,
  ProtectSceneSelection,
} from '../../types/protect-area'
import {
  createFlightCurve,
  createPointFlightCurve,
  getAreaCameraView,
  getCameraViewFromState,
  getFlightDuration,
  getFlightPhaseProgress,
  getPointCameraView,
  type AreaCameraView,
} from '../../utils/cameraFlight'
import {
  createCameraViewSnapshot,
  type CameraViewLogSource,
} from '../../utils/cameraViewLog'
import {
  beginMapGesture,
  constrainMapTarget,
  createMapGestureState,
  endMapGesture,
  getMapControlSettings,
  markMapGestureChange,
  resetMapGesture,
} from '../../utils/mapControls'

interface SceneViewportRefs {
  aspectRatio: Readonly<Ref<number>>
  height: Readonly<Ref<number>>
  width: Readonly<Ref<number>>
}

interface SceneCameraOptions {
  dataset: ProtectAreaDataset
  hasHoveredFeature: () => boolean
  invalidate: (frames?: number) => void
  onFirstControlMovement: () => void
  onFlightState: (isFlying: boolean) => void
  onUserCameraInteraction: () => void
  onViewSettled: () => void
  reducedMotion: MediaQueryList
  rendererElement: HTMLElement
  viewport: SceneViewportRefs
}

interface CameraMotionOptions {
  durationSeconds?: number
  onArrive?: () => void
  style?: 'flight' | 'smooth' | 'uniform'
}

function boundsToBox2(bounds: ProjectedBounds): Box2 {
  return new Box2(
    new Vector2(bounds.minX, bounds.minZ),
    new Vector2(bounds.maxX, bounds.maxZ),
  )
}

function getBoundsCenterDistanceKm(
  fromBounds: ProjectedBounds | null | undefined,
  toBounds: ProjectedBounds | null | undefined,
): number {
  if (!fromBounds || !toBounds) return Number.POSITIVE_INFINITY

  return Math.hypot(
    toBounds.center[0] - fromBounds.center[0],
    toBounds.center[1] - fromBounds.center[1],
  )
}

export function useSceneCamera({
  dataset,
  hasHoveredFeature,
  invalidate,
  onFirstControlMovement,
  onFlightState,
  onUserCameraInteraction,
  onViewSettled,
  reducedMotion,
  rendererElement,
  viewport,
}: SceneCameraOptions) {
  const cameraRef = shallowRef<PerspectiveCamera | null>(null)
  const currentTarget = new Vector3()
  const controlCorrection = new Vector3()
  const globalView = getAreaCameraView(
    boundsToBox2(dataset.bounds),
    window.innerWidth / window.innerHeight,
  )
  const cameraPosition = globalView.position.clone()
  const controlSettings = getMapControlSettings()
  const areaById = new Map(dataset.areas.map((area) => [area.id, area]))
  const featureById = new Map(
    dataset.features.map((feature) => [feature.id, feature]),
  )
  const mapGesture = createMapGestureState()

  let flightTimeline: gsap.core.Timeline | null = null
  let gestureResetTimer: number | null = null
  let introCall: gsap.core.Tween | null = null
  let isControlDragging = false
  let shouldRefreshHoverAfterControls = false
  let lastCameraLogAt = 0
  let orbitControls: OrbitControls | null = null
  let resizeCall: gsap.core.Tween | null = null

  currentTarget.copy(globalView.target)

  function getViewportSize() {
    return {
      width: viewport.width.value || window.innerWidth,
      height: viewport.height.value || window.innerHeight,
    }
  }

  function logCameraView(source: CameraViewLogSource, force = false): void {
    if (!import.meta.env.DEV) return

    const camera = cameraRef.value
    if (!camera) return

    const now = performance.now()
    if (
      !force &&
      now - lastCameraLogAt < SCENE_CONFIG.debug.cameraLogIntervalMs
    ) return
    lastCameraLogAt = now

    console.info(
      '[ProtectAreaView]',
      createCameraViewSnapshot(camera, currentTarget, getViewportSize(), source),
    )
  }

  function setCameraView(position: Vector3, target: Vector3): void {
    const camera = cameraRef.value
    if (!camera) return

    camera.position.copy(position)
    currentTarget.copy(target)
    if (orbitControls) {
      orbitControls.target.copy(currentTarget)
      orbitControls.update()
    } else {
      camera.lookAt(currentTarget)
    }
    camera.updateMatrixWorld()
    logCameraView('focus', true)
    invalidate()
  }

  function updateControlCursor(): void {
    if (!orbitControls?.domElement) return

    orbitControls.domElement.style.cursor = isControlDragging
      ? 'grabbing'
      : hasHoveredFeature()
        ? 'pointer'
        : 'grab'
  }

  function enableOrbitControls(): void {
    if (!orbitControls) return
    orbitControls.enabled = true
    updateControlCursor()
  }

  function disableOrbitControls(): void {
    if (!orbitControls) return
    orbitControls.enabled = false
    const controlElement = orbitControls.domElement
    if (controlElement) controlElement.style.cursor = 'default'
  }

  function handleControlStart(): void {
    if (gestureResetTimer !== null) window.clearTimeout(gestureResetTimer)
    gestureResetTimer = null
    beginMapGesture(mapGesture)
    isControlDragging = true
    shouldRefreshHoverAfterControls = false
    updateControlCursor()
    invalidate(60)
  }

  function handleControlChange(): void {
    const camera = cameraRef.value
    if (!orbitControls || !camera) return

    const isFirstMovement = markMapGestureChange(mapGesture)
    if (isFirstMovement) {
      onUserCameraInteraction()
      onFirstControlMovement()
    }
    controlCorrection.copy(orbitControls.target)
    constrainMapTarget(orbitControls.target, dataset.bounds, currentTarget.y)
    controlCorrection.sub(orbitControls.target).multiplyScalar(-1)
    camera.position.add(controlCorrection)
    currentTarget.copy(orbitControls.target)
    logCameraView('controls')
    invalidate(60)
  }

  function handleControlEnd(): void {
    endMapGesture(mapGesture)
    gestureResetTimer = window.setTimeout(() => {
      resetMapGesture(mapGesture)
      gestureResetTimer = null
    }, 0)
    isControlDragging = false
    shouldRefreshHoverAfterControls = true
    if (orbitControls) currentTarget.copy(orbitControls.target)
    logCameraView('controls', true)
    updateControlCursor()
    invalidate(60)
  }

  function initializeOrbitControls(): void {
    const camera = cameraRef.value
    if (!camera) return

    const { controls: config } = SCENE_CONFIG
    const controls = new OrbitControls(camera, rendererElement)
    controls.enableDamping = true
    controls.dampingFactor = config.dampingFactor
    controls.enablePan = true
    controls.enableRotate = true
    controls.enableZoom = true
    controls.panSpeed = config.panSpeed
    controls.rotateSpeed = config.rotateSpeed
    controls.zoomSpeed = config.zoomSpeed
    controls.zoomToCursor = config.zoomToCursor
    controls.screenSpacePanning = false
    controls.minDistance = controlSettings.minDistance
    controls.maxDistance = controlSettings.maxDistance
    controls.minPolarAngle = controlSettings.minPolarAngle
    controls.maxPolarAngle = controlSettings.maxPolarAngle
    controls.mouseButtons.LEFT = MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY
    controls.mouseButtons.RIGHT = MOUSE.PAN
    controls.touches.ONE = TOUCH.ROTATE
    controls.touches.TWO = TOUCH.DOLLY_PAN
    controls.target.copy(currentTarget)
    controls.addEventListener('start', handleControlStart)
    controls.addEventListener('change', handleControlChange)
    controls.addEventListener('end', handleControlEnd)
    controls.update()

    orbitControls = controls
    updateControlCursor()
  }

  function moveCameraTo(
    destination: AreaCameraView,
    shouldAnimate: boolean,
    curveFactory: (start: Vector3, end: Vector3) => Curve<Vector3>,
    options: CameraMotionOptions = {},
  ): void {
    const camera = cameraRef.value
    if (!camera) return

    flightTimeline?.kill()
    flightTimeline = null
    disableOrbitControls()

    const skipMotion = !shouldAnimate || reducedMotion.matches

    if (skipMotion) {
      setCameraView(destination.position, destination.target)
      enableOrbitControls()
      onFlightState(false)
      options.onArrive?.()
      onViewSettled()
      return
    }

    const startPosition = camera.position.clone()
    const startTarget = currentTarget.clone()
    const curve = curveFactory(startPosition, destination.position)
    const progress = { value: 0 }
    const { phases } = SCENE_CONFIG.flight
    const phaseProgress = getFlightPhaseProgress(curve.getLength())
    const duration = getFlightDuration()
    const durationWeightTotal = Math.max(
      phases.departure.durationWeight +
        phases.cruise.durationWeight +
        phases.arrival.durationWeight,
      Number.EPSILON,
    )
    const updateCameraAlongFlight = (): void => {
      camera.position.copy(curve.getPointAt(progress.value))
      currentTarget.lerpVectors(startTarget, destination.target, progress.value)
      camera.lookAt(currentTarget)
      camera.updateMatrixWorld()
      logCameraView('flight')
      invalidate()
    }

    onFlightState(true)
    flightTimeline = gsap.timeline({
      onUpdate: updateCameraAlongFlight,
      onComplete: () => {
        setCameraView(destination.position, destination.target)
        enableOrbitControls()
        onFlightState(false)
        flightTimeline = null
        options.onArrive?.()
        onViewSettled()
      },
      onInterrupt: () => {
        if (orbitControls) {
          orbitControls.target.copy(currentTarget)
          orbitControls.update()
        }
        enableOrbitControls()
        onFlightState(false)
        onViewSettled()
      },
    })

    if (options.style === 'smooth' || options.style === 'uniform') {
      const pointTransition = SCENE_CONFIG.flight.pointTransition
      flightTimeline.to(progress, {
        duration: options.durationSeconds ?? pointTransition.durationSeconds,
        ease: options.style === 'uniform'
          ? SCENE_CONFIG.flight.uniformEase
          : pointTransition.ease,
        value: 1,
      })
      return
    }

    flightTimeline
      .to(progress, {
        duration: duration * (phases.departure.durationWeight / durationWeightTotal),
        ease: phases.departure.ease,
        value: phaseProgress.departureEnd,
      })
      .to(progress, {
        duration: duration * (phases.cruise.durationWeight / durationWeightTotal),
        ease: phases.cruise.ease,
        value: phaseProgress.arrivalStart,
      })
      .to(progress, {
        duration: duration * (phases.arrival.durationWeight / durationWeightTotal),
        ease: phases.arrival.ease,
        value: 1,
      })
  }

  function focusArea(
    areaId: string,
    shouldAnimate: boolean,
    previousAreaId: string | null = null,
  ): void {
    const area = areaById.get(areaId)
    if (!area) return

    const destination = getAreaCameraView(
      boundsToBox2(area.bounds),
      viewport.aspectRatio.value || window.innerWidth / window.innerHeight,
    )
    const areaDistanceKm = getBoundsCenterDistanceKm(
      previousAreaId ? areaById.get(previousAreaId)?.bounds : null,
      area.bounds,
    )
    const style: CameraMotionOptions['style'] = areaDistanceKm < (
      SCENE_CONFIG.flight.uniformDistanceThresholdKm
    )
      ? 'uniform'
      : 'flight'

    moveCameraTo(destination, shouldAnimate, createFlightCurve, {
      durationSeconds: SCENE_CONFIG.flight.durationSeconds,
      style,
    })
  }

  function focusFeature(
    selection: ProtectSceneSelection,
    previousSelection: ProtectSceneSelection | null,
    shouldAnimate: boolean,
    onArrive: () => void,
  ): void {
    const camera = cameraRef.value
    if (!camera) return

    const destination = getPointCameraView(
      new Vector3(...selection.point),
      camera.position,
      currentTarget,
    )
    const previousFeature = previousSelection
      ? featureById.get(previousSelection.featureId)
      : null
    const nextFeature = featureById.get(selection.featureId)
    const featureDistanceKm = getBoundsCenterDistanceKm(
      previousFeature?.bounds,
      nextFeature?.bounds,
    )
    const style: CameraMotionOptions['style'] = featureDistanceKm < (
      SCENE_CONFIG.flight.uniformDistanceThresholdKm
    )
      ? 'uniform'
      : 'smooth'

    moveCameraTo(destination, shouldAnimate, createPointFlightCurve, {
      onArrive,
      style,
    })
  }

  function restoreFeatureClickView(
    selection: ProtectSceneSelection,
    shouldAnimate: boolean,
  ): void {
    moveCameraTo(
      getCameraViewFromState(selection.returnContext.view),
      shouldAnimate,
      createPointFlightCurve,
      { style: 'smooth' },
    )
  }

  function scheduleResize(areaId: string, hasFeatureSelection: boolean): void {
    resizeCall?.kill()
    resizeCall = gsap.delayedCall(0.12, () => {
      if (hasFeatureSelection) {
        logCameraView('resize', true)
      } else {
        focusArea(areaId, false)
      }
    })
  }

  function mount(activeAreaId: string): void {
    initializeOrbitControls()
    setCameraView(globalView.position, globalView.target)
    introCall = gsap.delayedCall(0.3, () => focusArea(activeAreaId, true))
  }

  function beforeRender(): void {
    if (!orbitControls?.enabled) return

    if (orbitControls.update()) {
      queueMicrotask(() => invalidate())
    } else if (shouldRefreshHoverAfterControls) {
      shouldRefreshHoverAfterControls = false
      onViewSettled()
    }
  }

  function dispose(): void {
    flightTimeline?.kill()
    introCall?.kill()
    resizeCall?.kill()
    if (gestureResetTimer !== null) window.clearTimeout(gestureResetTimer)
    resetMapGesture(mapGesture)
    orbitControls?.removeEventListener('start', handleControlStart)
    orbitControls?.removeEventListener('change', handleControlChange)
    orbitControls?.removeEventListener('end', handleControlEnd)
    orbitControls?.dispose()
    orbitControls = null
  }

  return {
    beforeRender,
    cameraPosition,
    cameraRef,
    cancelIntro: () => introCall?.kill(),
    currentTarget,
    dispose,
    focusArea,
    focusFeature,
    getViewportSize,
    isControlDragging: () => isControlDragging,
    mapGesture,
    mount,
    restoreFeatureClickView,
    scheduleResize,
    updateControlCursor,
  }
}
