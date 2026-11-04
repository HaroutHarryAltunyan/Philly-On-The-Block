import * as THREE from "three";

// Authoring code for the two food models, built only from the ingredients on
// the menu and matched to the product photos in /public/images/menu:
//
//   Philly OTB — sesame hoagie roll, premium chopped meat, grilled onions,
//   sharp white American, sliced red and green bell peppers,
//   OTB Ranch (white, peppery) and OTB Tang (salmon-orange) in zigzags.
//   OTB Fries — shoestring fries, steak, grilled onions, sharp white American,
//   OTB Ranch, OTB Tang, in an open kraft takeout box.
//
// scripts/export-food-models.mjs runs this once in a browser and writes the
// result to public/models/*.glb. The site loads those model files; this file
// is not shipped to visitors. Node names are the contract with the runtime
// (food-gl.ts), which animates each named ingredient layer.

export const NODE = {
  sandwich: "philly-otb",
  bottomBread: "bottom-bread",
  topBread: "top-bread",
  steak: "steak",
  onions: "onions",
  cheese: "cheese",
  pepper: "bell-peppers",
  sauces: "sauces",
  fries: "otb-fries",
  friesSticks: "shoestring-fries",
  box: "kraft-box",
} as const;

// ───────────────────────── shared geometry math (also used at runtime) ─────────────────────────

export const L = 6; // roll length (x)
export const A = 0.95; // roll half width (z)
const TOP_H = 0.72;
const BOTTOM_H = 0.42;

export const BOX_W = 3.2;
export const BOX_D = 2.2;
const BOX_H = 1.0;
const FLARE = 0.26;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
export const smooth = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rounded ends: 1 in the middle of the roll, 0 at the tips. */
export const rollScale = (u: number) => Math.pow(Math.max(1 - Math.pow(Math.abs(2 * u - 1), 4), 0), 0.25);

/** Height of the overstuffed filling inside the roll. */
export function moundHeight(x: number, z: number) {
  const s = rollScale(x / L + 0.5);
  const zz = z / (A * Math.max(s, 0.001) * 0.92);
  if (Math.abs(zz) >= 1 || s <= 0.02) return 0;
  return 0.5 * Math.sqrt(s) * Math.pow(1 - zz * zz, 0.55);
}

/** Height of the fries pile inside the box. */
export const pileHeight = (x: number, z: number) => {
  const nx = x / (BOX_W / 2 + 0.1);
  const nz = z / (BOX_D / 2 + 0.1);
  return Math.max(0.15, 1.12 - 0.32 * (nx * nx + nz * nz));
};

// ───────────────────────── textures + materials ─────────────────────────

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, s: number, count: number, color: string, rMin: number, rMax: number, r: () => number) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.6;
    ctx.beginPath();
    ctx.arc(r() * s, r() * s, rMin + r() * (rMax - rMin), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function makeMaterials(texSize: number) {
  const r = rng(7);
  const crustMap = canvasTexture(texSize, (ctx, s) => {
    // v runs around the roll: 0 = one side, 0.5 = crown, 1 = other side.
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#c98a45");
    g.addColorStop(0.3, "#a9632a");
    g.addColorStop(0.5, "#8b4a1c");
    g.addColorStop(0.7, "#a9632a");
    g.addColorStop(1, "#c98a45");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1600, "#6e3612", 0.6, 2.2, r);
    speckle(ctx, s, 900, "#e0a964", 0.5, 1.8, r);
    ctx.strokeStyle = "rgba(240, 190, 120, 0.55)"; // baked cracks across the crown
    ctx.lineWidth = s / 160;
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.3 + r() * 0.4) * (s / 9);
      ctx.beginPath();
      ctx.moveTo(x, s * 0.36);
      ctx.bezierCurveTo(x + s * 0.02, s * 0.45, x - s * 0.02, s * 0.55, x + s * 0.01, s * 0.64);
      ctx.stroke();
    }
  });
  crustMap.wrapS = THREE.ClampToEdgeWrapping;
  const crumbMap = canvasTexture(texSize, (ctx, s) => {
    ctx.fillStyle = "#e9d1a4";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2200, "#cfae7a", 0.8, 3.2, r);
    speckle(ctx, s, 900, "#fbf0da", 0.6, 2.4, r);
  });
  const kraftMap = canvasTexture(texSize, (ctx, s) => {
    ctx.fillStyle = "#c69b6b";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(120, 80, 40, 0.18)";
    for (let i = 0; i < 900; i++) {
      const x = r() * s;
      const y = r() * s;
      ctx.lineWidth = 0.5 + r();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 4);
      ctx.stroke();
    }
    speckle(ctx, s, 500, "#b0855a", 0.5, 1.6, r);
  });
  const ranchMap = canvasTexture(Math.max(texSize / 2, 128), (ctx, s) => {
    ctx.fillStyle = "#f6f1e6";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 260, "#2a2018", 0.5, 1.4, r); // cracked black pepper in the ranch
  });
  // glTF has no separate alpha map, so the melted cheese's coverage (holes
  // where the chop shows through) lives in the color texture's alpha.
  const cheeseMap = canvasTexture(texSize, (ctx, s) => {
    ctx.fillStyle = "#efe0b8";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, "#fbf1d6", 1, 5, r);
    speckle(ctx, s, 500, "#e2cc97", 1, 4, r);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    for (let i = 0; i < 220; i++) {
      ctx.beginPath();
      ctx.ellipse(r() * s, r() * s, s * (0.008 + r() * 0.03), s * (0.006 + r() * 0.022), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  });

  const named = <T extends THREE.Material>(name: string, mat: T) => {
    mat.name = name;
    return mat;
  };
  return {
    crust: named("bread-crust", new THREE.MeshPhysicalMaterial({ map: crustMap, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color("#f0b070"), sheenRoughness: 0.6, side: THREE.DoubleSide })),
    crumb: named("bread-crumb", new THREE.MeshStandardMaterial({ map: crumbMap, roughness: 0.95, side: THREE.DoubleSide })),
    seed: named("sesame", new THREE.MeshStandardMaterial({ color: "#efe0bb", roughness: 0.55 })),
    steak: named("chopped-steak", new THREE.MeshPhysicalMaterial({ roughness: 0.58, clearcoat: 0.45, clearcoatRoughness: 0.45 })),
    onion: named("grilled-onion", new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.5, sheenColor: new THREE.Color("#ffcf80") })),
    cheese: named("white-american", new THREE.MeshPhysicalMaterial({ map: cheeseMap, roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.25, sheen: 0.6, sheenColor: new THREE.Color("#fff3d0"), alphaTest: 0.5, side: THREE.DoubleSide })),
    // Glossy cooked bell pepper skin.
    pepper: named("bell-pepper", new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 })),
    tang: named("otb-tang", new THREE.MeshPhysicalMaterial({ color: "#ec9373", roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 })),
    ranch: named("otb-ranch", new THREE.MeshPhysicalMaterial({ map: ranchMap, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 })),
    fry: named("shoestring-fry", new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 })),
    kraft: named("kraft-box", new THREE.MeshStandardMaterial({ map: kraftMap, roughness: 0.95, side: THREE.DoubleSide })),
  };
}

type Materials = ReturnType<typeof makeMaterials>;

// ───────────────────────── ingredient builders ─────────────────────────

/** Irregular chunk of chopped steak: a jittered icosahedron with faceted normals. */
function chunkGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const r = rng(seed);
  const cache = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = cache.get(key);
    if (!j) {
      j = [1 + (r() - 0.5) * 0.55, 1 + (r() - 0.5) * 0.55, 1 + (r() - 0.5) * 0.55];
      cache.set(key, j);
    }
    pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1], pos.getZ(i) * j[2]);
  }
  // Smooth normals: cooked chopped steak reads soft and juicy, not faceted.
  g.computeVertexNormals();
  return g;
}

function rollHalf(top: boolean, m: Materials, r: () => number) {
  const group = new THREE.Group();
  const segU = 72;
  const segV = 28;
  const h = top ? TOP_H : BOTTOM_H;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    const s = rollScale(u);
    const x = (u - 0.5) * L;
    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      const th = v * Math.PI;
      const bump = 1 + 0.03 * Math.sin(u * 46) * Math.sin(th * 5) + 0.012 * Math.sin(u * 130 + th * 9);
      positions.push(x, (top ? 1 : -1) * h * s * Math.sin(th) * bump, A * s * Math.cos(th) * bump);
      uvs.push(u, v);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segU; i++)
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j;
      const b = a + segV + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const crustGeo = new THREE.BufferGeometry();
  crustGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  crustGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  crustGeo.setIndex(index);
  crustGeo.computeVertexNormals();
  const crust = new THREE.Mesh(crustGeo, m.crust);
  crust.name = top ? "top-crust" : "bottom-crust";
  group.add(crust);

  // The cut face: soft crumb.
  const crumbGeo = new THREE.PlaneGeometry(L, 2 * A, segU, 12);
  const cp = crumbGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const w = cp.getY(i) / A;
    const s = rollScale(x / L + 0.5);
    cp.setXYZ(i, x * (0.2 + 0.8 * s), (top ? 0.02 : -0.02) * (1 - w * w), w * A * s * 0.985);
  }
  crumbGeo.computeVertexNormals();
  const crumb = new THREE.Mesh(crumbGeo, m.crumb);
  crumb.name = top ? "top-crumb" : "bottom-crumb";
  group.add(crumb);

  if (top) {
    // Sesame seeds on the crown, like the real roll.
    const count = 240;
    const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), m.seed, count);
    seeds.name = "sesame-seeds";
    const o = new THREE.Object3D();
    for (let n = 0; n < count; n++) {
      const u = 0.06 + r() * 0.88;
      const th = Math.PI * (0.28 + r() * 0.44);
      const s = rollScale(u);
      const x = (u - 0.5) * L;
      const y = TOP_H * s * Math.sin(th) * 1.01;
      const z = A * s * Math.cos(th) * 1.01;
      o.position.set(x, y, z);
      o.lookAt(x, y + Math.sin(th) * 2, z + Math.cos(th) * 2);
      o.rotateZ(r() * Math.PI);
      o.scale.set(0.05, 0.026, 0.016);
      o.updateMatrix();
      seeds.setMatrixAt(n, o.matrix);
    }
    group.add(seeds);
  }
  return group;
}

function instanced(
  name: string,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  count: number,
  place: (o: THREE.Object3D, c: THREE.Color) => boolean,
) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = name;
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 20) {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    if (!place(o, c)) continue;
    o.updateMatrix();
    mesh.setMatrixAt(n, o.matrix);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  return mesh;
}

function steakChunks(count: number, m: Materials, r: () => number, at: (o: THREE.Object3D) => boolean, scale = 1) {
  const dark = new THREE.Color("#341b0d");
  const mid = new THREE.Color("#5a301b");
  const seared = new THREE.Color("#8a5229");
  return instanced("chopped-steak", chunkGeometry(11), m.steak, count, (o, c) => {
    if (!at(o)) return false;
    o.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    const k = (0.65 + r() * 0.7) * scale;
    o.scale.set(0.105 * k, 0.045 * k, 0.075 * k);
    const t = r();
    c.copy(dark).lerp(t > 0.75 ? seared : mid, t);
    return true;
  });
}

function onionStrips(count: number, m: Materials, r: () => number, at: (o: THREE.Object3D) => boolean) {
  const pale = new THREE.Color("#d9b56c");
  const caramel = new THREE.Color("#9c5a22");
  const geo = new THREE.TorusGeometry(0.1, 0.017, 6, 14, 1.9);
  geo.scale(1, 1, 0.55); // softened, flattened strips
  return instanced("grilled-onion", geo, m.onion, count, (o, c) => {
    if (!at(o)) return false;
    // Grilled onions lie down in the chop.
    o.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.7, (r() - 0.5) * 0.6, r() * Math.PI * 2);
    const k = 0.75 + r() * 0.55;
    o.scale.set(k, k, k);
    c.copy(pale).lerp(caramel, r());
    return true;
  });
}

/** Sliced bell pepper strips: a curved, flattened slice of the pepper wall. */
function bellPepperStrips(count: number, m: Materials, r: () => number, at: (o: THREE.Object3D) => boolean) {
  const red = new THREE.Color("#b3170e");
  const green = new THREE.Color("#3f6e1a");
  // Real-world size: the roll is 6 units ≈ 30 cm, so a ~4 cm × 8 mm slice.
  const geo = new THREE.TorusGeometry(0.45, 0.08, 8, 24, 1.7);
  geo.scale(1, 1, 0.3); // flat like a sliced pepper wall
  return instanced("bell-pepper-strips", geo, m.pepper, count, (o, c) => {
    if (!at(o)) return false;
    // Lying in the chop, mostly flat, any direction.
    o.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5, r() * Math.PI * 2);
    const k = 0.75 + r() * 0.4;
    o.scale.set(k, k, k);
    c.copy(r() > 0.4 ? red : green);
    return true;
  });
}

function cheeseSheet(width: number, depth: number, height: (x: number, z: number) => number, edge: (x: number, z: number) => number, m: Materials) {
  const geo = new THREE.PlaneGeometry(width, depth, 96, 32);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    // Rest on the filling, and droop over the edge where it runs out.
    p.setY(i, height(x, z) + 0.025 - edge(x, z) * 0.22);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m.cheese);
  mesh.name = "melted-cheese";
  return mesh;
}

function zigzagSauce(name: string, material: THREE.Material, from: number, to: number, amp: number, step: number, flip: boolean, surface: (x: number, z: number) => number, radius: number) {
  const pts: THREE.Vector3[] = [];
  let k = 0;
  for (let x = from; x <= to; x += step / 2, k++) {
    const z = (k % 2 === 0 ? 1 : -1) * amp * (flip ? -1 : 1);
    pts.push(new THREE.Vector3(x, surface(x, z) + 0.05, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 24, radius, 7, false), material);
  mesh.name = name;
  return mesh;
}

function named(name: string, ...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}

// ───────────────────────── Philly OTB ─────────────────────────

function buildCheesesteak(m: Materials) {
  const r = rng(42);
  const bottom = named(NODE.bottomBread, rollHalf(false, m, r));

  // Top half on a hinge along the back edge, propped open by the filling.
  const topInner = rollHalf(true, m, r);
  topInner.position.z = A;
  const topPivot = named(NODE.topBread, topInner);
  topPivot.position.set(0, 0.36, -A);
  topPivot.rotation.x = -0.27;

  const inside = (o: THREE.Object3D, yMin: number, yMax: number) => {
    const x = (r() - 0.5) * L * 0.9;
    const z = (r() - 0.5) * 2 * A * 0.9;
    const h = moundHeight(x, z);
    if (h < 0.05) return false;
    o.position.set(x, h * lerp(yMin, yMax, Math.pow(r(), 0.7)), z);
    return true;
  };

  const edge = (x: number, z: number) => {
    const s = rollScale(x / L + 0.5);
    const zz = Math.abs(z) / (A * Math.max(s, 0.001) * 0.92);
    return smooth(clamp01((zz - 0.8) / 0.4));
  };
  const surface = (x: number, z: number) => moundHeight(x, z) + 0.03;

  const root = named(
    NODE.sandwich,
    bottom,
    named(NODE.steak, steakChunks(1100, m, r, (o) => inside(o, 0.05, 1))),
    named(NODE.onions, onionStrips(170, m, r, (o) => inside(o, 0.45, 1.02))),
    named(NODE.cheese, cheeseSheet(L * 0.88, 2 * A * 1.02, (x, z) => moundHeight(x, z) * 0.86, edge, m)),
    named(
      NODE.pepper,
      bellPepperStrips(24, m, r, (o) => {
        const x = (r() - 0.5) * L * 0.82;
        const z = (r() - 0.5) * 2 * A * 0.75;
        const h = moundHeight(x, z);
        if (h < 0.12) return false;
        o.position.set(x, h * (0.75 + r() * 0.3), z);
        return true;
      }),
    ),
    named(
      NODE.sauces,
      zigzagSauce("otb-tang", m.tang, -L * 0.4, L * 0.4, A * 0.55, 0.62, false, surface, 0.022),
      zigzagSauce("otb-ranch", m.ranch, -L * 0.37, L * 0.43, A * 0.5, 0.62, true, surface, 0.02),
    ),
    topPivot,
  );
  return root;
}

// ───────────────────────── OTB Fries ─────────────────────────

function quad(a: number[], b: number[], c: number[], d: number[], mat: THREE.Material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function kraftBox(m: Materials) {
  const bw = BOX_W / 2;
  const bd = BOX_D / 2;
  const tw = bw + FLARE;
  const td = bd + FLARE;
  const H = BOX_H;
  return named(
    NODE.box,
    quad([-bw, 0, -bd], [bw, 0, -bd], [bw, 0, bd], [-bw, 0, bd], m.kraft),
    quad([-bw, 0, bd], [bw, 0, bd], [tw, H, td], [-tw, H, td], m.kraft),
    quad([bw, 0, -bd], [-bw, 0, -bd], [-tw, H, -td], [tw, H, -td], m.kraft),
    quad([bw, 0, bd], [bw, 0, -bd], [tw, H, -td], [tw, H, td], m.kraft),
    quad([-bw, 0, -bd], [-bw, 0, bd], [-tw, H, td], [-tw, H, -td], m.kraft),
    // Open flaps, folded back like the takeout box in the photo.
    quad([-tw, H, td], [tw, H, td], [tw - 0.2, H - 0.12, td + 0.95], [-tw + 0.2, H - 0.12, td + 0.95], m.kraft),
    quad([tw, H, -td], [-tw, H, -td], [-tw + 0.15, H + 1.05, -td - 0.55], [tw - 0.15, H + 1.05, -td - 0.55], m.kraft),
    quad([tw, H, td], [tw, H, -td], [tw + 0.85, H - 0.1, -td + 0.25], [tw + 0.85, H - 0.1, td - 0.25], m.kraft),
    quad([-tw, H, -td], [-tw, H, td], [-tw - 0.85, H - 0.1, td - 0.25], [-tw - 0.85, H - 0.1, -td + 0.25], m.kraft),
  );
}

function buildLoadedFries(m: Materials) {
  const r = rng(99);
  const gold = new THREE.Color("#eab84a");
  const deep = new THREE.Color("#c27f22");
  const fries = instanced("fries", new THREE.BoxGeometry(1, 1, 1), m.fry, 420, (o, c) => {
    const x = (r() - 0.5) * (BOX_W + FLARE);
    const z = (r() - 0.5) * (BOX_D + FLARE);
    o.position.set(x, 0.06 + Math.pow(r(), 0.8) * (pileHeight(x, z) - 0.06), z);
    o.rotation.set((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.35);
    o.scale.set(0.06 + r() * 0.015, 0.055 + r() * 0.012, 0.6 + r() * 0.55);
    c.copy(gold).lerp(deep, r() * 0.8);
    return true;
  });

  const top = (o: THREE.Object3D, lift: number) => {
    const x = (r() - 0.5) * BOX_W * 1.02;
    const z = (r() - 0.5) * BOX_D;
    o.position.set(x, pileHeight(x, z) + lift * (0.4 + r() * 0.8), z);
    return true;
  };
  const surface = (x: number, z: number) => pileHeight(x, z) + 0.08;

  return named(
    NODE.fries,
    kraftBox(m),
    named(NODE.friesSticks, fries),
    named(NODE.steak, steakChunks(700, m, r, (o) => top(o, 0.05), 0.95)),
    named(NODE.onions, onionStrips(90, m, r, (o) => top(o, 0.1))),
    named(NODE.cheese, cheeseSheet(BOX_W * 1.05, BOX_D * 1.05, (x, z) => pileHeight(x, z) + 0.06, () => 0, m)),
    named(
      NODE.sauces,
      zigzagSauce("otb-tang", m.tang, -BOX_W * 0.45, BOX_W * 0.45, BOX_D * 0.4, 0.3, false, surface, 0.02),
      zigzagSauce("otb-ranch", m.ranch, -BOX_W * 0.42, BOX_W * 0.48, BOX_D * 0.36, 0.3, true, surface, 0.018),
    ),
  );
}

/** Builds both models (for export). */
export function buildFoodModels(texSize = 1024) {
  const m = makeMaterials(texSize);
  return { sandwich: buildCheesesteak(m), fries: buildLoadedFries(m) };
}
