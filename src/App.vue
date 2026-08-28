<script setup lang="ts">
import { gsap } from 'gsap'
import {
  computed,
  defineAsyncComponent,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import AreaStepper from './components/AreaStepper.vue'
import {
  PROTECT_AREA_TYPES,
  PROTECT_AREA_TYPE_DEFINITIONS,
  PROTECT_POINT_STATUSES,
  PROTECT_POINT_STATUS_DEFINITIONS,
} from './config/protectArea'
import { useAreaTour } from './composables/useAreaTour'
import { loadProtectAreaDataset } from './data/protectAreaDataset'
import type {
  ProtectAreaDataset,
  ProtectSceneSelection,
} from './types/protect-area'
import { getSceneSelectionId } from './utils/sceneSelection'

const orbitalScenePromise = import('./components/scene/OrbitalScene.vue')
const OrbitalScene = defineAsyncComponent(() => orbitalScenePromise)

const appShell = ref<HTMLElement | null>(null)
const areaReadout = ref<HTMLElement | null>(null)
const dataset = shallowRef<ProtectAreaDataset | null>(null)
const dataError = ref<string | null>(null)
const isLoading = ref(true)
const selectedFeatureSelection = ref<ProtectSceneSelection | null>(null)
const areaTypeEntries = PROTECT_AREA_TYPES.map((type) => ({
  color: PROTECT_AREA_TYPE_DEFINITIONS[type].color,
  label: PROTECT_AREA_TYPE_DEFINITIONS[type].label,
  type,
}))
const pointStatusEntries = PROTECT_POINT_STATUSES.map((status) => ({
  color: PROTECT_POINT_STATUS_DEFINITIONS[status].color,
  label: PROTECT_POINT_STATUS_DEFINITIONS[status].label,
  status,
}))

const {
  activeIndex,
  animateSelection,
  handleFlightState,
  isPlaying,
  playbackProgress,
  selectIndex,
  setPlaybackHold,
  startPlayback,
  stopPlayback,
  togglePlayback,
} = useAreaTour({
  areaCount: () => dataset.value?.areas.length ?? 0,
  autoPlay: true,
  onAreaChange: () => {
    selectedFeatureSelection.value = null
  },
})

const activeArea = computed(() => {
  const areas = dataset.value?.areas
  if (!areas?.length) return null
  return areas[activeIndex.value] ?? areas[0] ?? null
})

let dataAbortController: AbortController | null = null
let areaReadoutTween: gsap.core.Tween | null = null
let introContext: gsap.Context | null = null

async function loadDataset(): Promise<void> {
  dataAbortController?.abort()
  const controller = new AbortController()
  dataAbortController = controller
  dataError.value = null
  isLoading.value = true

  try {
    dataset.value = markRaw(await loadProtectAreaDataset(controller.signal))
    startPlayback()
  } catch (error) {
    if (controller.signal.aborted) return
    dataError.value = error instanceof Error ? error.message : 'Unknown data error'
  } finally {
    if (dataAbortController === controller) isLoading.value = false
  }
}

function selectFeature(selection: ProtectSceneSelection): void {
  const currentDataset = dataset.value
  if (!currentDataset) return

  stopPlayback()
  if (getSceneSelectionId(selection) === getSceneSelectionId(selectedFeatureSelection.value)) {
    return
  }

  const index = currentDataset.areas.findIndex((area) => area.id === selection.areaId)
  if (index < 0) return

  animateSelection.value = true
  if (index !== activeIndex.value) selectIndex(index)
  selectedFeatureSelection.value = selection
}

function clearFeatureSelection(): void {
  const currentDataset = dataset.value
  const selection = selectedFeatureSelection.value
  if (currentDataset && selection) {
    const returnIndex = currentDataset.areas.findIndex(
      (area) => area.id === selection.returnContext.areaId,
    )
    if (returnIndex >= 0 && returnIndex !== activeIndex.value) {
      animateSelection.value = true
      activeIndex.value = returnIndex
    }
  }

  selectedFeatureSelection.value = null
}

function playIntro(): void {
  introContext?.revert()
  introContext = gsap.context(() => {
    const introElements = appShell.value?.querySelectorAll<HTMLElement>('[data-intro]')
    if (!introElements?.length) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(introElements, { autoAlpha: 1 })
      return
    }

    gsap.from(introElements, {
      autoAlpha: 0,
      clearProps: 'transform',
      delay: 0.08,
      duration: 0.55,
      ease: 'power3.out',
      stagger: 0.07,
      y: 14,
    })
  }, appShell.value ?? undefined)
}

function playAreaReadout(): void {
  const elements = areaReadout.value?.querySelectorAll<HTMLElement>('[data-area-text]')
  if (!elements?.length) return

  areaReadoutTween?.kill()
  gsap.killTweensOf(elements)

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    areaReadoutTween = gsap.fromTo(
      elements,
      { opacity: 0 },
      {
        clearProps: 'opacity',
        duration: 0.12,
        ease: 'power2.out',
        opacity: 1,
        onComplete: () => {
          areaReadoutTween = null
        },
      },
    )
    return
  }

  areaReadoutTween = gsap.fromTo(
    elements,
    { clipPath: 'inset(0 100% 0 0)' },
    {
      clearProps: 'clipPath',
      clipPath: 'inset(0 0% 0 0)',
      duration: 1,
      ease: 'power2.inOut',
      stagger: 0.035,
      onComplete: () => {
        areaReadoutTween = null
      },
    },
  )
}

watch(dataset, async (value) => {
  if (!value) return
  await nextTick()
  playIntro()
})

watch(
  () => activeArea.value?.id,
  (areaId) => {
    if (areaId) playAreaReadout()
  },
  { flush: 'post' },
)

onMounted(() => {
  void loadDataset()
})

onBeforeUnmount(() => {
  dataAbortController?.abort()
  areaReadoutTween?.kill()
  introContext?.revert()
})
</script>

<template>
  <main ref="appShell" class="protect-explorer">
    <template v-if="dataset && activeArea">
      <div class="scene-layer" aria-hidden="true">
        <OrbitalScene
          :active-area-id="activeArea.id"
          :animate-selection="animateSelection"
          :dataset="dataset"
          :selected-feature-selection="selectedFeatureSelection"
          @clear-feature-selection="clearFeatureSelection"
          @flight-state="handleFlightState"
          @select-feature="selectFeature"
          @terrain-hover-state="setPlaybackHold('terrain-hover', $event)"
          @user-camera-interaction="stopPlayback"
        />
      </div>
      <div class="scene-edge-shade" aria-hidden="true"></div>

      <section
        ref="areaReadout"
        class="area-readout"
        aria-atomic="true"
        aria-live="polite"
      >
        <div class="readout-index" data-area-text>
          <span>{{ String(activeIndex + 1).padStart(2, '0') }}</span>
          <i></i>
          <span>{{ activeArea.city }}</span>
        </div>

        <h1 data-area-text>{{ activeArea.name }}</h1>

        <dl class="area-metadata" data-area-text>
          <div>
            <dt>保护对象</dt>
            <dd>{{ activeArea.species || '未标注' }}</dd>
          </div>
          <div>
            <dt>行政区</dt>
            <dd>{{ activeArea.county || activeArea.city }}</dd>
          </div>
          <div>
            <dt>功能区面积</dt>
            <dd>{{ activeArea.totalArea.toFixed(2) }} <small>ha</small></dd>
          </div>
          <div>
            <dt>保护区编码</dt>
            <dd class="metadata-code">{{ activeArea.id }}</dd>
          </div>
        </dl>
      </section>

      <aside class="area-legend" data-intro aria-label="地图图例">
        <div class="legend-group">
          <p>功能区类型</p>
          <ul>
            <li v-for="entry in areaTypeEntries" :key="entry.type">
              <span class="legend-swatch" :style="{ backgroundColor: entry.color }"></span>
              <span>{{ entry.label }}</span>
            </li>
          </ul>
        </div>

        <div class="legend-group legend-point-group">
          <p>监测点状态</p>
          <ul>
            <li v-for="entry in pointStatusEntries" :key="entry.status">
              <span
                class="legend-point-swatch"
                :style="{ backgroundColor: entry.color }"
              ></span>
              <span>{{ entry.label }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <div data-intro>
        <AreaStepper
          :active-index="activeIndex"
          :animate-selection="animateSelection"
          :areas="dataset.areas"
          :is-playing="isPlaying"
          :playback-progress="playbackProgress"
          @select="selectIndex"
          @toggle-playback="togglePlayback"
        />
      </div>
    </template>

    <section v-else class="scene-loading" role="status" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <p v-if="isLoading">正在加载保护区数据</p>
      <template v-else>
        <p>保护区数据加载失败</p>
        <button type="button" @click="loadDataset">重试</button>
        <small>{{ dataError }}</small>
      </template>
    </section>
  </main>
</template>

<style scoped>
.protect-explorer {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: #080c0b;
}

.scene-layer,
.scene-edge-shade {
  position: absolute;
  inset: 0;
}

.scene-layer {
  z-index: 0;
}

.scene-edge-shade {
  z-index: 1;
  pointer-events: none;
  box-shadow:
    inset 110px 0 140px rgba(4, 7, 6, 0.5),
    inset 0 110px 110px rgba(4, 7, 6, 0.34),
    inset 0 -170px 150px rgba(4, 7, 6, 0.58);
}

.readout-index,
.area-legend li {
  display: flex;
  align-items: center;
}

.area-legend p,
.readout-index,
.area-metadata dt {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 0 3px rgba(185, 213, 106, 0.12);
}

.scene-loading .status-dot {
  animation: status-pulse 720ms ease-in-out infinite alternate;
}

.area-readout {
  position: absolute;
  z-index: 2;
  top: 30px;
  left: 30px;
  width: min(460px, calc(100vw - 60px));
  padding-left: 18px;
  border-left: 1px solid rgba(185, 213, 106, 0.62);
  pointer-events: none;
}

.readout-index {
  gap: 9px;
  color: var(--lime);
  font-size: 10px;
  font-weight: 700;
}

.readout-index i {
  width: 28px;
  height: 1px;
  background: currentColor;
}

.area-readout h1 {
  max-width: 430px;
  margin: 14px 0 0;
  color: var(--paper);
  font-family: "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(25px, 2.4vw, 38px);
  font-weight: 500;
  line-height: 1.28;
  letter-spacing: 0;
  text-wrap: balance;
}

.area-metadata {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 14px 24px;
  margin: 22px 0 0;
}

.area-metadata div {
  min-width: 0;
}

.area-metadata dt {
  color: var(--faint);
  font-size: 9px;
}

.area-metadata dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: rgba(241, 238, 228, 0.82);
  font-size: 12px;
  line-height: 1.4;
}

.area-metadata small {
  color: var(--faint);
  font-size: 9px;
  font-weight: 500;
}

.metadata-code {
  font-variant-numeric: tabular-nums;
}

.area-legend {
  position: absolute;
  z-index: 2;
  right: auto;
  bottom: 174px;
  left: 30px;
  min-width: 124px;
  pointer-events: none;
}

.legend-group + .legend-group {
  margin-top: 18px;
}

.area-legend p {
  padding-bottom: 9px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font-size: 9px;
}

.area-legend ul {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.area-legend li {
  gap: 8px;
  color: rgba(241, 238, 228, 0.72);
  font-size: 10px;
}

.legend-swatch {
  width: 18px;
  height: 3px;
  box-shadow: 0 0 10px currentColor;
}

.legend-point-swatch {
  width: 10px;
  height: 9px;
  flex: 0 0 10px;
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}

.scene-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  color: var(--muted);
  font-size: 11px;
}

.scene-loading p,
.scene-loading small {
  max-width: min(420px, calc(100vw - 48px));
  margin: 0;
  overflow-wrap: anywhere;
  text-align: center;
}

.scene-loading small {
  color: var(--faint);
  font-size: 9px;
}

.scene-loading button {
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--paper);
  cursor: pointer;
}

@keyframes status-pulse {
  from {
    opacity: 0.42;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 760px) {
  .scene-edge-shade {
    box-shadow:
      inset 0 90px 90px rgba(4, 7, 6, 0.42),
      inset 0 -180px 130px rgba(4, 7, 6, 0.66);
  }

  .area-readout {
    top: 20px;
    left: 16px;
    width: calc(100vw - 32px);
    padding-left: 13px;
  }

  .area-readout h1 {
    max-width: calc(100vw - 58px);
    margin-top: 10px;
    font-size: clamp(22px, 7vw, 29px);
    line-height: 1.25;
  }

  .area-metadata {
    max-width: calc(100vw - 56px);
    gap: 10px 18px;
    margin-top: 16px;
  }

  .area-metadata dd {
    margin-top: 3px;
    font-size: 11px;
  }

  .area-legend {
    right: auto;
    bottom: 166px;
    left: 16px;
  }

  .area-legend p {
    display: none;
  }

  .area-legend ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 6px 14px;
    margin: 0;
  }

  .area-legend li {
    font-size: 9px;
  }

  .legend-swatch {
    width: 12px;
  }

  .legend-group + .legend-group {
    margin-top: 7px;
  }
}

@media (max-height: 690px) {
  .area-metadata {
    display: none;
  }

  .area-legend {
    bottom: 142px;
  }
}
</style>
