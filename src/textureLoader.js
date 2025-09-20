import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { QUALITY_ORDER } from './textureRepository.js';

THREE.Cache.enabled = true;

export function createLoadingManager(onProgress) {
  const manager = new THREE.LoadingManager();
  if (onProgress) {
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      const ratio = itemsTotal === 0 ? 1 : itemsLoaded / itemsTotal;
      onProgress(Math.min(1, ratio));
    };
  }
  return manager;
}

export function selectTextureUrl(source, preferredQuality = '8k') {
  if (!source) return null;
  if (typeof source === 'string') return source;

  const ordered = QUALITY_ORDER.filter((quality) => source[quality]);
  if (ordered.length === 0) {
    const first = Object.values(source)[0];
    return typeof first === 'string' ? first : null;
  }

  const preferredIndex = QUALITY_ORDER.indexOf(preferredQuality);
  if (preferredIndex !== -1) {
    for (let i = preferredIndex; i < QUALITY_ORDER.length; i += 1) {
      const quality = QUALITY_ORDER[i];
      if (source[quality]) {
        return source[quality];
      }
    }
  }

  return source[ordered[0]];
}

export function loadTexture(loader, source, {
  preferredQuality = '8k',
  colorSpace = THREE.SRGBColorSpace,
  wrapS = THREE.ClampToEdgeWrapping,
  wrapT = THREE.ClampToEdgeWrapping,
  anisotropy = 16,
  generateMipmaps = true,
  flipY = false,
  mapping,
  minFilter,
  magFilter
} = {}) {
  const url = selectTextureUrl(source, preferredQuality);
  if (!url) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.wrapS = wrapS;
        texture.wrapT = wrapT;
        texture.anisotropy = anisotropy;
        texture.generateMipmaps = generateMipmaps;
        texture.flipY = flipY;
        if (mapping) {
          texture.mapping = mapping;
        }
        if (minFilter) texture.minFilter = minFilter;
        if (magFilter) texture.magFilter = magFilter;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn('纹理加载失败', url, error);
        resolve(null);
      }
    );
  });
}

export function loadHdrTexture(loader, source, { preferredQuality = '4k' } = {}) {
  const url = selectTextureUrl(source, preferredQuality);
  if (!url) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn('HDR 纹理加载失败', url, error);
        resolve(null);
      }
    );
  });
}
