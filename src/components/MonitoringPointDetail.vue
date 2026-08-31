<script setup lang="ts">
import { computed } from 'vue'
import type { ProtectAreaPoint } from '../types/protect-area'

const props = defineProps<{
  areaName: string
  featureLabel: string
  point: ProtectAreaPoint
  statusColor: string
  statusLabel: string
}>()

const emit = defineEmits<{
  back: []
}>()

const primarySpecies = computed(() => props.point.species[0] ?? '未标注物种')

const detailRows = computed(() => [
  { label: '保护区', value: props.areaName },
  { label: '功能区', value: props.featureLabel },
  { label: '物种', value: props.point.species.join(' / ') || '未标注' },
  { label: '种植面积', value: `${props.point.plantingAreaHa.toFixed(2)} ha` },
  { label: '植株数量', value: `${props.point.plantCount} 株` },
  { label: '生长状态', value: props.statusLabel },
  { label: '调查日期', value: props.point.surveyDate },
  { label: '监测方式', value: props.point.monitoringMethod },
  { label: '生境描述', value: props.point.habitat },
])
</script>

<template>
  <article class="point-detail-page">
    <header class="point-detail-hero">
      <button
        class="point-detail-back"
        type="button"
        aria-label="返回地图"
        title="返回地图"
        @click="emit('back')"
      >
        返回地图
      </button>

      <p class="point-detail-kicker">Monitoring Point Detail</p>
      <h1>{{ point.name }}</h1>
      <div class="point-detail-status" :style="{ '--point-detail-status-color': statusColor }">
        <span>{{ statusLabel }}</span>
        <strong>{{ primarySpecies }}</strong>
      </div>
    </header>

    <section class="point-detail-body" aria-label="监测点详情">
      <div class="point-detail-summary">
        <h2>点位概况</h2>
        <p>{{ point.description }}</p>
      </div>

      <dl class="point-detail-list">
        <div v-for="row in detailRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>

      <div class="point-detail-risk">
        <span>风险提示</span>
        <p>{{ point.riskNote }}</p>
      </div>
    </section>
  </article>
</template>

<style scoped>
.point-detail-page {
  position: relative;
  z-index: 2;
  display: grid;
  height: 100vh;
  height: 100svh;
  min-height: 100vh;
  min-height: 100svh;
  grid-template-columns: minmax(280px, 0.78fr) minmax(360px, 1fr);
  gap: clamp(28px, 6vw, 92px);
  align-items: center;
  padding: clamp(24px, 6vw, 76px);
  background:
    linear-gradient(90deg, rgba(185, 213, 106, 0.12), transparent 36%),
    radial-gradient(circle at 82% 24%, rgba(241, 238, 228, 0.08), transparent 30%),
    #080c0b;
  color: var(--paper);
  overflow-y: auto;
}

.point-detail-hero,
.point-detail-body {
  min-width: 0;
}

.point-detail-back {
  display: inline-flex;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin-bottom: clamp(42px, 12vh, 132px);
  padding: 0 14px;
  border: 1px solid rgba(241, 238, 228, 0.22);
  border-radius: 3px;
  background: rgba(241, 238, 228, 0.06);
  color: rgba(241, 238, 228, 0.78);
  cursor: pointer;
  font-size: 11px;
  letter-spacing: 0;
  transition:
    border-color 150ms ease-out,
    color 150ms ease-out,
    transform 150ms var(--ease-out);
}

.point-detail-kicker,
.point-detail-list dt,
.point-detail-risk span {
  margin: 0;
  color: var(--faint);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.point-detail-hero h1,
.point-detail-summary h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: "Songti SC", "STSong", Georgia, serif;
  font-weight: 500;
  letter-spacing: 0;
}

.point-detail-hero h1 {
  max-width: 680px;
  margin-top: 12px;
  color: #ffffff;
  font-size: clamp(42px, 7vw, 96px);
  line-height: 0.98;
}

.point-detail-status {
  display: inline-flex;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  margin-top: 24px;
  color: rgba(241, 238, 228, 0.78);
  font-size: 12px;
}

.point-detail-status::before {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  background: var(--point-detail-status-color);
  box-shadow: 0 0 18px var(--point-detail-status-color);
  content: "";
}

.point-detail-status strong {
  color: var(--paper);
  font-weight: 500;
}

.point-detail-body {
  display: grid;
  gap: 24px;
  align-content: center;
  padding-top: 72px;
  border-top: 1px solid rgba(241, 238, 228, 0.16);
}

.point-detail-summary h2 {
  font-size: clamp(22px, 3vw, 36px);
  line-height: 1.12;
}

.point-detail-summary p,
.point-detail-list dd,
.point-detail-risk p {
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(241, 238, 228, 0.74);
  font-size: 13px;
  line-height: 1.72;
}

.point-detail-summary p {
  margin-top: 14px;
}

.point-detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 28px;
  margin: 0;
}

.point-detail-list div {
  min-width: 0;
  padding-top: 12px;
  border-top: 1px solid rgba(241, 238, 228, 0.1);
}

.point-detail-list dd {
  margin-top: 6px;
  color: rgba(241, 238, 228, 0.86);
}

.point-detail-risk {
  padding: 16px 0 0;
  border-top: 1px solid rgba(185, 213, 106, 0.28);
}

.point-detail-risk p {
  margin-top: 8px;
}

@media (hover: hover) and (pointer: fine) {
  .point-detail-back:hover {
    border-color: rgba(241, 238, 228, 0.48);
    color: var(--paper);
    transform: translateX(-2px);
  }
}

@media (max-width: 860px) {
  .point-detail-page {
    grid-template-columns: 1fr;
    align-content: start;
    gap: 34px;
  }

  .point-detail-back {
    margin-bottom: 56px;
  }

  .point-detail-body {
    padding-top: 28px;
  }

  .point-detail-list {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
