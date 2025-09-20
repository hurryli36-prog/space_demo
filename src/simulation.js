import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/FXAAShader.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js';

import { TEXTURE_SOURCES } from './textureRepository.js';
import { createLoadingManager, loadTexture, loadHdrTexture } from './textureLoader.js';
import { SimulationUI } from './ui.js';
import { DataLoader } from './dataLoader.js';

const DEFAULT_OPTIONS = {
  textureQuality: '8k',
  resolutionMultiplier: 1,
  maxPixelRatio: 4,
  enablePostprocessing: true,
  enableNebula: true,
  enableAsteroids: true,
  realDataAutoLoad: false,
  fallbackDataUrl: 'data/sample_exoplanets.json',
  onProgress: null,
  onReady: null,
  starRadius: 32,
  orbitScale: 48
};

const NEBULA_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const NEBULA_FRAGMENT_SHADER = `
  varying vec3 vWorldPosition;
  uniform float time;
  uniform float intensity;
  uniform vec3 colorA;
  uniform vec3 colorB;
  uniform vec3 center;

  float hash(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(dot(p, vec3(1.0, 57.0, 113.0))) * 43758.5453);
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);

    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 x) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;
    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(x * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float d = length(vWorldPosition - center) * 0.00045;
    float turbulence = fbm(vWorldPosition * 0.002 + vec3(time * 0.05, time * 0.03, time * 0.04));
    float burst = pow(max(0.0, 1.0 - d), 2.0);
    float energy = turbulence * intensity * burst;
    float alpha = smoothstep(0.1, 0.8, turbulence) * intensity * burst * 0.9;
    vec3 color = mix(colorA, colorB, turbulence);
    gl_FragColor = vec4(color * energy * 1.2, alpha);
  }
`;

const EXOPLANET_VERTEX_SHADER = `
  uniform float sizeMultiplier;
  attribute float size;
  attribute vec3 customColor;
  varying vec3 vColor;
  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, size * sizeMultiplier * (300.0 / -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const EXOPLANET_FRAGMENT_SHADER = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.6, 0.0, d);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const GLOW_VERTEX_SHADER = `
  uniform vec3 viewVector;
  uniform float c;
  uniform float p;
  varying float intensity;
  void main() {
    vec3 vNormal = normalize(normalMatrix * normal);
    vec3 vNormel = normalize(normalMatrix * viewVector);
    intensity = pow(c - dot(vNormal, vNormel), p);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT_SHADER = `
  uniform vec3 glowColor;
  varying float intensity;
  void main() {
    gl_FragColor = vec4(glowColor, intensity);
  }
`;

export class SpaceSimulation {
  constructor(container, options = {}) {
    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.settings = {
      resolutionMultiplier: this.options.resolutionMultiplier,
      bloomStrength: 1.45,
      bloomThreshold: 0.68,
      bloomRadius: 0.42,
      nebulaIntensity: 1.2,
      nebulaVisible: this.options.enableNebula,
      asteroidsVisible: this.options.enableAsteroids,
      exoplanetsVisible: true,
      planetTrails: true
    };

    this.clock = new THREE.Clock();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.fxaaPass = null;

    this.controls = null;
    this.ui = null;

    this.loadingManager = createLoadingManager(this.options.onProgress);
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.textureLoader.setCrossOrigin('anonymous');
    this.hdrLoader = new RGBELoader(this.loadingManager);
    this.hdrLoader.setDataType(THREE.FloatType);

    this.dataLoader = new DataLoader({ fallbackUrl: this.options.fallbackDataUrl });

    this.assets = {};
    this.planets = [];
    this.orbitTrails = [];

    this.exoplanetCloud = null;
    this.nebula = null;
    this.asteroidField = null;
    this.starfield = null;
    this.sunGroup = null;
    this.sunGlowMaterial = null;
    this.sunLight = null;

    this.animationId = null;
    this.vectorHelper = new THREE.Vector3();
  }

  async initialize() {
    this.setupRenderer();
    this.setupScene();
    await this.loadAssets();
    this.buildUniverse();
    this.setupPostProcessing();
    this.setupUI();

    if (typeof this.options.onReady === 'function') {
      this.options.onReady();
    }

    if (this.options.realDataAutoLoad) {
      this.loadExoplanetData();
    }

    this.animate();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.updateRendererSize();
  }

  setupScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02040b, 0.00042);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    this.camera.position.set(0, 80, 220);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.035;
    this.controls.maxDistance = 2200;
    this.controls.minDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.18;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    const ambientLight = new THREE.AmbientLight(0x1d2440, 0.55);
    this.scene.add(ambientLight);
  }

  async loadAssets() {
    const { textureQuality } = this.options;
    const tasks = [
      loadTexture(this.textureLoader, TEXTURE_SOURCES.starfield, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.sun.surface, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.earth.map, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.earth.normal, {
        preferredQuality: textureQuality,
        colorSpace: THREE.LinearSRGBColorSpace
      }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.earth.specular, {
        preferredQuality: textureQuality,
        colorSpace: THREE.LinearSRGBColorSpace
      }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.earth.clouds, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.mercury.map, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.moon.map, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.mars.map, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.mars.normal, {
        preferredQuality: textureQuality,
        colorSpace: THREE.LinearSRGBColorSpace
      }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.planets.jupiter.map, { preferredQuality: textureQuality }),
      loadTexture(this.textureLoader, TEXTURE_SOURCES.asteroid.map, { preferredQuality: '4k' }),
      loadHdrTexture(this.hdrLoader, TEXTURE_SOURCES.environment.hdr, { preferredQuality: '4k' })
    ];

    const [
      starfield,
      sunSurface,
      earthMap,
      earthNormal,
      earthSpecular,
      earthClouds,
      mercuryMap,
      moonMap,
      marsMap,
      marsNormal,
      jupiterMap,
      asteroidMap,
      environmentHdr
    ] = await Promise.all(tasks);

    this.assets = {
      starfield,
      sunSurface,
      earthMap,
      earthNormal,
      earthSpecular,
      earthClouds,
      mercuryMap,
      moonMap,
      marsMap,
      marsNormal,
      jupiterMap,
      asteroidMap,
      environmentHdr
    };
  }

  buildUniverse() {
    this.createEnvironment();
    this.createStarfield();
    this.createSun();
    this.createPlanets();
    if (this.options.enableNebula) {
      this.createNebula();
    }
    if (this.options.enableAsteroids) {
      this.createAsteroidField();
    }
  }

  createEnvironment() {
    if (this.assets.environmentHdr) {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      pmremGenerator.compileEquirectangularShader();
      const envMap = pmremGenerator.fromEquirectangular(this.assets.environmentHdr);
      this.scene.environment = envMap.texture;
      this.assets.environmentHdr.dispose();
      pmremGenerator.dispose();
    }
  }

  createStarfield() {
    const geometry = new THREE.SphereGeometry(4000, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: this.assets.starfield,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.starfield = mesh;
  }

  createSun() {
    const sunGeometry = new THREE.SphereGeometry(this.options.starRadius, 128, 128);
    const sunMaterial = new THREE.MeshStandardMaterial({
      map: this.assets.sunSurface,
      emissive: new THREE.Color(0xffb347),
      emissiveIntensity: 2.6,
      roughness: 0.25,
      metalness: 0.0
    });

    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.castShadow = false;
    sunMesh.receiveShadow = false;

    const glowGeometry = new THREE.SphereGeometry(this.options.starRadius * 1.6, 128, 128);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        c: { value: 0.4 },
        p: { value: 2.6 },
        glowColor: { value: new THREE.Color(0xffd480) },
        viewVector: { value: new THREE.Vector3(0, 0, 1) }
      },
      vertexShader: GLOW_VERTEX_SHADER,
      fragmentShader: GLOW_FRAGMENT_SHADER,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });

    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);

    const light = new THREE.PointLight(0xfff6d4, 3.8, 0, 2);
    light.castShadow = true;
    light.shadow.bias = -0.00008;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;

    const group = new THREE.Group();
    group.add(sunMesh);
    group.add(glowMesh);
    group.add(light);

    this.scene.add(group);

    this.sunGroup = group;
    this.sunGlowMaterial = glowMaterial;
    this.sunLight = light;
    this.sunMesh = sunMesh;
  }

  createPlanets() {
    const orbitScale = this.options.orbitScale;
    const planetGroup = new THREE.Group();
    this.scene.add(planetGroup);
    this.planetGroup = planetGroup;

    const orbitHolder = new THREE.Group();
    this.scene.add(orbitHolder);
    this.orbitHolder = orbitHolder;

    const configs = [
      {
        name: '水星',
        radius: 5,
        distance: orbitScale * 0.7,
        rotationSpeed: 0.02,
        orbitSpeed: 0.0055,
        roughness: 0.9,
        metalness: 0.1,
        map: this.assets.mercuryMap
      },
      {
        name: '地球',
        radius: 9,
        distance: orbitScale * 1.1,
        rotationSpeed: 0.045,
        orbitSpeed: 0.0032,
        tilt: 23.5,
        roughness: 0.8,
        metalness: 0.08,
        map: this.assets.earthMap,
        normalMap: this.assets.earthNormal,
        specularMap: this.assets.earthSpecular,
        cloudsMap: this.assets.earthClouds,
        hasMoon: true
      },
      {
        name: '火星',
        radius: 6.2,
        distance: orbitScale * 1.55,
        rotationSpeed: 0.04,
        orbitSpeed: 0.0025,
        roughness: 0.95,
        metalness: 0.05,
        map: this.assets.marsMap,
        normalMap: this.assets.marsNormal
      },
      {
        name: '木星',
        radius: 18,
        distance: orbitScale * 2.6,
        rotationSpeed: 0.12,
        orbitSpeed: 0.0016,
        roughness: 0.6,
        metalness: 0.05,
        map: this.assets.jupiterMap
      }
    ];

    configs.forEach((config) => {
      const planet = this.createPlanet(config);
      this.planets.push(planet);
    });
  }

  createPlanet(config) {
    const pivot = new THREE.Object3D();
    pivot.rotation.x = THREE.MathUtils.degToRad(config.orbitInclination || 0);
    this.planetGroup.add(pivot);

    const segments = Math.max(64, Math.floor(config.radius * 8));
    const geometry = new THREE.SphereGeometry(config.radius, segments, segments);

    const material = new THREE.MeshStandardMaterial({
      map: config.map,
      normalMap: config.normalMap || null,
      roughness: config.roughness ?? 0.8,
      metalness: config.metalness ?? 0.1
    });

    if (config.normalMap) {
      material.normalScale = new THREE.Vector2(1, 1);
    }

    if (config.specularMap) {
      material.roughnessMap = config.specularMap;
      material.roughness = Math.min(0.95, config.roughness ?? 0.85);
      material.metalness = config.metalness ?? 0.04;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
    #ifdef USE_ROUGHNESSMAP
      vec4 texelRoughness = texture2D( roughnessMap, vUv );
      texelRoughness = vec4(1.0) - texelRoughness;
      roughnessFactor *= texelRoughness.r;
    #endif
    roughness = clamp( roughnessFactor, 0.04, 1.0 );`
        );
      };
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(config.distance, 0, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(config.tilt || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    pivot.add(mesh);

    let clouds = null;
    if (config.cloudsMap) {
      const cloudGeometry = new THREE.SphereGeometry(config.radius * 1.01, segments, segments);
      const cloudMaterial = new THREE.MeshStandardMaterial({
        map: config.cloudsMap,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
      mesh.add(clouds);
    }

    let moon = null;
    if (config.hasMoon) {
      moon = this.createMoon({
        radius: config.radius * 0.27,
        distance: config.radius * 3.8,
        map: this.assets.moonMap,
        orbitSpeed: 0.014,
        rotationSpeed: 0.02,
        parent: mesh
      });
    }

    if (this.settings.planetTrails) {
      const orbitLine = this.createOrbitLine(config.distance);
      this.orbitHolder.add(orbitLine);
      this.orbitTrails.push(orbitLine);
    }

    return {
      name: config.name,
      pivot,
      mesh,
      clouds,
      moon,
      rotationSpeed: config.rotationSpeed,
      orbitSpeed: config.orbitSpeed,
      distance: config.distance
    };
  }

  createMoon({ radius, distance, map, orbitSpeed, rotationSpeed, parent }) {
    const pivot = new THREE.Object3D();
    parent.add(pivot);

    const geometry = new THREE.SphereGeometry(radius, 48, 48);
    const material = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.9,
      metalness: 0.05
    });

    const moonMesh = new THREE.Mesh(geometry, material);
    moonMesh.position.set(distance, 0, 0);
    moonMesh.castShadow = true;
    moonMesh.receiveShadow = true;

    pivot.add(moonMesh);

    return {
      pivot,
      mesh: moonMesh,
      orbitSpeed,
      rotationSpeed
    };
  }

  createOrbitLine(radius) {
    const points = [];
    for (let i = 0; i <= 256; i += 1) {
      const angle = (i / 256) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x1b4b99,
      transparent: true,
      opacity: 0.22,
      linewidth: 1
    });
    return new THREE.LineLoop(geometry, material);
  }

  createNebula() {
    const geometry = new THREE.SphereGeometry(2200, 128, 128);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.settings.nebulaIntensity },
        colorA: { value: new THREE.Color(0x4175ff) },
        colorB: { value: new THREE.Color(0xb736ff) },
        center: { value: new THREE.Vector3(0, 0, 0) }
      },
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = this.settings.nebulaVisible;
    this.scene.add(mesh);
    this.nebula = mesh;
  }

  createAsteroidField() {
    const count = 2400;
    const geometry = new THREE.IcosahedronGeometry(1.2, 0);
    const material = new THREE.MeshStandardMaterial({
      map: this.assets.asteroidMap,
      roughness: 0.95,
      metalness: 0.12
    });

    const instanced = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const radius = THREE.MathUtils.randFloat(180, 260);
      const angle = Math.random() * Math.PI * 2;
      const height = THREE.MathUtils.randFloatSpread(26);
      dummy.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const scale = THREE.MathUtils.randFloat(0.5, 2.1);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.visible = this.settings.asteroidsVisible;
    this.scene.add(instanced);
    this.asteroidField = instanced;
  }

  setupPostProcessing() {
    if (!this.options.enablePostprocessing) {
      return;
    }

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight),
      this.settings.bloomStrength,
      this.settings.bloomRadius,
      this.settings.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    this.updateRendererSize();
  }

  setupUI() {
    this.ui = new SimulationUI(this);
  }

  async loadExoplanetData(options = {}) {
    const result = await this.dataLoader.loadExoplanetData(options);
    this.populateExoplanetCloud(result.records);
    return { source: result.source, count: result.records.length };
  }

  populateExoplanetCloud(records) {
    if (this.exoplanetCloud) {
      this.scene.remove(this.exoplanetCloud);
      this.exoplanetCloud.geometry.dispose();
      this.exoplanetCloud.material.dispose();
      this.exoplanetCloud = null;
    }

    if (!records || records.length === 0) {
      return;
    }

    const count = Math.min(records.length, 2000);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const color = new THREE.Color();
    const distanceScale = 38;
    const sizeScale = 0.4;

    for (let i = 0; i < count; i += 1) {
      const record = records[i];
      const distanceAU = Math.max(0.02, record.pl_orbsmax || record.orbital_distance || 1);
      const radius = distanceAU * distanceScale;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * radius * 0.1;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const mass = Math.max(0.1, record.pl_masse || 1);
      const normalizedMass = Math.min(mass / 500, 1);
      color.setHSL(0.62 - normalizedMass * 0.5, 0.75, 0.55 + normalizedMass * 0.1);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      const radiusMultiplier = Math.max(0.5, (record.pl_rade || 1) * sizeScale);
      sizes[i] = radiusMultiplier;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.computeBoundingSphere();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        sizeMultiplier: { value: 6.0 }
      },
      vertexShader: EXOPLANET_VERTEX_SHADER,
      fragmentShader: EXOPLANET_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });

    const points = new THREE.Points(geometry, material);
    points.visible = this.settings.exoplanetsVisible;
    this.scene.add(points);
    this.exoplanetCloud = points;
  }

  setResolutionMultiplier(value) {
    this.settings.resolutionMultiplier = value;
    this.updateRendererSize();
  }

  setBloomStrength(value) {
    this.settings.bloomStrength = value;
    if (this.bloomPass) {
      this.bloomPass.strength = value;
    }
  }

  setBloomThreshold(value) {
    this.settings.bloomThreshold = value;
    if (this.bloomPass) {
      this.bloomPass.threshold = value;
    }
  }

  setBloomRadius(value) {
    this.settings.bloomRadius = value;
    if (this.bloomPass) {
      this.bloomPass.radius = value;
    }
  }

  setNebulaIntensity(value) {
    this.settings.nebulaIntensity = value;
    if (this.nebula) {
      this.nebula.material.uniforms.intensity.value = value;
    }
  }

  setNebulaVisibility(visible) {
    this.settings.nebulaVisible = visible;
    if (this.nebula) {
      this.nebula.visible = visible;
    }
  }

  setAsteroidVisibility(visible) {
    this.settings.asteroidsVisible = visible;
    if (this.asteroidField) {
      this.asteroidField.visible = visible;
    }
  }

  setOrbitTrailsVisibility(visible) {
    this.settings.planetTrails = visible;
    this.orbitTrails.forEach((trail) => {
      trail.visible = visible;
    });
  }

  setExoplanetVisibility(visible) {
    this.settings.exoplanetsVisible = visible;
    if (this.exoplanetCloud) {
      this.exoplanetCloud.visible = visible;
    }
  }

  updateRendererSize() {
    if (!this.renderer) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const multiplier = this.settings.resolutionMultiplier || 1;
    const pixelRatio = Math.min(window.devicePixelRatio * multiplier, this.options.maxPixelRatio);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
    }

    if (this.bloomPass) {
      this.bloomPass.setSize(width, height);
    }

    if (this.fxaaPass) {
      this.fxaaPass.material.uniforms.resolution.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    }

    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  handleResize() {
    this.updateRendererSize();
  }

  update(delta) {
    if (!delta) return;

    this.controls.update();

    if (this.sunGlowMaterial) {
      this.vectorHelper.copy(this.camera.position).sub(this.sunGroup.position).normalize();
      this.sunGlowMaterial.uniforms.viewVector.value.copy(this.vectorHelper);
    }

    if (this.sunMesh) {
      this.sunMesh.rotation.y += delta * 0.12;
    }

    this.planets.forEach((planet) => {
      if (planet.pivot) {
        planet.pivot.rotation.y += planet.orbitSpeed * delta * 60;
      }
      if (planet.mesh) {
        planet.mesh.rotation.y += planet.rotationSpeed * delta * 60;
      }
      if (planet.clouds) {
        planet.clouds.rotation.y += planet.rotationSpeed * 0.6 * delta * 60;
      }
      if (planet.moon) {
        planet.moon.pivot.rotation.y += planet.moon.orbitSpeed * delta * 60;
        planet.moon.mesh.rotation.y += planet.moon.rotationSpeed * delta * 60;
      }
    });

    if (this.nebula && this.nebula.material.uniforms) {
      this.nebula.material.uniforms.time.value += delta;
      this.nebula.material.uniforms.center.value.copy(this.sunGroup.position);
    }

    if (this.asteroidField) {
      this.asteroidField.rotation.y += delta * 0.12;
    }

    if (this.exoplanetCloud && this.settings.exoplanetsVisible) {
      this.exoplanetCloud.rotation.y += delta * 0.018;
    }

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.002;
    }
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    this.update(delta);
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    if (this.ui) {
      this.ui.dispose();
    }
    this.renderer.dispose();
    this.scene.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }
}
