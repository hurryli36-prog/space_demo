const DEFAULT_LIMIT = 500;

export class DataLoader {
  constructor({ fallbackUrl = 'data/sample_exoplanets.json', fetchImplementation } = {}) {
    this.fallbackUrl = fallbackUrl;
    if (fetchImplementation) {
      this.fetchImplementation = fetchImplementation;
    } else {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const nativeFetch = scope && typeof scope.fetch === 'function' ? scope.fetch.bind(scope) : (typeof fetch === 'function' ? fetch : null);
      this.fetchImplementation = nativeFetch;
    }
  }

  async fetchJson(url, init) {
    if (!this.fetchImplementation) {
      throw new Error('当前环境不支持 fetch。');
    }
    const response = await this.fetchImplementation(url, init);
    if (!response.ok) {
      throw new Error(`网络请求失败：${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async loadExoplanetArchive(limit = DEFAULT_LIMIT) {
    const query =
      'select+pl_name,discoverymethod,pl_orbper,pl_orbsmax,pl_rade,pl_masse,sy_dist+from+ps+where+pl_orbsmax+is+not+null+and+pl_rade+is+not+null+and+pl_masse+is+not+null';
    const url = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${query}+order+by+pl_orbsmax&format=json&max_rows=${limit}`;
    try {
      const data = await this.fetchJson(url, {
        headers: {
          Accept: 'application/json'
        }
      });
      return data;
    } catch (error) {
      console.warn('获取 NASA 系外行星数据失败，自动回退到离线样本。', error);
      return null;
    }
  }

  async loadFallbackData() {
    if (!this.fetchImplementation) {
      return null;
    }
    try {
      const data = await this.fetchJson(this.fallbackUrl, {
        headers: {
          Accept: 'application/json'
        }
      });
      return data;
    } catch (error) {
      console.error('离线样本数据加载失败。', error);
      return null;
    }
  }

  async loadExoplanetData({ limit = DEFAULT_LIMIT, fallbackOnly = false } = {}) {
    if (!fallbackOnly) {
      const liveData = await this.loadExoplanetArchive(limit);
      if (Array.isArray(liveData) && liveData.length > 0) {
        return { source: 'NASA Exoplanet Archive', records: liveData };
      }
    }

    const fallback = await this.loadFallbackData();
    if (Array.isArray(fallback) && fallback.length > 0) {
      return { source: '离线样本', records: fallback };
    }

    return { source: 'empty', records: [] };
  }
}
