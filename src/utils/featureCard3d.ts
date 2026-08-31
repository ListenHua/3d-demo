import { Scene, type Camera, type Vector3 } from 'three'
import {
  CSS3DRenderer,
  CSS3DSprite,
} from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { SCENE_CONFIG } from '../config/scene'

export interface FeatureCardContent {
  color: string
  detailButtonLabel?: string
  detailPointId?: string
  eyebrow: string
  kind: 'feature' | 'point'
  rows: Array<{
    label: string
    value: string
  }>
  title: string
}

export interface FeatureCard3D {
  card: HTMLElement
  closeButton: HTMLButtonElement
  detailButton: HTMLButtonElement
  onClose: () => void
  onCloseClick: (event: MouseEvent) => void
  onDetailClick: (event: MouseEvent) => void
  onDetailPointerDown: (event: PointerEvent) => void
  onOpenDetail: (pointId: string) => void
  onPointerDown: (event: PointerEvent) => void
  renderer: CSS3DRenderer
  scene: Scene
  shell: HTMLElement
  sprite: CSS3DSprite
  fields: {
    details: HTMLElement
    footer: HTMLElement
    eyebrow: HTMLElement
    swatch: HTMLElement
    title: HTMLElement
  }
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  return element
}

function createDataRow(label: string) {
  const row = createElement('div', 'feature-card-row')
  const term = createElement('dt', 'feature-card-label')
  const value = createElement('dd', 'feature-card-value')
  term.textContent = label
  row.append(term, value)
  return { row, value }
}

export function createFeatureCard3D(
  host: HTMLElement,
  width: number,
  height: number,
  onClose: () => void,
  onOpenDetail: (pointId: string) => void,
): FeatureCard3D {
  const renderer = new CSS3DRenderer()
  renderer.setSize(width, height)
  renderer.domElement.className = 'feature-card-renderer'
  host.appendChild(renderer.domElement)

  const anchor = createElement('div', 'feature-card-anchor')
  const shell = createElement('div', 'feature-card-shell')
  const card = createElement('article', 'feature-card-3d')
  card.setAttribute('aria-label', '功能区三维信息卡片')
  card.style.opacity = '0'

  const header = createElement('header', 'feature-card-header')
  const swatch = createElement('span', 'feature-card-swatch')
  const heading = createElement('div', 'feature-card-heading')
  const eyebrow = createElement('p', 'feature-card-eyebrow')
  const title = createElement('h3', 'feature-card-title')
  const closeButton = createElement('button', 'feature-card-close')
  closeButton.type = 'button'
  closeButton.style.pointerEvents = 'auto'
  closeButton.textContent = '×'
  closeButton.title = '关闭功能区信息'
  closeButton.setAttribute('aria-label', '关闭功能区信息')
  const onPointerDown = (event: PointerEvent) => event.stopPropagation()
  const onCloseClick = (event: MouseEvent) => {
    event.stopPropagation()
    onClose()
  }
  closeButton.addEventListener('pointerdown', onPointerDown)
  closeButton.addEventListener('click', onCloseClick)
  eyebrow.textContent = '功能区'
  heading.append(eyebrow, title)
  header.append(swatch, heading, closeButton)

  const details = createElement('dl', 'feature-card-data')
  const footer = createElement('footer', 'feature-card-footer')
  const detailButton = createElement('button', 'feature-card-detail')
  const onDetailPointerDown = (event: PointerEvent) => event.stopPropagation()
  const onDetailClick = (event: MouseEvent) => {
    event.stopPropagation()
    const pointId = detailButton.dataset.pointId
    if (pointId) onOpenDetail(pointId)
  }
  detailButton.type = 'button'
  detailButton.style.pointerEvents = 'auto'
  detailButton.textContent = '查看详情'
  detailButton.title = '查看监测点详情'
  detailButton.setAttribute('aria-label', '查看监测点详情')
  detailButton.hidden = true
  detailButton.addEventListener('pointerdown', onDetailPointerDown)
  detailButton.addEventListener('click', onDetailClick)
  footer.appendChild(detailButton)
  card.append(header, details, footer)
  shell.appendChild(card)
  anchor.appendChild(shell)

  const sprite = new CSS3DSprite(anchor)
  anchor.style.pointerEvents = 'none'
  sprite.visible = false
  sprite.scale.setScalar(SCENE_CONFIG.card.liftScale)
  const scene = new Scene()
  scene.add(sprite)

  return {
    card,
    closeButton,
    detailButton,
    onClose,
    onCloseClick,
    onDetailClick,
    onDetailPointerDown,
    onOpenDetail,
    onPointerDown,
    renderer,
    scene,
    shell,
    sprite,
    fields: {
      details,
      footer,
      eyebrow,
      swatch,
      title,
    },
  }
}

export function updateFeatureCard3D(
  handle: FeatureCard3D,
  content: FeatureCardContent,
  position: Vector3,
): void {
  const rows = content.rows.map(({ label, value }) => {
    const row = createDataRow(label)
    row.value.textContent = value
    return row.row
  })
  handle.fields.details.replaceChildren(...rows)
  handle.fields.eyebrow.textContent = content.eyebrow
  handle.fields.title.textContent = content.title
  handle.fields.swatch.style.backgroundColor = content.color
  handle.card.setAttribute(
    'aria-label',
    content.kind === 'point' ? '监测点三维信息卡片' : '功能区三维信息卡片',
  )
  handle.shell.classList.toggle('feature-card-shell--point', content.kind === 'point')
  handle.fields.footer.hidden = !content.detailPointId
  handle.detailButton.hidden = !content.detailPointId
  handle.detailButton.textContent = content.detailButtonLabel ?? '查看详情'
  if (content.detailPointId) {
    handle.detailButton.dataset.pointId = content.detailPointId
  } else {
    delete handle.detailButton.dataset.pointId
  }
  handle.sprite.position.copy(position)
}

export function resizeFeatureCard3D(
  handle: FeatureCard3D,
  width: number,
  height: number,
): void {
  handle.renderer.setSize(width, height)
}

export function renderFeatureCard3D(handle: FeatureCard3D, camera: Camera): void {
  handle.renderer.render(handle.scene, camera)
}

export function disposeFeatureCard3D(handle: FeatureCard3D): void {
  handle.closeButton.removeEventListener('pointerdown', handle.onPointerDown)
  handle.closeButton.removeEventListener('click', handle.onCloseClick)
  handle.detailButton.removeEventListener('pointerdown', handle.onDetailPointerDown)
  handle.detailButton.removeEventListener('click', handle.onDetailClick)
  handle.scene.remove(handle.sprite)
  handle.renderer.domElement.remove()
}
