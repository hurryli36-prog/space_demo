import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

export class SimulationUI {
  constructor(simulation) {
    this.simulation = simulation;
    this.gui = new GUI({ title: '宇宙模拟控制台', width: 360 });
    this.gui.domElement.classList.add('gui-container');
    this.gui.domElement.style.position = 'absolute';
    this.gui.domElement.style.top = '16px';
    this.gui.domElement.style.right = '16px';
    this.gui.domElement.style.maxHeight = '90vh';
    this.gui.domElement.style.overflowY = 'auto';

    simulation.container.appendChild(this.gui.domElement);

    this.notificationEl = document.createElement('div');
    this.notificationEl.className = 'notification hidden';
    simulation.container.appendChild(this.notificationEl);

    this.notificationTimer = null;

    this.setupControls();
  }

  setupControls() {
    const renderingFolder = this.gui.addFolder('渲染 & 光效');
    renderingFolder.add(this.simulation.settings, 'resolutionMultiplier', 0.5, 2, 0.1)
      .name('输出分辨率倍数')
      .onChange((value) => this.simulation.setResolutionMultiplier(value));
    renderingFolder
      .add(this.simulation.settings, 'bloomStrength', 0, 4, 0.01)
      .name('星际泛光强度')
      .onChange((value) => this.simulation.setBloomStrength(value));
    renderingFolder
      .add(this.simulation.settings, 'bloomThreshold', 0, 1, 0.001)
      .name('泛光阈值')
      .onChange((value) => this.simulation.setBloomThreshold(value));
    renderingFolder
      .add(this.simulation.settings, 'bloomRadius', 0, 1, 0.001)
      .name('泛光半径')
      .onChange((value) => this.simulation.setBloomRadius(value));

    const universeFolder = this.gui.addFolder('宇宙要素');
    universeFolder
      .add(this.simulation.settings, 'nebulaIntensity', 0, 3, 0.01)
      .name('星云能量')
      .onChange((value) => this.simulation.setNebulaIntensity(value));
    universeFolder
      .add(this.simulation.settings, 'nebulaVisible')
      .name('显示动态星云')
      .onChange((value) => this.simulation.setNebulaVisibility(value));
    universeFolder
      .add(this.simulation.settings, 'asteroidsVisible')
      .name('显示小行星带')
      .onChange((value) => this.simulation.setAsteroidVisibility(value));
    universeFolder
      .add(this.simulation.settings, 'planetTrails')
      .name('行星轨道轨迹')
      .onChange((value) => this.simulation.setOrbitTrailsVisibility(value));

    const dataFolder = this.gui.addFolder('真实数据联动');
    dataFolder
      .add(this.simulation.settings, 'exoplanetsVisible')
      .name('显示系外行星云')
      .onChange((value) => this.simulation.setExoplanetVisibility(value));

    dataFolder
      .add({
        load: async () => {
          this.showNotification('正在请求 NASA Exoplanet Archive 数据…');
          const { source, count } = await this.simulation.loadExoplanetData();
          if (count === 0) {
            this.showNotification('未获取到有效数据，请检查网络或离线样本。');
          } else {
            this.showNotification(`已载入 <strong>${count}</strong> 颗行星（数据源：${source}）`);
          }
        }
      }, 'load')
      .name('同步最新数据');
  }

  showNotification(message, duration = 4200) {
    if (!this.notificationEl) return;
    this.notificationEl.innerHTML = message;
    this.notificationEl.classList.remove('hidden');
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    this.notificationTimer = setTimeout(() => {
      this.notificationEl.classList.add('hidden');
    }, duration);
  }

  dispose() {
    if (this.gui) {
      this.gui.destroy();
    }
    if (this.notificationEl && this.notificationEl.parentNode) {
      this.notificationEl.parentNode.removeChild(this.notificationEl);
    }
  }
}
