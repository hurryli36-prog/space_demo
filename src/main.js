import { SpaceSimulation } from './simulation.js';

const container = document.getElementById('app');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingProgress = document.getElementById('loading-progress');

const simulation = new SpaceSimulation(container, {
  textureQuality: '8k',
  resolutionMultiplier: 1,
  maxPixelRatio: 4,
  enablePostprocessing: true,
  enableNebula: true,
  enableAsteroids: true,
  realDataAutoLoad: false,
  fallbackDataUrl: 'data/sample_exoplanets.json',
  onProgress: (ratio) => {
    if (loadingProgress) {
      loadingProgress.style.width = `${Math.floor(ratio * 100)}%`;
    }
  },
  onReady: () => {
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      setTimeout(() => loadingOverlay.remove(), 1200);
    }
  }
});

simulation.initialize();

window.addEventListener('resize', () => simulation.handleResize());

// 暴露到全局便于在控制台调试
window.__spaceSimulation = simulation;
