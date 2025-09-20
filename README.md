# 沉浸式宇宙模拟（Space Demo）

一个基于 Three.js 构建的沉浸式宇宙与行星系统演示，专注于极致的视觉质量：

- 支持 8K 级别的星空、恒星与行星纹理，默认启用 ACES Filmic 色彩映射与高动态光照。
- 自带动态星云、泛光、抗锯齿、体积感小行星带等高级渲染效果，可根据硬件性能微调。
- 能够实时联动 NASA Exoplanet Archive 等公开数据源，将真实系外行星投射到场景中，并提供离线样本。
- 控制面板（lil-gui）允许调节分辨率倍数、泛光参数、星云强度、行星轨迹等，方便展示与演示。

## 快速开始

1. 启动任意静态文件服务（例如使用 Node.js 环境）：

   ```bash
   npx serve .
   ```

   或使用 VS Code Live Server / Python `http.server` 等工具。

2. 浏览器访问 `http://localhost:3000`（实际端口以服务配置为准），即可看到完整的沉浸式宇宙场景。

3. 如需加载 NASA 实时数据，点击右上角控制面板「真实数据联动 → 同步最新数据」。当网络不可用时会自动回退到 `data/sample_exoplanets.json` 中的示例数据。

## 功能亮点

- **高精度纹理**：行星、恒星、星空背景采用公开的 8K/4K 素材，支持根据显卡性能调节分辨率倍数。
- **高级光效**：启用泛光、HDR 环境贴图与 PCF Soft 阴影，营造极具冲击力的星际视觉。
- **动态星云与小行星带**：自定义 Shader 实现呼吸般的星云流动，InstancedMesh 构建万级别小行星环。
- **真实数据投影**：将系外行星的轨道半径、质量、半径映射到彩色点云中，借助颜色与尺寸反映物理属性。
- **可视化控制台**：lil-gui 面板可调节渲染细节、开关特效、切换轨道展示，适合科学展示或交互体验。

## 数据与素材来源

- 行星与恒星贴图来自 [Solar System Scope Textures](https://www.solarsystemscope.com/textures/)。
- HDR 环境光来自 [Poly Haven](https://polyhaven.com/)。
- 系外行星实时数据源：NASA [Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/)。

> 所有外部资源均使用公共 CDN 引用，若需离线运行可按需下载并替换 `src/textureRepository.js` 中的链接。

## 自定义提示

- 通过 `window.__spaceSimulation` 可在浏览器控制台访问模拟实例，例如：

  ```js
  // 提升泛光强度
  window.__spaceSimulation.setBloomStrength(2.4);
  ```

- 若想以 8K 输出截屏，可在控制面板调高「输出分辨率倍数」，然后使用浏览器的截图工具。

- 可扩展更多真实数据（如天体坐标、光谱），方式是在 `src/dataLoader.js` 中新增对应的抓取逻辑，再在 `populateExoplanetCloud` 中映射到几何体即可。

## 许可证说明

项目代码采用 MIT 许可证，第三方贴图与数据请遵循各自来源的版权条款与署名要求。
