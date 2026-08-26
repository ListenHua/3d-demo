import { MathUtils, type PerspectiveCamera, type Vector3 } from 'three'

export type CameraViewLogSource = 'controls' | 'flight' | 'focus' | 'resize'

export interface CameraViewportSize {
  width: number
  height: number
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

export function createCameraViewSnapshot(
  camera: PerspectiveCamera,
  target: Vector3,
  viewport: CameraViewportSize,
  source: CameraViewLogSource,
) {
  const offset = camera.position.clone().sub(target)
  const distance = offset.length()
  const polar = distance > 0
    ? Math.acos(MathUtils.clamp(offset.y / distance, -1, 1))
    : 0
  const azimuth = Math.atan2(offset.x, offset.z)
  const visibleHeight = 2 * Math.tan(MathUtils.degToRad(camera.fov) / 2) * distance
  const visibleWidth = visibleHeight * camera.aspect

  return {
    source,
    anglesDeg: {
      azimuth: round(MathUtils.radToDeg(azimuth)),
      polar: round(MathUtils.radToDeg(polar)),
    },
    distanceKm: round(distance),
    visibleSizeKm: {
      width: round(visibleWidth),
      height: round(visibleHeight),
    },
    cameraPositionKm: {
      x: round(camera.position.x),
      y: round(camera.position.y),
      z: round(camera.position.z),
    },
    targetKm: {
      x: round(target.x),
      y: round(target.y),
      z: round(target.z),
    },
    fovDeg: round(camera.fov),
    aspect: round(camera.aspect),
    viewportPx: {
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    },
  }
}
