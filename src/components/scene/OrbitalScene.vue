<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { SRGBColorSpace } from 'three'
import { SCENE_CONFIG } from '../../config/scene'
import type {
  ProtectAreaDataset,
  ProtectSceneSelection,
} from '../../types/protect-area'
import SceneContent from './SceneContent.vue'

defineProps<{
  dataset: ProtectAreaDataset
  activeAreaId: string
  animateSelection: boolean
  selectedFeatureSelection: ProtectSceneSelection | null
}>()

const emit = defineEmits<{
  selectFeature: [selection: ProtectSceneSelection]
  clearFeatureSelection: []
  flightState: [isFlying: boolean]
  openPointDetail: [pointId: string]
  terrainHoverState: [isHovered: boolean]
  userCameraInteraction: []
}>()
</script>

<template>
  <TresCanvas
    :clear-color="SCENE_CONFIG.ground.color"
    :antialias="SCENE_CONFIG.canvas.antialias"
    :alpha="false"
    :dpr="SCENE_CONFIG.canvas.dpr"
    :logarithmic-depth-buffer="SCENE_CONFIG.canvas.logarithmicDepthBuffer"
    :output-color-space="SRGBColorSpace"
    :render-mode="SCENE_CONFIG.canvas.renderMode"
    power-preference="high-performance"
  >
    <SceneContent
      :active-area-id="activeAreaId"
      :animate-selection="animateSelection"
      :dataset="dataset"
      :selected-feature-selection="selectedFeatureSelection"
      @clear-feature-selection="emit('clearFeatureSelection')"
      @flight-state="emit('flightState', $event)"
      @open-point-detail="emit('openPointDetail', $event)"
      @select-feature="emit('selectFeature', $event)"
      @terrain-hover-state="emit('terrainHoverState', $event)"
      @user-camera-interaction="emit('userCameraInteraction')"
    />
  </TresCanvas>
</template>
