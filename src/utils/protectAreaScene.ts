import {
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector2,
} from 'three'
import { PROTECT_AREA_TYPE_DEFINITIONS } from '../config/protectArea'
import { SCENE_CONFIG } from '../config/scene'
import type {
  AreaType,
  GeoPosition,
  ProjectedPolygon,
  ProtectAreaGroup,
} from '../types/protect-area'

export function getFeatureHoverScaleY(isHovered: boolean): number {
  return isHovered ? SCENE_CONFIG.feature.hoverScaleY : 1
}

export function getFeatureTopY(): number {
  return SCENE_CONFIG.feature.elevationKm + SCENE_CONFIG.feature.depthKm
}

export function shouldRaiseFeature(
  featureId: string,
  hoveredFeatureId: string | null,
  selectedFeatureId: string | null,
): boolean {
  return selectedFeatureId
    ? featureId === selectedFeatureId
    : featureId === hoveredFeatureId
}

export interface FeatureVisual {
  areaId: string
  baseColor: Color
  featureId: string
  type: AreaType
  group: Group
  fill: MeshStandardMaterial
}

export interface ProtectAreaSceneGraph {
  group: Group
  visuals: FeatureVisual[]
}

function stripClosingPoint(ring: GeoPosition[]): GeoPosition[] {
  if (ring.length < 2) return ring

  const first = ring[0]
  const last = ring[ring.length - 1]

  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1)
  }

  return ring
}

function toShapePoint([x, z]: GeoPosition): Vector2 {
  return new Vector2(x, -z)
}

function createShape(polygon: ProjectedPolygon): Shape {
  const outer = stripClosingPoint(polygon.outer).map(toShapePoint)

  if (outer.length < 3) {
    throw new Error('A projected polygon requires at least three outer points')
  }

  const shape = new Shape(outer)

  for (const hole of polygon.holes) {
    const holePoints = stripClosingPoint(hole).map(toShapePoint)

    if (holePoints.length >= 3) {
      shape.holes.push(new Path(holePoints))
    }
  }

  return shape
}

export function createProtectAreaSceneGraph(areas: ProtectAreaGroup[]): ProtectAreaSceneGraph {
  const group = new Group()
  const visuals: FeatureVisual[] = []
  group.name = 'protect-area-map'

  for (const area of areas) {
    const areaGroup = new Group()
    areaGroup.name = area.name
    areaGroup.userData.areaId = area.id

    for (const feature of area.features) {
      const polygons = feature.polygons
      if (polygons.length === 0) continue

      const featureGroup = new Group()
      featureGroup.name = feature.id
      featureGroup.userData.areaId = area.id
      featureGroup.userData.areaType = feature.type
      featureGroup.userData.featureId = feature.id

      const elevation = SCENE_CONFIG.feature.elevationKm
      const color = new Color(PROTECT_AREA_TYPE_DEFINITIONS[feature.type].color)
      const shapes = polygons.map(createShape)
      const geometry = new ExtrudeGeometry(shapes, {
        bevelEnabled: false,
        curveSegments: 1,
        depth: SCENE_CONFIG.feature.depthKm,
        steps: 1,
      })
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, elevation, 0)

      const fill = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: SCENE_CONFIG.feature.material.emissiveIntensity,
        metalness: SCENE_CONFIG.feature.material.metalness,
        opacity: 1,
        roughness: SCENE_CONFIG.feature.material.roughness,
        transparent: false,
      })
      const mesh = new Mesh(geometry, fill)
      mesh.name = `${feature.id}-fill`
      mesh.userData.areaId = area.id
      mesh.userData.areaType = feature.type
      mesh.userData.featureId = feature.id
      mesh.renderOrder = elevation * 100
      featureGroup.add(mesh)

      areaGroup.add(featureGroup)

      visuals.push({
        areaId: area.id,
        baseColor: color.clone(),
        featureId: feature.id,
        type: feature.type,
        group: featureGroup,
        fill,
      })
    }

    group.add(areaGroup)
  }

  return { group, visuals }
}

export function disposeProtectAreaSceneGraph(sceneGraph: ProtectAreaSceneGraph): void {
  sceneGraph.group.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose()

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose())
      } else {
        object.material.dispose()
      }
    }
  })
}
