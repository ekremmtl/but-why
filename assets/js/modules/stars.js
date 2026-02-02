import * as THREE from 'three';
import { starsConfig } from './config.js';

export { starsConfig };

let sceneRef;
let cameraRef;
let isMobileDeviceRef = false;

let starPoints;

export function applyMobileStarsTuning() {
  if (isMobileDeviceRef) {
    starsConfig.count = 450;
  }
}

export function initStars({ scene, camera, isMobileDevice }) {
  sceneRef = scene;
  cameraRef = camera;
  isMobileDeviceRef = Boolean(isMobileDevice);

  applyMobileStarsTuning();
  rebuildStars();
}

export function disposeStars() {
  if (!sceneRef) return;

  if (starPoints) {
    sceneRef.remove(starPoints);
    if (starPoints.geometry) starPoints.geometry.dispose();
    if (starPoints.material) starPoints.material.dispose();
    starPoints = null;
  }
}

export function rebuildStars() {
  if (!sceneRef || !cameraRef) return;
  disposeStars();
  createStars();
}

function createStars() {
  if (!starsConfig.enabled) return;

  const count = Math.max(0, Math.floor(starsConfig.count));
  if (count === 0) return;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinklePhase = new Float32Array(count);
  const blinkPhase = new Float32Array(count);

  const center = new THREE.Vector3(starsConfig.centerX, 0, starsConfig.centerZ);
  const isCameraAnchored = starsConfig.anchor === 'camera';
  if (!isCameraAnchored) {
    center.set(starsConfig.centerX, 0, starsConfig.centerZ);
  }

  const heightMin = Math.min(starsConfig.heightMin, starsConfig.heightMax);
  const heightMax = Math.max(starsConfig.heightMin, starsConfig.heightMax);

  const farLimit = cameraRef ? Math.max(50, cameraRef.far * 0.95) : 900;

  for (let i = 0; i < count; i++) {
    if (starsConfig.mode === 'dome') {
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random();
      const phi = starsConfig.domeUpperOnly ? Math.acos(1 - u) : Math.acos(1 - 2 * u);

      const unclampedR = Math.max(
        10,
        starsConfig.domeRadius + (Math.random() - 0.5) * 2 * starsConfig.domeRadiusJitter
      );
      const r = Math.min(unclampedR, farLimit);
      const lx = Math.sin(phi) * Math.cos(theta) * r;
      const ly = Math.cos(phi) * r + starsConfig.domeYOffset;
      const lz = Math.sin(phi) * Math.sin(theta) * r;

      positions[i * 3 + 0] = isCameraAnchored ? lx : center.x + lx;
      positions[i * 3 + 1] = isCameraAnchored ? ly : ly;
      positions[i * 3 + 2] = isCameraAnchored ? lz : center.z + lz;
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * starsConfig.radius;
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const y = heightMin + Math.random() * (heightMax - heightMin);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    sizes[i] = starsConfig.sizeMin + Math.random() * (starsConfig.sizeMax - starsConfig.sizeMin);
    twinklePhase[i] = Math.random() * Math.PI * 2;
    blinkPhase[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinklePhase, 1));
  geometry.setAttribute('aBlink', new THREE.BufferAttribute(blinkPhase, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(starsConfig.color) },
      uOpacity: { value: starsConfig.opacity },
      uSizeMul: { value: starsConfig.sizeMultiplier },
      uTwinkleAmp: { value: starsConfig.twinkleAmp },
      uTwinkleSpeed: { value: starsConfig.twinkleSpeed },
      uBlinkAmp: { value: starsConfig.blinkAmp },
      uBlinkSpeed: { value: starsConfig.blinkSpeed },
      uBlinkThreshold: { value: starsConfig.blinkThreshold },
      uSizePulseAmp: { value: starsConfig.sizePulseAmp },
      uSizePulseSpeed: { value: starsConfig.sizePulseSpeed }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aTwinkle;
      attribute float aBlink;

      uniform float uTime;
      uniform float uSizeMul;
      uniform float uTwinkleAmp;
      uniform float uTwinkleSpeed;
      uniform float uBlinkAmp;
      uniform float uBlinkSpeed;
      uniform float uBlinkThreshold;
      uniform float uSizePulseAmp;
      uniform float uSizePulseSpeed;

      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(1.0, -mvPosition.z);

        float tw = 0.5 + 0.5 * sin(uTime * uTwinkleSpeed + aTwinkle);
        float bl = 0.5 + 0.5 * sin(uTime * uBlinkSpeed + aBlink);
        float blinkGate = step(uBlinkThreshold, bl);

        float alphaTw = mix(1.0 - uTwinkleAmp, 1.0, tw);
        float alphaBl = mix(1.0, blinkGate, uBlinkAmp);
        vAlpha = alphaTw * alphaBl;

        float sizePulse = 1.0 + uSizePulseAmp * sin(uTime * uSizePulseSpeed + aTwinkle);
        gl_PointSize = (aSize * uSizeMul * sizePulse) * (300.0 / dist);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;

      void main() {
        vec2 p = gl_PointCoord.xy - vec2(0.5);
        float d = length(p);
        float core = smoothstep(0.5, 0.0, d);
        float halo = smoothstep(0.65, 0.0, d);
        float a = (0.85 * core + 0.35 * halo) * uOpacity * vAlpha;
        if (a <= 0.001) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `
  });

  starPoints = new THREE.Points(geometry, material);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = -10;
  if (isCameraAnchored) {
    starPoints.position.copy(cameraRef.position);
  }
  sceneRef.add(starPoints);
}

export function updateStars(nowSeconds) {
  if (!starPoints) return;
  if (!starsConfig.enabled) return;

  if (starsConfig.anchor === 'camera') {
    starPoints.position.copy(cameraRef.position);
  }

  const mat = starPoints.material;
  mat.uniforms.uTime.value = nowSeconds;
  mat.uniforms.uOpacity.value = starsConfig.opacity;
  mat.uniforms.uSizeMul.value = starsConfig.sizeMultiplier;
  mat.uniforms.uTwinkleAmp.value = starsConfig.twinkleAmp;
  mat.uniforms.uTwinkleSpeed.value = starsConfig.twinkleSpeed;
  mat.uniforms.uBlinkAmp.value = starsConfig.blinkAmp;
  mat.uniforms.uBlinkSpeed.value = starsConfig.blinkSpeed;
  mat.uniforms.uBlinkThreshold.value = starsConfig.blinkThreshold;
  mat.uniforms.uSizePulseAmp.value = starsConfig.sizePulseAmp;
  mat.uniforms.uSizePulseSpeed.value = starsConfig.sizePulseSpeed;
  mat.uniforms.uColor.value.set(starsConfig.color);
}

export function attachStarsGui(folder) {
  if (!folder) return;

  folder.add(starsConfig, 'enabled').name('Enabled').onChange(() => rebuildStars());
  folder.add(starsConfig, 'anchor', ['world', 'camera']).name('Anchor').onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'mode', ['dome', 'box']).name('Mode').onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'count', 0, 8000).name('Count').step(100).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'centerX', -1000, 1000).name('Center X').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'centerZ', -1000, 1000).name('Center Z').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'radius', 50, 2000).name('Radius').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'heightMin', 0, 2000).name('Height Min').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'heightMax', 0, 4000).name('Height Max').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'domeRadius', 50, 2000).name('Dome Radius').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'domeRadiusJitter', 0, 500).name('Dome Radius Jitter').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'domeYOffset', -200, 800).name('Dome Y Offset').step(1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'domeUpperOnly').name('Dome Upper Only').onFinishChange(() => rebuildStars());
  folder.addColor(starsConfig, 'color').name('Color');
  folder.add(starsConfig, 'opacity', 0, 1).name('Opacity').step(0.01);
  folder.add(starsConfig, 'sizeMin', 0.1, 10).name('Size Min').step(0.1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'sizeMax', 0.1, 15).name('Size Max').step(0.1).onFinishChange(() => rebuildStars());
  folder.add(starsConfig, 'sizeMultiplier', 0.1, 5).name('Size Mul').step(0.01);
  folder.add(starsConfig, 'twinkleAmp', 0, 1).name('Twinkle Amp').step(0.01);
  folder.add(starsConfig, 'twinkleSpeed', 0, 5).name('Twinkle Speed').step(0.01);
  folder.add(starsConfig, 'blinkAmp', 0, 1).name('Blink Amp').step(0.01);
  folder.add(starsConfig, 'blinkSpeed', 0, 5).name('Blink Speed').step(0.01);
  folder.add(starsConfig, 'blinkThreshold', 0, 1).name('Blink Threshold').step(0.01);
  folder.add(starsConfig, 'sizePulseAmp', 0, 1).name('Size Pulse Amp').step(0.01);
  folder.add(starsConfig, 'sizePulseSpeed', 0, 5).name('Size Pulse Speed').step(0.01);
  folder.add({ rebuildStars: () => rebuildStars() }, 'rebuildStars').name('Rebuild Stars');
}
