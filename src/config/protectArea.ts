import type { AreaType, PointGrowthStatus } from '../types/protect-area'

interface ProtectAreaTypeDefinition {
  /** GeoJSON 的 BHDLX 字段可能使用的原始名称。 */
  aliases: readonly string[]
  /** 地块、图例和信息卡使用的十六进制颜色。 */
  color: string
  /** 界面统一展示名称。 */
  label: string
  /** 重叠地块的裁剪优先级；数值越大，越优先保留完整形状。 */
  renderPriority: number
}

/** 功能区的稳定顺序，同时决定图例的展示顺序。 */
export const PROTECT_AREA_TYPES = [
  'buffer',
  'core',
  'experiment',
  'rescue',
] as const satisfies readonly AreaType[]

/** 功能区的解析、展示和渲染元数据。 */
export const PROTECT_AREA_TYPE_DEFINITIONS = {
  buffer: {
    aliases: ['缓冲区'],
    color: '#E6B85C',
    label: '缓冲区',
    renderPriority: 0,
  },
  core: {
    aliases: ['核心区'],
    color: '#43C983',
    label: '核心区',
    renderPriority: 2,
  },
  experiment: {
    aliases: ['试验区', '实验区'],
    color: '#4DB8D0',
    label: '试验区',
    renderPriority: 1,
  },
  rescue: {
    aliases: ['抢救园'],
    color: '#E76F79',
    label: '抢救园',
    renderPriority: 3,
  },
} as const satisfies Record<AreaType, ProtectAreaTypeDefinition>

/** 裁剪后允许渲染的最小多边形面积，单位为平方千米。 */
export const MIN_RENDER_POLYGON_AREA_KM2 = 1e-8

/** 保护区源数据转换参数。 */
export const PROTECT_AREA_TRANSFORM_CONFIG = {
  /** 投影坐标保留的小数位数；4 位约等于 0.1 米精度。 */
  coordinatePrecision: 4,
  /** 简化前后允许的最大聚合面积偏差比例。 */
  maxAreaDeltaRatio: 0.0001,
  /** 闭合边界的 RDP 简化容差，单位为千米；0.001 即 1 米。 */
  simplifyToleranceKm: 0.001,
} as const

/** 模拟监测点状态的稳定图例顺序。 */
export const PROTECT_POINT_STATUSES = [
  'good',
  'normal',
  'attention',
] as const satisfies readonly PointGrowthStatus[]

/** 模拟监测点状态的统一文案和无光照颜色。 */
export const PROTECT_POINT_STATUS_DEFINITIONS = {
  attention: {
    color: '#F06A5F',
    label: '需关注',
  },
  good: {
    color: '#B9D56A',
    label: '良好',
  },
  normal: {
    color: '#58B8E8',
    label: '正常',
  },
} as const satisfies Record<PointGrowthStatus, { color: string; label: string }>

const AREA_TYPE_BY_ALIAS = new Map<string, AreaType>(
  PROTECT_AREA_TYPES.flatMap((type) => (
    PROTECT_AREA_TYPE_DEFINITIONS[type].aliases.map((alias) => [alias, type] as const)
  )),
)

export function getAreaTypeFromAlias(alias: string): AreaType | undefined {
  return AREA_TYPE_BY_ALIAS.get(alias)
}
