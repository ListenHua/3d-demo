import type { ProtectSceneSelection } from '../types/protect-area'

export function getSceneSelectionId(
  selection: ProtectSceneSelection | null,
): string | null {
  if (!selection) return null
  return selection.kind === 'point'
    ? `point:${selection.pointId}`
    : `feature:${selection.featureId}`
}
