import * as THREE from 'three';
import { guidanceConfig } from './config.js';

export { guidanceConfig };

export const guidanceState = {
  drawActive: false,
  drawT: 0,
  drawP: 1,
  drawEverStarted: false,
  fadeActive: false,
  fadeT: 0,
  baseOpacity: 0.9,
  lastStartX: 0,
  lastStartZ: 0,
  colorFarDist: 220
};

let sceneRef;
let getTerrainHeightRef;
let getCharacterRef;
let getIntroPlayingRef;
let resultXThresholdRef = -100;

let guidanceLine;
let guidanceLineMaterial;
let guidanceDrawTotal = 0;

const _guidanceGoal = new THREE.Vector3();
const _guidanceColorA = new THREE.Color();
const _guidanceColorB = new THREE.Color();
const _guidanceColorC = new THREE.Color();
const _guidanceColorD = new THREE.Color();
const _guidanceColorOut = new THREE.Color();

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function initGuidance({ scene, getTerrainHeight, getCharacter, getIntroPlaying, resultXThreshold }) {
  sceneRef = scene;
  getTerrainHeightRef = getTerrainHeight;
  getCharacterRef = getCharacter;
  getIntroPlayingRef = getIntroPlaying;
  if (typeof resultXThreshold === 'number') {
    resultXThresholdRef = resultXThreshold;
  }

  if (typeof resultXThresholdRef === 'number') {
    guidanceConfig.goalX = resultXThresholdRef;
  }
}

export function disposeGuidance() {
  if (!sceneRef) return;

  if (guidanceLine) {
    sceneRef.remove(guidanceLine);
    guidanceLine.geometry.dispose();
    guidanceLine = null;
  }

  if (guidanceLineMaterial) {
    guidanceLineMaterial.dispose();
    guidanceLineMaterial = null;
  }

  guidanceDrawTotal = 0;
}

export function startGuidanceDraw() {
  if (!guidanceLine) return;
  guidanceState.drawActive = true;
  guidanceState.drawT = 0;
  guidanceState.drawP = 0;
  guidanceState.drawEverStarted = true;
  guidanceState.fadeActive = false;
  guidanceState.fadeT = 0;
  guidanceState.baseOpacity = clamp01(guidanceConfig.opacity);
  guidanceLine.visible = Boolean(guidanceConfig.enabled);
  if (guidanceDrawTotal > 0) {
    guidanceLine.geometry.setDrawRange(0, 0);
  }
}

export function startGuidanceFadeOut() {
  if (!guidanceLine) return;
  guidanceState.fadeActive = true;
  guidanceState.fadeT = 0;
  guidanceState.baseOpacity = clamp01(guidanceConfig.opacity);
}

export function setGuidanceStartFromCharacter() {
  const character = typeof getCharacterRef === 'function' ? getCharacterRef() : null;
  if (!character || !getTerrainHeightRef) return;

  guidanceConfig.startX = character.position.x;
  guidanceConfig.startZ = character.position.z;

  _guidanceGoal.set(resultXThresholdRef, 0, 0);
  _guidanceGoal.y = getTerrainHeightRef(_guidanceGoal.x, _guidanceGoal.z);
  guidanceState.colorFarDist = Math.max(1, character.position.distanceTo(_guidanceGoal));

  buildGuidanceLine();
}

export function buildGuidanceLine() {
  if (!sceneRef || !getTerrainHeightRef) return;

  if (guidanceLine) {
    sceneRef.remove(guidanceLine);
    guidanceLine.geometry.dispose();
    guidanceLine = null;
  }

  if (guidanceLineMaterial) {
    guidanceLineMaterial.dispose();
    guidanceLineMaterial = null;
  }

  guidanceLineMaterial = new THREE.MeshBasicMaterial({
    color: guidanceConfig.colorFar,
    transparent: true,
    opacity: guidanceConfig.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  const sx = Number(guidanceConfig.startX) || 0;
  const sz = Number(guidanceConfig.startZ) || 0;
  const samples = Math.max(2, Math.floor(guidanceConfig.samples));
  const pts = [];

  let gx = Number(guidanceConfig.goalX) || 0;
  let gz = Number(guidanceConfig.goalZ) || 0;
  if (guidanceConfig.relativeGoal) {
    gx = sx + (Number(guidanceConfig.goalOffsetX) || 0);
    gz = sz + (Number(guidanceConfig.goalOffsetZ) || 0);
  }

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = sx + (gx - sx) * t;
    const z = sz + (gz - sz) * t;
    const y = getTerrainHeightRef(x, z) + guidanceConfig.heightOffset;
    pts.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, samples - 1, guidanceConfig.width, 8, false);
  guidanceLine = new THREE.Mesh(geo, guidanceLineMaterial);
  guidanceDrawTotal = geo.index ? geo.index.count : geo.attributes.position.count;
  guidanceLine.renderOrder = 2;
  guidanceLine.frustumCulled = false;
  const allowVisible = !guidanceConfig.hideUntilDraw || guidanceState.drawEverStarted;
  guidanceLine.visible = Boolean(guidanceConfig.enabled) && allowVisible;
  sceneRef.add(guidanceLine);

  guidanceState.lastStartX = sx;
  guidanceState.lastStartZ = sz;
  guidanceState.baseOpacity = clamp01(guidanceConfig.opacity);
  if (guidanceDrawTotal > 0) {
    const p = clamp01(guidanceState.drawP);
    guidanceLine.geometry.setDrawRange(0, Math.floor(guidanceDrawTotal * p));
  }
}

export function updateGuidanceLine(delta) {
  if (!guidanceLine || !guidanceLineMaterial) return;
  const character = typeof getCharacterRef === 'function' ? getCharacterRef() : null;
  if (!character) return;

  const introPlaying = typeof getIntroPlayingRef === 'function' ? Boolean(getIntroPlayingRef()) : false;

  const allowVisible = !guidanceConfig.hideUntilDraw || guidanceState.drawEverStarted;
  guidanceLine.visible = Boolean(guidanceConfig.enabled) && allowVisible;
  if (!guidanceLine.visible) return;

  if (guidanceConfig.followCharacter && !introPlaying) {
    const sx = character.position.x;
    const sz = character.position.z;
    const dx = sx - guidanceState.lastStartX;
    const dz = sz - guidanceState.lastStartZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= Math.max(0.05, guidanceConfig.followRebuildDist)) {
      guidanceConfig.startX = sx;
      guidanceConfig.startZ = sz;
      buildGuidanceLine();
    }
  }

  _guidanceGoal.set(resultXThresholdRef, 0, 0);
  _guidanceGoal.y = getTerrainHeightRef(_guidanceGoal.x, _guidanceGoal.z);

  const dist = character.position.distanceTo(_guidanceGoal);
  const farD = Math.max(1, guidanceState.colorFarDist);
  const u = clamp01(dist / farD);

  const cFar = _guidanceColorA.set(guidanceConfig.colorFar);
  const cMid = _guidanceColorB.set(guidanceConfig.colorMid);
  const cNear = _guidanceColorC.set(guidanceConfig.colorNear);
  const cGoal = _guidanceColorD.set(guidanceConfig.colorGoal);

  const out = _guidanceColorOut;
  if (u > 0.66) {
    const t = clamp01((u - 0.66) / 0.34);
    out.lerpColors(cFar, cMid, t);
  } else if (u > 0.33) {
    const t = clamp01((u - 0.33) / 0.33);
    out.lerpColors(cMid, cNear, t);
  } else {
    const t = clamp01(u / 0.33);
    out.lerpColors(cGoal, cNear, t);
  }

  guidanceLineMaterial.color.copy(out);
  guidanceState.baseOpacity = clamp01(guidanceConfig.opacity);

  if (guidanceState.drawActive && guidanceDrawTotal > 0) {
    guidanceState.drawT = Math.min(guidanceState.drawT + delta, Math.max(0.01, guidanceConfig.drawDuration));
    const p = clamp01(guidanceState.drawT / Math.max(0.01, guidanceConfig.drawDuration));
    guidanceState.drawP = p;
    guidanceLine.geometry.setDrawRange(0, Math.floor(guidanceDrawTotal * p));
    if (p >= 1) {
      guidanceState.drawActive = false;
    }
  }

  if (guidanceState.fadeActive) {
    guidanceState.fadeT = Math.min(guidanceState.fadeT + delta, Math.max(0.01, guidanceConfig.fadeDuration));
    const p = clamp01(guidanceState.fadeT / Math.max(0.01, guidanceConfig.fadeDuration));
    const eased = 1 - p * p;
    guidanceLineMaterial.opacity = guidanceState.baseOpacity * eased;
    if (p >= 1) {
      guidanceState.fadeActive = false;
      guidanceLine.visible = false;
    }
  } else {
    guidanceLineMaterial.opacity = guidanceState.baseOpacity;
  }
}

export function attachGuidanceGui(folder) {
  if (!folder) return;

  folder.add(guidanceConfig, 'enabled').name('Enabled');
  folder.add(guidanceConfig, 'startX', -500, 500).name('Start X').step(0.1).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'startZ', -500, 500).name('Start Z').step(0.1).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'goalX', -500, 500).name('Goal X').step(0.1).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'goalZ', -500, 500).name('Goal Z').step(0.1).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'samples', 20, 400).name('Samples').step(1).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'width', 0.05, 2).name('Width').step(0.01).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'heightOffset', 0, 2).name('Height Offset').step(0.01).onFinishChange(() => buildGuidanceLine());
  folder.add(guidanceConfig, 'opacity', 0, 1).name('Opacity').step(0.01);
  folder.add(guidanceConfig, 'nearDistance', 0, 200).name('Near Dist').step(1);
  folder.add(guidanceConfig, 'farDistance', 10, 600).name('Far Dist').step(1);
  folder.addColor(guidanceConfig, 'colorFar').name('Far Color');
  folder.addColor(guidanceConfig, 'colorMid').name('Mid Color');
  folder.addColor(guidanceConfig, 'colorNear').name('Near Color');
  folder.addColor(guidanceConfig, 'colorGoal').name('Goal Color');
}
