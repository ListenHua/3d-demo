import {
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
  Texture,
  Vector2,
} from 'three'
import { PROTECT_AREA_TYPE_DEFINITIONS } from '../config/protectArea'
import { SCENE_CONFIG } from '../config/scene'
import type {
  AreaType,
  GeoPosition,
  ProjectedBounds,
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
  tint: MeshBasicMaterial
  border: LineBasicMaterial
}

export interface ProtectAreaSceneGraph {
  group: Group
  visuals: FeatureVisual[]
}

const TERRAIN_TEXTURE_BRIGHTNESS = 1.85
const TERRAIN_OVERLAY_ELEVATION_OFFSET_KM = 0.0005
const FEATURE_TINT_ELEVATION_OFFSET_KM = 0.0005
const FEATURE_BORDER_ELEVATION_OFFSET_KM = 0.0005

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

function createTerrainMaterial(terrainTexture: Texture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: '#ffffff',
    map: terrainTexture,
    transparent: true,
  })
  material.depthWrite = false

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'diffuseColor *= sampledDiffuseColor;',
      [
        `sampledDiffuseColor.rgb = min(sampledDiffuseColor.rgb * ${TERRAIN_TEXTURE_BRIGHTNESS.toFixed(2)}, vec3(1.0));`,
        'diffuseColor *= sampledDiffuseColor;',
      ].join('\n\t'),
    )
  }

  return material
}

function applyFeatureTerrainUV(geometry: ShapeGeometry, bounds: ProjectedBounds): void {
  const position = geometry.getAttribute('position')
  const width = bounds.width || 1
  const depth = bounds.depth || 1
  const uv: number[] = []

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = -position.getY(index)

    uv.push(
      (x - bounds.minX) / width,
      1 - (z - bounds.minZ) / depth,
    )
  }

  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
}

function createFeatureOverlayGeometry(shapes: Shape[]): ShapeGeometry {
  const geometry = new ShapeGeometry(shapes, 1)
  return geometry
}

function createFeatureTerrainOverlay(
  terrainTexture: Texture,
  shapes: Shape[],
  bounds: ProjectedBounds,
): Mesh {
  const geometry = createFeatureOverlayGeometry(shapes)
  applyFeatureTerrainUV(geometry, bounds)
  geometry.rotateX(-Math.PI / 2)

  const mesh = new Mesh(geometry, createTerrainMaterial(terrainTexture))
  mesh.name = 'feature-terrain-image-overlay'
  mesh.position.y = getFeatureTopY() + TERRAIN_OVERLAY_ELEVATION_OFFSET_KM
  mesh.renderOrder = 1
  mesh.raycast = () => {}

  return mesh
}

function createFeatureTintMaterial(color: Color): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color,
    opacity: SCENE_CONFIG.feature.visual.activeTintOpacity,
    transparent: true,
  })
  material.depthWrite = false
  return material
}

function createFeatureTintOverlay(shapes: Shape[], material: MeshBasicMaterial): Mesh {
  const geometry = createFeatureOverlayGeometry(shapes)
  geometry.rotateX(-Math.PI / 2)

  const mesh = new Mesh(geometry, material)
  mesh.name = 'feature-type-tint-overlay'
  mesh.position.y = getFeatureTopY() + FEATURE_TINT_ELEVATION_OFFSET_KM
  mesh.renderOrder = 2
  mesh.raycast = () => {}

  return mesh
}

function appendRingBorderSegments(vertices: number[], ring: GeoPosition[]): void {
  const points = stripClosingPoint(ring)
  if (points.length < 2) return

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]

    vertices.push(
      current[0],
      0,
      current[1],
      next[0],
      0,
      next[1],
    )
  }
}

function createFeatureBorderGeometry(polygons: ProjectedPolygon[]): BufferGeometry {
  const vertices: number[] = []

  for (const polygon of polygons) {
    appendRingBorderSegments(vertices, polygon.outer)
    polygon.holes.forEach((hole) => appendRingBorderSegments(vertices, hole))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  return geometry
}

function createFeatureBorderMaterial(color: Color): LineBasicMaterial {
  const material = new LineBasicMaterial({
    color,
    opacity: SCENE_CONFIG.feature.visual.activeBorderOpacity,
    transparent: true,
  })
  material.depthWrite = false
  return material
}

function createFeatureBorderOverlay(
  polygons: ProjectedPolygon[],
  material: LineBasicMaterial,
): LineSegments {
  const lines = new LineSegments(createFeatureBorderGeometry(polygons), material)
  lines.name = 'feature-border-line'
  lines.position.y = getFeatureTopY() + FEATURE_BORDER_ELEVATION_OFFSET_KM
  lines.renderOrder = 3
  lines.raycast = () => {}

  return lines
}

export function createProtectAreaSceneGraph(
  areas: ProtectAreaGroup[],
  terrainTexture: Texture,
): ProtectAreaSceneGraph {
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
      featureGroup.add(createFeatureTerrainOverlay(terrainTexture, shapes, feature.bounds))
      const tint = createFeatureTintMaterial(color)
      featureGroup.add(createFeatureTintOverlay(shapes, tint))
      const border = createFeatureBorderMaterial(color)
      featureGroup.add(createFeatureBorderOverlay(polygons, border))

      areaGroup.add(featureGroup)

      visuals.push({
        areaId: area.id,
        baseColor: color.clone(),
        featureId: feature.id,
        type: feature.type,
        group: featureGroup,
        fill,
        tint,
        border,
      })
    }

    group.add(areaGroup)
  }

  return { group, visuals }
}

export function disposeProtectAreaSceneGraph(sceneGraph: ProtectAreaSceneGraph): void {
  sceneGraph.group.traverse((object) => {
    if (object instanceof Mesh || object instanceof LineSegments) {
      object.geometry.dispose()

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose())
      } else {
        object.material.dispose()
      }
    }
  })
}
