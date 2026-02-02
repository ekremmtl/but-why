import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

let mountainModel;
let mountainModel2;
let mountainModel3;

const mountainMaterialConfig = {
  roughness: 0.9,
  metalness: 0.0,
  envMapIntensity: 1.0,
  emissiveIntensity: 1.0,
  specularIntensity: 1.0,
  specularColor: '#ffffff'
};

export function getMountainModels() {
  return { mountainModel, mountainModel2, mountainModel3 };
}

export function getMountainAnchorModel() {
  return mountainModel || mountainModel3;
}

export function initMountains({
  scene,
  assets,
  isMobileDevice,
  tuneTextureForMobile,
  updateLoadingProgress,
  showAudioUnlockOverlay,
  ensureButWhyText,
  gui,
  useDracoGlb = true,
  dracoDecoderPath = 'assets/models/mountain/',
  glbFileName = 'mountain.glb',
  useExternalMountainJpegs = true
}) {
  const manager = new THREE.LoadingManager();

  const finishLoadingUI = () => {
    if (updateLoadingProgress) updateLoadingProgress(100);
    if (showAudioUnlockOverlay) showAudioUnlockOverlay();
  };

  manager.onProgress = (url, itemsLoaded, itemsTotal) => {
    if (updateLoadingProgress && itemsTotal > 0) {
      updateLoadingProgress((itemsLoaded / itemsTotal) * 100);
    }
  };

  manager.onError = (url) => {
    console.error('Error while loading asset:', url);
    if (isMobileDevice) {
      finishLoadingUI();
    }
  };

  manager.onLoad = () => {
    console.log('All models loaded.');
    finishLoadingUI();
  };

  const modelsPath = `${assets.models}/mountain/`;

  const applyMaterialOverrides = (root) => {
    if (!root) return;
    root.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.material) return;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m) continue;
        if (typeof m.roughness === 'number') m.roughness = mountainMaterialConfig.roughness;
        if (typeof m.metalness === 'number') m.metalness = mountainMaterialConfig.metalness;
        if (typeof m.envMapIntensity === 'number') m.envMapIntensity = mountainMaterialConfig.envMapIntensity;
        if (m.emissive && typeof m.emissiveIntensity === 'number') {
          m.emissiveIntensity = mountainMaterialConfig.emissiveIntensity;
        }
        if (typeof m.specularIntensity === 'number') {
          m.specularIntensity = mountainMaterialConfig.specularIntensity;
        }
        if (m.specularColor && typeof m.specularColor.set === 'function') {
          m.specularColor.set(mountainMaterialConfig.specularColor);
        }
        m.needsUpdate = true;
      }
    });
  };

  const applyMaterialOverridesToAll = () => {
    applyMaterialOverrides(mountainModel);
    applyMaterialOverrides(mountainModel2);
    applyMaterialOverrides(mountainModel3);
  };

  const applyModelTransforms = (model, variant) => {
    if (!model) return;

    if (variant === 2) {
      model.scale.set(0.0012, 0.002, 0.0025);
      model.position.set(-272, 140.1, 358);
      model.rotation.x = -2.24938033997029;
      model.rotation.y = -0.402123859659494;
      model.rotation.z = 3.70707933123596;
      return;
    }

    if (variant === 3) {
      model.scale.set(0.0012, 0.002, 0.0025);
      model.position.set(-133, 73.8, -287);
      model.rotation.x = -1.39486713819387;
      model.rotation.y = 0.314159265358979;
      return;
    }

    model.scale.set(0.0011, 0.0031, 0.0038);
    model.position.set(-460, 123.9, -6);
    model.rotation.x = -1.4765485471872;
    model.rotation.y = 0.5;
  };

  const tuneModelMaterials = (root, { castShadow, receiveShadow }) => {
    if (!root) return;
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = Boolean(castShadow);
      child.receiveShadow = Boolean(receiveShadow);

      if (!tuneTextureForMobile) return;
      if (!child.material) return;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m && m.map) tuneTextureForMobile(m.map);
      }
    });
  };

  const attachMountainGui = () => {
    if (!gui) return;

    if (!isMobileDevice && mountainModel && mountainModel2) {
      const mountainFolder = gui.addFolder('Mountain 1');

      const scaleFolder = mountainFolder.addFolder('Scale');
      scaleFolder.add(mountainModel.scale, 'x', 0.0001, 0.01).name('Scale X').step(0.0001);
      scaleFolder.add(mountainModel.scale, 'y', 0.0001, 0.01).name('Scale Y').step(0.0001);
      scaleFolder.add(mountainModel.scale, 'z', 0.0001, 0.01).name('Scale Z').step(0.0001);

      const positionFolder = mountainFolder.addFolder('Position');
      positionFolder.add(mountainModel.position, 'x', -500, 500).name('Position X');
      positionFolder.add(mountainModel.position, 'y', -100, 200).name('Position Y');
      positionFolder.add(mountainModel.position, 'z', -500, 500).name('Position Z');

      const rotationFolder = mountainFolder.addFolder('Rotation');
      rotationFolder.add(mountainModel.rotation, 'x', -Math.PI * 2, Math.PI * 2).name('Rotation X');
      rotationFolder.add(mountainModel.rotation, 'y', -Math.PI * 2, Math.PI * 2).name('Rotation Y');
      rotationFolder.add(mountainModel.rotation, 'z', -Math.PI * 2, Math.PI * 2).name('Rotation Z');

      const materialFolder = mountainFolder.addFolder('Material');
      materialFolder.add(mountainMaterialConfig, 'roughness', 0, 1).name('Roughness').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder.add(mountainMaterialConfig, 'metalness', 0, 1).name('Metalness').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder.add(mountainMaterialConfig, 'envMapIntensity', 0, 5).name('Env Intensity').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder.add(mountainMaterialConfig, 'emissiveIntensity', 0, 5).name('Emissive Int').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder.add(mountainMaterialConfig, 'specularIntensity', 0, 5).name('Specular Int').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder.addColor(mountainMaterialConfig, 'specularColor').name('Specular Color').onChange(() => applyMaterialOverridesToAll());

      const mountainFolder2 = gui.addFolder('Mountain 2');

      const scaleFolder2 = mountainFolder2.addFolder('Scale');
      scaleFolder2.add(mountainModel2.scale, 'x', 0.0001, 0.01).name('Scale X').step(0.0001);
      scaleFolder2.add(mountainModel2.scale, 'y', 0.0001, 0.01).name('Scale Y').step(0.0001);
      scaleFolder2.add(mountainModel2.scale, 'z', 0.0001, 0.01).name('Scale Z').step(0.0001);

      const positionFolder2 = mountainFolder2.addFolder('Position');
      positionFolder2.add(mountainModel2.position, 'x', -500, 500).name('Position X');
      positionFolder2.add(mountainModel2.position, 'y', -100, 200).name('Position Y');
      positionFolder2.add(mountainModel2.position, 'z', -500, 500).name('Position Z');

      const rotationFolder2 = mountainFolder2.addFolder('Rotation');
      rotationFolder2.add(mountainModel2.rotation, 'x', -Math.PI * 2, Math.PI * 2).name('Rotation X');
      rotationFolder2.add(mountainModel2.rotation, 'y', -Math.PI * 2, Math.PI * 2).name('Rotation Y');
      rotationFolder2.add(mountainModel2.rotation, 'z', -Math.PI * 2, Math.PI * 2).name('Rotation Z');
    }

    if (mountainModel3) {
      const mountainFolder3 = gui.addFolder('Mountain 3');

      const scaleFolder3 = mountainFolder3.addFolder('Scale');
      scaleFolder3.add(mountainModel3.scale, 'x', 0.0001, 0.01).name('Scale X').step(0.0001);
      scaleFolder3.add(mountainModel3.scale, 'y', 0.0001, 0.01).name('Scale Y').step(0.0001);
      scaleFolder3.add(mountainModel3.scale, 'z', 0.0001, 0.01).name('Scale Z').step(0.0001);

      const positionFolder3 = mountainFolder3.addFolder('Position');
      positionFolder3.add(mountainModel3.position, 'x', -500, 500).name('Position X');
      positionFolder3.add(mountainModel3.position, 'y', -100, 200).name('Position Y');
      positionFolder3.add(mountainModel3.position, 'z', -500, 500).name('Position Z');

      const rotationFolder3 = mountainFolder3.addFolder('Rotation');
      rotationFolder3.add(mountainModel3.rotation, 'x', -Math.PI * 2, Math.PI * 2).name('Rotation X');
      rotationFolder3.add(mountainModel3.rotation, 'y', -Math.PI * 2, Math.PI * 2).name('Rotation Y');
      rotationFolder3.add(mountainModel3.rotation, 'z', -Math.PI * 2, Math.PI * 2).name('Rotation Z');

      const materialFolder3 = mountainFolder3.addFolder('Material');
      materialFolder3.add(mountainMaterialConfig, 'roughness', 0, 1).name('Roughness').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder3.add(mountainMaterialConfig, 'metalness', 0, 1).name('Metalness').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder3.add(mountainMaterialConfig, 'envMapIntensity', 0, 5).name('Env Intensity').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder3.add(mountainMaterialConfig, 'emissiveIntensity', 0, 5).name('Emissive Int').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder3.add(mountainMaterialConfig, 'specularIntensity', 0, 5).name('Specular Int').step(0.01).onChange(() => applyMaterialOverridesToAll());
      materialFolder3.addColor(mountainMaterialConfig, 'specularColor').name('Specular Color').onChange(() => applyMaterialOverridesToAll());
    }
  };

  if (useDracoGlb) {
    const dracoLoader = new DRACOLoader(manager);
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    dracoLoader.setDecoderConfig({ type: 'js' });

    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setPath(modelsPath);

    gltfLoader.load(
      glbFileName,
      (gltf) => {
        const root = gltf.scene;
        if (!root) {
          console.error('GLB loaded but scene is missing.');
          finishLoadingUI();
          return;
        }

        if (isMobileDevice) {
          mountainModel = root.clone(true);
          applyModelTransforms(mountainModel, 1);
          // applyExternalTextures(mountainModel, { isGltf: true });
          tuneModelMaterials(mountainModel, { castShadow: false, receiveShadow: false });
          scene.add(mountainModel);
          mountainModel2 = null;
          mountainModel3 = null;
        } else {
          mountainModel = root.clone(true);
          applyModelTransforms(mountainModel, 1);
          // applyExternalTextures(mountainModel, { isGltf: true });
          tuneModelMaterials(mountainModel, { castShadow: true, receiveShadow: true });
          scene.add(mountainModel);

          mountainModel2 = root.clone(true);
          applyModelTransforms(mountainModel2, 2);
          // applyExternalTextures(mountainModel2, { isGltf: true });
          tuneModelMaterials(mountainModel2, { castShadow: true, receiveShadow: true });
          scene.add(mountainModel2);

          mountainModel3 = root.clone(true);
          applyModelTransforms(mountainModel3, 3);
          // applyExternalTextures(mountainModel3, { isGltf: true });
          tuneModelMaterials(mountainModel3, { castShadow: true, receiveShadow: true });
          scene.add(mountainModel3);
        }

        console.log('Mountain models loaded.');
        if (ensureButWhyText) ensureButWhyText();

        applyMaterialOverridesToAll();
        attachMountainGui();
      },
      undefined,
      (error) => {
        console.error('Error while loading mountain GLB:', error);
        if (isMobileDevice) {
          finishLoadingUI();
        }
      }
    );

    return;
  }

  if (isMobileDevice) {
    const objLoader = new OBJLoader(manager);
    objLoader.setPath(modelsPath);
    objLoader.load(
      'Snow Covered Mountain Range in Northern Montana.obj',
      (object) => {
        mountainModel = object.clone();
        mountainModel.scale.set(0.0011, 0.0031, 0.0038);
        mountainModel.position.set(-460, 123.9, -6);
        mountainModel.rotation.x = -1.4765485471872;
        mountainModel.rotation.y = 0.5;

        const mobileMountainMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.95,
          metalness: 0.0
        });

        mountainModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.material = mobileMountainMaterial;
          }
        });

        scene.add(mountainModel);
        mountainModel2 = null;
        mountainModel3 = null;

        console.log('Mountain models loaded.');
        if (ensureButWhyText) ensureButWhyText();
      },
      undefined,
      (error) => {
        console.error('Error while loading mountain:', error);
        finishLoadingUI();
      }
    );
    return;
  }

  const mtlLoader = new MTLLoader(manager);
  mtlLoader.setPath(modelsPath);
  mtlLoader.load(
    'Snow Covered Mountain Range in Northern Montana.mtl',
    (materials) => {
      materials.preload();

      const objLoader = new OBJLoader(manager);
      objLoader.setMaterials(materials);
      objLoader.setPath(modelsPath);
      objLoader.load(
        'Snow Covered Mountain Range in Northern Montana.obj',
        (object) => {
          if (isMobileDevice) {
            mountainModel = object.clone();
            mountainModel.scale.set(0.0011, 0.0031, 0.0038);
            mountainModel.position.set(-460, 123.9, -6);
            mountainModel.rotation.x = -1.4765485471872;
            mountainModel.rotation.y = 0.5;

            // applyExternalTextures(mountainModel, { isGltf: false });

            mountainModel.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                if (child.material) {
                  const mats = Array.isArray(child.material) ? child.material : [child.material];
                  for (const m of mats) {
                    if (m && m.map && tuneTextureForMobile) tuneTextureForMobile(m.map);
                  }
                }
              }
            });

            scene.add(mountainModel);
            mountainModel2 = null;
            mountainModel3 = null;
          } else {
            mountainModel = object.clone();
            mountainModel.scale.set(0.0011, 0.0031, 0.0038);
            mountainModel.position.set(-460, 123.9, -6);
            mountainModel.rotation.x = -1.4765485471872;
            mountainModel.rotation.y = 0.5;

            mountainModel.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && child.material.map && tuneTextureForMobile) tuneTextureForMobile(child.material.map);
              }
            });

            scene.add(mountainModel);

            mountainModel2 = object.clone();
            mountainModel2.scale.set(0.0012, 0.002, 0.0025);
            mountainModel2.position.set(-272, 140.1, 358);
            mountainModel2.rotation.x = -2.24938033997029;
            mountainModel2.rotation.y = -0.402123859659494;
            mountainModel2.rotation.z = 3.70707933123596;

            // applyExternalTextures(mountainModel2, { isGltf: false });

            mountainModel2.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && child.material.map && tuneTextureForMobile) tuneTextureForMobile(child.material.map);
              }
            });

            scene.add(mountainModel2);

            mountainModel3 = object.clone();
            mountainModel3.scale.set(0.0012, 0.002, 0.0025);
            mountainModel3.position.set(-133, 73.8, -287);
            mountainModel3.rotation.x = -1.39486713819387;
            mountainModel3.rotation.y = 0.314159265358979;

            // applyExternalTextures(mountainModel3, { isGltf: false });

            mountainModel3.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && child.material.map && tuneTextureForMobile) tuneTextureForMobile(child.material.map);
              }
            });

            scene.add(mountainModel3);
          }

          console.log('Mountain models loaded.');

          if (ensureButWhyText) ensureButWhyText();

          applyMaterialOverridesToAll();
          attachMountainGui();
        },
        undefined,
        (error) => {
          console.error('Error while loading mountain:', error);
          if (isMobileDevice) {
            finishLoadingUI();
          }
        }
      );
    },
    undefined,
    (error) => {
      console.error('Error while loading mountain materials:', error);
      if (isMobileDevice) {
        finishLoadingUI();
      }
    }
  );
}
