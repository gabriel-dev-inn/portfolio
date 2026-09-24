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
    uSize: { value: mobile ? 34 : 42 },
    uPR: { value: PR },
    uAlpha: { value: 1 },
    uC1: { value: new THREE.Color("#7cf7e4") },
    uC2: { value: new THREE.Color("#a78bfa") },
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

  /* ---- Geração dos nós (sphere fibonacci + deformação orgânica) ---- */
  const N = mobile ? 1400 : 2200;
  const pos = new Float32Array(N * 3);
  const rand = new Float32Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = [];

  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    let x = Math.cos(th) * r, z = Math.sin(th) * r;
    // deformação: formato levemente "cerebral" (dois hemisférios + sulcos)
    const n =
      0.1 * Math.sin(x * 4.0 + y * 2.0) +
      0.07 * Math.sin(y * 7.0 + z * 3.0) +
      0.05 * Math.sin(z * 9.0 + x * 5.0);
    const fissure = 1 - 0.1 * Math.exp(-x * x * 40) * (y > -0.3 ? 1 : 0);
    const R = 1.85 * (1 + n) * fissure;
    const p = new THREE.Vector3(x * R * 1.12, y * R * 0.92, z * R);
    // jitter
    p.x += (Math.random() - 0.5) * 0.06;
    p.y += (Math.random() - 0.5) * 0.06;
    p.z += (Math.random() - 0.5) * 0.06;
    pts.push(p);
    pos.set([p.x, p.y, p.z], i * 3);
    rand[i] = Math.random();
  }

  const group = new THREE.Group();
  scene.add(group);

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));

  const pMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${waveGLSL}
      uniform float uSize; uniform float uPR;
      attribute float aRand;
      varying float vGlow; varying float vMix;
      void main(){
        vec3 n = normalize(position);
        float w = wave(n);
        vec3 p = position + n * w * 0.045;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float pulse = pow(max(0.0, w), 7.0);
        float tw = 0.5 + 0.5 * sin(uTime * 2.3 + aRand * 60.0);
        vGlow = 0.28 + pulse * 1.1 + tw * 0.22;
        vMix = clamp(n.x * 0.55 + 0.5 + (aRand - 0.5) * 0.35, 0.0, 1.0);
        gl_PointSize = uSize * uPR * (0.45 + aRand * 0.7 + pulse * 0.9) / -mv.z;
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
  group.add(new THREE.Points(pGeo, pMat));

  /* ---- Sinapses: linhas entre vizinhos próximos ---- */
  const linePos = [];
  const lineRand = [];
  const maxD = mobile ? 0.36 : 0.3;
  const maxD2 = maxD * maxD;
  const conn = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (conn[i] >= 3) continue;
    for (let j = i + 1; j < N; j++) {
      if (conn[i] >= 3) break;
      if (conn[j] >= 3) continue;
      if (pts[i].distanceToSquared(pts[j]) < maxD2 && Math.random() < 0.55) {
        linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        const r = Math.random();
        lineRand.push(r, r);
        conn[i]++; conn[j]++;
      }
    }
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  lGeo.setAttribute("aRand", new THREE.Float32BufferAttribute(lineRand, 1));
  const lMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${waveGLSL}
      attribute float aRand;
      varying float vGlow; varying float vMix;
      void main(){
        vec3 n = normalize(position);
        float w = wave(n);
        vec3 p = position + n * w * 0.045;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vGlow = 0.07 + pow(max(0.0, w), 5.0) * 0.55;
        vMix = clamp(n.x * 0.55 + 0.5, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC1; uniform vec3 uC2; uniform float uAlpha;
      varying float vGlow; varying float vMix;
      void main(){
        gl_FragColor = vec4(mix(uC1, uC2, vMix), vGlow * uAlpha);
      }`,
  });
  group.add(new THREE.LineSegments(lGeo, lMat));

  /* ---- Núcleo: brilho interno ---- */
  const coreMat = new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, "rgba(124,247,228,0.35)");
      grd.addColorStop(0.4, "rgba(96,165,250,0.12)");
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
  core.scale.set(5.5, 5.5, 1);
  group.add(core);

  /* ---- Anel orbital: "chamados" orbitando ---- */
  const ringN = 520;
  const ringPos = new Float32Array(ringN * 3);
  const ringRand = new Float32Array(ringN);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    const r = 2.9 + (Math.random() - 0.5) * 0.35;
    ringPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.08, Math.sin(a) * r], i * 3);
    ringRand[i] = Math.random();
  }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
  rGeo.setAttribute("aRand", new THREE.BufferAttribute(ringRand, 1));
  const rMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSize; uniform float uPR;
      attribute float aRand; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * 1.5 + aRand * 30.0), 3.0);
        gl_PointSize = uSize * 0.5 * uPR * (0.4 + aRand) / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a * vA * 0.7 * uAlpha);
      }`,
  });
  const ring = new THREE.Points(rGeo, rMat);
  ring.rotation.set(1.15, 0, 0.35);
  group.add(ring);

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
      heroX: m ? 0 : innerWidth < 1100 ? 1.3 : 1.95,
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

    group.rotation.y += dt * 0.12 * speed;
    group.rotation.x = lerp(group.rotation.x, mouse.y * 0.35 + scrollP * 1.2, 0.05);
    group.rotation.z = lerp(group.rotation.z, -mouse.x * 0.2, 0.05);
    ring.rotation.y += dt * 0.25 * speed;

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

  // Marquee acelera com o scroll
  const track = document.querySelector(".marquee__track");
  ScrollTrigger.create({
    trigger: ".marquee",
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => {
      const v = Math.min(Math.abs(self.getVelocity()) / 1000, 3);
      track.style.animationDuration = 38 / (1 + v) + "s";
    },
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
