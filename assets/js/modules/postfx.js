import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BloomPass } from 'three/addons/postprocessing/BloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { DotScreenPass } from 'three/addons/postprocessing/DotScreenPass.js';
import { BleachBypassShader } from 'three/addons/shaders/BleachBypassShader.js';
import { SepiaShader } from 'three/addons/shaders/SepiaShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';

export const postFxConfig = {
  enabled: true,
  insetScale: 0.33,
  mode: 'Bleach',
  filmNoiseIntensity: 0.25,
  filmScanlinesIntensity: 0.2,
  bloomStrength: 0.5,
  dotScale: 1.2,
  vignetteOffset: 1.12,
  vignetteDarkness: 1.19,
  bleachOpacity: 0.75,
  sepiaAmount: 0.8
};

let rendererRef;
let sceneRef;
let cameraRef;
let isMobileDeviceRef = false;

let composer;
let passes = {};

function disposeComposer() {
  if (composer) {
    composer.passes.length = 0;
    if (composer.renderTarget1) composer.renderTarget1.dispose();
    if (composer.renderTarget2) composer.renderTarget2.dispose();
  }
  composer = null;
  passes = {};
}

export function rebuildPostFx() {
  disposeComposer();
  if (!rendererRef || !sceneRef || !cameraRef) return;
  if (isMobileDeviceRef) return;
  if (!postFxConfig.enabled) return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  composer = new EffectComposer(rendererRef);
  composer.setSize(w, h);

  composer.addPass(new RenderPass(sceneRef, cameraRef));

  const gamma = new ShaderPass(GammaCorrectionShader);

  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = postFxConfig.vignetteOffset;
  vignette.uniforms.darkness.value = postFxConfig.vignetteDarkness;

  const film = new FilmPass(postFxConfig.filmNoiseIntensity, postFxConfig.filmScanlinesIntensity, 648, false);
  const bloom = new BloomPass(postFxConfig.bloomStrength);
  const dot = new DotScreenPass(new THREE.Vector2(0, 0), 0.5, postFxConfig.dotScale);

  const bleach = new ShaderPass(BleachBypassShader);
  bleach.uniforms.opacity.value = postFxConfig.bleachOpacity;

  const sepia = new ShaderPass(SepiaShader);
  sepia.uniforms.amount.value = postFxConfig.sepiaAmount;

  passes = { gamma, vignette, film, bloom, dot, bleach, sepia };

  composer.addPass(gamma);

  if (postFxConfig.mode === 'Vignette') composer.addPass(vignette);

  if (postFxConfig.mode === 'Film') {
    composer.addPass(film);
    composer.addPass(vignette);
  }

  if (postFxConfig.mode === 'Bloom') {
    composer.addPass(bloom);
    composer.addPass(vignette);
  }

  if (postFxConfig.mode === 'DotScreen') {
    composer.addPass(dot);
    composer.addPass(vignette);
  }

  if (postFxConfig.mode === 'Bleach') {
    composer.addPass(bleach);
    composer.addPass(vignette);
  }

  if (postFxConfig.mode === 'Sepia') {
    composer.addPass(sepia);
    composer.addPass(vignette);
  }
}

export function initPostFx({ renderer, scene, camera, isMobileDevice }) {
  rendererRef = renderer;
  sceneRef = scene;
  cameraRef = camera;
  isMobileDeviceRef = Boolean(isMobileDevice);

  if (isMobileDeviceRef && postFxConfig.enabled) {
    postFxConfig.enabled = false;
    disposeComposer();
  }

  if (!isMobileDeviceRef && postFxConfig.enabled) {
    rebuildPostFx();
  }
}

export function onPostFxResize() {
  if (!composer || !postFxConfig.enabled || isMobileDeviceRef) return;
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function renderPostFx(delta) {
  if (!composer || !postFxConfig.enabled || isMobileDeviceRef) return false;
  composer.render(delta);
  return true;
}

export function attachPostFxGui(folder) {
  if (!folder) return;

  folder.add(postFxConfig, 'enabled').name('Post FX').onChange(() => rebuildPostFx());
  folder
    .add(postFxConfig, 'mode', ['Vignette', 'Film', 'Bloom', 'DotScreen', 'Bleach', 'Sepia'])
    .name('Mode')
    .onChange(() => rebuildPostFx());

  folder.add(postFxConfig, 'vignetteOffset', 0.1, 3).name('Vignette Offset').step(0.01).onChange((v) => {
    if (passes.vignette) passes.vignette.uniforms.offset.value = v;
  });

  folder.add(postFxConfig, 'vignetteDarkness', 0.1, 3).name('Vignette Dark').step(0.01).onChange((v) => {
    if (passes.vignette) passes.vignette.uniforms.darkness.value = v;
  });

  folder.add(postFxConfig, 'filmNoiseIntensity', 0, 1).name('Film Noise').step(0.01).onFinishChange(() => rebuildPostFx());
  folder.add(postFxConfig, 'filmScanlinesIntensity', 0, 1).name('Film Lines').step(0.01).onFinishChange(() => rebuildPostFx());
  folder.add(postFxConfig, 'bloomStrength', 0, 2).name('Bloom').step(0.01).onFinishChange(() => rebuildPostFx());
  folder.add(postFxConfig, 'dotScale', 0.2, 3).name('Dot Scale').step(0.01).onFinishChange(() => rebuildPostFx());

  folder.add(postFxConfig, 'bleachOpacity', 0, 1).name('Bleach').step(0.01).onChange((v) => {
    if (passes.bleach) passes.bleach.uniforms.opacity.value = v;
  });

  folder.add(postFxConfig, 'sepiaAmount', 0, 1).name('Sepia').step(0.01).onChange((v) => {
    if (passes.sepia) passes.sepia.uniforms.amount.value = v;
  });
}
