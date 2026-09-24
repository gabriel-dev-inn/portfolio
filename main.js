import * as THREE from "three";

const hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;

if (hasGSAP) {
  document.documentElement.classList.add("js");
  gsap.registerPlugin(ScrollTrigger);
}
document.body.classList.add("is-loading");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);

/* =========================================================
   1. CENA 3D — "mente-rede": esfera orgânica de neurônios/nós
   ========================================================= */
const scene3d = (() => {
  const canvas = document.getElementById("webgl");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    canvas.style.display = "none";
    return null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 6.5);
  renderer.setClearColor(0x05060a, 1);

  const PR = Math.min(window.devicePixelRatio, 2);
  const mobile = innerWidth < 760;

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: mobile ? 24 : 30 },
    uPR: { value: PR },
    uAlpha: { value: 1 },
    uC1: { value: new THREE.Color("#7cf7e4") },
    uC2: { value: new THREE.Color("#a78bfa") },
    uC3: { value: new THREE.Color("#f472b6") },
    uWaveDir: { value: new THREE.Vector3(0.6, 0.8, 0.0).normalize() },
  };

  // Função de onda compartilhada entre pontos e linhas (os "pulsos de sinal")
  const waveGLSL = /* glsl */ `
    uniform float uTime;
    uniform vec3 uWaveDir;
    float wave(vec3 n){
      float a = sin(dot(n, uWaveDir) * 7.0 - uTime * 1.5);
      float b = sin(dot(n, vec3(-0.7, 0.2, 0.68)) * 5.0 + uTime * 1.1);
      return a * 0.65 + b * 0.35;
    }
  `;

  const group = new THREE.Group();
  scene.add(group);

  /* ---- Cérebro procedural: hemisférios + giros/sulcos + cerebelo + tronco ---- */
  const brain = new THREE.Group();
  group.add(brain);

  const N = mobile ? 5200 : 9000;
  const E = (cx, cy, cz, rx, ry, rz) => ({ c: new THREE.Vector3(cx, cy, cz), r: new THREE.Vector3(rx, ry, rz) });
  const hemiL = E(-0.43, 0.08, 0, 0.66, 0.92, 1.5);
  const hemiR = E(0.43, 0.08, 0, 0.66, 0.92, 1.5);
  const cereb = E(0, -0.6, -1.0, 0.8, 0.36, 0.5);
  const inE = (p, e, k = 1) => {
    const x = (p.x - e.c.x) / e.r.x, y = (p.y - e.c.y) / e.r.y, z = (p.z - e.c.z) / e.r.z;
    return x * x + y * y + z * z < k;
  };
  const onE = (e, u) => new THREE.Vector3(e.c.x + u.x * e.r.x, e.c.y + u.y * e.r.y, e.c.z + u.z * e.r.z);
  const normalE = (e, p) =>
    new THREE.Vector3((p.x - e.c.x) / e.r.x ** 2, (p.y - e.c.y) / e.r.y ** 2, (p.z - e.c.z) / e.r.z ** 2).normalize();
  const randDir = () => {
    const v = new THREE.Vector3();
    do v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    while (v.lengthSq() > 1 || v.lengthSq() < 1e-4);
    return v.normalize();
  };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // padrão de giros: as linhas onde ele cruza zero viram sulcos
  const gyri = (p) =>
    Math.sin(p.x * 6.5 + 2.2 * Math.sin(p.y * 4.3 + p.z * 2.9)) *
    Math.sin(p.z * 5.6 + 2.0 * Math.sin(p.x * 3.7 - p.y * 3.1)) *
    Math.sin(p.y * 6.1 + 1.7 * Math.sin(p.z * 4.4 + p.x * 2.3));

  const pts = [], crest = [];
  const nH = Math.floor(N * 0.82), nC = Math.floor(N * 0.12);

  // hemisférios (a face medial fica escondida pela fissura longitudinal)
  let guard = 0;
  while (pts.length < nH && guard++ < N * 30) {
    const e = Math.random() < 0.5 ? hemiL : hemiR;
    const other = e === hemiL ? hemiR : hemiL;
    const u = randDir();
    const p = onE(e, u);
    if (inE(p, other, 0.97) || inE(p, cereb)) continue;
    const n = normalE(e, p);
    const temporal = 0.28 * Math.exp(-((p.z - 0.25) ** 2) * 2.5) * Math.min(1, Math.abs(u.x) * 1.4);
    const floor = -0.42 - temporal;
    if (p.y < floor) p.y = floor + (p.y - floor) * 0.3;
    p.x *= 1 - 0.08 * Math.max(0, p.z);
    const depth = 1 - smooth(0, 0.22, Math.abs(gyri(p)));
    p.addScaledVector(n, -depth * 0.085);
    pts.push(p); crest.push(1 - depth);
  }
  // cerebelo com estrias finas
  guard = 0;
  while (pts.length < nH + nC && guard++ < N * 30) {
    const p = onE(cereb, randDir());
    if (inE(p, hemiL) || inE(p, hemiR)) continue;
    const n = normalE(cereb, p);
    const depth = 1 - smooth(0, 0.3, Math.abs(Math.sin(p.y * 40 + Math.sin(p.x * 3) * 2 + p.z * 6)));
    p.addScaledVector(n, -depth * 0.035);
    pts.push(p); crest.push(1 - depth * 0.8);
  }
  // tronco cerebral
  guard = 0;
  while (pts.length < N && guard++ < N * 30) {
    const t = Math.random();
    const rad = 0.2 - t * 0.06;
    const a = Math.random() * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * rad, -0.45 - t * 1.05, -0.45 - t * 0.35 + Math.sin(a) * rad * 0.9);
    if (inE(p, cereb) || inE(p, hemiL) || inE(p, hemiR)) continue;
    pts.push(p); crest.push(0.6 + Math.random() * 0.3);
  }

  // escala e centraliza
  const S = 1.2;
  const bb = new THREE.Box3();
  pts.forEach((p) => { p.multiplyScalar(S); bb.expandByPoint(p); });
  const ctr = bb.getCenter(new THREE.Vector3());
  pts.forEach((p) => p.sub(ctr));

  const NP = pts.length;
  const pos = new Float32Array(NP * 3);
  const rand = new Float32Array(NP);
  const aCrest = new Float32Array(NP);
  pts.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); rand[i] = Math.random(); aCrest[i] = crest[i]; });

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  pGeo.setAttribute("aCrest", new THREE.BufferAttribute(aCrest, 1));

  const pMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${waveGLSL}
      uniform float uSize; uniform float uPR;
      attribute float aRand; attribute float aCrest;
      varying float vGlow; varying float vMix;
      void main(){
        vec3 n = normalize(position);
        float w = wave(n);
        vec3 p = position + n * w * 0.018;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float pulse = pow(max(0.0, w), 7.0);
        float tw = 0.5 + 0.5 * sin(uTime * 2.3 + aRand * 60.0);
        vGlow = (0.22 + pulse * 1.0 + tw * 0.2) * (0.3 + 0.9 * aCrest);
        vMix = clamp(0.5 - position.z * 0.26 + (aRand - 0.5) * 0.3, 0.0, 1.0);
        gl_PointSize = uSize * uPR * (0.45 + aRand * 0.6 + pulse * 0.8) / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC1; uniform vec3 uC2; uniform float uAlpha;
      varying float vGlow; varying float vMix;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 1.7);
        vec3 col = mix(uC1, uC2, vMix);
        gl_FragColor = vec4(col * vGlow, a * vGlow * uAlpha);
      }`,
  });
  brain.add(new THREE.Points(pGeo, pMat));

  /* ---- Vizinhança via grade espacial (malha sináptica + grafo das vias) ---- */
  const maxD = mobile ? 0.17 : 0.13;
  const maxD2 = maxD * maxD;
  const cellKey = (x, y, z) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  const cellOf = (v) => Math.floor(v / maxD);
  const grid = new Map();
  pts.forEach((p, i) => {
    const k = cellKey(cellOf(p.x), cellOf(p.y), cellOf(p.z));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  });
  const adj = pts.map(() => []);
  pts.forEach((p, i) => {
    const cx = cellOf(p.x), cy = cellOf(p.y), cz = cellOf(p.z);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const j of list) {
            if (j <= i || p.distanceToSquared(pts[j]) > maxD2) continue;
            adj[i].push(j); adj[j].push(i);
          }
        }
  });

  const linePos = [];
  pts.forEach((p, i) => {
    let made = 0;
    for (const j of adj[i]) {
      if (j <= i || made >= 2 || Math.random() > 0.35) continue;
      const q = pts[j];
      linePos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      made++;
    }
  });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  const lMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${waveGLSL}
      varying float vGlow; varying float vMix;
      void main(){
        vec3 n = normalize(position);
        float w = wave(n);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + n * w * 0.018, 1.0);
        vGlow = 0.045 + pow(max(0.0, w), 5.0) * 0.3;
        vMix = clamp(0.5 - position.z * 0.26, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC1; uniform vec3 uC2; uniform float uAlpha;
      varying float vGlow; varying float vMix;
      void main(){ gl_FragColor = vec4(mix(uC1, uC2, vMix), vGlow * uAlpha); }`,
  });
  brain.add(new THREE.LineSegments(lGeo, lMat));

  /* ---- Vias neurais: caminhos pela superfície + fibras cruzando os hemisférios ---- */
  const paths = [];
  const nPaths = mobile ? 40 : 70;
  const tmp = new THREE.Vector3(), step = new THREE.Vector3();
  for (let k = 0; k < nPaths; k++) {
    let cur = Math.floor(Math.random() * nH);
    const dir = randDir();
    const path = [cur];
    const seen = new Set(path);
    const len = 28 + Math.floor(Math.random() * 50);
    for (let s = 0; s < len; s++) {
      let best = -1, bestScore = -Infinity;
      for (const j of adj[cur]) {
        if (seen.has(j)) continue;
        tmp.subVectors(pts[j], pts[cur]);
        const l = tmp.length();
        if (l < 0.04) continue;
        const score = tmp.dot(dir) / l + Math.random() * 0.6 + crest[j] * 0.3;
        if (score > bestScore) { bestScore = score; best = j; }
      }
      if (best < 0) break;
      step.subVectors(pts[best], pts[cur]).normalize();
      dir.lerp(step, 0.5).normalize();
      cur = best; path.push(cur); seen.add(cur);
    }
    if (path.length > 12) paths.push(path.map((i) => pts[i]));
  }
  // corpo caloso: fibras internas ligando os dois hemisférios
  const pickSide = (sign) => {
    for (let t = 0; t < 200; t++) {
      const p = pts[Math.floor(Math.random() * nH)];
      if (p.x * sign > 0.35 && p.y > -0.2) return p;
    }
    return pts[0];
  };
  const nInner = mobile ? 10 : 18;
  for (let k = 0; k < nInner; k++) {
    const a = pickSide(-1), b = pickSide(1);
    const c = new THREE.Vector3(0, Math.min(a.y, b.y) * 0.3 - 0.15, (a.z + b.z) / 2);
    paths.push(new THREE.QuadraticBezierCurve3(a, c, b).getPoints(40));
  }

  const vPos = [], vT = [], vSeed = [], vSpeed = [], vHue = [];
  const heads = [];
  paths.forEach((path) => {
    const seed = Math.random(), speed = 0.1 + Math.random() * 0.18, hue = Math.random();
    const last = path.length - 1;
    for (let s = 0; s < last; s++) {
      const a = path[s], b = path[s + 1];
      vPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      vT.push(s / last, (s + 1) / last);
      vSeed.push(seed, seed); vSpeed.push(speed, speed); vHue.push(hue, hue);
    }
    heads.push({ path, seed, speed, hue });
  });
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute("position", new THREE.Float32BufferAttribute(vPos, 3));
  vGeo.setAttribute("aT", new THREE.Float32BufferAttribute(vT, 1));
  vGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(vSeed, 1));
  vGeo.setAttribute("aSpeed", new THREE.Float32BufferAttribute(vSpeed, 1));
  vGeo.setAttribute("aHue", new THREE.Float32BufferAttribute(vHue, 1));

  const hueGLSL = /* glsl */ `
    uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
    vec3 hue(float h){ return h < 0.5 ? mix(uC1, uC2, h * 2.0) : mix(uC2, uC3, h * 2.0 - 1.0); }
  `;
  const vMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aT; attribute float aSeed; attribute float aSpeed; attribute float aHue;
      varying float vI; varying float vHue;
      void main(){
        float head = fract(uTime * aSpeed + aSeed) * 1.4 - 0.2;
        float d = head - aT;
        vI = 0.06 + (d < 0.0 ? 0.0 : exp(-d * 9.0) * 1.3);
        vHue = aHue;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${hueGLSL}
      uniform float uAlpha;
      varying float vI; varying float vHue;
      void main(){ gl_FragColor = vec4(hue(vHue) * vI, vI * uAlpha); }`,
  });
  brain.add(new THREE.LineSegments(vGeo, vMat));

  // cabeças dos impulsos (brilho que viaja pela via)
  const hPos = new Float32Array(heads.length * 3);
  const hAlpha = new Float32Array(heads.length);
  const hHue = new Float32Array(heads.map((h) => h.hue));
  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute("position", new THREE.BufferAttribute(hPos, 3));
  hGeo.setAttribute("aAlpha", new THREE.BufferAttribute(hAlpha, 1));
  hGeo.setAttribute("aHue", new THREE.BufferAttribute(hHue, 1));
  const hMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uSize; uniform float uPR;
      attribute float aAlpha; attribute float aHue;
      varying float vA; varying float vHue;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = aAlpha; vHue = aHue;
        gl_PointSize = uSize * uPR * 3.2 / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      ${hueGLSL}
      uniform float uAlpha;
      varying float vA; varying float vHue;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 2.2);
        vec3 col = mix(hue(vHue), vec3(1.0), 0.45 * a);
        gl_FragColor = vec4(col * a * 1.6, a * vA * uAlpha);
      }`,
  });
  const headPoints = new THREE.Points(hGeo, hMat);
  headPoints.frustumCulled = false;
  brain.add(headPoints);

  function updateHeads(time) {
    heads.forEach((h, k) => {
      const t = ((time * h.speed + h.seed) % 1) * 1.4 - 0.2;
      if (t < 0 || t > 1) { hAlpha[k] = 0; return; }
      const f = t * (h.path.length - 1);
      const i = Math.floor(f);
      const a = h.path[i], b = h.path[Math.min(i + 1, h.path.length - 1)];
      tmp.lerpVectors(a, b, f - i);
      hPos.set([tmp.x, tmp.y, tmp.z], k * 3);
      hAlpha[k] = Math.sin(t * Math.PI) * 0.9 + 0.1;
    });
    hGeo.attributes.position.needsUpdate = true;
    hGeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ---- Núcleo: brilho interno ---- */
  const coreMat = new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, "rgba(124,247,228,0.28)");
      grd.addColorStop(0.4, "rgba(96,165,250,0.1)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Sprite(coreMat);
  core.scale.set(5, 4.2, 1);
  group.add(core);

  /* ---- Campo de estrelas ---- */
  const sN = 900;
  const sPos = new Float32Array(sN * 3);
  for (let i = 0; i < sN; i++) {
    sPos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, -Math.random() * 25 - 3], i * 3);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(
    sGeo,
    new THREE.PointsMaterial({ size: 0.035, color: 0x9aa3c0, transparent: true, opacity: 0.55, depthWrite: false })
  );
  scene.add(stars);

  /* ---- Interação: mouse + scroll ---- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  });

  let scrollP = 0;
  const layout = () => {
    const m = innerWidth < 760;
    return {
      heroX: m ? 0 : innerWidth < 1100 ? 1.25 : 1.75,
      heroY: m ? 0.55 : 0,
      heroScale: m ? 0.78 : 1,
      alphaHero: m ? 0.55 : 1,
    };
  };
  let L = layout();
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(PR);
    renderer.setSize(innerWidth, innerHeight, false);
    L = layout();
  }
  resize();
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  const speed = reducedMotion ? 0.25 : 1;
  let intro = 0; // 0 → 1 quando o loader termina

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt * speed;

    const max = document.documentElement.scrollHeight - innerHeight;
    scrollP = max > 0 ? scrollY / max : 0;

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    // hero → fundo ambiente → centro no contato
    const t1 = clamp01(scrollP / 0.14);
    const t2 = clamp01((scrollP - 0.86) / 0.14);
    const tx = lerp(lerp(L.heroX, 0, t1), 0, t2);
    const ty = lerp(L.heroY, 0, t1) + t2 * 0.1;
    const ts = lerp(L.heroScale, 1.55, t1) * lerp(1, 0.72, t2) * lerp(0.6, 1, intro);
    uniforms.uAlpha.value = lerp(L.alphaHero, 0.9, t1) * intro;

    group.position.x += (tx - group.position.x) * 0.06;
    group.position.y += (ty - group.position.y) * 0.06;
    const s = group.scale.x + (ts - group.scale.x) * 0.06;
    group.scale.setScalar(s);

    // vista 3/4 lateral oscilando, para o cérebro ficar sempre reconhecível
    const tt = uniforms.uTime.value;
    brain.rotation.y = -1.0 + Math.sin(tt * 0.16) * 0.75 + scrollP * 2.4;
    brain.rotation.x = 0.18;
    group.rotation.x = lerp(group.rotation.x, mouse.y * 0.3, 0.05);
    group.rotation.y = lerp(group.rotation.y, mouse.x * 0.35, 0.05);
    updateHeads(tt);

    stars.position.x = -mouse.x * 0.4;
    stars.position.y = mouse.y * 0.3 + scrollP * 3;

    uniforms.uWaveDir.value.set(Math.sin(uniforms.uTime.value * 0.2), 0.8, Math.cos(uniforms.uTime.value * 0.2)).normalize();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  group.scale.setScalar(0.6);
  tick();

  return {
    reveal() {
      if (hasGSAP) gsap.to({ v: 0 }, { v: 1, duration: 2.2, ease: "expo.out", onUpdate() { intro = this.targets()[0].v; } });
      else intro = 1;
    },
  };
})();

/* =========================================================
   2. LOADER + INTRO DO HERO
   ========================================================= */
function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  for (const ch of text) {
    const s = document.createElement("span");
    s.className = "char";
    s.textContent = ch === " " ? " " : ch;
    el.appendChild(s);
  }
}
document.querySelectorAll(".split").forEach(splitChars);

function runLoader() {
  const loader = document.getElementById("loader");
  const count = document.getElementById("loaderCount");
  const bar = document.getElementById("loaderBar");

  const finish = () => {
    document.body.classList.remove("is-loading");
    scene3d?.reveal();
    if (!hasGSAP) { loader.remove(); return; }

    const tl = gsap.timeline();
    tl.to(loader, { yPercent: -100, duration: 1.1, ease: "expo.inOut" })
      .set(loader, { display: "none" })
      .from(".hero__title .char", { yPercent: 115, rotate: 8, duration: 1.3, stagger: 0.035, ease: "expo.out" }, "-=0.55")
      .to(".reveal-hero", { opacity: 1, y: 0, duration: 1, stagger: 0.12, ease: "power3.out" }, "-=1.0")
      .from(".nav", { y: -30, opacity: 0, duration: 0.9, ease: "power3.out" }, "-=0.9")
      .from(".hud, .hero__scroll", { opacity: 0, duration: 1 }, "-=0.6");
  };

  if (!hasGSAP) { finish(); return; }
  const o = { v: 0 };
  gsap.to(o, {
    v: 100,
    duration: reducedMotion ? 0.3 : 1.8,
    ease: "power2.inOut",
    onUpdate() {
      count.textContent = Math.round(o.v);
      bar.style.width = o.v + "%";
    },
    onComplete: finish,
  });
}
if (document.fonts?.ready) document.fonts.ready.then(runLoader); else runLoader();

/* =========================================================
   3. ANIMAÇÕES DE SCROLL
   ========================================================= */
if (hasGSAP) {
  ScrollTrigger.batch(".reveal", {
    start: "top 88%",
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: 0.1, ease: "power3.out" }),
  });

  // Contadores
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = +el.dataset.count;
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: "top 90%",
      once: true,
      onEnter: () => gsap.to(o, { v: end, duration: 2.2, ease: "power3.out", onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString("pt-BR")) }),
    });
  });

  // Linha de progresso do método
  gsap.to("#methodProgress", {
    width: "100%",
    ease: "none",
    scrollTrigger: { trigger: ".method__steps", start: "top 75%", end: "bottom 60%", scrub: true },
  });

  // Quote palavra por palavra
  const q = document.getElementById("quoteText");
  const frag = document.createDocumentFragment();
  q.childNodes.forEach((node) => {
    const isGrad = node.nodeType === 1;
    node.textContent.split(/(\s+)/).forEach((w) => {
      if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
      const s = document.createElement("span");
      s.className = "word" + (isGrad ? " grad-word" : "");
      s.textContent = w;
      frag.appendChild(s);
    });
  });
  q.textContent = "";
  q.appendChild(frag);
  gsap.to(q.querySelectorAll(".word"), {
    opacity: 1,
    stagger: 0.15,
    ease: "none",
    scrollTrigger: { trigger: ".quote", start: "top 70%", end: "center 45%", scrub: true },
  });

  // Parallax sutil nos títulos
  gsap.utils.toArray(".h2").forEach((h) => {
    gsap.fromTo(h, { x: -30 }, { x: 0, ease: "none", scrollTrigger: { trigger: h, start: "top bottom", end: "top 40%", scrub: true } });
  });
}

/* =========================================================
   4. TERMINAL "WHOAMI" DIGITANDO
   ========================================================= */
(() => {
  const el = document.getElementById("terminal");
  const lines = [
    [["p", "$ "], ["", "whoami"]],
    [["", "gabriel.amorim"]],
    [["p", "$ "], ["", "cat perfil.json"]],
    [["", "{"]],
    [["k", '  "cargo"'], ["", ": "], ["s", '"Suporte N1"'], ["", ","]],
    [["k", '  "empresa"'], ["", ": "], ["s", '"InnSpire.dev"'], ["", ","]],
    [["k", '  "erp"'], ["", ": "], ["s", '"TOTVS Protheus"'], ["", ","]],
    [["k", '  "stack"'], ["", ": ["], ["s", '"Web"'], ["", ", "], ["s", '"SQL"'], ["", ", "], ["s", '"Power BI"'], ["", "],"]],
    [["k", '  "graduando"'], ["", ": "], ["s", '"Psicologia · Unisul"'], ["", ","]],
    [["k", '  "superpoder"'], ["", ": "], ["s", '"traduzir erro em solução"']],
    [["", "}"]],
    [["p", "$ "], ["", "status --chamados"]],
    [["c", "✔ 145+ resolvidos · usuário satisfeito"]],
    [["p", "$ "]],
  ];
  const caret = document.createElement("span");
  caret.className = "caret";

  let started = false;
  async function type() {
    if (started) return;
    started = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));
    for (const line of lines) {
      const isCmd = line[0][0] === "p";
      for (const [cls, text] of line) {
        const span = document.createElement("span");
        if (cls) span.className = cls;
        el.appendChild(span);
        el.appendChild(caret);
        if (isCmd && cls !== "p") {
          for (const ch of text) { span.textContent += ch; await wait(45 + Math.random() * 60); }
        } else {
          span.textContent = text;
        }
      }
      await wait(isCmd ? 380 : 90);
      if (line !== lines[lines.length - 1]) el.insertBefore(document.createTextNode("\n"), caret);
    }
  }
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { type(); obs.disconnect(); }
  }, { threshold: 0.4 }).observe(el);
})();

/* =========================================================
   5. MICRO-INTERAÇÕES
   ========================================================= */
// Cursor
if (!isTouch) {
  const c = document.getElementById("cursor");
  const d = document.getElementById("cursorDot");
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  window.addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; });
  (function loop() {
    cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
    c.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll("a, button, [data-tilt]").forEach((el) => {
    el.addEventListener("pointerenter", () => c.classList.add("is-hover"));
    el.addEventListener("pointerleave", () => c.classList.remove("is-hover"));
  });
}

// Botões magnéticos
if (!isTouch && hasGSAP) {
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.5, ease: "power3.out" });
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)" }));
  });
}

// Tilt 3D nos cards
if (!isTouch && hasGSAP) {
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", px * 100 + "%");
      el.style.setProperty("--my", py * 100 + "%");
      gsap.to(el, { rotateY: (px - 0.5) * 12, rotateX: (0.5 - py) * 12, transformPerspective: 900, duration: 0.6, ease: "power3.out" });
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { rotateX: 0, rotateY: 0, duration: 1, ease: "power3.out" }));
  });
}

// Scramble no hover da nav
const glyphs = "!<>-_\\/[]{}—=+*^?#01";
document.querySelectorAll("[data-scramble]").forEach((el) => {
  const original = el.textContent;
  let raf;
  el.addEventListener("pointerenter", () => {
    let frame = 0;
    cancelAnimationFrame(raf);
    const run = () => {
      el.textContent = original.split("").map((ch, i) => (i < frame / 2 ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join("");
      frame++;
      if (frame / 2 <= original.length) raf = requestAnimationFrame(run);
      else el.textContent = original;
    };
    run();
  });
});

// Nav com fundo ao rolar
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => nav.classList.toggle("is-scrolled", scrollY > 40), { passive: true });

// Menu mobile
const burger = document.getElementById("burger");
const menu = document.getElementById("mobileMenu");
burger.addEventListener("click", () => {
  burger.classList.toggle("is-open");
  menu.classList.toggle("is-open");
});
menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { burger.classList.remove("is-open"); menu.classList.remove("is-open"); }));

// HUD: relógio + uptime
const start = Date.now();
const pad = (n) => String(n).padStart(2, "0");
setInterval(() => {
  const s = Math.floor((Date.now() - start) / 1000);
  document.getElementById("uptime").textContent = `${pad((s / 3600) | 0)}:${pad(((s / 60) | 0) % 60)}:${pad(s % 60)}`;
  document.getElementById("clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " BRT";
}, 1000);
document.getElementById("year").textContent = new Date().getFullYear();
