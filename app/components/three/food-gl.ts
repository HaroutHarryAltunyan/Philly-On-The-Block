import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { A, BOX_D, BOX_W, clamp01, L, moundHeight, NODE, pileHeight, rng, smooth } from "./food-models";

// Runtime for the scroll-driven food scene. Loads the two model files
// (public/models/philly-otb.glb, public/models/otb-fries.glb), animates their
// named ingredient layers, and adds the live effects that can't live in a
// model file: cinematic lighting, steam, and stretching cheese strands.
//
// Everything is driven by one number, `progress` (0..1). Camera path,
// rotation, separation, cheese stretch and the hand-off from the sandwich to
// the fries are all pure functions of it, so scrolling back reverses exactly.

export const FOOD_MODELS = {
  sandwich: "/models/philly-otb.glb",
  fries: "/models/otb-fries.glb",
};

export type Label = { id: string; x: number; y: number; opacity: number };

export type FoodScene = {
  setProgress: (p: number) => void;
  setPointer: (x: number, y: number) => void;
  onFrame: (cb: (labels: Label[]) => void) => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

const seg = (p: number, a: number, b: number) => smooth(clamp01((p - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Separation for each ingredient layer when exploded (world units), and the
// label shown beside it — names straight from the menu descriptions.
const SANDWICH_LAYERS: Array<{ node: string; offset: number; label: string; labelY: number }> = [
  { node: NODE.bottomBread, offset: -0.55, label: "Fresh bread", labelY: -0.2 },
  { node: NODE.steak, offset: 0, label: "Premium meat", labelY: 0.3 },
  { node: NODE.onions, offset: 0.6, label: "Grilled onions", labelY: 0.4 },
  { node: NODE.cheese, offset: 1.15, label: "Sharp white American", labelY: 0.45 },
  { node: NODE.pepper, offset: 1.55, label: "Spicy pepper", labelY: 0.5 },
  { node: NODE.sauces, offset: 1.95, label: "OTB Ranch + OTB Tang", labelY: 0.55 },
];
const TOP_BREAD_RISE = 2.55;

const FRIES_LAYERS: Array<{ node: string; offset: number; label: string; labelY: number }> = [
  { node: NODE.friesSticks, offset: 0, label: "Shoestring fries", labelY: 0.9 },
  { node: NODE.steak, offset: 0.65, label: "Steak", labelY: 1.15 },
  { node: NODE.onions, offset: 1.1, label: "Grilled onions", labelY: 1.2 },
  { node: NODE.cheese, offset: 1.55, label: "Sharp white American", labelY: 1.25 },
  { node: NODE.sauces, offset: 2.0, label: "OTB Ranch + OTB Tang", labelY: 1.3 },
];

type CamKey = { p: number; pos: [number, number, number]; look: [number, number, number]; fov: number };

// One continuous camera path (Catmull-Rom through the keys): no jumps, no
// resets, and scrolling up simply runs it backward.
const CAMERA: CamKey[] = [
  { p: 0.0, pos: [0, 1.5, 10.5], look: [0, 0.35, 0], fov: 30 }, // side profile
  { p: 0.12, pos: [1.6, 1.9, 8.6], look: [0, 0.35, 0], fov: 30 },
  { p: 0.22, pos: [1.3, 1.25, 3.9], look: [0.5, 0.35, 0.3], fov: 34 }, // into the chop
  { p: 0.31, pos: [-1.2, 2.3, 4.2], look: [-0.3, 0.7, 0], fov: 34 }, // across the cheese
  { p: 0.41, pos: [3.1, 2.8, 9.6], look: [0, 1.15, 0], fov: 32 }, // exploded, ~20° orbit
  { p: 0.47, pos: [2.4, 2.6, 9.8], look: [0, 1.1, 0], fov: 32 },
  { p: 0.54, pos: [0, 1.8, 10.8], look: [0, 0.4, 0], fov: 30 }, // reassembled, pull back
  { p: 0.59, pos: [0, 1.7, 5.4], look: [0, 0.5, 0], fov: 36 }, // move past it
  { p: 0.64, pos: [0, 9.2, 1.4], look: [0, 0.6, 0], fov: 34 }, // above the fries
  { p: 0.71, pos: [0.4, 8.6, 2.2], look: [0, 0.6, 0], fov: 34 },
  { p: 0.8, pos: [4.6, 5.0, 5.2], look: [0, 0.8, 0], fov: 32 }, // to 45°
  { p: 0.87, pos: [5.8, 4.8, 6.8], look: [0, 1.5, 0], fov: 32 }, // exploded
  { p: 0.93, pos: [5.0, 4.4, 6.2], look: [0, 1.0, 0], fov: 32 },
  { p: 1.0, pos: [3.7, 3.7, 4.9], look: [-0.9, 0.8, 0], fov: 34 }, // reveal: food right, copy left
];

function makeStrands(count: number, seed: number, anchor: (r: () => number) => [number, number, number]) {
  const r = rng(seed);
  const uniforms = { uPinch: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: "#f3e9cf", roughness: 0.3, clearcoat: 0.7 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPinch = uniforms.uPinch;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uPinch;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         // Melted cheese thins in the middle as it stretches.
         transformed.xz *= 1.0 - uPinch * sin(3.14159 * (position.y + 0.5));`,
      );
  };
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 16, true), mat, count);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const strands = Array.from({ length: count }, () => ({ a: anchor(r), radius: 0.022 + r() * 0.02, snap: 0.75 + r() * 0.45 }));
  const o = new THREE.Object3D();
  return {
    mesh,
    /** Strands span the gap between a lower and an upper layer, and let go one by one. */
    update(lower: number, upper: number) {
      const gap = upper - lower;
      uniforms.uPinch.value = clamp01(gap / 1.1) * 0.75;
      strands.forEach((s, i) => {
        const [x, z, h] = s.a;
        const alive = gap > 0.03 && gap < s.snap;
        const fade = alive ? 1 - smooth(clamp01((gap - s.snap * 0.75) / (s.snap * 0.25))) : 0;
        const rad = Math.max(s.radius * (1 - clamp01(gap / s.snap) * 0.5) * fade, 0.0001);
        o.position.set(x, h + lower + 0.03 + gap / 2, z);
        o.scale.set(rad, Math.max(gap, 0.0001), rad);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function makeSteam(count: number, spread: [number, number], baseY: number) {
  const r = rng(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * spread[0];
    pos[i * 3 + 1] = baseY;
    pos[i * 3 + 2] = (r() - 0.5) * spread[1];
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 1 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        // Slow rise, gentle curl, fade in then dissipate.
        float life = fract(uTime * (0.08 + seed * 0.05) + seed);
        vec3 p = position;
        p.y += life * 2.4;
        p.x += sin(life * 5.0 + seed * 20.0) * 0.22 * life;
        p.z += cos(life * 4.0 + seed * 13.0) * 0.16 * life;
        vAlpha = smoothstep(0.0, 0.18, life) * (1.0 - life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (70.0 + life * 170.0) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying float vAlpha;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(1.0, 0.96, 0.9, a * a * vAlpha * 0.26 * uAmount);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

function find(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Model is missing the "${name}" node`);
  return node;
}

/** Fewer drawn instances on constrained devices (same model file). */
function thin(root: THREE.Object3D, keep: number) {
  root.traverse((obj) => {
    const inst = obj as THREE.InstancedMesh;
    if (inst.isInstancedMesh) inst.count = Math.max(1, Math.floor(inst.count * keep));
  });
}

function prepare(root: THREE.Object3D, shadows: boolean) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && "envMapIntensity" in mat) mat.envMapIntensity = 0.9;
  });
}

export async function mountFoodScene(canvas: HTMLCanvasElement, options: { lowPower: boolean }): Promise<FoodScene> {
  const low = options.lowPower;
  const loader = new GLTFLoader();
  const [sandwichGltf, friesGltf] = await Promise.all([loader.loadAsync(FOOD_MODELS.sandwich), loader.loadAsync(FOOD_MODELS.fries)]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps the browns, golds, and sauce colors saturated
  // (ACES washed them out).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  let dpr = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // Food-commercial lighting: warm key, orange rim from behind, soft fill,
  // and a slow-moving glint that catches the cheese and sauces.
  const key = new THREE.DirectionalLight("#ffd2a0", 2.6);
  key.position.set(4, 7, 5);
  key.castShadow = !low;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  key.shadow.bias = -0.0008;
  const rim = new THREE.DirectionalLight("#ff8a3d", 3.2);
  rim.position.set(-5, 3, -6);
  const fill = new THREE.HemisphereLight("#c9dcff", "#2a1a10", 0.55);
  const glint = new THREE.PointLight("#ffb060", 6, 9, 2);
  scene.add(key, rim, fill, glint);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.43;
  ground.receiveShadow = true;
  scene.add(ground);

  const sandwich = find(sandwichGltf.scene, NODE.sandwich);
  const fries = find(friesGltf.scene, NODE.fries);
  prepare(sandwich, !low);
  prepare(fries, !low);
  if (low) {
    thin(sandwich, 0.6);
    thin(fries, 0.6);
  }
  const sandwichRig = new THREE.Group();
  sandwichRig.add(sandwich);
  const friesRig = new THREE.Group();
  friesRig.add(fries);
  scene.add(sandwichRig, friesRig);

  const sLayers = SANDWICH_LAYERS.map((l) => ({ ...l, obj: find(sandwich, l.node) }));
  const fLayers = FRIES_LAYERS.map((l) => ({ ...l, obj: find(fries, l.node) }));
  const topBread = find(sandwich, NODE.topBread);
  const topBase = { y: topBread.position.y, rx: topBread.rotation.x };
  const sCheese = sLayers.find((l) => l.node === NODE.cheese)!.obj;
  const fSteak = fLayers.find((l) => l.node === NODE.steak)!.obj;
  const fCheese = fLayers.find((l) => l.node === NODE.cheese)!.obj;

  const sStrands = makeStrands(14, 21, (r) => {
    const x = (r() - 0.5) * L * 0.7;
    const z = (r() - 0.5) * 2 * A * 0.5;
    return [x, z, moundHeight(x, z)];
  });
  sandwich.add(sStrands.mesh);
  const fStrands = makeStrands(12, 22, (r) => {
    const x = (r() - 0.5) * BOX_W * 0.7;
    const z = (r() - 0.5) * BOX_D * 0.6;
    return [x, z, pileHeight(x, z) + 0.1];
  });
  fries.add(fStrands.mesh);

  const steamS = makeSteam(low ? 28 : 70, [L * 0.7, A], 0.6);
  sandwichRig.add(steamS.points);
  const steamF = makeSteam(low ? 26 : 64, [BOX_W * 0.8, BOX_D * 0.7], 1.2);
  friesRig.add(steamF.points);

  const camPos = new THREE.CatmullRomCurve3(CAMERA.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
  const camLook = new THREE.CatmullRomCurve3(CAMERA.map((k) => new THREE.Vector3(...k.look)), false, "centripetal");
  const camAt = (p: number) => {
    for (let i = 0; i < CAMERA.length - 1; i++) {
      const a = CAMERA[i];
      const b = CAMERA[i + 1];
      if (p <= b.p) {
        const f = (p - a.p) / (b.p - a.p);
        return { t: (i + f) / (CAMERA.length - 1), fov: lerp(a.fov, b.fov, smooth(f)) };
      }
    }
    return { t: 1, fov: CAMERA[CAMERA.length - 1].fov };
  };

  let target = 0;
  let progress = 0;
  let pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  let active = false;
  let raf = 0;
  let portrait = false;
  let frameCb: ((labels: Label[]) => void) | null = null;
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    portrait = w / h < 0.9;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function apply(p: number, time: number) {
    // Camera
    const { t, fov } = camAt(p);
    camPos.getPoint(t, camera.position);
    camLook.getPoint(t, look);
    camera.fov = fov * (portrait ? 1.6 : 1); // phones: wider lens so the food still fits
    if (portrait) camera.position.multiplyScalar(1.1);
    camera.position.x += eased.x * 0.35;
    camera.position.y += eased.y * 0.2;
    camera.lookAt(look);
    camera.updateProjectionMatrix();

    // Cheesesteak: rotate, lift (melt), explode, reassemble, rotate out.
    const rot = 0.5 * seg(p, 0, 0.12) + 0.4 * seg(p, 0.12, 0.22) - 0.35 * seg(p, 0.22, 0.31) - 0.3 * seg(p, 0.47, 0.54);
    const lift = 0.32 * seg(p, 0.24, 0.3) * (1 - seg(p, 0.34, 0.4));
    const explode = seg(p, 0.33, 0.41) * (1 - seg(p, 0.47, 0.53));
    const out = seg(p, 0.54, 0.61);
    sandwichRig.rotation.set(-out * 0.25, rot + out * 1.1, 0);
    sandwichRig.position.set(0, 0, out * 6.5);
    sandwichRig.visible = p < 0.62;
    for (const l of sLayers) l.obj.position.y = l.offset * explode + (l.node === NODE.steak || l.node === NODE.bottomBread ? 0 : lift);
    topBread.position.y = topBase.y + TOP_BREAD_RISE * explode + lift * 1.6;
    topBread.rotation.x = topBase.rx * (1 - explode) - lift * 0.15;
    sStrands.update(0, sCheese.position.y);

    // Loaded fries: rise in, slow turn, explode, reassemble.
    const fin = seg(p, 0.57, 0.64);
    const fExplode = seg(p, 0.8, 0.86) * (1 - seg(p, 0.88, 0.93));
    friesRig.visible = p > 0.56;
    friesRig.position.y = -0.42 - (1 - fin) * 1.5;
    friesRig.rotation.y = -0.4 + 0.75 * seg(p, 0.64, 0.95);
    for (const l of fLayers) l.obj.position.y = l.offset * fExplode;
    fStrands.update(fSteak.position.y, fCheese.position.y);

    // Light + atmosphere: a brief dip to dark between the two products.
    const dip = Math.sin(Math.PI * seg(p, 0.555, 0.64));
    renderer.toneMappingExposure = 1.0 - 0.72 * dip;
    glint.position.set(Math.sin(time * 0.25) * 2.5, 2.6, 2.5 + Math.cos(time * 0.2));
    steamS.mat.uniforms.uTime.value = time;
    steamF.mat.uniforms.uTime.value = time;
    steamS.mat.uniforms.uAmount.value = (0.6 + 0.6 * seg(p, 0.12, 0.22)) * (1 - explode) * (1 - out);
    steamF.mat.uniforms.uAmount.value = fin * (1 - fExplode);
    const scale = renderer.getPixelRatio() * (canvas.clientHeight / 900) * 10;
    steamS.mat.uniforms.uScale.value = scale;
    steamF.mat.uniforms.uScale.value = scale;

    // Ingredient labels, projected beside each separated layer.
    if (frameCb) {
      const labels: Label[] = [];
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const push = (id: string, obj: THREE.Object3D, rigY: number, amount: number, x: number) => {
        if (amount < 0.05) return;
        tmp.set(x, rigY + obj.position.y, 0);
        obj.parent!.localToWorld(tmp);
        tmp.project(camera);
        labels.push({ id, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, opacity: smooth(clamp01((amount - 0.55) / 0.4)) });
      };
      // The bottom roll shares the "Fresh bread" label with the top roll.
      sLayers.forEach((l, i) => i > 0 && push(`s${i}`, l.obj, l.labelY, explode, 2.3));
      push("s-top", topBread, 0.3, explode, 2.3);
      fLayers.forEach((l, i) => push(`f${i}`, l.obj, l.labelY, fExplode, 2.2));
      frameCb(labels);
    }
  }

  let last = performance.now();
  let slow = 0;
  const start = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = now - last;
    last = now;
    progress += (target - progress) * Math.min(1, dt / 90);
    eased.x += (pointer.x - eased.x) * 0.05;
    eased.y += (pointer.y - eased.y) * 0.05;
    apply(progress, (now - start) / 1000);
    renderer.render(scene, camera);
    // Adaptive resolution: lower the pixel ratio if frames keep running long.
    slow = dt > 24 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 30 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      slow = 0;
    }
  };

  return {
    setProgress: (p) => {
      target = clamp01(p);
    },
    setPointer: (x, y) => {
      pointer = { x, y };
    },
    onFrame: (cb) => {
      frameCb = cb;
    },
    setActive: (on) => {
      if (on === active) return;
      active = on;
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else cancelAnimationFrame(raf);
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => {
          Object.values(mm).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mm.dispose();
        });
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
