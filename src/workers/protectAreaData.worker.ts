import protectAreaSource from '../assets/data/protect-area/protect_area.json'
import pointSource from '../assets/data/protect-area/protect_area_points.mock.json'
import type { ProtectAreaDataset } from '../types/protect-area'
import { prepareProtectAreaDataset } from '../utils/protectAreaData'

export interface ProtectAreaWorkerMessage {
  dataset?: ProtectAreaDataset
  error?: string
}

const workerScope = self as unknown as {
  postMessage: (message: ProtectAreaWorkerMessage) => void
}

try {
  workerScope.postMessage({
    dataset: prepareProtectAreaDataset(protectAreaSource, pointSource),
  })
} catch (error) {
  workerScope.postMessage({
    error: error instanceof Error ? error.message : 'Unknown protected area data error',
  })
}
