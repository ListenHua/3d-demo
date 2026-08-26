import { Box2, MathUtils, QuadraticBezierCurve3, Vector2, Vector3 } from 'three'
import { SCENE_CONFIG } from '../config/scene'
import type { FeatureReturnContext } from '../types/protect-area'

export interface AreaCameraView {
  position: Vector3
  target: Vector3
  distance: number
}

export interface FlightPhaseProgress {
  departureEnd: number
  arrivalStart: number
}

const VIEW_DIRECTION = new Vector3(...SCENE_CONFIG.camera.viewDirection).normalize()

export function getAreaCameraView(
  bounds: Box2,
  aspect: number,
  verticalFov = SCENE_CONFIG.camera.fov,
): AreaCameraView {
  const center = bounds.getCenter(new Vector2())
  const size = bounds.getSize(new Vector2())
  const verticalFovRadians = MathUtils.degToRad(verticalFov)
  const horizontalFovRadians = 2 * Math.atan(Math.tan(verticalFovRadians / 2) * Math.max(aspect, 0.5))
  const limitingFov = Math.min(verticalFovRadians, horizontalFovRadians)
  const radius = Math.max(Math.hypot(size.x, size.y) / 2, 0.75)
  const distance = (radius / Math.sin(limitingFov / 2)) * SCENE_CONFIG.camera.fitPadding
  const target = new Vector3(center.x, SCENE_CONFIG.camera.targetYKm, center.y)
  const position = target.clone().addScaledVector(VIEW_DIRECTION, distance)

  return { position, target, distance }
}

export function createFlightCurve(start: Vector3, end: Vector3): QuadraticBezierCurve3 {
  const horizontalDistance = Math.hypot(end.x - start.x, end.z - start.z)
  const { areaArc } = SCENE_CONFIG.flight
  const lift = MathUtils.clamp(
    horizontalDistance * areaArc.distanceFactor,
    areaArc.minLiftKm,
    areaArc.maxLiftKm,
  )
  const control = start
    .clone()
    .lerp(end, 0.5)
    .setY(Math.max(start.y, end.y) + lift)

  return new QuadraticBezierCurve3(start.clone(), control, end.clone())
}

export function getPointCameraView(
  point: Vector3,
  currentPosition: Vector3,
  currentTarget: Vector3,
  distance = SCENE_CONFIG.flight.pointFocus.distanceKm,
  polarDegrees = SCENE_CONFIG.flight.pointFocus.polarDeg,
): AreaCameraView {
  const currentOffset = currentPosition.clone().sub(currentTarget)
  const horizontalLength = Math.hypot(currentOffset.x, currentOffset.z)
  const azimuth = horizontalLength > Number.EPSILON
    ? Math.atan2(currentOffset.x, currentOffset.z)
    : Math.PI / 4
  const polar = MathUtils.degToRad(polarDegrees)
  const horizontalDistance = distance * Math.sin(polar)
  const target = point.clone()
  const position = new Vector3(
    target.x + horizontalDistance * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + horizontalDistance * Math.cos(azimuth),
  )

  return { position, target, distance }
}

export function getCameraViewFromState(
  state: FeatureReturnContext['view'],
): AreaCameraView {
  const position = new Vector3(...state.position)
  const target = new Vector3(...state.target)
  return {
    position,
    target,
    distance: position.distanceTo(target),
  }
}

export function createPointFlightCurve(start: Vector3, end: Vector3): QuadraticBezierCurve3 {
  const horizontalDistance = Math.hypot(end.x - start.x, end.z - start.z)
  const { pointArc } = SCENE_CONFIG.flight
  const lift = MathUtils.clamp(
    horizontalDistance * pointArc.distanceFactor,
    pointArc.minLiftKm,
    pointArc.maxLiftKm,
  )
  const control = start
    .clone()
    .lerp(end, 0.5)
    .setY(Math.max(start.y, end.y) + lift)

  return new QuadraticBezierCurve3(start.clone(), control, end.clone())
}

export function getFlightDuration(skipMotion = false): number {
  if (skipMotion) return 0
  return SCENE_CONFIG.flight.durationSeconds
}

export function getFlightPhaseProgress(pathLength: number): FlightPhaseProgress {
  const { departure, arrival } = SCENE_CONFIG.flight.phases
  const safePathLength = Math.max(pathLength, Number.EPSILON)
  const departureEnd = MathUtils.clamp(
    Math.min(departure.maxPathProgress, departure.pathDistanceKm / safePathLength),
    0,
    1,
  )
  const arrivalProgress = MathUtils.clamp(
    Math.min(arrival.maxPathProgress, arrival.pathDistanceKm / safePathLength),
    0,
    1,
  )

  return {
    departureEnd,
    arrivalStart: Math.max(departureEnd, 1 - arrivalProgress),
  }
}
