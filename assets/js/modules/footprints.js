import * as THREE from 'three';

let groundRef;
let groundMaterialRef;

let footprints = [];

let canvasRef;
let ctxRef;
let textureRef;

export function initFootprints({ ground, groundMaterial, canvasSize = 1024 }) {
  groundRef = ground;
  groundMaterialRef = groundMaterial;

  if (!groundRef || !groundMaterialRef) return;

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const footprintTexture = new THREE.CanvasTexture(canvas);
  groundMaterialRef.map = footprintTexture;
  groundMaterialRef.needsUpdate = true;

  groundRef.userData.canvas = canvas;
  groundRef.userData.ctx = ctx;
  groundRef.userData.texture = footprintTexture;

  canvasRef = canvas;
  ctxRef = ctx;
  textureRef = footprintTexture;
}

export function addFootprint(position) {
  if (!groundRef || !ctxRef || !canvasRef || !textureRef) return;

  const worldX = position.x + 100;
  const worldZ = position.z + 100;
  const canvasX = (worldX / 200) * canvasRef.width;
  const canvasY = (worldZ / 200) * canvasRef.height;

  ctxRef.fillStyle = 'rgba(200, 200, 200, 0.3)';
  ctxRef.beginPath();
  ctxRef.ellipse(canvasX, canvasY, 8, 12, 0, 0, Math.PI * 2);
  ctxRef.fill();

  textureRef.needsUpdate = true;

  footprints.push({
    x: canvasX,
    y: canvasY,
    time: Date.now()
  });

  if (footprints.length > 100) {
    footprints.shift();
  }
}

export function updateFootprints() {
  if (!ctxRef || !canvasRef || !textureRef) return;

  const now = Date.now();

  footprints = footprints.filter((fp) => {
    const age = (now - fp.time) / 1000;
    return age < 10;
  });

  ctxRef.fillStyle = 'white';
  ctxRef.fillRect(0, 0, canvasRef.width, canvasRef.height);

  footprints.forEach((fp) => {
    const age = (now - fp.time) / 1000;
    const alpha = Math.max(0, 0.3 - (age / 10) * 0.3);
    ctxRef.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctxRef.beginPath();
    ctxRef.ellipse(fp.x, fp.y, 8, 12, 0, 0, Math.PI * 2);
    ctxRef.fill();
  });

  textureRef.needsUpdate = true;
}
