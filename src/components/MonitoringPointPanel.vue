<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProtectAreaPoint } from '../types/protect-area'

const props = defineProps<{
  areaName: string
  featureLabel: string
  point: ProtectAreaPoint
  statusColor: string
  statusLabel: string
}>()

const emit = defineEmits<{
  close: []
}>()

const primarySpecies = computed(() => props.point.species[0] ?? '未标注物种')
const activeImageIndex = ref(0)
const speciesImages = computed(() => props.point.speciesImageUrls)
const imageCount = computed(() => speciesImages.value.length)

const detailRows = computed(() => [
  { label: '功能区', value: props.featureLabel },
  { label: '保护区', value: props.areaName },
  { label: '种植面积', value: `${props.point.plantingAreaHa.toFixed(2)} ha` },
  { label: '植株数量', value: `${props.point.plantCount} 株` },
  { label: '调查日期', value: props.point.surveyDate },
  { label: '监测方式', value: props.point.monitoringMethod },
  { label: '生境描述', value: props.point.habitat },
])

function selectImage(index: number): void {
  if (index < 0 || index >= imageCount.value) return
  activeImageIndex.value = index
}

function showPreviousImage(): void {
  activeImageIndex.value = (
    activeImageIndex.value - 1 + imageCount.value
  ) % imageCount.value
}

function showNextImage(): void {
  activeImageIndex.value = (activeImageIndex.value + 1) % imageCount.value
}

watch(
  () => props.point.id,
  () => {
    activeImageIndex.value = 0
  },
)
</script>

<template>
  <aside class="monitoring-point-panel" aria-label="监测点详情">
    <section class="monitoring-point-module monitoring-point-module--details">
      <header class="point-panel-header">
        <span class="point-panel-kicker">Monitoring Point</span>
        <button
          class="point-panel-close"
          type="button"
          aria-label="关闭监测点详情"
          title="关闭监测点详情"
          @click="emit('close')"
        >
          ×
        </button>
        <h2>{{ point.name }}</h2>
        <span class="point-status" :style="{ '--point-status-color': statusColor }">
          {{ statusLabel }}
        </span>
      </header>

      <p class="point-description">{{ point.description }}</p>

      <dl class="point-detail-list">
        <div v-for="row in detailRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>

      <div class="point-risk-note">
        <span>风险提示</span>
        <p>{{ point.riskNote }}</p>
      </div>
    </section>

    <section class="monitoring-point-module monitoring-point-module--image">
      <header>
        <span class="point-panel-kicker">Species Image</span>
        <h3>物种图片</h3>
      </header>
      <figure class="species-carousel">
        <div class="species-carousel-viewport">
          <div
            class="species-carousel-track"
            :style="{ transform: `translateX(-${activeImageIndex * 100}%)` }"
          >
            <img
              v-for="(imageUrl, index) in speciesImages"
              :key="imageUrl"
              :alt="`${primarySpecies}模拟物种图片 ${index + 1}`"
              decoding="async"
              :loading="index === 0 ? 'eager' : 'lazy'"
              :src="imageUrl"
            />
          </div>

          <div class="species-carousel-controls" v-if="imageCount > 1">
            <button
              type="button"
              aria-label="上一张物种图片"
              title="上一张物种图片"
              @click="showPreviousImage"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="下一张物种图片"
              title="下一张物种图片"
              @click="showNextImage"
            >
              ›
            </button>
          </div>

          <div class="species-carousel-dots" v-if="imageCount > 1">
            <button
              v-for="(_, index) in speciesImages"
              :key="index"
              type="button"
              :aria-current="index === activeImageIndex ? 'true' : undefined"
              :aria-label="`查看第 ${index + 1} 张物种图片`"
              :title="`第 ${index + 1} 张`"
              @click="selectImage(index)"
            ></button>
          </div>
        </div>
      </figure>
    </section>
  </aside>
</template>

<style scoped>
.monitoring-point-panel {
  position: absolute;
  z-index: 3;
  top: 190px;
  bottom: 174px;
  right: 30px;
  display: grid;
  width: min(360px, calc(100vw - 60px));
  align-content: start;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
  color: var(--paper);
  pointer-events: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(241, 238, 228, 0.28) transparent;
}

.monitoring-point-panel::-webkit-scrollbar {
  width: 4px;
}

.monitoring-point-panel::-webkit-scrollbar-thumb {
  background: rgba(241, 238, 228, 0.28);
}

.monitoring-point-module {
  min-width: 0;
  border: 1px solid rgba(241, 238, 228, 0.18);
  border-radius: 4px;
  background: rgba(8, 14, 12, 0.94);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(14px);
}

.monitoring-point-module--details {
  padding: 16px;
}

.monitoring-point-module--image {
  overflow: hidden;
}

.point-panel-header {
  position: relative;
  padding-right: 36px;
}

.point-panel-kicker,
.point-detail-list dt,
.point-risk-note span {
  margin: 0;
  color: var(--faint);
  font-size: 9px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.point-panel-header h2,
.monitoring-point-module--image h3 {
  margin: 7px 0 0;
  overflow-wrap: anywhere;
  font-family: "Songti SC", "STSong", Georgia, serif;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.16;
}

.point-panel-header h2 {
  font-size: 22px;
}

.monitoring-point-module--image h3 {
  font-size: 18px;
}

.point-panel-close {
  position: absolute;
  top: -8px;
  right: -8px;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgba(241, 238, 228, 0.56);
  cursor: pointer;
  font-family: Georgia, serif;
  font-size: 21px;
  line-height: 1;
  transition:
    color 150ms ease-out,
    transform 150ms var(--ease-out);
}

.point-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  color: rgba(241, 238, 228, 0.78);
  font-size: 10px;
}

.point-status::before {
  width: 7px;
  height: 7px;
  background: var(--point-status-color);
  box-shadow: 0 0 14px var(--point-status-color);
  content: "";
}

.point-description,
.point-risk-note p,
.point-detail-list dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(241, 238, 228, 0.78);
  font-size: 11px;
  line-height: 1.55;
}

.point-description {
  margin-top: 14px;
}

.point-detail-list {
  display: grid;
  gap: 9px;
  margin: 15px 0 0;
}

.point-detail-list div {
  display: grid;
  min-width: 0;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
}

.point-detail-list dd {
  color: rgba(241, 238, 228, 0.84);
}

.point-risk-note {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid rgba(241, 238, 228, 0.12);
}

.point-risk-note p {
  margin-top: 6px;
}

.monitoring-point-module--image header {
  padding: 14px 15px 12px;
}

.species-carousel {
  margin: 0;
}

.species-carousel-viewport {
  position: relative;
  overflow: hidden;
  background: rgba(241, 238, 228, 0.08);
}

.species-carousel-track {
  display: flex;
  transition: transform 260ms var(--ease-out);
  will-change: transform;
}

.species-carousel-track img {
  display: block;
  width: 100%;
  min-width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}

.species-carousel-controls {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 6px;
}

.species-carousel-controls button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(241, 238, 228, 0.22);
  border-radius: 2px;
  background: rgba(8, 14, 12, 0.78);
  color: var(--paper);
  cursor: pointer;
  font-family: Georgia, serif;
  font-size: 20px;
  line-height: 1;
  backdrop-filter: blur(10px);
  transition:
    border-color 150ms ease-out,
    transform 150ms var(--ease-out);
}

.species-carousel-dots {
  position: absolute;
  bottom: 14px;
  left: 14px;
  display: flex;
  gap: 7px;
}

.species-carousel-dots button {
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(241, 238, 228, 0.42);
  cursor: pointer;
  transition:
    background-color 150ms ease-out,
    transform 150ms var(--ease-out);
}

.species-carousel-dots button[aria-current="true"] {
  background: var(--lime);
}

@media (hover: hover) and (pointer: fine) {
  .point-panel-close:hover {
    color: var(--paper);
    transform: scale(1.06);
  }

  .species-carousel-controls button:hover {
    border-color: rgba(241, 238, 228, 0.52);
    transform: translateY(-1px);
  }

  .species-carousel-dots button:hover {
    background: rgba(241, 238, 228, 0.44);
  }
}

@media (max-width: 760px) {
  .monitoring-point-panel {
    top: auto;
    right: 12px;
    bottom: 166px;
    left: 12px;
    width: auto;
    max-height: min(58vh, 430px);
  }

  .monitoring-point-module--details {
    padding: 14px;
  }

  .point-panel-header h2 {
    font-size: 19px;
  }
}

@media (max-height: 690px) {
  .monitoring-point-panel {
    top: 24px;
    bottom: 142px;
  }
}
</style>
