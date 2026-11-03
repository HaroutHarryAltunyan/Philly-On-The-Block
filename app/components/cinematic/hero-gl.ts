import {
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from "three";

// Photo-driven hero scene. A single full-screen shader turns the restaurant's
// own photo into a lit, moving shot: slow dolly toward the sandwich, a warm
// key light drifting across it (specular "glisten" on the bright cheese and
// sauce), rising steam, depth-of-field falloff away from the subject, cursor
// parallax, film grain, and a scroll-driven push-in. Everything here is
// optional polish layered over the <img> poster underneath.

export type HeroOptions = {
  image: string;
  /** Subject position in the image, 0..1 from the top-left. */
  focus: [number, number];
  /** Where the subject should sit on screen, as an offset from center (-0.5..0.5). */
  shift: () => [number, number];
  lowPower: boolean;
  onReady: () => void;
};

export type HeroHandle = { dispose: () => void };

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2 uRes;
  uniform vec2 uImg;
  uniform float uTime;
  uniform float uIntro;
  uniform float uDolly;
  uniform vec2 uPointer;
  uniform vec2 uFocus;
  uniform vec2 uShift;
  varying vec2 vUv;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float screenAspect = uRes.x / uRes.y;
    float imgAspect = uImg.x / uImg.y;
    // Portion of the image visible at zoom 1 when covering the screen.
    vec2 cover = screenAspect > imgAspect ? vec2(1.0, imgAspect / screenAspect) : vec2(screenAspect / imgAspect, 1.0);

    // Camera: intro push (1.0 -> 1.07), slow breathing, scroll dolly.
    float intro = smoothstep(0.0, 1.0, uIntro);
    float zoom = 1.0 + 0.07 * intro + 0.012 * sin(uTime * 0.23) + 0.32 * uDolly;
    vec2 extent = cover / zoom;
    vec2 center = uFocus - vec2(uShift.x, -uShift.y) * extent;
    // Parallax: the camera drifts against the pointer.
    center -= vec2(uPointer.x, -uPointer.y) * 0.012 / zoom;
    center = clamp(center, extent * 0.5, 1.0 - extent * 0.5);

    vec2 p = (uv - 0.5) * extent;
    vec2 imgUv = vec2(p.x, -p.y) + center;

    // Subject position on screen (for steam and the key light).
    vec2 f = (uFocus - center) / extent;
    vec2 focusScreen = vec2(f.x, -f.y) + 0.5;

    // Depth of field: blur grows away from the subject.
    float d = distance(imgUv * vec2(imgAspect, 1.0), uFocus * vec2(imgAspect, 1.0));
    float radius = smoothstep(0.12, 0.55, d) * (0.0035 + 0.004 * uDolly);
    vec3 col = texture2D(uTex, imgUv).rgb;
    #ifndef LOW_POWER
      vec3 acc = col;
      float golden = 2.39996;
      for (int i = 1; i < 9; i++) {
        float fi = float(i);
        float r = sqrt(fi / 8.0) * radius;
        vec2 o = vec2(cos(fi * golden), sin(fi * golden)) * r;
        acc += texture2D(uTex, imgUv + o * vec2(1.0, imgAspect)).rgb;
      }
      col = acc / 9.0;
    #endif

    // Lift exposure: the source photo was shot at night.
    col = 1.0 - pow(1.0 - clamp(col, 0.0, 1.0), vec3(1.55));
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    // Grade: warm mids, cool deep shadows toward the brand ink.
    col *= vec3(1.07, 1.0, 0.9);
    col = mix(vec3(0.03, 0.075, 0.12), col, smoothstep(0.0, 0.35, lum) * 0.7 + 0.3);

    // Key light: drifts slowly, follows the pointer a little.
    vec2 lightPos = focusScreen + vec2(0.16 * sin(uTime * 0.21), 0.1 * cos(uTime * 0.17)) + uPointer * vec2(0.08, -0.06);
    vec2 lp = (uv - lightPos) * vec2(screenAspect, 1.0);
    float spot = exp(-dot(lp, lp) * 3.2);
    float spec = pow(smoothstep(0.42, 0.95, lum), 2.0) * spot;
    col += spec * vec3(1.0, 0.82, 0.38) * 0.7;
    col *= 0.78 + 0.42 * spot;

    // Steam rising off the sandwich.
    vec2 sp = vec2(uv.x * screenAspect * 2.4, uv.y * 2.2 - uTime * 0.11);
    float s = fbm(sp + vec2(fbm(sp * 1.6 + uTime * 0.04), 0.0));
    float column = exp(-pow((uv.x - focusScreen.x) * screenAspect * 2.2, 2.0));
    float rise = smoothstep(focusScreen.y - 0.08, focusScreen.y + 0.1, uv.y) * (1.0 - smoothstep(focusScreen.y + 0.1, focusScreen.y + 0.62, uv.y));
    float steam = smoothstep(0.5, 0.86, s) * column * rise;
    col += vec3(0.96, 0.94, 0.9) * steam * 0.2 * intro;

    // Brand-green ambient spill from the lower left, like the street sign.
    float spill = exp(-length((uv - vec2(-0.05, -0.1)) * vec2(screenAspect, 1.0)) * 2.4);
    col += vec3(0.0, 0.42, 0.03) * spill * 0.22;

    // Opening: black, then a mustard glow at the subject, then the shot.
    vec2 g = (uv - focusScreen) * vec2(screenAspect, 1.0);
    float glow = exp(-dot(g, g) * 5.0);
    float reveal = smoothstep(0.25, 1.0, uIntro);
    col = col * reveal + vec3(1.0, 0.72, 0.1) * glow * smoothstep(0.0, 0.3, uIntro) * (1.0 - 0.75 * reveal) * 0.55;

    // Vignette and grain.
    float v = length((uv - 0.5) * vec2(screenAspect, 1.0) * 0.95);
    col *= mix(0.22, 1.0, smoothstep(1.05, 0.2, v));
    col += (hash(uv * uRes + fract(uTime * 7.0) * 91.0) - 0.5) * 0.05;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

export function mountHero(canvas: HTMLCanvasElement, options: HeroOptions): HeroHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const maxDpr = options.lowPower ? 1.25 : 1.75;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTex: { value: null as unknown },
    uRes: { value: new Vector2(1, 1) },
    uImg: { value: new Vector2(750, 1000) },
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uDolly: { value: 0 },
    uPointer: { value: new Vector2(0, 0) },
    uFocus: { value: new Vector2(options.focus[0], options.focus[1]) },
    uShift: { value: new Vector2(0, 0) },
  };
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    defines: options.lowPower ? { LOW_POWER: 1 } : {},
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  scene.add(new Mesh(geometry, material));

  let disposed = false;
  let running = false;
  let visible = true;
  let frame = 0;
  let start = 0;
  let introStart = 0;
  const pointer = new Vector2(0, 0);
  const target = new Vector2(0, 0);
  // Frame-time sampling for adaptive resolution.
  let slowFrames = 0;
  let last = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    uniforms.uRes.value.set(width * dpr, height * dpr);
    const [sx, sy] = options.shift();
    uniforms.uShift.value.set(sx, sy);
  };

  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    target.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  };

  const tick = (now: number) => {
    if (disposed || !running) return;
    frame = requestAnimationFrame(tick);
    if (!start) {
      start = now;
      introStart = now;
    }
    const t = (now - start) / 1000;
    uniforms.uTime.value = t;
    uniforms.uIntro.value = Math.min((now - introStart) / 2600, 1);
    pointer.lerp(target, 0.045);
    uniforms.uPointer.value.copy(pointer);
    const rect = canvas.getBoundingClientRect();
    uniforms.uDolly.value = Math.min(Math.max(-rect.top / Math.max(rect.height, 1), 0), 1);
    renderer.render(scene, camera);

    // Adaptive resolution: if frames keep running long, render fewer pixels.
    if (last) {
      const dt = now - last;
      slowFrames = dt > 28 ? slowFrames + 1 : Math.max(slowFrames - 1, 0);
      if (slowFrames > 40 && dpr > 0.75) {
        dpr = Math.max(dpr - 0.25, 0.75);
        renderer.setPixelRatio(dpr);
        resize();
        slowFrames = 0;
      }
    }
    last = now;
  };

  const setRunning = (next: boolean) => {
    if (next === running || disposed) return;
    running = next;
    last = 0;
    if (running) frame = requestAnimationFrame(tick);
    else cancelAnimationFrame(frame);
  };

  const sync = () => setRunning(visible && document.visibilityState === "visible");
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  observer.observe(canvas);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pointermove", onPointer, { passive: true });

  new TextureLoader().load(
    options.image,
    (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = NoColorSpace;
      texture.minFilter = LinearFilter;
      texture.generateMipmaps = false;
      uniforms.uTex.value = texture;
      const img = texture.image as { width: number; height: number };
      uniforms.uImg.value.set(img.width, img.height);
      resize();
      renderer.render(scene, camera);
      options.onReady();
      sync();
    },
    undefined,
    () => undefined,
  );

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointer);
      (uniforms.uTex.value as { dispose?: () => void } | null)?.dispose?.();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
    },
  };
}
