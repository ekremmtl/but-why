import * as THREE from 'three';

export const auroraConfig = {
  enabled: true,
  anchorMode: 'mountain',
  posX: -442,
  posY: 114,
  posZ: 350,
  scaleX: 2300,
  scaleY: 1640,
  rotY: -1.5,
  opacity: 1,
  intensity: 0.95,
  speed: 1,
  bgIntensity: 0,
  onlyUpperHalf: true
};

let sceneRef;
let cameraRef;
let rendererRef;
let getAnchorModelRef;

let auroraMesh;
let auroraMaterial;

function hash21(n) {
  return ((Math.sin(n[0] * 12.9898 + n[1] * 4.1414) * 43758.5453) % 1 + 1) % 1;
}

function disposeAurora() {
  if (!sceneRef) return;
  if (auroraMesh) {
    sceneRef.remove(auroraMesh);
    if (auroraMesh.geometry) auroraMesh.geometry.dispose();
    if (auroraMaterial) auroraMaterial.dispose();
    auroraMesh = null;
    auroraMaterial = null;
  }
}

export function initAurora({ scene, camera, renderer, getAnchorModel }) {
  sceneRef = scene;
  cameraRef = camera;
  rendererRef = renderer;
  getAnchorModelRef = getAnchorModel;

  rebuildAurora();
}

export function rebuildAurora() {
  if (!sceneRef || !cameraRef) return;
  disposeAurora();
  if (!auroraConfig.enabled) return;

  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

  auroraMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uOpacity: { value: auroraConfig.opacity },
      uIntensity: { value: auroraConfig.intensity },
      uBgIntensity: { value: auroraConfig.bgIntensity },
      uSpeed: { value: auroraConfig.speed },
      uOnlyUpper: { value: auroraConfig.onlyUpperHalf ? 1.0 : 0.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision highp float;

      varying vec2 vUv;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uBgIntensity;
      uniform float uSpeed;
      uniform float uOnlyUpper;

      #define time (uTime * uSpeed)

      mat2 mm2(in float a){float c = cos(a), s = sin(a);return mat2(c,s,-s,c);} 
      mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);
      float tri(in float x){return clamp(abs(fract(x)-.5),0.01,0.49);} 
      vec2 tri2(in vec2 p){return vec2(tri(p.x)+tri(p.y),tri(p.y+tri(p.x)));}

      float triNoise2d(in vec2 p, float spd)
      {
          float z=1.8;
          float z2=2.5;
          float rz = 0.;
          p *= mm2(p.x*0.06);
          vec2 bp = p;
          for (float i=0.; i<5.; i++ )
          {
              vec2 dg = tri2(bp*1.85)*.75;
              dg *= mm2(time*spd);
              p -= dg/z2;

              bp *= 1.3;
              z2 *= .45;
              z *= .42;
              p *= 1.21 + (rz-1.0)*.02;

              rz += tri(p.x+tri(p.y))*z;
              p*= -m2;
          }
          return clamp(1./pow(rz*29., 1.3),0.,.55);
      }

      float hash21(in vec2 n){ return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
      vec4 aurora(vec3 ro, vec3 rd, vec2 fragCoord)
      {
          vec4 col = vec4(0.0);
          vec4 avgCol = vec4(0.0);

          for(float i=0.;i<50.;i++)
          {
              float of = 0.006*hash21(fragCoord.xy)*smoothstep(0.,15., i);
              float pt = ((.8+pow(i,1.4)*.002)-ro.y)/(rd.y*2.+0.4);
              pt -= of;
              vec3 bpos = ro + pt*rd;
              vec2 p = bpos.zx;
              float rzt = triNoise2d(p, 0.06);
              vec4 col2 = vec4(0.0,0.0,0.0, rzt);
              col2.rgb = (sin(1.-vec3(2.15,-.5, 1.2)+i*0.043)*0.5+0.5)*rzt;
              avgCol =  mix(avgCol, col2, .5);
              col += avgCol*exp2(-i*0.065 - 2.5)*smoothstep(0.,5., i);

          }

          col *= (clamp(rd.y*15.+.4,0.,1.));
          return col*1.8;
      }

      vec3 nmzHash33(vec3 q)
      {
          uvec3 p = uvec3(ivec3(q));
          p = p*uvec3(374761393U, 1103515245U, 668265263U) + p.zxy + p.yzx;
          p = p.yzx*(p.zxy^(p >> 3U));
          return vec3(p^(p >> 16U))*(1.0/vec3(0xffffffffU));
      }

      vec3 stars(in vec3 p)
      {
          vec3 c = vec3(0.);
          float res = uResolution.x*1.;

          for (float i=0.;i<4.;i++)
          {
              vec3 q = fract(p*(.15*res))-0.5;
              vec3 id = floor(p*(.15*res));
              vec2 rn = nmzHash33(id).xy;
              float c2 = 1.-smoothstep(0.,.6,length(q));
              c2 *= step(rn.x,.0005+i*i*0.001);
              c += c2*(mix(vec3(1.0,0.49,0.1),vec3(0.75,0.9,1.),rn.y)*0.1+0.9);
              p *= 1.3;
          }
          return c*c*.8;
      }

      vec3 bg(in vec3 rd)
      {
          float sd = dot(normalize(vec3(-0.5, -0.6, 0.9)), rd)*0.5+0.5;
          sd = pow(sd, 5.);
          vec3 col = mix(vec3(0.05,0.1,0.2), vec3(0.1,0.05,0.2), sd);
          return col*.63;
      }

      void main() {
        vec2 fragCoord = vUv * uResolution;
        vec2 q = fragCoord.xy / uResolution.xy;
        vec2 p = q - 0.5;
        p.x *= uResolution.x/uResolution.y;

        vec3 ro = vec3(0.0,0.0,-6.7);
        vec3 rd = normalize(vec3(p,1.3));

        rd.xz *= mm2(sin(time*0.05)*0.2);

        vec3 col = vec3(0.0);
        vec3 brd = rd;
        float fade = smoothstep(0.,0.01,abs(brd.y))*0.1+0.9;

        col = bg(rd)*fade*uBgIntensity;

        if (uOnlyUpper > 0.5 && rd.y <= 0.0) {
          gl_FragColor = vec4(col, 0.0);
          return;
        }

        if (rd.y > 0.){
            vec4 aur = smoothstep(0.,1.5,aurora(ro,rd, fragCoord))*fade;
            col = col*(1.-aur.a) + aur.rgb;
        }
        else
        {
            rd.y = abs(rd.y);
            col = bg(rd)*fade*0.6*uBgIntensity;
            vec4 aur = smoothstep(0.0,2.5,aurora(ro,rd, fragCoord));
            col = col*(1.-aur.a) + aur.rgb;
            vec3 pos = ro + ((0.5-ro.y)/rd.y)*rd;
            float nz2 = triNoise2d(pos.xz*vec2(.5,.7), 0.);
            col += mix(vec3(0.2,0.25,0.5)*0.08,vec3(0.3,0.3,0.5)*0.7, nz2*0.4);
        }

        float a = clamp(uOpacity, 0.0, 1.0);
        vec3 rgb = col * uIntensity;
        gl_FragColor = vec4(rgb, a);
      }
    `
  });

  auroraMesh = new THREE.Mesh(geometry, auroraMaterial);
  auroraMesh.frustumCulled = false;
  auroraMesh.renderOrder = -20;

  applyAuroraTransform();
  sceneRef.add(auroraMesh);
}

function applyAuroraTransform() {
  if (!auroraMesh) return;

  auroraMesh.position.set(auroraConfig.posX, auroraConfig.posY, auroraConfig.posZ);
  auroraMesh.rotation.set(0, auroraConfig.rotY, 0);
  auroraMesh.scale.set(auroraConfig.scaleX, auroraConfig.scaleY, 1);
}

function applyAnchorIfNeeded() {
  if (!auroraMesh) return;
  if (auroraConfig.anchorMode !== 'mountain') return;
  if (typeof getAnchorModelRef !== 'function') return;

  const anchorModel = getAnchorModelRef();
  if (!anchorModel) return;

  const bbox = new THREE.Box3().setFromObject(anchorModel);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  auroraMesh.position.x = center.x + auroraConfig.posX;
  auroraMesh.position.z = bbox.min.z + auroraConfig.posZ;
}

export function updateAurora(nowSeconds) {
  if (!auroraMesh || !auroraMaterial) return;
  if (!auroraConfig.enabled) return;

  applyAnchorIfNeeded();

  const w = window.innerWidth;
  const h = window.innerHeight;
  auroraMaterial.uniforms.uResolution.value.set(w, h);

  auroraMaterial.uniforms.uTime.value = nowSeconds;
  auroraMaterial.uniforms.uOpacity.value = auroraConfig.opacity;
  auroraMaterial.uniforms.uIntensity.value = auroraConfig.intensity;
  auroraMaterial.uniforms.uBgIntensity.value = auroraConfig.bgIntensity;
  auroraMaterial.uniforms.uSpeed.value = auroraConfig.speed;
  auroraMaterial.uniforms.uOnlyUpper.value = auroraConfig.onlyUpperHalf ? 1.0 : 0.0;
}

export function attachAuroraGui(folder) {
  if (!folder) return;

  folder.add(auroraConfig, 'enabled').name('Enabled').onChange(() => rebuildAurora());
  folder.add(auroraConfig, 'anchorMode', ['mountain', 'world']).name('Anchor');
  folder.add(auroraConfig, 'posX', -2000, 2000).name('Pos X').step(1).onChange(() => applyAuroraTransform());
  folder.add(auroraConfig, 'posY', -200, 1200).name('Pos Y').step(1).onChange(() => applyAuroraTransform());
  folder.add(auroraConfig, 'posZ', -2000, 2000).name('Pos Z').step(1).onChange(() => applyAuroraTransform());
  folder.add(auroraConfig, 'scaleX', 50, 4000).name('Scale X').step(1).onChange(() => applyAuroraTransform());
  folder.add(auroraConfig, 'scaleY', 50, 4000).name('Scale Y').step(1).onChange(() => applyAuroraTransform());
  folder.add(auroraConfig, 'rotY', -Math.PI, Math.PI).name('Rot Y').step(0.001).onChange(() => applyAuroraTransform());

  folder.add(auroraConfig, 'opacity', 0, 1).name('Opacity').step(0.01);
  folder.add(auroraConfig, 'intensity', 0, 4).name('Intensity').step(0.01);
  folder.add(auroraConfig, 'speed', 0, 3).name('Speed').step(0.01);
  folder.add(auroraConfig, 'bgIntensity', 0, 2).name('Bg').step(0.01);
  folder.add(auroraConfig, 'onlyUpperHalf').name('Upper Only');
}
