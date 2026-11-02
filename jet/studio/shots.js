// Shot list for the OBSIDIAN loops. Every motion is a whole number of cycles per loop, so each clip
// ends exactly where it began. The jet stays put and flies +X; the clouds stream past it.
import { THREE, createJet, createCabin, createEnvironment, addLights, CloudField, animateJet, cabinEnvironment } from '../js/jet-model.js';

const TAU = Math.PI * 2;
const S = (t, k = 1, p = 0) => Math.sin(TAU * k * t + p);

function flight(stage, { jet: id, sunAz = 0.18, seed = 3, fog = 0.0052, fov = 30, laps = 1, bg = 0.85, near = 1, fill = 0, beat = [3, 2] }) {
  const scene = new THREE.Scene();
  createEnvironment(stage.renderer, scene, { sunAz, backgroundIntensity: bg });
  scene.fog = new THREE.FogExp2(0x2a2b30, fog);
  addLights(scene, { sunAz });
  if (fill) {
    // soft cool fill from the camera side so pale and brushed paints keep their form against the amber key
    const fl = new THREE.DirectionalLight(0xb8c4e0, fill);
    fl.position.set(20, 30, 80);
    scene.add(fl);
  }
  const jet = createJet(id, { detail: 2 });
  scene.add(jet);
  const clouds = new CloudField(scene, { seed, sunAz, near });
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.3, 5000);
  const float = (t) => {
    jet.position.y = 0.05 * S(t, 2) + 0.018 * S(t, 5, 1.3);
    jet.rotation.x = 0.0035 * S(t, 1, 0.4);
    jet.rotation.z = 0.0022 * S(t, 2, 2.1);
    clouds.update(t, laps);
    animateJet(jet, t, { beacon: beat[0], strobe: beat[1] });
  };
  return { scene, camera, jet, clouds, float };
}

// Camera helper: base position + periodic glide, looking at a target with a little drift.
function glide(sc, pos, look, amp = [0, 0, 0], lookAmp = [0, 0, 0]) {
  const p = new THREE.Vector3(...pos);
  const l = new THREE.Vector3(...look);
  return (t) => {
    sc.float(t);
    sc.camera.position.set(p.x + amp[0] * S(t, 1), p.y + amp[1] * S(t, 1, 1.1), p.z + amp[2] * S(t, 1, 0.5));
    sc.camera.lookAt(l.x + lookAmp[0] * S(t, 1, 0.3), l.y + lookAmp[1] * S(t, 1, 1.7), l.z + lookAmp[2] * S(t, 1, 0.9));
  };
}

const BLOOM = { exposure: 1.05, bloom: [0.32, 0.45, 1.3] };
const CARD = { w: 1120, h: 700, seconds: 3, group: 'cards', stage: BLOOM };
const OWN = { w: 720, h: 960, seconds: 3, group: 'own', stage: BLOOM };

export const SHOTS = {
  /* ---------------------------------------------- Aircraft reel cards */
  umbra: {
    ...CARD,
    build(stage) {
      const sc = flight(stage, { jet: 'umbra', seed: 3, fov: 34 });
      sc.update = glide(sc, [27, -1.6, -21], [1.5, 0.4, 0], [0.8, 0.35, 1.2], [0.3, 0.1, 0]);
      return sc;
    },
  },
  halo: {
    ...CARD,
    build(stage) {
      const sc = flight(stage, { jet: 'halo', seed: 7, sunAz: 0.12, fill: 0.7 });
      sc.update = glide(sc, [6, 7, 27], [-0.5, 0, 0], [1.2, 0.3, 0.6], [0.4, 0.1, 0]);
      return sc;
    },
  },
  argent: {
    ...CARD,
    build(stage) {
      const sc = flight(stage, { jet: 'argent', seed: 11, sunAz: 0.24 });
      sc.update = glide(sc, [-33, 5.5, 23], [-1.5, 1.2, 0], [1, 0.4, 1], [0.3, 0.1, 0.2]);
      return sc;
    },
  },
  meridian: {
    ...CARD,
    build(stage) {
      const sc = flight(stage, { jet: 'meridian', seed: 17, sunAz: 0.2, fill: 0.55 });
      sc.update = glide(sc, [-27, 13, 33], [-2, 0.6, 0], [1.2, 0.4, 0.8], [0.3, 0.1, 0]);
      return sc;
    },
  },
  solstice: {
    ...CARD,
    build(stage) {
      const sc = flight(stage, { jet: 'solstice', seed: 23, sunAz: 0.15 });
      sc.update = glide(sc, [23, 15, 21], [0, -0.3, 0], [0.9, 0.5, 0.9], [0.3, 0.1, 0.2]);
      return sc;
    },
  },

  /* ------------------------------------------- Ownership carousel cards */
  'own-cabin': {
    ...OWN,
    stage: { exposure: 1.3, bloom: [0.3, 0.5, 1.3] },
    build(stage) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0b0c);
      scene.environment = cabinEnvironment(stage.renderer);
      scene.environmentIntensity = 0.55;
      const cabin = createCabin();
      scene.add(cabin);
      const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 50);
      return {
        scene,
        camera,
        update(t) {
          cabin.userData.setLoop(t); // one full turn of the cloud view per loop
          // Low in the aisle, looking across at the window wall: shades, bezels and cloud view above the seat backs.
          camera.position.set(3.0 + 0.22 * S(t), 0.5 + 0.02 * S(t, 1, 1), -0.4 + 0.05 * S(t, 1, 0.6));
          camera.lookAt(-2, 0.15 + 0.02 * S(t, 1, 2), 0.9 + 0.06 * S(t, 1, 0.3));
        },
      };
    },
  },
  'own-engine': {
    ...OWN,
    build(stage) {
      const sc = flight(stage, { jet: 'argent', seed: 29, sunAz: 0.26, fov: 34 });
      const e = sc.jet.userData.engine;
      sc.update = glide(sc, [e.x + 9.5, e.y + 1.6, e.z + 5.5], [e.x + 1.5, e.y - 0.1, e.z - 0.4], [0.5, 0.2, 0.4], [0.2, 0.06, 0.1]);
      return sc;
    },
  },
  'own-halo': {
    ...OWN,
    build(stage) {
      const sc = flight(stage, { jet: 'halo', seed: 31, sunAz: 0.1, fov: 34 });
      const c = sc.jet.userData.cockpit;
      sc.update = glide(sc, [c.x + 7, c.y + 0.6, 7.5], [c.x - 1.5, c.y - 0.9, 0], [0.5, 0.2, 0.5], [0.2, 0.05, 0]);
      return sc;
    },
  },
  'own-winglet': {
    ...OWN,
    build(stage) {
      const sc = flight(stage, { jet: 'solstice', seed: 37, sunAz: 0.14, fov: 36 });
      const w = sc.jet.userData.wingTip;
      sc.update = glide(sc, [w.x + 9, w.y + 3.2, w.z + 4.5], [w.x - 0.5, w.y + 0.6, w.z - 1.5], [0.5, 0.2, 0.4], [0.2, 0.08, 0.1]);
      return sc;
    },
  },
  'own-meridian': {
    ...OWN,
    build(stage) {
      const sc = flight(stage, { jet: 'meridian', seed: 41, sunAz: 0.22, fov: 34 });
      const ft = sc.jet.userData.finTop;
      sc.update = glide(sc, [ft.x + 7, ft.y + 2.5, 11], [ft.x + 0.5, ft.y - 3, 0], [0.6, 0.25, 0.5], [0.2, 0.08, 0]);
      return sc;
    },
  },
  'own-umbra': {
    ...OWN,
    build(stage) {
      const sc = flight(stage, { jet: 'umbra', seed: 43, sunAz: 0.2, fov: 34 });
      sc.update = glide(sc, [4.5, 1.1, 7.2], [-3, 0.2, 1.1], [0.5, 0.15, 0.3], [0.25, 0.05, 0.1]);
      return sc;
    },
  },

  /* --------------------------------------------- Charter feature loop */
  charter: {
    w: 1600,
    h: 900,
    seconds: 8,
    group: 'feature',
    stage: BLOOM,
    build(stage) {
      const sc = flight(stage, { jet: 'umbra', seed: 5, sunAz: 0.17, laps: 2, fov: 28, beat: [6, 5] });
      const target = new THREE.Vector3(-1, 0.4, 0);
      sc.update = (t) => {
        sc.float(t);
        // A slow arc around the front quarter and back again: a cosine sweep so it eases at both ends.
        const a = -0.5 + 0.22 * Math.cos(TAU * t);
        const d = 40 - 3 * Math.cos(TAU * t);
        sc.camera.position.set(Math.cos(a) * d, 1.2 + 1.4 * Math.sin(TAU * t), Math.sin(a) * d);
        // Look a little to the jet's screen-left so it sits right of centre, clear of the headline.
        const k = 6.5;
        sc.camera.lookAt(target.x - k * Math.sin(a), target.y + 0.2 * Math.sin(TAU * t + 1), target.z + k * Math.cos(a));
      };
      return sc;
    },
  },
};
