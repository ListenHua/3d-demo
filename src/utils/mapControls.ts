import { MathUtils, type Vector3 } from 'three'
import { SCENE_CONFIG } from '../config/scene'
import type {
  FeatureReturnContext,
  ProjectedBounds,
} from '../types/protect-area'

export interface MapControlSettings {
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
}

export interface MapGestureState {
  isDragging: boolean
  moved: boolean
}

export type MapFeatureClickAction = 'ignore' | 'navigate' | 'select'
export type SelectionCameraAction = 'area' | 'feature' | 'none' | 'return-view'

export interface MapFeatureClickContext {
  activeAreaId: string
  clickedAreaId: string
  clickedSelectionId: string
  selectedSelectionId: string | null
}

export interface SelectionCameraContext {
  areaId: string
  previousAreaId: string
  previousReturnAreaId: string | null
  previousReturnMode: FeatureReturnContext['mode'] | null
  previousSelectionId: string | null
  selectionId: string | null
}

export function createMapGestureState(): MapGestureState {
  return { isDragging: false, moved: false }
}

export function beginMapGesture(state: MapGestureState): void {
  state.isDragging = true
  state.moved = false
}

export function markMapGestureChange(state: MapGestureState): boolean {
  const isFirstMovement = state.isDragging && !state.moved
  if (state.isDragging) state.moved = true
  return isFirstMovement
}

export function endMapGesture(state: MapGestureState): void {
  state.isDragging = false
}

export function resetMapGesture(state: MapGestureState): void {
  state.moved = false
}

export function shouldBlockMapClick(state: MapGestureState): boolean {
  return state.moved
}

export function shouldNavigateToMapArea(
  state: MapGestureState,
  clickedAreaId: string,
  activeAreaId: string,
): boolean {
  return !shouldBlockMapClick(state) && clickedAreaId !== activeAreaId
}

export function getMapFeatureClickAction(
  state: MapGestureState,
  context: MapFeatureClickContext,
): MapFeatureClickAction {
  if (
    shouldBlockMapClick(state) ||
    context.clickedSelectionId === context.selectedSelectionId
  ) {
    return 'ignore'
  }

  return context.clickedAreaId === context.activeAreaId ? 'select' : 'navigate'
}

export function getSelectionCameraAction(
  context: SelectionCameraContext,
): SelectionCameraAction {
  if (
    context.selectionId &&
    context.selectionId !== context.previousSelectionId
  ) {
    return 'feature'
  }

  if (!context.selectionId && context.previousSelectionId) {
    return (
      context.previousReturnMode === 'view' &&
      context.previousReturnAreaId === context.areaId
    )
      ? 'return-view'
      : 'area'
  }

  if (context.areaId !== context.previousAreaId) return 'area'

  return 'none'
}

export function getMapControlSettings(): MapControlSettings {
  const { controls } = SCENE_CONFIG
  return {
    minDistance: controls.minDistanceKm,
    maxDistance: controls.maxDistanceKm,
    minPolarAngle: Math.PI * controls.minPolarAngleRatio,
    maxPolarAngle: Math.PI * controls.maxPolarAngleRatio,
  }
}

export function constrainMapTarget(
  target: Vector3,
  bounds: ProjectedBounds,
  targetY = 0.04,
  paddingRatio = SCENE_CONFIG.controls.targetPaddingRatio,
): void {
  const padding = Math.max(bounds.width, bounds.depth) * paddingRatio

  target.set(
    MathUtils.clamp(target.x, bounds.minX - padding, bounds.maxX + padding),
    targetY,
    MathUtils.clamp(target.z, bounds.minZ - padding, bounds.maxZ + padding),
  )
}
