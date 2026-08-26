# 广西原生境保护区 / TresJS 场景

直接使用 `src/assets/data/protect-area/` 中重新生成的广西保护区演示 GeoJSON 和 128 个模拟监测点数据。数据在 Worker 中完成投影、裁剪和关联转换，通过 TresJS 渲染、GSAP 镜头飞行和底部步骤导航进行浏览。

## 技术栈

- Vue 3 + TypeScript
- Vite 6
- TresJS + Three.js
- GSAP 3
- pnpm

## 开发

当前项目为兼容本机 Node.js 18 使用 Vite 6。建议 Node.js `18.20+`，后续升级到 Node.js 20.19 或 22.12 以上时可同步升级 Vite。

```bash
pnpm install
pnpm dev
```

## 校验与构建

```bash
pnpm test
pnpm type-check
pnpm build
pnpm preview
```

## 代码组织

- `src/config/`：保护区元数据和三维场景调节参数
- `src/assets/data/protect-area/`：保护区和模拟监测点源数据
- `src/components/scene/`：TresJS 场景、镜头控制和地块交互
- `src/composables/useAreaTour.ts`：区域选择与自动巡览状态
- `src/data/protectAreaDataset.ts`：Worker 生命周期和异步加载入口
- `src/workers/protectAreaData.worker.ts`：直接导入源数据并执行转换
- `src/utils/protectAreaData.ts`：保护区和点位统一转换入口
- `src/utils/`：数据投影、几何裁剪、镜头计算和场景图构建
- `src/utils/protectAreaPointScene.ts`：模拟监测点倒三角实例、动画与区域可见性
- `src/styles/feature-card.css`：CSS3D 动态信息卡全局样式

页面布局和入场动画位于 `src/App.vue`；组件样式跟随各自的 Vue 单文件组件维护。
