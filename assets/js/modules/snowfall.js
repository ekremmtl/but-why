import * as THREE from 'three';
import { snowConfig } from './config.js';

export { snowConfig };

let sceneRef;
let cameraRef;
let isMobileDeviceRef = false;
let getTerrainHeightRef;

let snowParticles;

export function applyMobileSnowTuning() {
  if (isMobileDeviceRef) {
    snowConfig.count = 700;
  }
}

export function initSnowfall({ scene, camera, isMobileDevice, getTerrainHeight }) {
  sceneRef = scene;
  cameraRef = camera;
  isMobileDeviceRef = Boolean(isMobileDevice);
  getTerrainHeightRef = getTerrainHeight;

  applyMobileSnowTuning();
  rebuildSnowfall();
}

export function disposeSnowfall() {
  if (snowParticles) {
    sceneRef.remove(snowParticles);
    if (snowParticles.geometry) snowParticles.geometry.dispose();
    if (snowParticles.material) {
      if (snowParticles.material.map) snowParticles.material.map.dispose();
      snowParticles.material.dispose();
    }
    snowParticles = null;
  }
}

export function rebuildSnowfall() {
  if (!sceneRef || !cameraRef) return;
  disposeSnowfall();
  createSnowfall();
}

function createSnowfall() {
  const requested = Math.max(0, Math.floor(snowConfig.count));
  if (requested === 0) return;

  const particleCount = Math.max(isMobileDeviceRef ? 0 : 1000, requested);
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount);

  const dir = new THREE.Vector3();
  cameraRef.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, cameraRef.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  for (let i = 0; i < particleCount; i++) {
    const forwardDist = snowConfig.forwardDistMin + Math.random() * (snowConfig.forwardDistMax - snowConfig.forwardDistMin);
    const coneRadius = snowConfig.coneRadiusBase + (forwardDist / 10) * snowConfig.coneRadiusScale;
    const ox = (Math.random() - 0.5) * coneRadius;
    const oz = (Math.random() - 0.5) * coneRadius;
    const spawnHeight = snowConfig.spawnHeightMin + Math.random() * (snowConfig.spawnHeightMax - snowConfig.spawnHeightMin);

    positions[i * 3 + 0] = cameraRef.position.x + dir.x * forwardDist + right.x * ox;
    positions[i * 3 + 1] = cameraRef.position.y + spawnHeight + up.y * 0;
    positions[i * 3 + 2] = cameraRef.position.z + dir.z * forwardDist + right.z * ox;

    positions[i * 3 + 0] += up.x * oz;
    positions[i * 3 + 1] += up.y * oz;
    positions[i * 3 + 2] += up.z * oz;

    velocities[i] = snowConfig.speedMin + Math.random() * (snowConfig.speedMax - snowConfig.speedMin);
  }

  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const snowTexture = new THREE.CanvasTexture(canvas);

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: snowConfig.size,
    map: snowTexture,
    transparent: true,
    opacity: snowConfig.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  snowParticles = new THREE.Points(particles, particleMaterial);
  sceneRef.add(snowParticles);
}

export function updateSnowfall(delta, now) {
  if (!snowParticles) return;

  const positions = snowParticles.geometry.attributes.position.array;
  const velocities = snowParticles.geometry.attributes.velocity.array;

  const dir = new THREE.Vector3();
  cameraRef.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, cameraRef.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  if (snowParticles.material) {
    snowParticles.material.size = snowConfig.size;
    snowParticles.material.opacity = snowConfig.opacity;
  }

  for (let i = 0; i < positions.length / 3; i++) {
    const idx = i * 3;
    const speed = velocities[i];

    positions[idx + 0] -= dir.x * speed * delta;
    positions[idx + 1] -= dir.y * speed * delta;
    positions[idx + 2] -= dir.z * speed * delta;

    positions[idx + 1] -= snowConfig.fallSpeed * delta;

    const jitter = 0.7 + Math.sin((now + i * 0.001) * 6.5) * 0.3;
    positions[idx + 0] += (Math.random() - 0.5) * jitter * delta * snowConfig.jitterXY;
    positions[idx + 1] += (Math.random() - 0.5) * jitter * delta * snowConfig.jitterY;
    positions[idx + 2] += (Math.random() - 0.5) * jitter * delta * snowConfig.jitterXY;

    const dx = positions[idx + 0] - cameraRef.position.x;
    const dy = positions[idx + 1] - cameraRef.position.y;
    const dz = positions[idx + 2] - cameraRef.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    const groundY = typeof getTerrainHeightRef === 'function' ? getTerrainHeightRef(positions[idx + 0], positions[idx + 2]) : -Infinity;

    if (
      distSq < snowConfig.nearResetDist * snowConfig.nearResetDist ||
      distSq > snowConfig.farResetDist * snowConfig.farResetDist ||
      positions[idx + 1] < groundY + snowConfig.groundClearance
    ) {
      const forwardDist = snowConfig.forwardDistMin + Math.random() * (snowConfig.forwardDistMax - snowConfig.forwardDistMin);
      const coneRadius = snowConfig.coneRadiusBase + (forwardDist / 10) * snowConfig.coneRadiusScale;
      const ox = (Math.random() - 0.5) * coneRadius;
      const oz = (Math.random() - 0.5) * coneRadius;
      const spawnHeight = snowConfig.spawnHeightMin + Math.random() * (snowConfig.spawnHeightMax - snowConfig.spawnHeightMin);

      positions[idx + 0] = cameraRef.position.x + dir.x * forwardDist + right.x * ox;
      positions[idx + 1] = cameraRef.position.y + spawnHeight;
      positions[idx + 2] = cameraRef.position.z + dir.z * forwardDist + right.z * ox;

      positions[idx + 0] += up.x * oz;
      positions[idx + 1] += up.y * oz;
      positions[idx + 2] += up.z * oz;

      velocities[i] = snowConfig.speedMin + Math.random() * (snowConfig.speedMax - snowConfig.speedMin);
    }
  }

  snowParticles.geometry.attributes.position.needsUpdate = true;
}

export function attachSnowGui(folder) {
  if (!folder) return;

  folder.add(snowConfig, 'count', 1000, 30000).name('Count').step(1000);
  folder.add(snowConfig, 'size', 0.05, 1.2).name('Size').step(0.01);
  folder.add(snowConfig, 'opacity', 0.05, 1).name('Opacity').step(0.01);
  folder.add(snowConfig, 'speedMin', 1, 80).name('Speed Min').step(1);
  folder.add(snowConfig, 'speedMax', 5, 120).name('Speed Max').step(1);
  folder.add(snowConfig, 'fallSpeed', 0, 60).name('Fall Speed').step(0.1);
  folder.add(snowConfig, 'forwardDistMin', 1, 80).name('Spawn Min').step(1);
  folder.add(snowConfig, 'forwardDistMax', 20, 200).name('Spawn Max').step(1);
  folder.add(snowConfig, 'spawnHeightMin', 0, 120).name('Spawn Height Min').step(1);
  folder.add(snowConfig, 'spawnHeightMax', 1, 200).name('Spawn Height Max').step(1);
  folder.add(snowConfig, 'coneRadiusBase', 0, 20).name('Cone Base').step(0.1);
  folder.add(snowConfig, 'coneRadiusScale', 0, 10).name('Cone Scale').step(0.1);
  folder.add(snowConfig, 'jitterXY', 0, 30).name('Jitter XY').step(0.1);
  folder.add(snowConfig, 'jitterY', 0, 20).name('Jitter Y').step(0.1);
  folder.add(snowConfig, 'groundClearance', 0, 10).name('Ground Clearance').step(0.1);
  folder.add({ rebuildSnow: () => rebuildSnowfall() }, 'rebuildSnow').name('Rebuild Snow');
}
