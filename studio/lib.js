// Shared render-studio toolkit: stage (renderer + post), procedural textures, materials, sky/ocean, the villa.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export { THREE };

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const noise = new ImprovedNoise();

/* ------------------------------------------------------------------ stage */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.55 },
    uAberration: { value: 0.0015 },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uAberration; uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r = length(d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - d * uAberration).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + d * uAberration).b;
      c = c * uGain; c = c + uLift * (1.0 - c);
      c *= 1.0 - uVignette * smoothstep(0.32, 0.92, r);
      float n = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
      c += n * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createStage({ width, height, ss = 2, exposure = 1, bloom = [0.5, 0.55, 0.85], grain = 0.03, vignette = 0.55, aberration = 0.0015, lift = [0, 0, 0], gain = [1, 1, 1] }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width * ss, height * ss, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width * ss, height * ss), bloom[0], bloom[1], bloom[2]);
  const outputPass = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uGrain.value = grain;
  grade.uniforms.uVignette.value = vignette;
  grade.uniforms.uAberration.value = aberration;
  grade.uniforms.uLift.value.set(...lift);
  grade.uniforms.uGain.value.set(...gain);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  composer.addPass(grade);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  return {
    renderer,
    composer,
    bloomPass,
    grade,
    width,
    height,
    canvas: out,
    pmrem: new THREE.PMREMGenerator(renderer),
    render(scene, camera, time = 0) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderPass.scene = scene;
      renderPass.camera = camera;
      grade.uniforms.uTime.value = time;
      composer.render();
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      return out;
    },
    blob(type = 'image/jpeg', quality = 0.93) {
      return new Promise((r) => out.toBlob(r, type, quality));
    },
    dispose() {
      composer.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/* --------------------------------------------------------------- textures */

export function travertineTexture({ size = 1024, seed = 7, base = [216, 204, 182] } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, size, size);
  // sedimentary banding — wavy horizontal strata that tile horizontally
  for (let i = 0; i < 260; i++) {
    const y0 = r() * size;
    const th = 0.6 + r() * r() * 14;
    const a = 0.02 + r() * 0.07;
    const dark = r() < 0.55;
    g.fillStyle = dark ? `rgba(128,100,66,${a})` : `rgba(255,248,234,${a * 1.2})`;
    g.beginPath();
    const amp = r() * 6;
    const k = (Math.floor(r() * 3) + 1) * ((Math.PI * 2) / size);
    const ph = r() * 6.28;
    g.moveTo(0, y0);
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y0 + Math.sin(x * k + ph) * amp);
    for (let x = size; x >= 0; x -= 16) g.lineTo(x, y0 + th + Math.sin(x * k + ph) * amp);
    g.closePath();
    g.fill();
  }
  // characteristic travertine pores — elongated horizontal voids
  for (let i = 0; i < 2600; i++) {
    const x = r() * size, y = r() * size;
    const rx = 0.6 + r() * r() * 9, ry = 0.3 + r() * 1.6;
    g.fillStyle = `rgba(96,74,50,${0.12 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,250,240,${0.15 * r()})`;
    g.beginPath();
    g.ellipse(x, y + ry * 0.9, rx * 0.8, ry * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function woodTexture({ size = 512, seed = 3, base = [92, 60, 38] } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 180; i++) {
    const x0 = r() * size;
    g.strokeStyle = r() < 0.5 ? `rgba(40,24,14,${0.1 + r() * 0.2})` : `rgba(160,110,70,${0.06 + r() * 0.12})`;
    g.lineWidth = 0.5 + r() * 3;
    g.beginPath();
    const amp = 2 + r() * 10, ph = r() * 6;
    for (let y = 0; y <= size; y += 8) g.lineTo(x0 + Math.sin((y / size) * Math.PI * 2 + ph) * amp, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function waterNormalTexture(size = 512) {
  // tileable normal map from integer-frequency wave sums
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const r = rng(11);
  const waves = Array.from({ length: 28 }, () => ({
    kx: Math.round((r() - 0.5) * 30),
    ky: Math.round((r() - 0.5) * 30),
    a: 0.2 + r(),
    p: r() * 6.28,
  })).filter((w) => w.kx || w.ky);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      for (const w of waves) {
        const k = Math.hypot(w.kx, w.ky);
        const s = Math.cos(w.kx * u + w.ky * v + w.p) * (w.a / k);
        dx += s * w.kx;
        dy += s * w.ky;
      }
      const n = new THREE.Vector3(-dx * 0.12, -dy * 0.12, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* -------------------------------------------------------------- materials */

let _M = null;
export function materials() {
  if (_M) return _M;
  const trav = travertineTexture();
  const travWarm = travertineTexture({ seed: 19, base: [222, 208, 184] });
  const wood = woodTexture();
  _M = {
    trav: new THREE.MeshStandardMaterial({ map: trav, roughness: 0.72, metalness: 0, envMapIntensity: 0.7 }),
    travFloor: new THREE.MeshStandardMaterial({ map: travWarm, roughness: 0.42, metalness: 0, envMapIntensity: 0.6 }),
    travUnder: new THREE.MeshStandardMaterial({ map: trav, color: 0xb9ab95, roughness: 0.85 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x3a2b1e, roughness: 0.32, metalness: 0.85 }),
    blackSteel: new THREE.MeshStandardMaterial({ color: 0x131110, roughness: 0.45, metalness: 0.6 }),
    walnut: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0xe6ddcf, roughness: 0.96 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x5b4c3e, roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xe9e1d3, roughness: 0.92 }),
    rug: new THREE.MeshStandardMaterial({ color: 0xc9b9a0, roughness: 1 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.18 }),
    glass: new THREE.MeshPhysicalMaterial({
      metalness: 0,
      roughness: 0.02,
      transmission: 0.82,
      thickness: 0.05,
      color: 0xcfdcdc,
      ior: 1.5,
      envMapIntensity: 1.6,
      specularIntensity: 1,
      side: THREE.DoubleSide,
    }),
    glassRail: new THREE.MeshPhysicalMaterial({ color: 0xdfe8e6, roughness: 0.05, transmission: 0.95, thickness: 0.02, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    reflecting: new THREE.MeshStandardMaterial({ color: 0x0b1c22, roughness: 0.02, metalness: 0.6, envMapIntensity: 1.2 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1b8fa6, roughness: 0.04, metalness: 0.15, emissive: 0x0b4652, emissiveIntensity: 0.5, envMapIntensity: 1.4 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.6, 1.3), toneMapped: false }),
    glowSoft: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.15, 0.62), toneMapped: false }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.8, 0.5), toneMapped: false }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    plant: new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 1, flatShading: true }),
  };
  return _M;
}

/* --------------------------------------------------------------- geometry */

// Remap a box's UVs to its own dimensions so stone textures keep scale on long slabs.
export function worldUV(geo, scale = 3) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) (u = p.getZ(i)), (v = p.getY(i));
    else if (ny >= nx && ny >= nz) (u = p.getX(i)), (v = p.getZ(i));
    else (u = p.getX(i)), (v = p.getY(i));
    uv.setXY(i, u / scale, v / scale);
  }
  uv.needsUpdate = true;
  return geo;
}

// Axis-aligned slab from min/max extents.
export function slab(parent, mat, x0, x1, y0, y1, z0, z1, { cast = true, receive = true, uv = 3 } = {}) {
  const geo = worldUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), uv);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

export function pane(parent, mat, x0, x1, y0, y1, z0, z1) {
  // a glass pane is a very thin slab that does not cast shadows
  return slab(parent, mat, x0, x1, y0, y1, z0, z1, { cast: false, receive: false });
}

/* ---------------------------------------------------------- environment */

export function sunVector(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export function goldenSky(scene, stage, { elevation = 4, azimuth = 100, turbidity = 8, rayleigh = 2.4, mie = 0.0038, mieG = 0.76, env = true } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity;
  u.rayleigh.value = rayleigh;
  u.mieCoefficient.value = mie;
  u.mieDirectionalG.value = mieG;
  const sun = sunVector(elevation, azimuth);
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  if (env) {
    const envScene = new THREE.Scene();
    const sky2 = new Sky();
    sky2.scale.setScalar(20000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    sky2.material.uniforms.sunPosition.value.copy(sun);
    envScene.add(sky2);
    // a warm ground bounce so reflections below the horizon are not black
    const ground = new THREE.Mesh(new THREE.SphereGeometry(15000, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0d2236, side: THREE.BackSide }));
    envScene.add(ground);
    scene.environment = stage.pmrem.fromScene(envScene, 0, 1, 30000).texture;
  }
  return { sky, sun };
}

export function ocean(scene, sun, { y = -48, color = 0x07294a, distortion = 5.5, size = 3 } = {}) {
  const water = new Water(new THREE.PlaneGeometry(40000, 40000), {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: waterNormalTexture(),
    sunDirection: sun.clone().normalize(),
    sunColor: 0xffd9a8,
    waterColor: color,
    distortionScale: distortion,
    fog: !!scene.fog,
  });
  // deeper, bluer body: less Fresnel mirror, more scattered water colour
  water.material.fragmentShader = water.material.fragmentShader
    .replace('float rf0 = 0.3;', 'float rf0 = 0.12;')
    .replace('* waterColor;', '* waterColor + waterColor * 0.35;');
  water.rotation.x = -Math.PI / 2;
  water.position.y = y;
  water.material.uniforms.size.value = size;
  scene.add(water);
  return water;
}

/* --------------------------------------------------------------- headland */

export function headland(scene, { size = 1500, seg = 720 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const SEA = -60;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, headlandHeight(x, z, SEA));
  }
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const scrub = new THREE.Color(0x8b7d4e), scrub2 = new THREE.Color(0x5e6338), rockC = new THREE.Color(0x957d66), rockD = new THREE.Color(0x5e4e42), wet = new THREE.Color(0x231d19);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = n.getY(i);
    const v = noise.noise(x * 0.05, y * 0.05, z * 0.05) * 0.5 + 0.5;
    c.copy(rockD).lerp(rockC, v);
    const strata = 0.82 + 0.18 * Math.sin(y * 1.35 + noise.noise(x * 0.03, y * 0.2, z * 0.03) * 5);
    c.multiplyScalar(strata);
    c.lerp(new THREE.Color(0xa4876b), smooth(0.4, 1, noise.noise(x * 0.015, y * 0.08, z * 0.015) * 0.5 + 0.5) * 0.5);
    const top = smooth(0.72, 0.9, ny) * smooth(-30, -6, y);
    const veg = scrub.clone().lerp(scrub2, smooth(0.3, 0.7, noise.noise(x * 0.02, 4, z * 0.02) * 0.5 + 0.5));
    c.lerp(veg, top);
    c.lerp(wet, smooth(-50, -57, y));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, materials().rock);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

export function headlandHeight(x, z, SEA = -60) {
  const n1 = noise.noise(x * 0.012, 0.3, z * 0.012);
  // a narrow promontory running out to sea, joining a wider mainland coast far behind
  const inland = Math.max(0, -z - 170);
  const halfW = Math.min(560, 34 + Math.max(0, -z) * 0.08 + inland * 1.6 + n1 * 10);
  const tipZ = 4 + noise.noise(x * 0.025, 5.1, 0.7) * 4 - Math.pow(Math.abs(x) / halfW, 2.0) * 26;
  const inside = Math.min(halfW - Math.abs(x), tipZ - z, z + 640 + n1 * 60);
  const rough = noise.noise(x * 0.09, z * 0.09, 1.7) * 3.2 + noise.noise(x * 0.27, z * 0.27, 3.3) * 1.1;
  const t = smooth(-14, 24, inside + rough * 1.6);
  const nearHouse = smooth(70, 30, Math.hypot(x, z + 10));
  const far = smooth(-120, -420, z);
  let plateau = -0.7 + Math.max(0, -z - 30) * 0.05 + (noise.noise(x * 0.008, 2, z * 0.008) * 0.5 + 0.5) * 55 * far + noise.noise(x * 0.04, 9, z * 0.04) * 1.6 * (1 - nearHouse);
  plateau = Math.max(plateau, -1.2);
  const ledges = rough * (1 - t) * t * 14;
  const shelf = Math.max(0, noise.noise(x * 0.05, 7.7, z * 0.05) - 0.38) * 70 * smooth(6, -14, inside) * smooth(-40, -8, inside);
  let h = SEA - 6 + (plateau - SEA + 6) * t + ledges + shelf;
  // sedimentary benches: soft terracing so the cliff reads as stacked strata, not a curtain
  const step = 4.2 + noise.noise(x * 0.02, 3.3, z * 0.02) * 1.2;
  const k = h / step, f = k - Math.floor(k);
  const tf = Math.pow(f, 3.2);
  h = lerp(h, (Math.floor(k) + tf) * step, 0.75 * t * (1 - t) * 4 * smooth(0.02, 0.2, 1 - t));
  return Math.min(plateau, h);
}

/* ------------------------------------------------------------------ villa */

// The HALCYON house. Origin: main living floor level, front glass faces +z (the sea).
export function buildVilla({ glow = 1, interior = true, base = true } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const lights = [];

  const warm = (x, y, z, i = 1, d = 18) => {
    const l = new THREE.PointLight(0xffb36b, 140 * i * glow, d, 2);
    l.position.set(x, y, z);
    g.add(l);
    lights.push(l);
  };

  /* ---- Level 1 — the Grotto, set into the cliff */
  slab(g, M.travUnder, -14, 14, -5.3, -4.6, -9, 6.2);
  slab(g, M.trav, -13.6, -13, -4.6, -0.6, -8, 4); // side walls
  slab(g, M.trav, 13, 13.6, -4.6, -0.6, -8, 4);
  slab(g, M.trav, -13, 13, -4.6, -0.6, -8.6, -8);
  pane(g, M.glass, -13, 13, -4.6, -0.6, 3.95, 4.0);
  for (let x = -13; x <= 13.01; x += 3.25) slab(g, M.bronze, x - 0.05, x + 0.05, -4.6, -0.6, 3.9, 4.06, { cast: false });
  pane(g, M.glassRail, -14, 14, -4.6, -3.5, 6.15, 6.2);

  /* ---- Level 2 — the Horizon, the great room that cantilevers past the cliff */
  slab(g, M.travUnder, -17, 17, -0.6, 0, -11, 7.2);
  slab(g, M.travUnder, -17, 8, -0.6, 0, 7.2, 12.5);
  slab(g, M.travUnder, 13.6, 17, -0.6, 0, 7.2, 12.5);
  slab(g, M.trav, -15, 15, 0, 4.3, -9.6, -9); // back wall
  slab(g, M.trav, -15.6, -15, 0, 4.3, -9.6, -1); // solid west wall
  pane(g, M.glass, -15.5, -15.45, 0, 4.3, -1, 7);
  pane(g, M.glass, 15.0, 15.05, 0, 4.3, -9, 7);
  pane(g, M.glass, -15, 15, 0, 4.3, 6.95, 7.0);
  for (let x = -15; x <= 15.01; x += 3) slab(g, M.bronze, x - 0.05, x + 0.05, 0, 4.3, 6.9, 7.06, { cast: false });
  slab(g, M.trav, -17.6, 17.6, 4.3, 4.95, -10.4, 10.4); // deep eave roof
  slab(g, M.travUnder, -17.6, 17.6, 4.25, 4.3, -10.4, 10.4, { cast: false }); // soffit
  pane(g, M.glassRail, -17, 8, 0, 1.1, 12.45, 12.5);
  pane(g, M.glassRail, 13.6, 17, 0, 1.1, 12.45, 12.5);

  /* ---- the cantilevered infinity pool */
  slab(g, M.trav, 8, 13.6, -1.7, -0.5, 7.2, 27.6);
  slab(g, M.trav, 8, 8.35, -0.5, 0.02, 7.2, 27.6);
  slab(g, M.trav, 13.25, 13.6, -0.5, 0.02, 7.2, 27.6);
  const water = slab(g, M.water, 8.35, 13.25, -0.5, -0.06, 7.2, 27.6, { cast: false });
  slab(g, M.glowSoft, 8.36, 8.4, -0.45, -0.38, 8, 27.4, { cast: false }); // underwater light line

  /* ---- Level 3 — the Crown, primary suite */
  slab(g, M.trav, -10, 6.2, 4.95, 8.7, -8.6, -8); // back
  slab(g, M.trav, -10.6, -10, 4.95, 8.7, -8.6, 3);
  pane(g, M.glass, -10, 6.2, 4.95, 8.7, 2.95, 3.0);
  pane(g, M.glass, 6.2, 6.25, 4.95, 8.7, -8, 3);
  slab(g, M.trav, -11.2, 7.8, 8.7, 9.3, -9.4, 5.6);
  for (let x = -9.6; x <= 6.21; x += 1.32) slab(g, M.trav, x - 0.09, x + 0.09, 4.95, 8.7, 3.25, 3.85); // brise-soleil fins
  pane(g, M.glassRail, -17.6, 17.6, 4.95, 6.0, 10.35, 10.4);

  if (interior) {
    // Grotto interior
    slab(g, M.travFloor, -13, 13, -4.62, -4.6, -8, 3.9, { cast: false });
    slab(g, M.glowSoft, -12, 12, -0.68, -0.62, -6.5, -6.2, { cast: false });
    slab(g, M.glowSoft, -12, 12, -0.68, -0.62, 1.6, 1.9, { cast: false });
    for (const x of [-8, 0, 8]) warm(x, -2.2, -2, 0.9, 14);
    furnitureLounge(g, -6, -4.6, -1.5, 1);
    furnitureLounge(g, 6, -4.6, -1.5, -1);

    // Horizon interior
    slab(g, M.travFloor, -15, 15, 0.0, 0.02, -9, 6.9, { cast: false });
    for (let z = -6; z <= 5; z += 3.6) slab(g, M.glow, -13, 13, 4.15, 4.24, z, z + 0.14, { cast: false });
    for (const x of [-10, -2, 7]) warm(x, 2.8, -1, 1.25, 20);
    furnitureLounge(g, -8, 0, 0.5, 1);
    slab(g, M.trav, 1, 7, 0, 0.95, -5.4, -4.2); // kitchen island
    slab(g, M.walnut, -14.6, 14.6, 0, 3.1, -8.95, -8.4);
    slab(g, M.walnut, 8.5, 13.5, 0.72, 0.8, 0, 3.4); // dining
    for (const x of [2.5, 4, 5.5]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 12), M.glow);
      p.position.set(x, 2.9, -4.8);
      g.add(p);
    }
    // Crown interior
    slab(g, M.travFloor, -10, 6.2, 4.95, 4.97, -8, 2.9, { cast: false });
    slab(g, M.walnut, -9.5, 5.5, 4.95, 7.6, -7.95, -7.6);
    slab(g, M.linen, -4.5, -0.5, 4.95, 5.6, -6.2, -2.4);
    slab(g, M.fabricDark, -4.7, -0.3, 4.95, 6.4, -7.5, -7.1);
    slab(g, M.glowSoft, -9, 5, 8.6, 8.66, -4, -3.8, { cast: false });
    for (const x of [-6, 2]) warm(x, 7.4, -2.5, 0.8, 14);
  }

  if (base) {
    // garden court & entry approach behind the house
    slab(g, M.trav, -19, 19, -0.75, -0.6, -34, -11, { cast: false });
    slab(g, M.reflecting, -4.5, 4.5, -0.66, -0.58, -29, -15, { cast: false }); // reflecting pool
    const r = rng(5);
    const olive = new THREE.IcosahedronGeometry(2.2, 1);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const tree = new THREE.Mesh(olive, M.plant);
      tree.position.set(side * (8 + r() * 9), 2.4 + r(), -14 - r() * 19);
      tree.scale.set(1 + r() * 0.6, 0.8 + r() * 0.4, 1 + r() * 0.6);
      tree.castShadow = tree.receiveShadow = true;
      g.add(tree);
      slab(g, M.walnut, tree.position.x - 0.15, tree.position.x + 0.15, -0.6, tree.position.y - 1, tree.position.z - 0.15, tree.position.z + 0.15);
    }
  }

  return { group: g, lights, water };
}

function furnitureLounge(g, x, y, z, dir) {
  const M = materials();
  slab(g, M.fabric, x - 2.6, x + 2.6, y, y + 0.45, z - 0.5, z + 0.5);
  slab(g, M.fabric, x - 2.6, x + 2.6, y, y + 0.85, z - 0.9, z - 0.5);
  slab(g, M.fabric, x + 2.6 * dir - 0.5, x + 2.6 * dir + 0.5, y, y + 0.45, z - 0.5, z + 2.6);
  slab(g, M.trav, x - 1, x + 1, y, y + 0.38, z + 1.1, z + 2.2);
  slab(g, M.rug, x - 3.4, x + 3.4, y + 0.005, y + 0.02, z - 1.2, z + 3.4, { cast: false });
}
