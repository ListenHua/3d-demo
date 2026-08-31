import { gsap } from 'gsap'
import {
  InstancedMesh,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
} from 'three'
import type { ShallowRef } from 'vue'
import {
  PROTECT_AREA_TYPE_DEFINITIONS,
  PROTECT_POINT_STATUS_DEFINITIONS,
} from '../../config/protectArea'
import { SCENE_CONFIG } from '../../config/scene'
import type {
  ProtectAreaDataset,
  ProtectSceneSelection,
} from '../../types/protect-area'
import {
  createFeatureCard3D,
  disposeFeatureCard3D,
  renderFeatureCard3D,
  resizeFeatureCard3D,
  updateFeatureCard3D,
  type FeatureCard3D,
} from '../../utils/featureCard3d'
import {
  getMapFeatureClickAction,
  type MapGestureState,
} from '../../utils/mapControls'
import {
  setProtectAreaPointHover,
  type ProtectAreaPointSceneGraph,
} from '../../utils/protectAreaPointScene'
import { getSceneSelectionId } from '../../utils/sceneSelection'
import {
  getFeatureHoverScaleY,
  getFeatureTopY,
  shouldRaiseFeature,
  type FeatureVisual,
  type ProtectAreaSceneGraph,
} from '../../utils/protectAreaScene'

interface FeatureInteractionOptions {
  cameraRef: ShallowRef<PerspectiveCamera | null>
  currentTarget: Vector3
  dataset: ProtectAreaDataset
  getActiveAreaId: () => string
  getHostElement: () => HTMLElement | null
  getSelectedSelection: () => ProtectSceneSelection | null
  getViewportSize: () => { height: number; width: number }
  invalidate: (frames?: number) => void
  isControlDragging: () => boolean
  mapGesture: MapGestureState
  onClearSelection: () => void
  onHoverChange: (isHovered: boolean) => void
  onOpenPointDetail: (pointId: string) => void
  onPointStateChange: () => void
  onSelectFeature: (selection: ProtectSceneSelection) => void
  pointSceneGraph: ProtectAreaPointSceneGraph
  reducedMotion: MediaQueryList
  rendererElement: HTMLElement
  sceneGraph: ProtectAreaSceneGraph
}

export function useFeatureInteraction({
  cameraRef,
  currentTarget,
  dataset,
  getActiveAreaId,
  getHostElement,
  getSelectedSelection,
  getViewportSize,
  invalidate,
  isControlDragging,
  mapGesture,
  onClearSelection,
  onHoverChange,
  onOpenPointDetail,
  onPointStateChange,
  onSelectFeature,
  pointSceneGraph,
  reducedMotion,
  rendererElement,
  sceneGraph,
}: FeatureInteractionOptions) {
  let featureCard: FeatureCard3D | null = null
  let featureCardNeedsRender = false
  let featureCardTween: gsap.core.Tween | null = null
  let hoveredFeatureId: string | null = null
  const areaById = new Map(dataset.areas.map((area) => [area.id, area]))
  const featureById = new Map(dataset.features.map((feature) => [feature.id, feature]))
  const visualByFeatureId = new Map(
    sceneGraph.visuals.map((visual) => [visual.featureId, visual]),
  )
  const pointerClient = new Vector2(Number.NaN, Number.NaN)
  const pointerNdc = new Vector2()
  const raycaster = new Raycaster()

  let pointerRefreshFrame: number | null = null

  function setHoveredPoint(pointId: string | null): void {
    if (pointSceneGraph.hoveredPointId === pointId) return
    setProtectAreaPointHover(pointSceneGraph, pointId, reducedMotion.matches)
    onPointStateChange()
  }

  function getFeatureMetadata(object: Object3D | null) {
    let current = object

    while (current) {
      if (
        typeof current.userData.areaId === 'string' &&
        typeof current.userData.featureId === 'string'
      ) {
        return {
          areaId: current.userData.areaId as string,
          featureId: current.userData.featureId as string,
        }
      }
      current = current.parent
    }

    return null
  }

  function getPointMetadata(object: Object3D, index: number | undefined) {
    if (!(object instanceof InstancedMesh) || typeof index !== 'number') return null

    const pointIds = object.userData.pointIds
    if (!Array.isArray(pointIds) || typeof pointIds[index] !== 'string') return null

    const point = pointSceneGraph.pointById.get(pointIds[index])
    const featureScaleY = point
      ? visualByFeatureId.get(point.featureId)?.group.scale.y ?? 1
      : 1
    const pointY = (
      SCENE_CONFIG.feature.elevationKm + SCENE_CONFIG.feature.depthKm
    ) * featureScaleY + SCENE_CONFIG.monitoringPoint.offsetAboveTerrainKm
    return point && point.areaId === getActiveAreaId()
      ? {
          areaId: point.areaId,
          featureId: point.featureId,
          kind: 'point' as const,
          point: new Vector3(point.position[0], pointY, point.position[1]),
          pointId: point.id,
        }
      : null
  }

  function getSceneIntersection(clientX: number, clientY: number) {
    const camera = cameraRef.value
    if (!camera) return null

    const bounds = rendererElement.getBoundingClientRect()
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) return null

    pointerNdc.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    camera.updateWorldMatrix(true, false)
    sceneGraph.group.updateWorldMatrix(true, true)
    raycaster.setFromCamera(pointerNdc, camera)

    for (const intersection of raycaster.intersectObject(sceneGraph.group, true)) {
      const pointMetadata = getPointMetadata(intersection.object, intersection.instanceId)
      if (pointMetadata) return pointMetadata

      const metadata = getFeatureMetadata(intersection.object)
      if (metadata) {
        return { ...metadata, kind: 'feature' as const, point: intersection.point }
      }
    }

    return null
  }

  function isPointerOverRenderer(): boolean {
    if (!Number.isFinite(pointerClient.x) || !Number.isFinite(pointerClient.y)) {
      return false
    }
    return document.elementFromPoint(pointerClient.x, pointerClient.y) === rendererElement
  }

  function refreshPointerHoverNow(): void {
    pointerRefreshFrame = null
    if (isControlDragging() || !isPointerOverRenderer()) {
      setHoveredFeature(null)
      return
    }

    const hit = getSceneIntersection(pointerClient.x, pointerClient.y)
    setHoveredPoint(hit?.kind === 'point' ? hit.pointId : null)
    setHoveredFeature(hit?.featureId ?? null)
  }

  function refreshPointerHover(): void {
    if (pointerRefreshFrame !== null) return
    pointerRefreshFrame = window.requestAnimationFrame(refreshPointerHoverNow)
  }

  function handleWindowPointerMove(event: PointerEvent): void {
    pointerClient.set(event.clientX, event.clientY)

    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      setHoveredFeature(null)
      return
    }

    refreshPointerHover()
  }

  function setVisualState(
    visual: FeatureVisual,
    isActive: boolean,
    isHovered: boolean,
    isSelected: boolean,
    immediate: boolean,
  ): void {
    const isEmphasized = isHovered || isSelected
    const { visual: config } = SCENE_CONFIG.feature
    const brightness = isEmphasized
      ? config.emphasizedBrightness
      : isActive
        ? config.activeBrightness
        : config.inactiveBrightness
    const emissiveIntensity = isEmphasized
      ? config.emphasizedEmissiveIntensity
      : isActive
        ? config.activeEmissiveIntensity
        : config.inactiveEmissiveIntensity
    const tintOpacity = isEmphasized
      ? config.emphasizedTintOpacity
      : isActive
        ? config.activeTintOpacity
        : config.inactiveTintOpacity
    const borderOpacity = isEmphasized
      ? config.emphasizedBorderOpacity
      : isActive
        ? config.activeBorderOpacity
        : config.inactiveBorderOpacity
    const targetColor = visual.baseColor.clone().multiplyScalar(brightness)

    gsap.killTweensOf(visual.fill)
    gsap.killTweensOf(visual.fill.color)
    gsap.killTweensOf(visual.tint)
    gsap.killTweensOf(visual.tint.color)
    gsap.killTweensOf(visual.border)
    gsap.killTweensOf(visual.border.color)

    if (immediate || reducedMotion.matches) {
      visual.fill.color.copy(targetColor)
      visual.fill.emissiveIntensity = emissiveIntensity
      visual.tint.color.copy(targetColor)
      visual.tint.opacity = tintOpacity
      visual.border.color.copy(targetColor)
      visual.border.opacity = borderOpacity
      invalidate()
      return
    }

    gsap.to(visual.fill.color, {
      b: targetColor.b,
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      g: targetColor.g,
      overwrite: true,
      r: targetColor.r,
      onUpdate: invalidate,
    })
    gsap.to(visual.fill, {
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      emissiveIntensity,
      overwrite: true,
      onUpdate: invalidate,
    })
    gsap.to(visual.tint.color, {
      b: targetColor.b,
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      g: targetColor.g,
      overwrite: true,
      r: targetColor.r,
      onUpdate: invalidate,
    })
    gsap.to(visual.tint, {
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      opacity: tintOpacity,
      overwrite: true,
      onUpdate: invalidate,
    })
    gsap.to(visual.border.color, {
      b: targetColor.b,
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      g: targetColor.g,
      overwrite: true,
      r: targetColor.r,
      onUpdate: invalidate,
    })
    gsap.to(visual.border, {
      duration: SCENE_CONFIG.feature.motion.visualDurationSeconds,
      ease: 'power2.out',
      opacity: borderOpacity,
      overwrite: true,
      onUpdate: invalidate,
    })
  }

  function applyAreaVisuals(activeAreaId: string, immediate = false): void {
    const selectedFeatureId = getSelectedSelection()?.featureId
    sceneGraph.visuals.forEach((visual) => {
      setVisualState(
        visual,
        visual.areaId === activeAreaId,
        visual.featureId === hoveredFeatureId,
        visual.featureId === selectedFeatureId,
        immediate,
      )
    })
  }

  function setFeatureLift(featureId: string, isLifted: boolean, immediate = false): void {
    const visual = visualByFeatureId.get(featureId)
    if (!visual) return

    gsap.killTweensOf(visual.group.scale)

    if (immediate || reducedMotion.matches) {
      visual.group.scale.y = getFeatureHoverScaleY(isLifted)
      invalidate()
      onPointStateChange()
      return
    }

    gsap.to(visual.group.scale, {
      duration: isLifted
        ? SCENE_CONFIG.feature.motion.hoverDurationSeconds
        : SCENE_CONFIG.feature.motion.restDurationSeconds,
      ease: isLifted
        ? SCENE_CONFIG.feature.motion.hoverEase
        : SCENE_CONFIG.feature.motion.restEase,
      overwrite: true,
      y: getFeatureHoverScaleY(isLifted),
      onUpdate: () => {
        invalidate()
        onPointStateChange()
      },
    })
  }

  function syncFeatureElevation(featureId: string, immediate = false): void {
    setFeatureLift(
      featureId,
      shouldRaiseFeature(
        featureId,
        hoveredFeatureId,
        getSelectedSelection()?.featureId ?? null,
      ),
      immediate,
    )
  }

  function setHoveredFeature(featureId: string | null, immediate = false): void {
    if (featureId === null) setHoveredPoint(null)
    if (featureId === hoveredFeatureId) return

    const previousHoveredFeatureId = hoveredFeatureId
    hoveredFeatureId = featureId

    if (previousHoveredFeatureId) {
      syncFeatureElevation(previousHoveredFeatureId, immediate)
      const previousVisual = visualByFeatureId.get(previousHoveredFeatureId)
      if (previousVisual) {
        setVisualState(
          previousVisual,
          previousVisual.areaId === getActiveAreaId(),
          false,
          previousVisual.featureId === getSelectedSelection()?.featureId,
          immediate,
        )
      }
    }
    if (hoveredFeatureId) {
      syncFeatureElevation(hoveredFeatureId, immediate)
      const hoveredVisual = visualByFeatureId.get(hoveredFeatureId)
      if (hoveredVisual) {
        setVisualState(
          hoveredVisual,
          hoveredVisual.areaId === getActiveAreaId(),
          true,
          hoveredVisual.featureId === getSelectedSelection()?.featureId,
          immediate,
        )
      }
    }

    if (
      (previousHoveredFeatureId !== null) !== (hoveredFeatureId !== null)
    ) {
      onHoverChange(hoveredFeatureId !== null)
    }
  }

  function syncSelectionVisuals(
    previousSelection: ProtectSceneSelection | null,
    selection: ProtectSceneSelection | null,
    activeAreaId: string,
    immediate: boolean,
  ): void {
    const affectedFeatureIds = new Set([
      previousSelection?.featureId,
      selection?.featureId,
      hoveredFeatureId ?? undefined,
    ])
    affectedFeatureIds.forEach((featureId) => {
      if (featureId) syncFeatureElevation(featureId, immediate)
    })
    applyAreaVisuals(activeAreaId, immediate)
  }

  function initializeFeatureCard(): void {
    const host = getHostElement()
    if (!host) return

    const viewport = getViewportSize()
    featureCard = createFeatureCard3D(
      host,
      viewport.width,
      viewport.height,
      onClearSelection,
      onOpenPointDetail,
    )
  }

  function updateFeatureCard(selection: ProtectSceneSelection): boolean {
    if (!featureCard) return false

    const feature = featureById.get(selection.featureId)
    const area = areaById.get(selection.areaId)
    if (!feature || !area) return false

    const definition = PROTECT_AREA_TYPE_DEFINITIONS[feature.type]
    const content = selection.kind === 'point'
      ? (() => {
          const point = pointSceneGraph.pointById.get(selection.pointId)
          if (!point) return null
          const pointStatus = PROTECT_POINT_STATUS_DEFINITIONS[point.growthStatus]

          return {
            color: pointStatus.color,
            detailButtonLabel: '查看详情',
            detailPointId: point.id,
            eyebrow: '模拟监测点',
            kind: 'point' as const,
            title: point.name,
            rows: [
              { label: '物种', value: point.species.join(' / ') },
              { label: '种植面积', value: `${point.plantingAreaHa.toFixed(2)} ha` },
              { label: '植株数量', value: `${point.plantCount} 株` },
              { label: '生长状态', value: pointStatus.label },
              { label: '调查日期', value: point.surveyDate },
              { label: '功能区', value: definition.label },
              { label: '保护区', value: area.name },
            ],
          }
        })()
      : {
          color: definition.color,
          eyebrow: '功能区',
          kind: 'feature' as const,
          title: definition.label,
          rows: [
            { label: '面积', value: `${feature.area.toFixed(2)} ha` },
            { label: '保护区', value: area.name },
            { label: '保护对象', value: area.species || '未标注' },
            {
              label: '行政区',
              value: [area.city, area.county].filter(Boolean).join(' / '),
            },
          ],
        }
    if (!content) return false

    updateFeatureCard3D(
      featureCard,
      content,
      new Vector3(...selection.point),
    )
    featureCardNeedsRender = true
    invalidate()
    return true
  }

  function hideFeatureCard(immediate = false): void {
    if (!featureCard) return

    featureCardTween?.kill()
    featureCardTween = null

    if (immediate || reducedMotion.matches || !featureCard.sprite.visible) {
      gsap.set(featureCard.card, { opacity: 0, scale: 0.96 })
      featureCard.sprite.visible = false
      featureCardNeedsRender = true
      invalidate()
      return
    }

    featureCardTween = gsap.to(featureCard.card, {
      duration: SCENE_CONFIG.card.hideDurationSeconds,
      ease: 'power2.out',
      opacity: 0,
      scale: 0.97,
      onComplete: () => {
        if (featureCard) featureCard.sprite.visible = false
        featureCardNeedsRender = true
        featureCardTween = null
        invalidate()
      },
    })
  }

  function showFeatureCard(): void {
    if (!featureCard) return

    featureCardTween?.kill()
    featureCard.sprite.visible = true
    featureCardNeedsRender = true
    invalidate()

    if (reducedMotion.matches) {
      gsap.set(featureCard.card, { opacity: 1, scale: 1 })
      return
    }

    gsap.set(featureCard.card, { opacity: 0, scale: 0.96 })
    featureCardTween = gsap.to(featureCard.card, {
      duration: SCENE_CONFIG.card.showDurationSeconds,
      ease: 'power3.out',
      opacity: 1,
      scale: 1,
      onComplete: () => {
        featureCardTween = null
      },
    })
  }

  function handleRendererClick(event: MouseEvent): void {
    const camera = cameraRef.value
    if (!camera) return

    pointerClient.set(event.clientX, event.clientY)
    const intersection = getSceneIntersection(event.clientX, event.clientY)
    if (!intersection) return

    const activeAreaId = getActiveAreaId()
    const currentSelection = getSelectedSelection()
    const clickedSelectionId = intersection.kind === 'point'
      ? `point:${intersection.pointId}`
      : `feature:${intersection.featureId}`
    const action = getMapFeatureClickAction(mapGesture, {
      activeAreaId,
      clickedAreaId: intersection.areaId,
      clickedSelectionId,
      selectedSelectionId: getSceneSelectionId(currentSelection),
    })
    if (action === 'ignore') return

    const returnContext = currentSelection?.returnContext ?? {
      areaId: intersection.areaId === activeAreaId
        ? activeAreaId
        : intersection.areaId,
      mode: intersection.areaId === activeAreaId ? 'view' as const : 'area' as const,
      view: {
        position: camera.position.toArray(),
        target: currentTarget.toArray(),
      },
    }
    const selection: ProtectSceneSelection = intersection.kind === 'point'
      ? {
          kind: 'point',
          areaId: intersection.areaId,
          featureId: intersection.featureId,
          pointId: intersection.pointId,
          point: intersection.point.toArray(),
          returnContext,
        }
      : {
          kind: 'feature',
          areaId: intersection.areaId,
          featureId: intersection.featureId,
          point: [intersection.point.x, getFeatureTopY(), intersection.point.z],
          returnContext,
        }
    event.stopPropagation()
    onSelectFeature(selection)
    if (action === 'navigate') setHoveredFeature(null)
  }

  function resize(width: number, height: number): void {
    if (featureCard && width && height) {
      resizeFeatureCard3D(featureCard, width, height)
      if (featureCard.sprite.visible) invalidate()
    }
  }

  function beforeRender(): void {
    if (
      featureCard &&
      cameraRef.value &&
      (featureCard.sprite.visible || featureCardNeedsRender)
    ) {
      const didHideFeatureCard = featureCardNeedsRender && !featureCard.sprite.visible
      renderFeatureCard3D(featureCard, cameraRef.value)
      featureCardNeedsRender = false
      if (didHideFeatureCard) refreshPointerHover()
    }
  }

  function mount(): void {
    initializeFeatureCard()
    window.addEventListener('pointermove', handleWindowPointerMove)
    rendererElement.addEventListener('click', handleRendererClick)
  }

  function dispose(): void {
    setHoveredFeature(null, true)
    featureCardTween?.kill()
    featureCardTween = null
    featureCardNeedsRender = false
    if (pointerRefreshFrame !== null) window.cancelAnimationFrame(pointerRefreshFrame)
    pointerRefreshFrame = null
    window.removeEventListener('pointermove', handleWindowPointerMove)
    rendererElement.removeEventListener('click', handleRendererClick)
    if (featureCard) disposeFeatureCard3D(featureCard)
    featureCard = null

    sceneGraph.visuals.forEach((visual) => {
      gsap.killTweensOf(visual.fill)
      gsap.killTweensOf(visual.fill.color)
      gsap.killTweensOf(visual.tint)
      gsap.killTweensOf(visual.tint.color)
      gsap.killTweensOf(visual.border)
      gsap.killTweensOf(visual.border.color)
      gsap.killTweensOf(visual.group.scale)
    })
  }

  return {
    applyAreaVisuals,
    beforeRender,
    dispose,
    hasHoveredFeature: () => hoveredFeatureId !== null,
    hideFeatureCard,
    mount,
    refreshPointerHover,
    resize,
    setHoveredFeature,
    showFeatureCard,
    syncSelectionVisuals,
    updateFeatureCard,
  }
}
