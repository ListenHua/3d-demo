import { gsap } from 'gsap'
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type SelectionSource = 'keyboard' | 'playback' | 'pointer'
export type PlaybackHoldReason = 'camera-flight' | 'document-hidden' | 'terrain-hover'

interface AreaTourOptions {
  areaCount: () => number
  autoPlay?: boolean
  durationSeconds?: number
  onAreaChange: () => void
  selectionFillDurationSeconds?: number
}

export function getAreaBarProgress(
  index: number,
  activeIndex: number,
  activeProgress: number,
): number {
  if (index < activeIndex) return 1
  if (index > activeIndex) return 0
  return Math.min(Math.max(activeProgress, 0), 1)
}

export function getPlaybackStartIndex(
  activeIndex: number,
  areaCount: number,
  activeProgress: number,
): number {
  if (areaCount <= 0) return -1
  if (activeProgress < 1) return activeIndex
  return activeIndex >= areaCount - 1 ? 0 : activeIndex + 1
}

export function useAreaTour({
  areaCount,
  autoPlay = false,
  durationSeconds = 5,
  onAreaChange,
  selectionFillDurationSeconds = 0.28,
}: AreaTourOptions) {
  const activeIndex = ref(0)
  const animateSelection = ref(true)
  const isFlying = ref(autoPlay)
  const isPlaying = ref(autoPlay)
  const playbackProgress = ref(autoPlay ? 0 : 1)
  const playbackClock = { progress: playbackProgress.value }
  const selectionClock = { progress: 1 }
  const playbackHolds = new Set<PlaybackHoldReason>(
    autoPlay ? ['camera-flight'] : [],
  )

  let playbackTween: gsap.core.Tween | null = null
  let selectionTween: gsap.core.Tween | null = null

  function killPlaybackTween(): void {
    playbackTween?.kill()
    playbackTween = null
  }

  function killSelectionTween(): void {
    selectionTween?.kill()
    selectionTween = null
  }

  function stopPlayback(): void {
    isPlaying.value = false
    killPlaybackTween()
    killSelectionTween()
    playbackClock.progress = playbackProgress.value
  }

  function animateSelectionFill(): void {
    killSelectionTween()
    playbackProgress.value = 0
    selectionClock.progress = 0

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playbackProgress.value = 1
      selectionClock.progress = 1
      return
    }

    selectionTween = gsap.to(selectionClock, {
      duration: selectionFillDurationSeconds,
      ease: 'power2.out',
      progress: 1,
      onUpdate: () => {
        playbackProgress.value = selectionClock.progress
      },
      onComplete: () => {
        playbackProgress.value = 1
        selectionTween = null
      },
    })
  }

  function selectIndex(index: number, source: SelectionSource = 'pointer'): void {
    if (index < 0 || index >= areaCount()) return
    if (source !== 'playback') stopPlayback()
    if (index === activeIndex.value) return

    onAreaChange()
    animateSelection.value = source !== 'keyboard'
    activeIndex.value = index
    if (source === 'pointer') animateSelectionFill()
  }

  function advancePlayback(): void {
    if (!isPlaying.value) return

    const nextIndex = getPlaybackStartIndex(activeIndex.value, areaCount(), 1)
    if (nextIndex < 0) return

    playbackProgress.value = 0
    playbackClock.progress = 0
    selectIndex(nextIndex, 'playback')
  }

  function startPlaybackTween(): void {
    if (!isPlaying.value || playbackHolds.size > 0) return

    killSelectionTween()
    killPlaybackTween()
    playbackClock.progress = playbackProgress.value
    const remainingDuration = Math.max(
      (1 - playbackProgress.value) * durationSeconds,
      0.01,
    )

    playbackTween = gsap.to(playbackClock, {
      duration: remainingDuration,
      ease: 'none',
      progress: 1,
      onUpdate: () => {
        playbackProgress.value = playbackClock.progress
      },
      onComplete: () => {
        playbackProgress.value = 1
        playbackTween = null
        advancePlayback()
      },
    })
  }

  function setPlaybackHold(reason: PlaybackHoldReason, shouldHold: boolean): void {
    const didChange = shouldHold
      ? !playbackHolds.has(reason)
      : playbackHolds.has(reason)
    if (!didChange) return

    if (shouldHold) {
      playbackHolds.add(reason)
      playbackTween?.pause()
      return
    }

    playbackHolds.delete(reason)
    if (isPlaying.value && playbackHolds.size === 0) startPlaybackTween()
  }

  function startPlayback(): void {
    if (areaCount() <= 0) return
    isPlaying.value = true
    startPlaybackTween()
  }

  function togglePlayback(): void {
    if (isPlaying.value) {
      stopPlayback()
      return
    }

    isPlaying.value = true
    const startIndex = getPlaybackStartIndex(
      activeIndex.value,
      areaCount(),
      playbackProgress.value,
    )

    if (startIndex !== activeIndex.value) {
      playbackProgress.value = 0
      playbackClock.progress = 0
      selectIndex(startIndex, 'playback')
      return
    }

    startPlaybackTween()
  }

  function handleFlightState(flying: boolean): void {
    isFlying.value = flying
    setPlaybackHold('camera-flight', flying)
    if (!flying && isPlaying.value && playbackHolds.size === 0 && !playbackTween) {
      startPlaybackTween()
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectIndex(activeIndex.value - 1, 'keyboard')
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectIndex(activeIndex.value + 1, 'keyboard')
    }
  }

  function handleVisibilityChange(): void {
    setPlaybackHold('document-hidden', document.hidden)
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    handleVisibilityChange()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    killPlaybackTween()
    killSelectionTween()
  })

  return {
    activeIndex,
    animateSelection,
    handleFlightState,
    isFlying,
    isPlaying,
    playbackProgress,
    selectIndex,
    setPlaybackHold,
    startPlayback,
    stopPlayback,
    togglePlayback,
  }
}
