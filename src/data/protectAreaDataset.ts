import type { ProtectAreaDataset } from '../types/protect-area'
import type { ProtectAreaWorkerMessage } from '../workers/protectAreaData.worker'

export function loadProtectAreaDataset(
  signal?: AbortSignal,
): Promise<ProtectAreaDataset> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Protected area data loading was aborted', 'AbortError'))
      return
    }

    const worker = new Worker(
      new URL('../workers/protectAreaData.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const cleanup = (): void => {
      signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
    }
    const handleAbort = (): void => {
      cleanup()
      reject(new DOMException('Protected area data loading was aborted', 'AbortError'))
    }

    worker.onmessage = (event: MessageEvent<ProtectAreaWorkerMessage>) => {
      cleanup()
      if (event.data.dataset) {
        resolve(event.data.dataset)
      } else {
        reject(new Error(event.data.error ?? 'Failed to prepare protected area data'))
      }
    }
    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || 'Protected area data worker failed'))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}
