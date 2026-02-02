import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attachPostFxGui, initPostFx, onPostFxResize, renderPostFx } from './modules/postfx.js';
import { detectInitialLanguage, SUBTITLES_BY_LANG, t as tI18n } from './modules/i18n.js';
import { attachSnowGui, initSnowfall, updateSnowfall } from './modules/snowfall.js';
import { attachStarsGui, initStars, updateStars } from './modules/stars.js';
import {
  attachGuidanceGui,
  buildGuidanceLine,
  guidanceState,
  initGuidance,
  setGuidanceStartFromCharacter,
  startGuidanceDraw,
  startGuidanceFadeOut,
  updateGuidanceLine
} from './modules/guidance.js';
import { addFootprint, initFootprints, updateFootprints } from './modules/footprints.js';
import {
  audioState,
  getNarrationAudio,
  initAudioControls,
  playStepSound,
  playTitleFallSound,
  showAudioUnlockOverlay,
  startAudioIfNeeded,
  tryStartMusicIfNeeded
} from './modules/audio.js';
import { getMountainAnchorModel, initMountains } from './modules/mountains.js';
import { attachAuroraGui, initAurora, updateAurora } from './modules/aurora.js';

const ASSETS = {
  models: 'assets/models',
  sounds: 'assets/sounds'
};

let scene, camera, renderer, controls;
let character, mixer, walkAction;
let clock = new THREE.Clock();
let ground, groundMaterial;
let ambientLight, directionalLight, hemisphereLight;
let cloudParticles;
let gui;
let bebasThreeFontPromise;
let bebasThreeFont;

let lastFootprintTime = 0;
let isGameOver = false;
let introPlaying = false;
let introStartTime = 0;
let narrationAudio;
let movementDisabled = false;
let lastCharacterPosLogTime = -999;
const CHARACTER_POS_LOG_INTERVAL = 0.5;
let forwardStarted = false;
let winTriggered = false;
let loseTriggered = false;
const RESULT_X_THRESHOLD = -100;
const footprintInterval = 0.3;
let introDuration = 4.0;

const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let currentLang = 'en';

function t(key) {
  return tI18n(currentLang, key);
}

const endingMotion = {
  mode: null,
  winSpeed: 7.5,
  winDirX: -1,
  winDirZ: 0,
  loseVy: 0,
  loseGravity: -140,
  loseTiltSpeed: 2.2,
  loseInitialVy: -6,
  loseTerminalVy: -38,
  loseMaxTiltX: -1.25,
  loseMaxTiltY: -2.5,
  loseMaxTiltZ: -2,
  freezeT: 0,
  freezeDuration: 2.5,
  freezeColor: new THREE.Color('#86d7ff'),
  originalColors: new WeakMap()
};

let lastStepSoundTime = 0;
const STEP_CONFIG = {
  intervalSeconds: 0.45
};



function cacheOriginalMaterialColors(root) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (!m || !m.color) return;
      if (!endingMotion.originalColors.has(m)) {
        endingMotion.originalColors.set(m, m.color.clone());
      }
    });
  });
}

function startWinAutoRun() {
  if (!character) return;
  endingMotion.mode = 'win';
  if (walkAction) {
    walkAction.paused = false;
  }
}

function startLoseDeath() {
  if (!character) return;
  endingMotion.mode = 'lose';
  endingMotion.loseVy = endingMotion.loseInitialVy;
  endingMotion.freezeT = 0;
  cacheOriginalMaterialColors(character);
  if (walkAction) {
    walkAction.paused = true;
  }
}

function updateEndingMotion(delta) {
  if (!character || !endingMotion.mode) return;

  if (endingMotion.mode === 'win') {
    const dx = endingMotion.winDirX;
    const dz = endingMotion.winDirZ;
    character.position.x += dx * endingMotion.winSpeed * delta;
    character.position.z += dz * endingMotion.winSpeed * delta;

    const terrainHeight = getTerrainHeight(character.position.x, character.position.z);
    character.position.y = terrainHeight + 0.2;

    if (walkAction) {
      walkAction.paused = false;
    }
  }

  if (endingMotion.mode === 'lose') {
    const dropG = (typeof butWhyDropConfig !== 'undefined' && butWhyDropConfig && butWhyDropConfig.gravity)
      ? butWhyDropConfig.gravity
      : 520;
    const g = -Math.max(Math.abs(endingMotion.loseGravity), dropG * 0.12);

    endingMotion.loseVy += g * delta;
    endingMotion.loseVy = Math.max(endingMotion.loseTerminalVy, endingMotion.loseVy);
    character.position.y += endingMotion.loseVy * delta;

    const terrainHeight = getTerrainHeight(character.position.x, character.position.z);
    const groundY = terrainHeight + 0.12;
    if (character.position.y <= groundY) {
      character.position.y = groundY;
      endingMotion.loseVy = 0;
    }

    const tiltK = Math.min(1, endingMotion.loseTiltSpeed * delta);
    character.rotation.x += (endingMotion.loseMaxTiltX - character.rotation.x) * tiltK;
    character.rotation.y += (endingMotion.loseMaxTiltY - character.rotation.y) * tiltK;
    character.rotation.z += (endingMotion.loseMaxTiltZ - character.rotation.z) * tiltK;

    endingMotion.freezeT = Math.min(endingMotion.freezeT + delta, endingMotion.freezeDuration);
    const p = clamp01(endingMotion.freezeT / Math.max(0.01, endingMotion.freezeDuration));

    character.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m || !m.color) return;
        const base = endingMotion.originalColors.get(m);
        if (!base) return;
        m.color.copy(base).lerp(endingMotion.freezeColor, p);
        m.needsUpdate = true;
      });
    });
  }

  if (controls && camera) {
    controls.target.copy(character.position);
    camera.position.x = character.position.x - Math.sin(character.rotation.y) * 10 + 30;
    camera.position.z = character.position.z - Math.cos(character.rotation.y) * 10;
    camera.position.y = character.position.y + 10;
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function showResultOverlay({ variant, title, message }) {
  const overlay = document.getElementById('game-over-screen');
  if (!overlay) return;

  overlay.classList.remove('is-win', 'is-lose');
  if (variant === 'win') overlay.classList.add('is-win');
  if (variant === 'lose') overlay.classList.add('is-lose');

  const msgEl = document.getElementById('result-message');
  const restartBtn = document.getElementById('restart-button');

  const heading = variant === 'win' ? t('headingWin') : t('headingLose');
  const msgText = typeof message === 'string' && message.trim().length ? message : title;

  if (msgEl) {
    msgEl.textContent = '';
    msgEl.classList.add('typing');
  }

  if (restartBtn) {
    restartBtn.classList.add('is-hidden');
  }

  const typingToken = Symbol('typing');
  overlay._typingToken = typingToken;

  overlay.classList.add('show');

  if (!msgEl) {
    if (restartBtn) restartBtn.classList.remove('is-hidden');
    return;
  }

  const speedMs = 45;
  let i = 0;

  const tick = () => {
    if (overlay._typingToken !== typingToken) return;
    if (i >= msgText.length) {
      msgEl.classList.remove('typing');
      if (restartBtn) restartBtn.classList.remove('is-hidden');
      return;
    }

    const ch = msgText[i];
    msgEl.textContent += ch;
    i += 1;

    const extraPause = ch === '.' || ch === '!' || ch === '?' ? 220 : ch === ',' ? 120 : 0;
    setTimeout(tick, speedMs + extraPause);
  };

  tick();
}

function triggerButWhyFinalMoment() {
  ensureButWhyText();
  setButWhyVisible(true);
  movementDisabled = true;

  setTimeout(() => {
    startGuidanceFadeOut();
  }, 1000);

  butWhyFinalActive = true;
  butWhyConfig.visible = true;
  butWhyAnimationState.active = true;
  butWhyConfig.offsetY = butWhyAnimationState.fromOffsetY;
  butWhyRiseStartTime = clock.getElapsedTime();
  resetButWhyDrop(clock.getElapsedTime());

  finalCameraBaseTarget.copy(controls.target);
  finalCameraLookUpStartTime = clock.getElapsedTime();
  finalCameraLookUpActive = true;
  controls.enabled = finalSceneConfig.orbitEnabled;
}

let butWhyText;
let butWhyMaterial;
let butWhyGuiFolder;
let butWhyButMesh;
let butWhyWhyMesh;
let butWhyLight;
let butWhyFinalActive = false;
let butWhyRiseStartTime = 0;
let finalCameraLookUpStartTime = 0;
let finalCameraLookUpActive = false;
const finalCameraBaseTarget = new THREE.Vector3();

const butWhyDropConfig = {
  enabled: true,
  wordSpacing: 22,
  butExtraX: -6,
  whyExtraX: -2,
  butDropHeight: 80,
  whyDropHeight: 80,
  whyDelay: 0.18,
  gravity: 520,
  bounce: 0.28,
  stopVelocity: 18,
  squash: 0.22,
  squashDuration: 0.14,
  impactShake: 0.8,
  impactShakeDuration: 0.22,
  groundShake: 0.35,
  groundShakeDuration: 0.18
};

const butWhyDropState = {
  active: false,
  lastTime: 0,
  but: { y: 0, v: 0, landed: false, squashT: 0, impactPlayed: false },
  why: { y: 0, v: 0, landed: false, squashT: 0, impactPlayed: false },
  shakeT: 0,
  shakeDur: 0,
  shakeAmp: 0,
  cameraBasePos: null,
  groundShakeT: 0,
  groundShakeDur: 0,
  groundShakeAmp: 0,
  groundBaseY: null
};

const finalSceneConfig = {
  riseFromOffsetY: -200,
  riseToOffsetY: -50,
  riseDuration: 5,
  lookUpYOffset: 20,
  lookUpDuration: 1.0,
  orbitEnabled: false
};

const butWhyAnimationState = {
  active: false,
  fromOffsetY: 150,
  toOffsetY: -220
};

const butWhyConfig = {
  visible: false,
  debugAlwaysShow: false,
  color: 0xffffff,
  emissive: 0x000000,
  emissiveIntensity: 0,
  usePointLight: false,
  pointLightIntensity: 2.0,
  pointLightDistance: 180,
  pointLightOffsetX: 0,
  pointLightOffsetY: 20,
  pointLightOffsetZ: 20,
  textSize: 12,
  depth: 1.8,
  curveSegments: 12,
  bevelEnabled: true,
  bevelThickness: 0.25,
  bevelSize: 0.15,
  bevelSegments: 5,
  height: 2,
  offsetX: 106,
  offsetY: -136,
  offsetZ: 0,
  rotY: Math.PI / 2,
  scale: 3.5
};

function rebuildButWhyText() {
  if (butWhyText) {
    scene.remove(butWhyText);
    if (butWhyButMesh && butWhyButMesh.geometry) butWhyButMesh.geometry.dispose();
    if (butWhyWhyMesh && butWhyWhyMesh.geometry) butWhyWhyMesh.geometry.dispose();
    if (butWhyMaterial) butWhyMaterial.dispose();
    if (butWhyLight) {
      butWhyText.remove(butWhyLight);
      butWhyLight = null;
    }
    butWhyText = null;
  }
  butWhyMaterial = null;
  butWhyButMesh = null;
  butWhyWhyMesh = null;
  butWhyLight = null;

  ensureButWhyText();
}

function resetButWhyDrop(now) {
  butWhyDropState.active = true;
  butWhyDropState.lastTime = now;
  butWhyDropState.but.y = butWhyDropConfig.butDropHeight;
  butWhyDropState.but.v = 0;
  butWhyDropState.but.landed = false;
  butWhyDropState.but.squashT = 0;
  butWhyDropState.but.impactPlayed = false;

  butWhyDropState.why.y = butWhyDropConfig.whyDropHeight;
  butWhyDropState.why.v = 0;
  butWhyDropState.why.landed = false;
  butWhyDropState.why.squashT = 0;
  butWhyDropState.why.impactPlayed = false;

  butWhyDropState.shakeT = 0;
  butWhyDropState.shakeDur = 0;
  butWhyDropState.shakeAmp = 0;
  butWhyDropState.cameraBasePos = camera ? camera.position.clone() : null;
  butWhyDropState.groundShakeT = 0;
  butWhyDropState.groundShakeDur = 0;
  butWhyDropState.groundShakeAmp = 0;
  if (ground && butWhyDropState.groundBaseY === null) {
    butWhyDropState.groundBaseY = ground.position.y;
  }
}

function triggerImpactShake(amp, dur) {
  butWhyDropState.shakeAmp = Math.max(butWhyDropState.shakeAmp, amp);
  butWhyDropState.shakeDur = Math.max(butWhyDropState.shakeDur, dur);
  butWhyDropState.shakeT = 0;
}

function triggerGroundShake(amp, dur) {
  butWhyDropState.groundShakeAmp = Math.max(butWhyDropState.groundShakeAmp, amp);
  butWhyDropState.groundShakeDur = Math.max(butWhyDropState.groundShakeDur, dur);
  butWhyDropState.groundShakeT = 0;
}



function ensureBebasThreeFontLoaded() {
  if (bebasThreeFontPromise) return bebasThreeFontPromise;

  bebasThreeFontPromise = new Promise((resolve) => {
    const loader = new TTFLoader();
    loader.load(
      'assets/fonts/BebasNeue-Regular.ttf',
      (json) => {
        try {
          const font = new FontLoader().parse(json);
          bebasThreeFont = font;
          resolve(font);
        } catch (e) {
          console.error('Failed to parse TTF into Three.js font:', e);
          resolve(null);
        }
      },
      undefined,
      (err) => {
        console.error('Failed to load Bebas Neue TTF for 3D text:', err);
        resolve(null);
      }
    );
  });

  return bebasThreeFontPromise;
}

const originalDocumentTitle = document.title;
let walkingTitleTimer = null;
let walkingTitleTick = 0;
const walkingTitleTrackLength = 14;
const walkingTitleSpace = '\u2007';
const walkingTitleEnabled = false;

// Intro animation camera settings
let introStartOffsetX = -10;
let introStartOffsetY = 4;
let introStartOffsetZ = 5;
let introEndOffsetX = 30;
let introEndOffsetY = 10;
let introEndOffsetZ = 0;

// Subtitle configuration (start/end in seconds)
let subtitles = SUBTITLES_BY_LANG.en;

function getButWhyWordsForLang() {
  if (currentLang === 'tr') return { left: 'AMA', right: 'NEDEN?' };
  return { left: 'BUT', right: 'WHY?' };
}

function getButWhyLeftExtraXForLang() {
  if (currentLang === 'tr') return -13;
  return butWhyDropConfig.butExtraX;
}

function rebuildButWhyTextGeometryIfNeeded() {
  if (!butWhyButMesh || !butWhyWhyMesh) return;

  const { left, right } = getButWhyWordsForLang();

  ensureBebasThreeFontLoaded().then((font) => {
    if (!font || !butWhyButMesh || !butWhyWhyMesh) return;

    const commonGeoOpts = {
      font,
      size: butWhyConfig.textSize,
      depth: butWhyConfig.depth,
      curveSegments: Math.max(1, Math.floor(butWhyConfig.curveSegments)),
      bevelEnabled: Boolean(butWhyConfig.bevelEnabled),
      bevelThickness: butWhyConfig.bevelThickness,
      bevelSize: butWhyConfig.bevelSize,
      bevelSegments: Math.max(0, Math.floor(butWhyConfig.bevelSegments))
    };

    const leftGeo = new TextGeometry(left, commonGeoOpts);
    const rightGeo = new TextGeometry(right, commonGeoOpts);

    leftGeo.computeBoundingBox();
    const b1 = leftGeo.boundingBox;
    if (b1) {
      const xOffset = (b1.max.x + b1.min.x) / 2;
      const yOffset = (b1.max.y + b1.min.y) / 2;
      leftGeo.translate(-xOffset, -yOffset, 0);
    }

    rightGeo.computeBoundingBox();
    const b2 = rightGeo.boundingBox;
    if (b2) {
      const xOffset = (b2.max.x + b2.min.x) / 2;
      const yOffset = (b2.max.y + b2.min.y) / 2;
      rightGeo.translate(-xOffset, -yOffset, 0);
    }

    const oldLeft = butWhyButMesh.geometry;
    const oldRight = butWhyWhyMesh.geometry;
    butWhyButMesh.geometry = leftGeo;
    butWhyWhyMesh.geometry = rightGeo;
    if (oldLeft) oldLeft.dispose();
    if (oldRight) oldRight.dispose();

    const halfSpacing = butWhyDropConfig.wordSpacing / 2;
    butWhyButMesh.position.x = -halfSpacing + getButWhyLeftExtraXForLang();
    butWhyWhyMesh.position.x = halfSpacing + butWhyDropConfig.whyExtraX;

    updateButWhyTransform();
  });
}

function applyI18n() {
  document.documentElement.lang = currentLang;

  if (currentLang === 'tr') {
    document.getElementById('lang-tr').classList.add('active');
    document.getElementById('lang-en').classList.remove('active');
  } else {
    document.getElementById('lang-en').classList.add('active');
    document.getElementById('lang-tr').classList.remove('active');
  }

  const infoEl = document.getElementById('info');
  if (infoEl) infoEl.textContent = t('infoMove');

  const volumeLabel = document.getElementById('volume-label');
  if (volumeLabel) volumeLabel.textContent = t('volume');

  const docLink = document.getElementById('documentary-link');
  if (docLink) docLink.textContent = t('documentary');

  const mobileFwd = document.getElementById('mobile-forward');
  if (mobileFwd) mobileFwd.textContent = currentLang === 'tr' ? 'HEDEFE' : 'TO TARGET';
  const mobileBack = document.getElementById('mobile-back');
  if (mobileBack) mobileBack.textContent = currentLang === 'tr' ? 'SÜRÜYE' : 'TO COLONY';

  const restartBtn = document.getElementById('restart-button');
  if (restartBtn) restartBtn.textContent = t('tryAgain');

  const unlockBtn = document.getElementById('audio-unlock-button');
  if (unlockBtn) unlockBtn.textContent = t('audioStart');

  subtitles = SUBTITLES_BY_LANG[currentLang] || SUBTITLES_BY_LANG.en;

  rebuildButWhyTextGeometryIfNeeded();
}

function setLanguage(lang) {
  if (lang !== 'tr' && lang !== 'en') return;
  currentLang = lang;
  if (window.localStorage) window.localStorage.setItem('lang', lang);
  applyI18n();
}

function setupLanguageControls() {
  const trBtn = document.getElementById('lang-tr');
  const enBtn = document.getElementById('lang-en');

  if (trBtn) {
    trBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setLanguage('tr');
      trBtn.classList.add('active');
      enBtn.classList.remove('active');
    });
  }
  if (enBtn) {
    enBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setLanguage('en');
      enBtn.classList.add('active');
      trBtn.classList.remove('active');
    });
  }
}

function setButWhyVisible(visible) {
  if (butWhyText) {
    butWhyText.visible = visible;
  }
}

function updateButWhyTransform() {
  if (!butWhyText) return;

  // Auto-position based on the main mountain model.
  const anchorModel = getMountainAnchorModel();
  if (anchorModel) {
    const bbox = new THREE.Box3().setFromObject(anchorModel);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    butWhyText.position.set(
      center.x + butWhyConfig.offsetX,
      bbox.max.y + butWhyConfig.offsetY,
      center.z + butWhyConfig.offsetZ
    );
  } else {
    butWhyText.position.set(butWhyConfig.offsetX, butWhyConfig.offsetY, butWhyConfig.offsetZ);
  }

  butWhyText.rotation.set(0, butWhyConfig.rotY, 0);
  butWhyText.scale.setScalar(butWhyConfig.scale);
}

function tuneTextureForMobile(tex) {
  if (!isMobileDevice || !tex) return;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
}

function updateButWhyFinal(now) {
  if (!butWhyFinalActive) return;
  if (!butWhyText || !butWhyButMesh || !butWhyWhyMesh) return;

  if (!butWhyDropConfig.enabled) {
    // Fallback: keep the previous simple Y animation path.
    if (!butWhyAnimationState.active) return;
    const tRaw = (now - butWhyRiseStartTime) / finalSceneConfig.riseDuration;
    const t = Math.min(Math.max(tRaw, 0), 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    butWhyConfig.offsetY =
      butWhyAnimationState.fromOffsetY +
      (butWhyAnimationState.toOffsetY - butWhyAnimationState.fromOffsetY) * ease;
    updateButWhyTransform();
    if (t >= 1) {
      butWhyAnimationState.active = false;
    }
    return;
  }

  const dt = Math.min(0.033, Math.max(0.001, now - (butWhyDropState.lastTime || now)));
  butWhyDropState.lastTime = now;

  // Keep the group at the final place while words animate locally.
  butWhyConfig.offsetY = butWhyAnimationState.toOffsetY;
  updateButWhyTransform();

  const g = butWhyDropConfig.gravity;
  const b = Math.min(0.95, Math.max(0, butWhyDropConfig.bounce));
  const stopV = Math.max(1, butWhyDropConfig.stopVelocity);

  const stepWord = (wordState, allowSim) => {
    if (!allowSim || wordState.landed) {
      return { impact: false };
    }

    wordState.v -= g * dt;
    wordState.y += wordState.v * dt;

    if (wordState.y <= 0) {
      wordState.y = 0;
      if (Math.abs(wordState.v) < stopV) {
        wordState.v = 0;
        wordState.landed = true;
      } else {
        wordState.v = -wordState.v * b;
      }
      wordState.squashT = butWhyDropConfig.squashDuration;
      return { impact: true };
    }

    return { impact: false };
  };

  const sinceStart = now - butWhyRiseStartTime;
  const butRes = stepWord(butWhyDropState.but, true);
  const whyRes = stepWord(butWhyDropState.why, sinceStart >= butWhyDropConfig.whyDelay);

  if (butRes.impact) {
    triggerImpactShake(butWhyDropConfig.impactShake, butWhyDropConfig.impactShakeDuration);
    triggerGroundShake(butWhyDropConfig.groundShake, butWhyDropConfig.groundShakeDuration);

    if (!butWhyDropState.but.impactPlayed) {
      playTitleFallSound();
      butWhyDropState.but.impactPlayed = true;
    }
  }
  if (whyRes.impact) {
    triggerImpactShake(butWhyDropConfig.impactShake, butWhyDropConfig.impactShakeDuration);
    triggerGroundShake(butWhyDropConfig.groundShake, butWhyDropConfig.groundShakeDuration);

    if (!butWhyDropState.why.impactPlayed) {
      playTitleFallSound();
      butWhyDropState.why.impactPlayed = true;
    }
  }

  // Apply local positions.
  butWhyButMesh.position.y = butWhyDropState.but.y;
  butWhyWhyMesh.position.y = butWhyDropState.why.y;

  // Squash & stretch on impact.
  const applySquash = (mesh, wordState) => {
    if (wordState.squashT <= 0) {
      mesh.scale.set(1, 1, 1);
      return;
    }
    wordState.squashT = Math.max(0, wordState.squashT - dt);
    const t = wordState.squashT / Math.max(0.0001, butWhyDropConfig.squashDuration);
    const k = (1 - t);
    const squash = butWhyDropConfig.squash * (1 - k);
    mesh.scale.set(1 + squash, 1 - squash, 1);
  };
  applySquash(butWhyButMesh, butWhyDropState.but);
  applySquash(butWhyWhyMesh, butWhyDropState.why);

  // Camera shake (no drift).
  if (camera && butWhyDropState.cameraBasePos) {
    if (butWhyDropState.shakeDur > 0 && butWhyDropState.shakeT < butWhyDropState.shakeDur) {
      butWhyDropState.shakeT = Math.min(butWhyDropState.shakeT + dt, butWhyDropState.shakeDur);
      const t = butWhyDropState.shakeT / butWhyDropState.shakeDur;
      const decay = 1 - t;
      const amp = butWhyDropState.shakeAmp * decay;
      const sx = (Math.random() - 0.5) * 2 * amp;
      const sy = (Math.random() - 0.5) * 2 * amp;
      const sz = (Math.random() - 0.5) * 2 * amp;
      camera.position.copy(butWhyDropState.cameraBasePos).add(new THREE.Vector3(sx, sy, sz));
    } else {
      camera.position.copy(butWhyDropState.cameraBasePos);
    }
  }

  // Ground shake.
  if (ground && butWhyDropState.groundBaseY !== null && butWhyDropState.groundShakeDur > 0) {
    butWhyDropState.groundShakeT = Math.min(
      butWhyDropState.groundShakeT + dt,
      butWhyDropState.groundShakeDur
    );
    const t = butWhyDropState.groundShakeT / butWhyDropState.groundShakeDur;
    const decay = 1 - t;
    const amp = butWhyDropState.groundShakeAmp * decay;
    ground.position.y = butWhyDropState.groundBaseY + Math.sin(t * Math.PI * 6) * amp;
  } else if (ground && butWhyDropState.groundBaseY !== null) {
    ground.position.y = butWhyDropState.groundBaseY;
  }
}

function updateFinalCameraTarget(now) {
  if (!butWhyFinalActive) return;

  if (!finalCameraLookUpActive) {
    const target = finalCameraBaseTarget;
    controls.target.copy(target);
    camera.lookAt(target);
    return;
  }

  const tRaw = (now - finalCameraLookUpStartTime) / finalSceneConfig.lookUpDuration;
  const t = Math.min(Math.max(tRaw, 0), 1);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const target = new THREE.Vector3(
    finalCameraBaseTarget.x,
    finalCameraBaseTarget.y + finalSceneConfig.lookUpYOffset * ease,
    finalCameraBaseTarget.z
  );

  controls.target.copy(finalCameraBaseTarget);
  camera.lookAt(target);

  if (t >= 1) {
    finalCameraLookUpActive = false;
  }
}

function ensureButWhyText() {
  if (butWhyText) {
    updateButWhyTransform();
    ensureButWhyGui();
    return;
  }

  ensureBebasThreeFontLoaded().then((font) => {
    if (!font) return;

    const commonGeoOpts = {
      font,
      size: butWhyConfig.textSize,
      depth: butWhyConfig.depth,
      curveSegments: Math.max(1, Math.floor(butWhyConfig.curveSegments)),
      bevelEnabled: Boolean(butWhyConfig.bevelEnabled),
      bevelThickness: butWhyConfig.bevelThickness,
      bevelSize: butWhyConfig.bevelSize,
      bevelSegments: Math.max(0, Math.floor(butWhyConfig.bevelSegments))
    };

    const { left, right } = getButWhyWordsForLang();
    const butGeo = new TextGeometry(left, commonGeoOpts);
    const whyGeo = new TextGeometry(right, commonGeoOpts);

    butGeo.computeBoundingBox();
    const b1 = butGeo.boundingBox;
    if (b1) {
      const xOffset = (b1.max.x + b1.min.x) / 2;
      const yOffset = (b1.max.y + b1.min.y) / 2;
      butGeo.translate(-xOffset, -yOffset, 0);
    }

    whyGeo.computeBoundingBox();
    const b2 = whyGeo.boundingBox;
    if (b2) {
      const xOffset = (b2.max.x + b2.min.x) / 2;
      const yOffset = (b2.max.y + b2.min.y) / 2;
      whyGeo.translate(-xOffset, -yOffset, 0);
    }

    butWhyMaterial = new THREE.MeshStandardMaterial({
      color: butWhyConfig.color,
      emissive: butWhyConfig.emissive,
      emissiveIntensity: butWhyConfig.emissiveIntensity,
      metalness: 0.05,
      roughness: 0.35
    });

    butWhyText = new THREE.Group();
    butWhyText.visible = butWhyConfig.visible;
    butWhyText.renderOrder = 10;

    butWhyButMesh = new THREE.Mesh(butGeo, butWhyMaterial);
    butWhyWhyMesh = new THREE.Mesh(whyGeo, butWhyMaterial);

    butWhyButMesh.castShadow = false;
    butWhyButMesh.receiveShadow = false;
    butWhyWhyMesh.castShadow = false;
    butWhyWhyMesh.receiveShadow = false;

    const halfSpacing = butWhyDropConfig.wordSpacing / 2;
    butWhyButMesh.position.x = -halfSpacing + getButWhyLeftExtraXForLang();
    butWhyWhyMesh.position.x = halfSpacing + butWhyDropConfig.whyExtraX;

    butWhyText.add(butWhyButMesh);
    butWhyText.add(butWhyWhyMesh);

    butWhyLight = new THREE.PointLight(0xffffff, butWhyConfig.pointLightIntensity, butWhyConfig.pointLightDistance);
    butWhyLight.visible = Boolean(butWhyConfig.usePointLight);
    butWhyLight.position.set(
      butWhyConfig.pointLightOffsetX,
      butWhyConfig.pointLightOffsetY,
      butWhyConfig.pointLightOffsetZ
    );
    butWhyText.add(butWhyLight);

    scene.add(butWhyText);
    updateButWhyTransform();
    ensureButWhyGui();
  });
}

function ensureButWhyGui() {
  if (!gui || butWhyGuiFolder) return;

  butWhyGuiFolder = gui.addFolder('But Why Text');
  butWhyGuiFolder.add(butWhyConfig, 'debugAlwaysShow').name('Debug Always Show').onChange(() => {
    // If debug is enabled, keep the text visible even outside the subtitle time window.
    if (butWhyConfig.debugAlwaysShow) {
      ensureButWhyText();
      setButWhyVisible(true);
    }
  });

  butWhyGuiFolder.add(butWhyConfig, 'visible').name('Visible').onChange((v) => {
    ensureButWhyText();
    setButWhyVisible(v);
  });
  butWhyGuiFolder.add(butWhyConfig, 'offsetX', -500, 500).name('Offset X').onChange(updateButWhyTransform);
  butWhyGuiFolder.add(butWhyConfig, 'offsetY', -200, 300).name('Offset Y').onChange(updateButWhyTransform);
  butWhyGuiFolder.add(butWhyConfig, 'offsetZ', -500, 500).name('Offset Z').onChange(updateButWhyTransform);
  butWhyGuiFolder.add(butWhyConfig, 'rotY', -Math.PI * 2, Math.PI * 2).name('Rotation Y').onChange(updateButWhyTransform);
  butWhyGuiFolder.add(butWhyConfig, 'scale', 0.1, 20).name('Scale').onChange(updateButWhyTransform);

  butWhyGuiFolder.add(butWhyConfig, 'textSize', 1, 80).name('Text Size').step(0.5).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'depth', 0.1, 20).name('Depth').step(0.1).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'curveSegments', 1, 32).name('Curve Segments').step(1).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'bevelEnabled').name('Bevel').onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'bevelThickness', 0, 5).name('Bevel Thickness').step(0.01).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'bevelSize', 0, 5).name('Bevel Size').step(0.01).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add(butWhyConfig, 'bevelSegments', 0, 12).name('Bevel Segments').step(1).onFinishChange(() => rebuildButWhyText());
  butWhyGuiFolder.add({ rebuild: () => rebuildButWhyText() }, 'rebuild').name('Rebuild 3D Text');

  const dropFolder = gui.addFolder('But Why Drop');
  dropFolder.add(butWhyDropConfig, 'enabled').name('Enabled');
  dropFolder.add(butWhyDropConfig, 'wordSpacing', 0, 80).name('Word Spacing').step(0.5).onFinishChange(() => rebuildButWhyText());
  dropFolder.add(butWhyDropConfig, 'butExtraX', -80, 80).name('BUT Extra X').step(0.5).onFinishChange(() => rebuildButWhyText());
  dropFolder.add(butWhyDropConfig, 'whyExtraX', -80, 80).name('WHY Extra X').step(0.5).onFinishChange(() => rebuildButWhyText());
  dropFolder.add(butWhyDropConfig, 'butDropHeight', 0, 300).name('BUT Drop Height').step(1);
  dropFolder.add(butWhyDropConfig, 'whyDropHeight', 0, 300).name('WHY Drop Height').step(1);
  dropFolder.add(butWhyDropConfig, 'whyDelay', 0, 2).name('WHY Delay').step(0.01);
  dropFolder.add(butWhyDropConfig, 'gravity', 0, 2000).name('Gravity').step(1);
  dropFolder.add(butWhyDropConfig, 'bounce', 0, 0.95).name('Bounce').step(0.01);
  dropFolder.add(butWhyDropConfig, 'stopVelocity', 1, 200).name('Stop Velocity').step(1);
  dropFolder.add(butWhyDropConfig, 'squash', 0, 1).name('Squash').step(0.01);
  dropFolder.add(butWhyDropConfig, 'squashDuration', 0.01, 1).name('Squash Duration').step(0.01);
  dropFolder.add(butWhyDropConfig, 'impactShake', 0, 10).name('Camera Shake').step(0.01);
  dropFolder.add(butWhyDropConfig, 'impactShakeDuration', 0.01, 1).name('Shake Duration').step(0.01);
  dropFolder.add(butWhyDropConfig, 'groundShake', 0, 5).name('Ground Shake').step(0.01);
  dropFolder.add(butWhyDropConfig, 'groundShakeDuration', 0.01, 1).name('Ground Shake Duration').step(0.01);

  butWhyGuiFolder.addColor(butWhyConfig, 'color').name('Color').onChange(() => {
    if (butWhyMaterial) {
      butWhyMaterial.color.setHex(butWhyConfig.color);
    }
  });

  butWhyGuiFolder.addColor(butWhyConfig, 'emissive').name('Emissive Color').onChange(() => {
    if (butWhyMaterial) {
      butWhyMaterial.emissive.setHex(butWhyConfig.emissive);
    }
  });
  butWhyGuiFolder.add(butWhyConfig, 'emissiveIntensity', 0, 5).name('Emissive Intensity').step(0.01).onChange(() => {
    if (butWhyMaterial) {
      butWhyMaterial.emissiveIntensity = butWhyConfig.emissiveIntensity;
    }
  });
  butWhyGuiFolder.add(butWhyConfig, 'usePointLight').name('Use Point Light').onChange((v) => {
    if (butWhyLight) butWhyLight.visible = Boolean(v);
  });
  butWhyGuiFolder.add(butWhyConfig, 'pointLightIntensity', 0, 20).name('Light Intensity').step(0.01).onChange(() => {
    if (butWhyLight) butWhyLight.intensity = butWhyConfig.pointLightIntensity;
  });
  butWhyGuiFolder.add(butWhyConfig, 'pointLightDistance', 0, 600).name('Light Distance').step(1).onChange(() => {
    if (butWhyLight) butWhyLight.distance = butWhyConfig.pointLightDistance;
  });
  butWhyGuiFolder.add(butWhyConfig, 'pointLightOffsetX', -200, 200).name('Light Offset X').step(0.5).onChange(() => {
    if (butWhyLight) butWhyLight.position.x = butWhyConfig.pointLightOffsetX;
  });
  butWhyGuiFolder.add(butWhyConfig, 'pointLightOffsetY', -200, 200).name('Light Offset Y').step(0.5).onChange(() => {
    if (butWhyLight) butWhyLight.position.y = butWhyConfig.pointLightOffsetY;
  });
  butWhyGuiFolder.add(butWhyConfig, 'pointLightOffsetZ', -200, 200).name('Light Offset Z').step(0.5).onChange(() => {
    if (butWhyLight) butWhyLight.position.z = butWhyConfig.pointLightOffsetZ;
  });

  const finalFolder = gui.addFolder('Final Scene');
  finalFolder
    .add(finalSceneConfig, 'lookUpYOffset', 0, 80)
    .name('Look Up Y')
    .onChange(() => {
      finalCameraLookUpActive = false;
    });
  finalFolder
    .add(finalSceneConfig, 'lookUpDuration', 0.1, 3)
    .name('Look Up Duration')
    .onChange(() => {
      finalCameraLookUpActive = false;
    });
  finalFolder.add(finalSceneConfig, 'orbitEnabled').name('Orbit Enabled').onChange((v) => {
    if (controls) controls.enabled = v;
  });
}

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  ArrowUp: false,
  ArrowLeft: false,
  ArrowDown: false,
  ArrowRight: false
};

function setupMobileMoveButtons() {
  const fwd = document.getElementById('mobile-forward');
  const back = document.getElementById('mobile-back');

  const bindHold = (el, keyName) => {
    if (!el) return;

    const down = (e) => {
      if (movementDisabled || introPlaying) return;
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      startGameIfNeeded();
      keys[keyName] = true;
      startAudioIfNeeded({
        introPlaying,
      });
    };

    const up = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      keys[keyName] = false;
    };

    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('pointerleave', up, { passive: false });
  };

  bindHold(fwd, 'w');
  bindHold(back, 's');
}

const moveSpeed = 3.5;

window.addEventListener('DOMContentLoaded', () => {
  currentLang = detectInitialLanguage();
  applyI18n();
  setupLanguageControls();
  setupMobileMoveButtons();
});

init();
animate();



function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x002538);
  scene.fog = new THREE.Fog(0x002538, 0, 698);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(-25, 10.6, 30);

  renderer = new THREE.WebGLRenderer({ antialias: !isMobileDevice });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.25 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isMobileDevice;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  initPostFx({ renderer, scene, camera, isMobileDevice });
  initSnowfall({ scene, camera, isMobileDevice, getTerrainHeight });
  initStars({ scene, camera, isMobileDevice });
  initGuidance({
    scene,
    getTerrainHeight,
    getCharacter: () => character,
    getIntroPlaying: () => introPlaying,
    resultXThreshold: RESULT_X_THRESHOLD
  });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enabled = false;

  ambientLight = new THREE.AmbientLight(0x062538, 2);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0x42b7ff, 0.9);
  directionalLight.position.set(-40, 33, -10);
  directionalLight.castShadow = !isMobileDevice;
  directionalLight.shadow.camera.left = -30;
  directionalLight.shadow.camera.right = 30;
  directionalLight.shadow.camera.top = 30;
  directionalLight.shadow.camera.bottom = -30;
  directionalLight.shadow.mapSize.width = isMobileDevice ? 1024 : 2048;
  directionalLight.shadow.mapSize.height = isMobileDevice ? 1024 : 2048;
  scene.add(directionalLight);

  hemisphereLight = new THREE.HemisphereLight(0x4f6b7d, 0xb8e4ff, 1.2);
  scene.add(hemisphereLight);

  const groundSegments = isMobileDevice ? 220 : 1000;
  const groundGeometry = new THREE.PlaneGeometry(800, 800, groundSegments, groundSegments);
  const vertices = groundGeometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const wave1 = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 1.2;
    const wave2 = Math.sin(x * 0.15 + y * 0.1) * 0.6;
    const noise = (Math.random() - 0.5) * 0.8;
    vertices[i + 2] = wave1 + wave2 + noise;
  }
  groundGeometry.attributes.position.needsUpdate = true;
  groundGeometry.computeVertexNormals();

  groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8f0f8,
    roughness: 0.47,
    metalness: 0
  });
  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildGuidanceLine();

  initFootprints({ ground, groundMaterial });

  // initFog({ scene });
  createGUI();
  initMountains({
    scene,
    assets: ASSETS,
    isMobileDevice,
    tuneTextureForMobile,
    updateLoadingProgress,
    showAudioUnlockOverlay,
    ensureButWhyText,
    gui
  });

  initAurora({
    scene,
    camera,
    renderer,
    getAnchorModel: () => getMountainAnchorModel()
  });

  const textureLoader = new THREE.TextureLoader();
  const penguinTexture = textureLoader.load(`${ASSETS.models}/character/Penguin Diffuse Color.png`);
  penguinTexture.colorSpace = THREE.SRGBColorSpace;
  tuneTextureForMobile(penguinTexture);

  const loader = new FBXLoader();
  loader.load(
    `${ASSETS.models}/character/model.fbx`,
    (fbx) => {
      character = fbx;
      character.scale.setScalar(0.03);
      character.position.set(0, -0.05, 0);
      character.rotation.y = -Math.PI / 2;

      setGuidanceStartFromCharacter();

      character.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;

          if (child.material) {
            child.material.map = penguinTexture;
            child.material.needsUpdate = true;
          }
        }
      });

      scene.add(character);

      if (gui) {
        const characterFolder = gui.addFolder('Character (Penguin)');

        const charScaleFolder = characterFolder.addFolder('Scale');
        charScaleFolder.add(character.scale, 'x', 0.001, 0.1).name('Scale X').step(0.001);
        charScaleFolder.add(character.scale, 'y', 0.001, 0.1).name('Scale Y').step(0.001);
        charScaleFolder.add(character.scale, 'z', 0.001, 0.1).name('Scale Z').step(0.001);

        const charPositionFolder = characterFolder.addFolder('Position');
        charPositionFolder.add(character.position, 'x', -50, 50).name('Position X');
        charPositionFolder.add(character.position, 'y', -5, 5).name('Position Y');
        charPositionFolder.add(character.position, 'z', -50, 50).name('Position Z');

        const charRotationFolder = characterFolder.addFolder('Rotation');
        charRotationFolder.add(character.rotation, 'x', -Math.PI, Math.PI).name('Rotation X');
        charRotationFolder.add(character.rotation, 'y', -Math.PI, Math.PI).name('Rotation Y');
        charRotationFolder.add(character.rotation, 'z', -Math.PI, Math.PI).name('Rotation Z');

        characterFolder.open();
      }

      mixer = new THREE.AnimationMixer(character);

      if (fbx.animations && fbx.animations.length > 0) {
        walkAction = mixer.clipAction(fbx.animations[0]);
        walkAction.play();
      }

      camera.position.set(
        character.position.x + introStartOffsetX,
        character.position.y + introStartOffsetY,
        character.position.z + introStartOffsetZ
      );
      camera.lookAt(character.position.x, character.position.y + 1, character.position.z);

      console.log('Model loaded.');
    },
    (xhr) => {
      console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`);
    },
    (error) => {
      console.error('Error while loading character model:', error);
    }
  );

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onWindowResize);

  // Mobile movement is handled by on-screen buttons now.

  initAudioControls({
    t,
    applyI18n,
    resetGame,
    hideLoadingScreen
  });
  narrationAudio = getNarrationAudio();
}

function updateSubtitles() {
  if (!narrationAudio) return;

  const currentTime = narrationAudio.currentTime;
  const subtitleElement = document.getElementById('subtitle');
  const timerEl = document.getElementById('narration-timer');

  if (timerEl) {
    const dur = narrationAudio.duration;
    const isPlaying = !narrationAudio.paused && currentTime > 0;
    if (!Number.isFinite(dur) || dur <= 0 || narrationAudio.ended || butWhyFinalActive || !isPlaying) {
      timerEl.style.display = 'none';
    } else {
      const remain = Math.max(0, dur - currentTime);
      const mm = Math.floor(remain / 60);
      const ss = Math.floor(remain % 60);
      timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      timerEl.style.display = 'block';
    }
  }

  if (butWhyFinalActive) {
    if (subtitleElement) subtitleElement.classList.remove('show');
    const endingOverlay = document.getElementById('ending-overlay');
    if (endingOverlay) endingOverlay.classList.remove('show');
    ensureButWhyText();
    setButWhyVisible(true);
    movementDisabled = true;
    return;
  }

  // Debug option: keep the text visible while tweaking via GUI.
  if (butWhyConfig.debugAlwaysShow) {
    ensureButWhyText();
    setButWhyVisible(true);
  } else {
    setButWhyVisible(Boolean(butWhyConfig.visible));
  }

  // When "But why?" appears, show the in-scene 3D text (instead of the HTML overlay).
  if (!butWhyConfig.debugAlwaysShow && currentTime >= 36 && currentTime <= 38) {
    if (!winTriggered && !loseTriggered) {
      const endingOverlay = document.getElementById('ending-overlay');
      if (endingOverlay) {
        endingOverlay.classList.remove('show');
      }
      if (subtitleElement) subtitleElement.classList.remove('show');

      isGameOver = true;
      triggerButWhyFinalMoment();

      const didWin = character && character.position.x <= RESULT_X_THRESHOLD;
      if (didWin) {
        winTriggered = true;
        startWinAutoRun();
        setTimeout(() => {
          showResultOverlay({
            variant: 'win',
            title: t('endingWin'),
          });
        }, 3000);
      } else {
        loseTriggered = true;
        startLoseDeath();
        setTimeout(() => {
          showResultOverlay({
            variant: 'lose',
            title: t('endingLose'),
          });
        }, 3000);
      }
    }
    return;
  }

  if (!narrationAudio.paused && currentTime > 0) {
    let activeSubtitle = null;
    for (let i = 0; i < subtitles.length; i++) {
      if (currentTime >= subtitles[i].start && currentTime <= subtitles[i].end) {
        activeSubtitle = subtitles[i];
        break;
      }
    }

    if (activeSubtitle) {
      subtitleElement.textContent = activeSubtitle.text;
      subtitleElement.classList.add('show');
    } else {
      subtitleElement.classList.remove('show');
    }
  } else {
    subtitleElement.classList.remove('show');
  }
}

function onKeyDown(event) {
  // When movement is disabled, also block moving forward.
  if (movementDisabled && (event.key.toLowerCase() === 'w' || event.key === 'ArrowUp')) {
    return;
  }

  if (
    event.key.toLowerCase() === 'w' ||
    event.key === 'ArrowUp' ||
    event.key.toLowerCase() === 's' ||
    event.key === 'ArrowDown'
  ) {
    startGameIfNeeded();
  }

  // Start audio on the first user interaction (after intro).
  if (
    !introPlaying &&
    !audioState.audioStarted &&
    (event.key.toLowerCase() === 'w' ||
      event.key === 'ArrowUp' ||
      event.key.toLowerCase() === 's' ||
      event.key === 'ArrowDown')
  ) {
    startAudioIfNeeded({
      introPlaying,
    });
  }

  if (event.key.toLowerCase() in keys) {
    keys[event.key.toLowerCase()] = true;
  }
  if (event.key in keys) {
    keys[event.key] = true;
  }
}

function onKeyUp(event) {
  if (event.key.toLowerCase() in keys) {
    keys[event.key.toLowerCase()] = false;
  }
  if (event.key in keys) {
    keys[event.key] = false;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.25 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  onPostFxResize();
}

function shouldIgnorePointerTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest('#audio-controls') ||
    target.closest('#info') ||
    target.closest('#subtitle') ||
    target.closest('#ending-overlay') ||
    target.closest('a') ||
    target.closest('button') ||
    target.closest('input')
  );
}

function getTerrainHeight(x, z) {
  const wave1 = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.2;
  const wave2 = Math.sin(x * 0.15 + z * 0.1) * 0.6;
  return wave1 + wave2;
}

function setWalkingTitle(isWalking) {
  if (!walkingTitleEnabled) {
    if (walkingTitleTimer) {
      clearInterval(walkingTitleTimer);
      walkingTitleTimer = null;
    }
    if (document.title !== originalDocumentTitle) document.title = originalDocumentTitle;
    return;
  }

  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
    isWalking = false;
  }

  if (isWalking) {
    if (walkingTitleTimer) return;

    walkingTitleTick = 0;
    walkingTitleTimer = setInterval(() => {
      const range = walkingTitleTrackLength + 1;
      const penguinPos = walkingTitleTrackLength - (walkingTitleTick % range);
      const snow1Pos = (walkingTitleTick + 2) % range;
      const snow2Pos = (walkingTitleTick + 7) % range;
      const snow3Pos = (walkingTitleTick + 12) % range;

      const sprites = [
        { pos: penguinPos, sym: '🐧' },
        { pos: snow1Pos, sym: '' },
        { pos: snow2Pos, sym: '❄️' },
        { pos: snow3Pos, sym: '❄️' }
      ].sort((a, b) => a.pos - b.pos);

      let title = '';
      let cursor = 0;
      for (const s of sprites) {
        title += walkingTitleSpace.repeat(Math.max(0, s.pos - cursor));
        title += s.sym;
        cursor = s.pos + 1;
      }
      title += walkingTitleSpace.repeat(Math.max(0, walkingTitleTrackLength - cursor + 1));
      document.title = title;

      walkingTitleTick += 1;
    }, 300);
    return;
  }

  if (walkingTitleTimer) {
    clearInterval(walkingTitleTimer);
    walkingTitleTimer = null;
  }
  document.title = originalDocumentTitle;
}

const positionTriggers = [];

function addPositionTrigger({ name, x, y, z, radius = 2, once = true, onEnter }) {
  positionTriggers.push({
    name,
    x,
    y,
    z,
    radius,
    once,
    fired: false,
    onEnter
  });
}

function updatePositionTriggers() {
  if (!character || !positionTriggers.length) return;

  const cx = character.position.x;
  const cy = character.position.y;
  const cz = character.position.z;

  for (const t of positionTriggers) {
    if (t.once && t.fired) continue;
    const dx = cx - t.x;
    const dy = cy - t.y;
    const dz = cz - t.z;
    if (dx * dx + dy * dy + dz * dz <= t.radius * t.radius) {
      t.fired = true;
      if (typeof t.onEnter === 'function') {
        t.onEnter({ x: cx, y: cy, z: cz, trigger: t });
      } else {
        console.log(`[Trigger] ${t.name || 'pos'} reached`, { x: cx, y: cy, z: cz });
      }
    }
  }
}

function updateMovement(delta) {
  if (!character || isGameOver || introPlaying || movementDisabled) return;

  const isMoving =
    keys.w ||
    keys.s ||
    keys.a ||
    keys.d ||
    keys.ArrowUp ||
    keys.ArrowDown ||
    keys.ArrowLeft ||
    keys.ArrowRight;

  setWalkingTitle(isMoving);

  if (mixer && walkAction) {
    walkAction.paused = !isMoving;
  }

  const moveVector = new THREE.Vector3();

  if (keys.w || keys.ArrowUp) {
    moveVector.z += 1;
  }
  if (keys.s || keys.ArrowDown) {
    moveVector.z -= 1;
  }

  if (moveVector.length() > 0) {
    if (keys.w || keys.ArrowUp) {
      forwardStarted = true;
    }

    tryStartMusicIfNeeded();

    moveVector.normalize();
    moveVector.applyQuaternion(character.quaternion);
    character.position.add(moveVector.multiplyScalar(moveSpeed * delta));

    const terrainHeight = getTerrainHeight(character.position.x, character.position.z);
    character.position.y = terrainHeight + 0.2;

    lastFootprintTime += delta;
    if (lastFootprintTime >= footprintInterval) {
      addFootprint(character.position.clone());
      const now = clock.getElapsedTime();
      if (now - lastStepSoundTime >= STEP_CONFIG.intervalSeconds) {
        playStepSound();
        lastStepSoundTime = now;
      }
      lastFootprintTime = 0;
    }

    const now = clock.getElapsedTime();
    if (now - lastCharacterPosLogTime >= CHARACTER_POS_LOG_INTERVAL) {
      lastCharacterPosLogTime = now;
      console.log(
        `[POS] x:${character.position.x.toFixed(2)} y:${character.position.y.toFixed(2)} z:${character.position.z.toFixed(2)}`
      );
    }

    updatePositionTriggers();

  }

  controls.target.copy(character.position);
  camera.position.x = character.position.x - Math.sin(character.rotation.y) * 10 + 30;
  camera.position.z = character.position.z - Math.cos(character.rotation.y) * 10;
  camera.position.y = character.position.y + 10;
}

function resetGame() {
  window.location.reload();
}

function updateLoadingProgress(progress) {
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  if (loadingBar && loadingText) {
    setTimeout(() => {
      loadingBar.style.width = `${progress}%`;
      loadingText.textContent = `${Math.round(progress)}%`;
    }, 100);
  }
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');

    // tryStartWinterAudio().then((ok) => {
    //   if (ok) showAudioUnlockOverlay(false);
    //   else showAudioUnlockOverlay(true);
    // });

    startIntroAnimation();
  }
}

function startGameIfNeeded() {
  const loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) return;
  if (loadingScreen.classList.contains('hidden')) return;
  hideLoadingScreen();
}

function startIntroAnimation() {
  if (!character) return;

  introPlaying = true;
  introStartTime = clock.getElapsedTime();

  camera.position.set(
    character.position.x + introStartOffsetX,
    character.position.y + introStartOffsetY,
    character.position.z + introStartOffsetZ
  );
  camera.lookAt(character.position.x, character.position.y + 1, character.position.z);
}

function updateIntroAnimation() {
  if (!introPlaying || !character) return;

  const elapsed = clock.getElapsedTime() - introStartTime;
  const progress = Math.min(elapsed / introDuration, 1);

  if (progress >= 1) {
    introPlaying = false;
    // Keep OrbitControls disabled by default (can be enabled via GUI on localhost).
    controls.enabled = finalSceneConfig.orbitEnabled;
    if (!guidanceState.drawEverStarted) startGuidanceDraw();
    return;
  }

  const easeProgress =
    progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  const startPos = {
    x: character.position.x + introStartOffsetX,
    y: character.position.y + introStartOffsetY,
    z: character.position.z + introStartOffsetZ
  };

  const endPos = {
    x: character.position.x - Math.sin(character.rotation.y) * 10 + introEndOffsetX,
    y: character.position.y + introEndOffsetY,
    z: character.position.z - Math.cos(character.rotation.y) * 10 + introEndOffsetZ
  };

  camera.position.x = startPos.x + (endPos.x - startPos.x) * easeProgress;
  camera.position.y = startPos.y + (endPos.y - startPos.y) * easeProgress;
  camera.position.z = startPos.z + (endPos.z - startPos.z) * easeProgress;

  camera.lookAt(character.position.x, character.position.y + 1, character.position.z);
}
function createGUI() {
  // Only show the debug GUI on localhost.
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '';

  if (!isLocalhost) {
    return;
  }

  gui = new GUI();

  const effectsFolder = gui.addFolder('Effects');
  attachPostFxGui(effectsFolder);

  const sceneFolder = gui.addFolder('Scene & Fog');
  sceneFolder
    .addColor({ bgColor: 0xb8d4e8 }, 'bgColor')
    .name('Background Color')
    .onChange((value) => {
      scene.background.setHex(value);
      scene.fog.color.setHex(value);
    });
  sceneFolder.add(scene.fog, 'near', 0, 200).name('Fog Near');
  sceneFolder.add(scene.fog, 'far', 50, 1000).name('Fog Far');

  const cameraFolder = gui.addFolder('Camera');
  cameraFolder.add(camera.position, 'x', -50, 50).name('Position X');
  cameraFolder.add(camera.position, 'y', 0, 50).name('Position Y');
  cameraFolder.add(camera.position, 'z', -50, 50).name('Position Z');
  cameraFolder.add(camera, 'fov', 30, 120).name('FOV').onChange(() => camera.updateProjectionMatrix());

  const guidanceFolder = gui.addFolder('Guidance Line');
  attachGuidanceGui(guidanceFolder);

  const snowFolder = gui.addFolder('Snow');
  attachSnowGui(snowFolder);

  const starsFolder = gui.addFolder('Stars');
  attachStarsGui(starsFolder);

  const auroraFolder = gui.addFolder('Aurora');
  attachAuroraGui(auroraFolder);

  const ambientFolder = gui.addFolder('Ambient Light');
  ambientFolder
    .addColor({ color: 0xd0e4f7 }, 'color')
    .name('Color')
    .onChange((value) => {
      ambientLight.color.setHex(value);
    });
  ambientFolder.add(ambientLight, 'intensity', 0, 2).name('Intensity');

  const directionalFolder = gui.addFolder('Directional Light');
  directionalFolder
    .addColor({ color: 0xe8f4ff }, 'color')
    .name('Color')
    .onChange((value) => {
      directionalLight.color.setHex(value);
    });
  directionalFolder.add(directionalLight, 'intensity', 0, 2).name('Intensity');
  directionalFolder.add(directionalLight.position, 'x', -50, 50).name('Position X');
  directionalFolder.add(directionalLight.position, 'y', 0, 100).name('Position Y');
  directionalFolder.add(directionalLight.position, 'z', -50, 50).name('Position Z');

  const hemisphereFolder = gui.addFolder('Hemisphere Light');
  hemisphereFolder
    .addColor({ skyColor: 0xd4e8f7 }, 'skyColor')
    .name('Sky Color')
    .onChange((value) => {
      hemisphereLight.color.setHex(value);
    });
  hemisphereFolder
    .addColor({ groundColor: 0xa8c8e0 }, 'groundColor')
    .name('Ground Color')
    .onChange((value) => {
      hemisphereLight.groundColor.setHex(value);
    });
  hemisphereFolder.add(hemisphereLight, 'intensity', 0, 2).name('Intensity');

  const groundFolder = gui.addFolder('Ground');
  groundFolder
    .addColor({ color: 0xe8f0f8 }, 'color')
    .name('Color')
    .onChange((value) => {
      groundMaterial.color.setHex(value);
    });
  groundFolder.add(groundMaterial, 'roughness', 0, 1).name('Roughness');
  groundFolder.add(groundMaterial, 'metalness', 0, 1).name('Metalness');
  groundFolder.add(ground.position, 'y', -10, 10).name('Position Y');

  const subtitlesFolder = gui.addFolder('Subtitles');
  subtitles.forEach((subtitle, index) => {
    const subFolder = subtitlesFolder.addFolder(`Subtitle ${index + 1}`);
    subFolder.add(subtitle, 'start', 0, 60).name('Start (s)').step(0.1);
    subFolder.add(subtitle, 'end', 0, 60).name('End (s)').step(0.1);
    subFolder.add(subtitle, 'text').name('Text').listen();
  });

  const audioFolder = gui.addFolder('Audio');
  const audioControls = {
    currentTime: 0,
    play: () => {
      if (narrationAudio) {
        narrationAudio.play().catch((e) => console.log('Narration play error:', e));
      }
    },
    pause: () => {
      if (narrationAudio) narrationAudio.pause();
    },
    restart: () => {
      resetGame();
    }
  };
  audioFolder.add(audioControls, 'play').name('▶ Play');
  audioFolder.add(audioControls, 'pause').name('⏸ Pause');
  audioFolder.add(audioControls, 'restart').name('⏮ Restart');
  audioFolder
    .add(audioControls, 'currentTime', 0, 60)
    .name('Narration Time (s)')
    .listen()
    .onChange((value) => {
      if (narrationAudio) narrationAudio.currentTime = value;
    });

  setInterval(() => {
    if (narrationAudio) {
      audioControls.currentTime = narrationAudio.currentTime;
    }
  }, 100);

  const introTestFolder = gui.addFolder('Intro Animation Test');

  const introTestControls = {
    introDuration,
    startOffsetX: introStartOffsetX,
    startOffsetY: introStartOffsetY,
    startOffsetZ: introStartOffsetZ,
    endOffsetX: introEndOffsetX,
    endOffsetY: introEndOffsetY,
    endOffsetZ: introEndOffsetZ,
    startIntroTest: () => {
      if (!character) return;
      introPlaying = true;
      introStartTime = clock.getElapsedTime();
      controls.enabled = false;
    },
    resetIntroTest: () => {
      introPlaying = false;
      controls.enabled = true;
    }
  };

  introTestFolder
    .add(introTestControls, 'introDuration', 1, 10)
    .name('Duration (s)')
    .step(0.5)
    .onChange((value) => {
      introDuration = value;
    });

  const startFolder = introTestFolder.addFolder('Start Position (Close-up)');
  startFolder
    .add(introTestControls, 'startOffsetX', -10, 10)
    .name('Offset X')
    .step(0.5)
    .onChange((value) => {
      introStartOffsetX = value;
    });
  startFolder
    .add(introTestControls, 'startOffsetY', 0, 5)
    .name('Offset Y')
    .step(0.1)
    .onChange((value) => {
      introStartOffsetY = value;
    });
  startFolder
    .add(introTestControls, 'startOffsetZ', -10, 10)
    .name('Offset Z')
    .step(0.5)
    .onChange((value) => {
      introStartOffsetZ = value;
    });

  const endFolder = introTestFolder.addFolder('End Position (Game Camera)');
  endFolder
    .add(introTestControls, 'endOffsetX', 0, 50)
    .name('Offset X')
    .step(1)
    .onChange((value) => {
      introEndOffsetX = value;
    });
  endFolder
    .add(introTestControls, 'endOffsetY', 0, 20)
    .name('Offset Y')
    .step(1)
    .onChange((value) => {
      introEndOffsetY = value;
    });
  endFolder
    .add(introTestControls, 'endOffsetZ', -20, 20)
    .name('Offset Z')
    .step(1)
    .onChange((value) => {
      introEndOffsetZ = value;
    });

  introTestFolder.add(introTestControls, 'startIntroTest').name('▶ Test Intro');
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const now = clock.getElapsedTime();

  if (mixer) {
    mixer.update(delta);
  }

  updateIntroAnimation();
  updateMovement(delta);
  updateEndingMotion(delta);
  updateGuidanceLine(delta);
  updateSnowfall(delta, now);
  updateStars(now);
  updateFootprints();
  updateSubtitles();
  updateButWhyFinal(now);
  updateFinalCameraTarget(now);

  updateAurora(now);

  if (cloudParticles) {
    cloudParticles.material.uniforms.time.value += delta;
    cloudParticles.rotation.y += delta * 0.01;
  }

  controls.update();
  if (!renderPostFx(delta)) renderer.render(scene, camera);
}
