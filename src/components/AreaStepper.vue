<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ProtectAreaGroup } from '../types/protect-area'
import { getAreaBarProgress } from '../composables/useAreaTour'

const props = defineProps<{
  areas: ProtectAreaGroup[]
  activeIndex: number
  animateSelection: boolean
  isPlaying: boolean
  playbackProgress: number
}>()

const emit = defineEmits<{
  select: [index: number, source: 'pointer' | 'keyboard']
  togglePlayback: []
}>()

const stepButtons = ref<Array<HTMLButtonElement | null>>([])
const stepViewport = ref<HTMLDivElement | null>(null)

function selectStep(index: number, source: 'pointer' | 'keyboard' = 'pointer'): void {
  if (index < 0 || index >= props.areas.length) return
  emit('select', index, source)
}

function getProgress(index: number): number {
  return getAreaBarProgress(index, props.activeIndex, props.playbackProgress)
}

function handleTrackWheel(event: WheelEvent): void {
  const viewport = stepViewport.value
  if (!viewport) return

  const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY
  if (rawDelta === 0) return

  const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? viewport.clientWidth
      : 1
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth
  if (maxScrollLeft <= 0) return

  event.preventDefault()
  viewport.scrollLeft = Math.min(
    Math.max(viewport.scrollLeft + rawDelta * deltaScale, 0),
    maxScrollLeft,
  )
}

watch(
  () => props.activeIndex,
  async (index) => {
    await nextTick()
    stepButtons.value[index]?.scrollIntoView({
      behavior: props.animateSelection ? 'smooth' : 'auto',
      block: 'nearest',
      inline: 'center',
    })
  },
  { immediate: true },
)
</script>

<template>
  <footer class="area-stepper" aria-label="保护区域自动巡览">
    <div class="playback-control">
      <button
        class="playback-button"
        type="button"
        :aria-label="isPlaying ? '暂停巡览' : '播放巡览'"
        :title="isPlaying ? '暂停巡览' : '播放巡览'"
        @click="emit('togglePlayback')"
      >
        <span v-if="isPlaying" class="playback-icon-pause" aria-hidden="true">
          <i></i><i></i>
        </span>
        <span v-else class="playback-icon-play" aria-hidden="true"></span>
      </button>
    </div>

    <nav class="stepper-nav" aria-label="保护区域">
      <button
        class="step-arrow step-arrow--previous"
        type="button"
        :disabled="activeIndex === 0"
        aria-label="上一个保护区域"
        title="上一个保护区域"
        @click="selectStep(activeIndex - 1)"
      >
        <span aria-hidden="true">&larr;</span>
      </button>

      <div
        ref="stepViewport"
        class="step-track-viewport"
        @wheel="handleTrackWheel"
      >
        <div class="step-track">
          <button
            v-for="(area, index) in areas"
            :key="area.id"
            :ref="(element) => { stepButtons[index] = element as HTMLButtonElement | null }"
            class="area-step-item"
            :class="{ 'is-active': index === activeIndex, 'is-passed': index < activeIndex }"
            type="button"
            :aria-current="index === activeIndex ? 'step' : undefined"
            :aria-label="`${index + 1}. ${area.name}`"
            :title="area.name"
            @click="selectStep(index)"
          >
            <span class="area-progress-track" aria-hidden="true">
              <span
                class="area-progress-fill"
                :style="{ transform: `scaleX(${getProgress(index)})` }"
              ></span>
            </span>
            <span class="area-step-name">{{ area.name }}</span>
          </button>
        </div>
      </div>

      <button
        class="step-arrow step-arrow--next"
        type="button"
        :disabled="activeIndex === areas.length - 1"
        aria-label="下一个保护区域"
        title="下一个保护区域"
        @click="selectStep(activeIndex + 1)"
      >
        <span aria-hidden="true">&rarr;</span>
      </button>
    </nav>
  </footer>
</template>

<style scoped>
.area-stepper {
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  min-height: 142px;
  grid-template-columns: 70px minmax(0, 1fr);
  align-items: center;
  padding: 18px 30px 22px;
  border-top: 1px solid var(--line);
  background: rgba(7, 11, 10, 0.9);
  backdrop-filter: blur(16px);
}

.playback-control {
  display: flex;
  height: 68px;
  align-items: center;
  justify-content: flex-start;
  padding-right: 18px;
  border-right: 1px solid var(--line);
}

.playback-button {
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(241, 238, 228, 0.3);
  background: transparent;
  color: var(--paper);
  cursor: pointer;
  transition:
    border-color 160ms ease-out,
    color 160ms ease-out,
    transform 160ms var(--ease-out);
}

.playback-button:active {
  transform: scale(0.97);
}

.playback-icon-play {
  width: 0;
  height: 0;
  margin-left: 3px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 9px solid currentColor;
}

.playback-icon-pause {
  display: flex;
  width: 12px;
  height: 13px;
  justify-content: space-between;
}

.playback-icon-pause i {
  width: 4px;
  height: 100%;
  background: currentColor;
}

.stepper-nav {
  display: grid;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 12px;
  padding-left: 18px;
}

.step-arrow,
.area-step-item {
  border: 0;
  background: transparent;
  cursor: pointer;
  transition:
    color 160ms ease-out,
    opacity 160ms ease-out,
    transform 160ms var(--ease-out);
}

.step-arrow {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 34px;
  height: 34px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--line);
  color: var(--paper);
  font-size: 16px;
  transition:
    border-color 140ms var(--ease-out),
    opacity 160ms ease-out,
    transform 160ms var(--ease-out);
}

.step-arrow::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: var(--green-fill);
  content: "";
  pointer-events: none;
  transform: scaleX(0);
  transition: transform 140ms var(--ease-out);
  will-change: transform;
}

.step-arrow--previous::before {
  transform-origin: right center;
}

.step-arrow--next::before {
  transform-origin: left center;
}

.step-arrow > span {
  position: relative;
  z-index: 1;
  color: var(--paper);
}

.step-arrow:focus-visible:not(:disabled) {
  border-color: var(--lime);
}

.step-arrow:focus-visible:not(:disabled)::before {
  transform: scaleX(1);
  transition-duration: 0ms;
}

.step-arrow:active:not(:disabled),
.area-step-item:active {
  transform: scale(0.97);
}

.step-arrow:disabled {
  cursor: default;
  opacity: 0.25;
}

.step-track-viewport {
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior: contain;
}

.step-track-viewport::-webkit-scrollbar {
  display: none;
}

.step-track {
  display: grid;
  width: max-content;
  min-width: 100%;
  grid-auto-columns: 156px;
  grid-auto-flow: column;
  gap: 16px;
  align-items: start;
  padding: 7px 4px 2px;
}

.area-step-item {
  display: flex;
  width: 156px;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  color: rgba(241, 238, 228, 0.38);
  text-align: left;
}

.area-progress-track {
  position: relative;
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  background: rgba(241, 238, 228, 0.14);
}

.area-progress-fill {
  position: absolute;
  inset: 0;
  display: block;
  background: var(--lime);
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
}

.area-step-name {
  display: block;
  min-height: 3.9em;
  overflow-wrap: anywhere;
  font-size: 10px;
  line-height: 1.3;
  white-space: normal;
}

.area-step-item.is-passed {
  color: rgba(241, 238, 228, 0.55);
}

.area-step-item.is-active {
  color: var(--paper);
}

@media (hover: hover) and (pointer: fine) {
  .step-arrow:hover:not(:disabled) {
    border-color: var(--lime);
  }

  .step-arrow:hover:not(:disabled)::before {
    transform: scaleX(1);
    transition-duration: 180ms;
  }

  .playback-button:hover {
    border-color: rgba(241, 238, 228, 0.58);
    color: var(--paper);
  }

  .area-step-item:hover:not(.is-active) {
    color: rgba(241, 238, 228, 0.78);
  }
}

@media (max-width: 760px) {
  .area-stepper {
    min-height: 150px;
    grid-template-columns: 52px minmax(0, 1fr);
    padding: 14px 12px 17px;
  }

  .playback-control {
    height: 74px;
    padding-right: 10px;
  }

  .playback-button {
    width: 36px;
    height: 36px;
  }

  .stepper-nav {
    grid-template-columns: 30px minmax(0, 1fr) 30px;
    gap: 7px;
    padding-left: 10px;
  }

  .step-arrow {
    width: 30px;
    height: 30px;
  }

  .step-track {
    grid-auto-columns: 132px;
    gap: 13px;
  }

  .area-step-item {
    width: 132px;
  }
}

@media (max-height: 690px) {
  .area-stepper {
    min-height: 126px;
    padding-top: 10px;
    padding-bottom: 12px;
  }

  .area-step-name {
    min-height: 2.6em;
    font-size: 9px;
  }
}
</style>
