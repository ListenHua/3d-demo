export const SCENE_CONFIG = {
  /** TresCanvas 渲染器参数。 */
  canvas: {
    /** 是否启用 WebGL 多重采样抗锯齿。 */
    antialias: true,
    /** 设备像素比范围；1.5 上限兼顾高分屏清晰度和移动端填充率。 */
    dpr: [1, 1.5] as [number, number],
    /** 当前近远裁剪面无需对数深度，关闭后可恢复早期深度测试优化。 */
    logarithmicDepthBuffer: false,
    /** 静止时停止逐帧渲染，由交互和动画显式请求新帧。 */
    renderMode: 'on-demand' as const,
  },
  /** 透视相机与区域自动取景参数，场景世界单位统一为千米。 */
  camera: {
    /** 相机最远裁剪面，单位为千米。 */
    far: 2_400,
    /** 区域包围圆到镜头距离的留白倍率，越大画面留白越多。 */
    fitPadding: 1.28,
    /** 垂直视场角，单位为度。 */
    fov: 40,
    /** 相机最近裁剪面，单位为千米。 */
    near: 0.05,
    /** OrbitControls 注视点相对地图平面的高度，单位为千米。 */
    targetYKm: 0.04,
    /** 区域取景时的相机方向向量，使用前会自动归一化。 */
    viewDirection: [0.82, 1.36, 1.08] as [number, number, number],
  },
  /** CSS3D 功能区信息卡参数。 */
  card: {
    /** 信息卡隐藏动画时长，单位为秒。 */
    hideDurationSeconds: 0.12,
    /** CSS3DSprite 相对 Three.js 世界坐标的缩放比例。 */
    liftScale: 0.00076,
    /** 信息卡显示动画时长，单位为秒。 */
    showDurationSeconds: 0.18,
  },
  /** 地图旋转、平移和缩放控制参数。 */
  controls: {
    /** 阻尼响应系数；数值越大，拖动惯性越快停止。 */
    dampingFactor: 0.085,
    /** 镜头距控制目标的最大距离，单位为千米。 */
    maxDistanceKm: 50,
    /** 最大极角占 PI 的比例；0.5 表示镜头可接近水平视角。 */
    maxPolarAngleRatio: 0.47,
    /** 镜头距控制目标的最小距离，单位为千米。 */
    minDistanceKm: 1,
    /** 最小极角占 PI 的比例；限制镜头从正上方观察。 */
    minPolarAngleRatio: 0.12,
    /** 平移灵敏度倍率。 */
    panSpeed: 0.72,
    /** 旋转灵敏度倍率。 */
    rotateSpeed: 0.46,
    /** 可平移范围相对数据包围盒最大边长的外扩比例。 */
    targetPaddingRatio: 0.08,
    /** 滚轮或触控板缩放灵敏度倍率。 */
    zoomSpeed: 0.82,
    /** 是否以指针所在位置作为缩放中心。 */
    zoomToCursor: true,
  },
  /** 仅开发环境使用的相机调试参数。 */
  debug: {
    /** 连续输出相机状态时的最小间隔，单位为毫秒。 */
    cameraLogIntervalMs: 120,
  },
  /** 功能区地块的几何、材质与状态动画参数。 */
  feature: {
    /** 地块挤出厚度，单位为千米。 */
    depthKm: 0.055,
    /** 地块底面相对地图平面的高度，单位为千米。 */
    elevationKm: 0,
    /** 悬停或选中时沿 Y 轴的高度缩放倍率。 */
    hoverScaleY: 1.65,
    /** MeshStandardMaterial 材质参数。 */
    material: {
      /** 默认自发光强度。 */
      emissiveIntensity: 0.08,
      /** 金属度，取值范围通常为 0–1。 */
      metalness: 0.06,
      /** 粗糙度，取值范围通常为 0–1。 */
      roughness: 0.74,
    },
    /** 地块状态切换动画时长。 */
    motion: {
      /** 地块抬升动画时长，单位为秒。 */
      hoverDurationSeconds: 0.6,
      /** 地块抬升缓动；快速响应后平滑落到目标高度。 */
      hoverEase: 'power2.out',
      /** 地块恢复高度动画时长，单位为秒。 */
      restDurationSeconds: 0.4,
      /** 地块恢复缓动；退出比进入更利落。 */
      restEase: 'power2.out',
      /** 颜色和自发光过渡时长，单位为秒。 */
      visualDurationSeconds: 0.22,
    },
    /** 不同交互状态下的颜色亮度和自发光强度。 */
    visual: {
      /** 当前保护区域内、未强调地块的颜色亮度倍率。 */
      activeBrightness: 1,
      /** 当前保护区域内、未强调地块的自发光强度。 */
      activeEmissiveIntensity: 0.2,
      /** 悬停或选中地块的颜色亮度倍率。 */
      emphasizedBrightness: 2,
      /** 悬停或选中地块的自发光强度。 */
      emphasizedEmissiveIntensity: 0.2,
      /** 非当前保护区域地块的颜色亮度倍率。 */
      inactiveBrightness: 0.28,
      /** 非当前保护区域地块的自发光强度。 */
      inactiveEmissiveIntensity: 0.015,
      /** 当前保护区域内顶面功能区透明色覆盖层的不透明度。 */
      activeTintOpacity: 0.5,
      /** 悬停或选中地块顶面功能区透明色覆盖层的不透明度。 */
      emphasizedTintOpacity: 0.6,
      /** 非当前保护区域顶面功能区透明色覆盖层的不透明度。 */
      inactiveTintOpacity: 1,
      /** 当前保护区域内功能区顶面边框线的不透明度。 */
      activeBorderOpacity: 0.68,
      /** 悬停或选中地块顶面边框线的不透明度。 */
      emphasizedBorderOpacity: 1,
      /** 非当前保护区域功能区顶面边框线的不透明度。 */
      inactiveBorderOpacity: 1,
    },
  },
  /** 区域切换、地块聚焦和返回视角的镜头动画参数。 */
  flight: {
    /** 跨保护区域飞行使用的二次贝塞尔弧线参数。 */
    areaArc: {
      /** 弧线抬升量相对水平飞行距离的倍率。 */
      distanceFactor: 0.22,
      /** 弧线允许的最大抬升量，单位为千米。 */
      maxLiftKm: 150,
      /** 弧线至少抬升的高度，单位为千米。 */
      minLiftKm: 6,
    },
    /** 跨保护区域飞行的总时长，单位为秒。 */
    durationSeconds: 1,
    /** 跨保护区域飞行开始后切换贴图和区域可见性的延迟，单位为秒。 */
    areaVisualSwitchDelaySeconds: 0.34,
    /** 两个地区或功能区中心低于该距离时改用匀速过渡，单位为千米。 */
    uniformDistanceThresholdKm: 10,
    /** 近距离切换的匀速缓动名称。 */
    uniformEase: 'none',
    /** 飞行动画三阶段；durationWeight 会按总和自动归一化。 */
    phases: {
      /** 到达阶段：逐步减速并精确落到目标视角。 */
      arrival: {
        /** 该阶段占总动画时长的相对权重。 */
        durationWeight: 0.5,
        /** GSAP 缓动名称。 */
        ease: 'sine.out',
        /** 短距离飞行中，该阶段最多占路径进度的比例。 */
        maxPathProgress: 0.28,
        /** 长距离飞行中用于减速的实际路径长度，单位为千米。 */
        pathDistanceKm: 3,
      },
      /** 巡航阶段：保持线性速度。 */
      cruise: {
        /** 该阶段占总动画时长的相对权重。 */
        durationWeight: 0.2,
        /** GSAP 缓动名称；none 表示线性。 */
        ease: 'none',
      },
      /** 离开阶段：从当前视角平滑加速。 */
      departure: {
        /** 该阶段占总动画时长的相对权重。 */
        durationWeight: 0.3,
        /** GSAP 缓动名称。 */
        ease: 'sine.in',
        /** 短距离飞行中，该阶段最多占路径进度的比例。 */
        maxPathProgress: 0.12,
        /** 长距离飞行中用于加速的实际路径长度，单位为千米。 */
        pathDistanceKm: 2,
      },
    },
    /** 单个地块聚焦和返回时使用的短距离弧线参数。 */
    pointArc: {
      /** 弧线抬升量相对水平移动距离的倍率。 */
      distanceFactor: 0.15,
      /** 短距离弧线允许的最大抬升量，单位为千米。 */
      maxLiftKm: 1.25,
      /** 短距离弧线至少抬升的高度，单位为千米。 */
      minLiftKm: 0.12,
    },
    /** 选中单个功能区后的近景构图参数。 */
    pointFocus: {
      /** 镜头与选中点的距离，单位为千米。 */
      distanceKm: 1,
      /** 镜头相对 Y 轴正方向的极角，单位为度；90 度为水平视角。 */
      polarDeg: 75,
    },
    /** 地块近景聚焦与返回使用的连续过渡参数。 */
    pointTransition: {
      /** 过渡时长，单位为秒。 */
      durationSeconds: 1,
      /** GSAP 缓动名称。 */
      ease: 'sine.inOut',
    },
  },
  /** 与地图底色一致的线性雾参数。 */
  fog: {
    /** 完全被雾遮蔽的距离，单位为千米。 */
    farKm: 20,
    /** 开始出现雾效的距离，单位为千米。 */
    nearKm: 10,
  },
  /** 承载地图的地面平面与材质参数。 */
  ground: {
    /** 地面、画布清屏和雾共用的背景色。 */
    color: '#000000',
    /** 地面材质金属度，取值范围通常为 0–1。 */
    metalness: 0.04,
    /** 地面材质粗糙度，取值范围通常为 0–1。 */
    roughness: 0.94,
    /** 地面尺寸相对数据包围盒最大边长的倍率。 */
    sizeFactor: 1.25,
  },
  /** 模拟监测点在地图中的显示和命中参数。 */
  monitoringPoint: {
    /** 倒三角尖端高出功能区当前顶面的距离，单位为千米。 */
    offsetAboveTerrainKm: 0.015,
    /** 倒三角标记在屏幕中的高度，单位为像素。 */
    markerHeightPx: 15,
    /** 倒三角标记在屏幕中的宽度，单位为像素。 */
    markerWidthPx: 13,
    /** 绕 Y 轴持续旋转的速度，单位为弧度/秒。 */
    rotationSpeedRad: 0.65,
    /** 上下浮动振幅，单位为千米。 */
    bobAmplitudeKm: 0.007,
    /** 完成一次上下浮动的时长，单位为秒。 */
    bobDurationSeconds: 2.2,
    /** 鼠标悬停实例的缩放倍率。 */
    hoverScale: 1.5,
    /** 鼠标悬停缩放的进入与退出过渡。 */
    hoverMotion: {
      /** 点位放大动画时长，单位为秒。 */
      enterDurationSeconds: 0.18,
      /** 点位放大缓动。 */
      enterEase: 'power3.out',
      /** 点位恢复动画时长，单位为秒。 */
      leaveDurationSeconds: 0.14,
      /** 点位恢复缓动。 */
      leaveEase: 'power2.out',
    },
    /** 不可见命中体相对可见标记的缩放倍率。 */
    hitScale: 1.55,
    /** 持续动画的最高刷新率。 */
    maxFps: 30,
    /** 三个侧面的固定无光照亮度倍率。 */
    facetBrightness: {
      light: 1,
      middle: 0.84,
      dark: 0.68,
    },
    /** 接触阴影的整体透明度。 */
    shadowOpacity: 0.22,
    /** 接触阴影的基础屏幕尺寸，单位为像素。 */
    shadowSizePx: 14,
    /** 点位上浮时阴影额外扩大的比例。 */
    shadowBobScale: 0.25,
    /** 阴影相对地形顶面的防闪烁高度，单位为千米。 */
    shadowElevationKm: 0.001,
    /** 程序化软阴影纹理尺寸，单位为像素。 */
    shadowTextureSizePx: 64,
  },
  /** 半球光参数。 */
  light: {
    /** 从地面方向照射的光色。 */
    groundColor: '#111815',
    /** 半球光强度。 */
    intensity: 1.45,
    /** 从天空方向照射的光色。 */
    skyColor: '#d7eee3',
  },
} as const
