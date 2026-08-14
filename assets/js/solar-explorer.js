import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
  "use strict";

  const root = document.getElementById("solarSystem3D");
  const stageEl = root ? root.querySelector(".s3d-stage") : null;
  const canvas = document.getElementById("s3dCanvas");
  if (!root || !stageEl || !canvas || !window.SPACE || !Array.isArray(SPACE.planets) || !SPACE.sun) return;

  const tabsEl = document.getElementById("s3dTabs");
  const toggleRow = document.getElementById("s3dToggleRow");
  const speedRange = document.getElementById("s3dSpeedRange");
  const resetBtn = document.getElementById("s3dResetBtn");
  const fullscreenBtn = document.getElementById("s3dFullscreenBtn");
  const loadingEl = document.getElementById("s3dLoading");
  const tooltipEl = document.getElementById("s3dTooltip");
  if (!tabsEl || !toggleRow || !speedRange) return;

  const PLANETS = SPACE.planets;
  const SUN = SPACE.sun;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const MISSIONS = {
    mercurio: [
      { name: "MESSENGER", years: "2011–2015", url: "https://science.nasa.gov/mission/messenger/" },
      { name: "BepiColombo", years: "en curso", url: "https://science.nasa.gov/mission/bepicolombo/" },
    ],
    venus: [
      { name: "Magallanes", years: "1990–1994", url: "https://science.nasa.gov/mission/magellan/" },
    ],
    tierra: [
      { name: "Estación Espacial Internacional", years: "en órbita permanente", url: "https://www.nasa.gov/humans-in-space/international-space-station/" },
    ],
    marte: [
      { name: "Perseverance", years: "2021–presente", url: "https://mars.nasa.gov/mars2020/" },
      { name: "Curiosity", years: "2012–presente", url: "https://mars.nasa.gov/msl/" },
    ],
    jupiter: [{ name: "Juno", years: "2016–presente", url: "https://science.nasa.gov/mission/juno/" }],
    saturno: [{ name: "Cassini–Huygens", years: "2004–2017", url: "https://science.nasa.gov/mission/cassini/" }],
    urano: [{ name: "Voyager 2", years: "sobrevuelo 1986", url: "https://www.nasa.gov/mission/voyager-2/" }],
    neptuno: [{ name: "Voyager 2", years: "sobrevuelo 1989", url: "https://www.nasa.gov/mission/voyager-2/" }],
  };

  const TOGGLES = [
    { id: "orbits", label: "Órbitas", def: true },
    { id: "names", label: "Nombres", def: true },
    { id: "asteroids", label: "Asteroides", def: false },
    { id: "kuiper", label: "Kuiper", def: false },
    { id: "habitable", label: "Habitable", def: false },
    { id: "missions", label: "Misiones", def: false },
  ];
  const SPEED_MULT = [0, 0.35, 1, 2.2, 4];
  const BASE_RATE = 0.32;
  const DIST_POWER = 0.62;
  const WORLD_MAX_R = 46;

  const state = {
    speedIndex: reduceMotion ? 0 : 2,
    focus: null,
    layers: Object.fromEntries(TOGGLES.map((t) => [t.id, t.def])),
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function buildTabs() {
    const items = [`<button type="button" class="s3d-tab is-active" data-planet="" role="tab" aria-selected="true">Vista general</button>`].concat(
      PLANETS.map(
        (p) =>
          `<button type="button" class="s3d-tab" data-planet="${p.id}" role="tab" aria-selected="false"><span class="s3d-tab-dot" style="background:${p.color}" aria-hidden="true"></span>${esc(p.name)}</button>`
      )
    );
    tabsEl.innerHTML = items.join("");
  }
  function toggleMarkup(t) {
    return `<button type="button" class="s3d-toggle${state.layers[t.id] ? " is-active" : ""}" data-toggle="${t.id}" aria-pressed="${state.layers[t.id]}"><span class="s3d-toggle-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3"/></svg></span>${t.label}</button>`;
  }
  function buildToggles() {
    toggleRow.innerHTML = TOGGLES.map(toggleMarkup).join("");
  }
  buildTabs();
  buildToggles();
  if (reduceMotion) speedRange.value = "0";

  // ---- procedural texture generation (mercurio, venus, marte, jupiter, saturno, urano, neptuno, sol) ----
  function hash2(x, y, seed) {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function noise2(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed, octaves) {
    let total = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise2(x * freq, y * freq, seed + i * 17) * amp;
      max += amp;
      amp *= 0.52;
      freq *= 2.05;
    }
    return total / max;
  }
  function hexToRgb(hex) {
    const c = hex.replace("#", "");
    const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function lightenRgb(rgb, amt) {
    return rgb.map((c) => Math.max(0, Math.min(255, c + amt)));
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function paintPixels(ctx, w, h, painter) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const i = (y * w + x) * 4;
        const rgb = painter(u, v, x, y);
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function rockyTexture(baseHex, seed, craterCount, banding) {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    const base = hexToRgb(baseHex);
    paintPixels(ctx, w, h, (u, v, x, y) => {
      const n = fbm(x * 0.02, y * 0.02, seed, 5);
      const band = banding ? Math.sin(v * Math.PI * banding.count + n * banding.warp) * banding.strength : 0;
      const t = n * 0.5 + band;
      return t >= 0 ? lightenRgb(base, t * 70) : lightenRgb(base, t * 90);
    });
    ctx.globalCompositeOperation = "source-atop";
    const rnd = (() => {
      let s = seed * 9301 + 49297;
      return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    })();
    for (let i = 0; i < craterCount; i++) {
      const cx = rnd() * w, cy = rnd() * h, r = 4 + rnd() * 16;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(0,0,0,.28)");
      g.addColorStop(0.7, "rgba(0,0,0,.12)");
      g.addColorStop(0.85, "rgba(255,255,255,.1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    return c;
  }

  function bandedTexture(bandColors, seed, spotHex) {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    paintPixels(ctx, w, h, (u, v) => {
      const warp = fbm(u * 6, v * 22, seed, 4) * 0.16;
      const lat = Math.min(0.999, Math.max(0, v + warp));
      const bandPos = lat * (bandColors.length - 1);
      const i0 = Math.floor(bandPos);
      const i1 = Math.min(bandColors.length - 1, i0 + 1);
      const t = bandPos - i0;
      const turbulence = fbm(u * 10 + 4, v * 40, seed + 5, 3) * 0.22;
      return mixRgb(bandColors[i0], bandColors[i1], Math.min(1, Math.max(0, t + turbulence)));
    });
    if (spotHex) {
      const sx = w * 0.32, sy = h * 0.58, rx = w * 0.09, ry = h * 0.075;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
      g.addColorStop(0, spotHex);
      g.addColorStop(0.75, spotHex + "cc");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1, ry / rx);
      ctx.translate(-sx, -sy);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return c;
  }

  function sunTexture() {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    const cold = [255, 138, 24], hot = [255, 240, 176];
    paintPixels(ctx, w, h, (u, v, x, y) => {
      const n = fbm(x * 0.06, y * 0.06, 3, 5);
      const flare = fbm(x * 0.18, y * 0.18, 11, 3);
      const t = Math.min(1, Math.max(0, n * 0.6 + flare * 0.4 + 0.4));
      return mixRgb(cold, hot, t);
    });
    return c;
  }

  function ringTextureRGBA() {
    const w = 4, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const base = hexToRgb("#E9D8A6");
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const n = noise2(v * 50, 2, 21);
      const gapA = Math.abs(v - 0.4) < 0.035 ? 0.1 : 1;
      const gapB = Math.abs(v - 0.72) < 0.018 ? 0.2 : 1;
      const edgeFade = Math.min(1, Math.min(v, 1 - v) * 9);
      const alpha = Math.max(0, Math.min(1, (0.3 + n * 0.55) * gapA * gapB * edgeFade)) * 255;
      const rgb = lightenRgb(base, (n - 0.5) * 50);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function canvasToTexture(c, srgb) {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function buildProceduralTextures() {
    const gasBands = {
      jupiter: [
        hexToRgb("#C9A06B"), hexToRgb("#E8D2AE"), hexToRgb("#B97A4E"), hexToRgb("#E3B583"),
        hexToRgb("#8C5A38"), hexToRgb("#E8D2AE"), hexToRgb("#C9A06B"),
      ],
      saturno: [
        hexToRgb("#E9D8A6"), hexToRgb("#F2E7C4"), hexToRgb("#D8C185"), hexToRgb("#F2E7C4"), hexToRgb("#E9D8A6"),
      ],
      urano: [hexToRgb("#8FD6D4"), hexToRgb("#9FE0DE"), hexToRgb("#B7EAE8"), hexToRgb("#9FE0DE")],
      neptuno: [hexToRgb("#3F53C9"), hexToRgb("#5E72E4"), hexToRgb("#7C8CEB"), hexToRgb("#5E72E4"), hexToRgb("#3F53C9")],
    };
    return {
      mercurio: canvasToTexture(rockyTexture("#B7B0C9", 2, 90), true),
      venus: canvasToTexture(rockyTexture("#E7C08C", 6, 0, { count: 5, warp: 8, strength: 0.14 }), true),
      marte: canvasToTexture(rockyTexture("#E2643B", 9, 55), true),
      jupiter: canvasToTexture(bandedTexture(gasBands.jupiter, 14, "#C9583A"), true),
      saturno: canvasToTexture(bandedTexture(gasBands.saturno, 18, null), true),
      urano: canvasToTexture(bandedTexture(gasBands.urano, 23, null), true),
      neptuno: canvasToTexture(bandedTexture(gasBands.neptuno, 27, null), true),
      sol: canvasToTexture(sunTexture(), true),
      anillo: canvasToTexture(ringTextureRGBA(), true),
    };
  }

  // ---- three.js scene ----
  let renderer, scene, camera, controls;
  let sunMesh, sunGlow;
  let starPoints, asteroidPoints, kuiperPoints, habitableRing;
  const orbitLines = [];
  const planetMeshes = {};
  const cloudMeshes = {};
  const missionMarkers = {};
  const labelEls = {};
  let raf = null, lastT = 0, ready = false, io = null;
  const angles = {};
  PLANETS.forEach((p, i) => {
    angles[p.id] = (i / PLANETS.length) * Math.PI * 2;
  });
  const maxDistancePow = Math.pow(Math.max.apply(null, PLANETS.map((p) => p.distance3d)), DIST_POWER);
  function orbitRadius(p) {
    return 0.16 * WORLD_MAX_R + (Math.pow(p.distance3d, DIST_POWER) / maxDistancePow) * 0.84 * WORLD_MAX_R;
  }
  function planetWorldRadius(p) {
    return THREE.MathUtils.clamp(Math.sqrt(p.radius3d) * 0.85, 0.55, 3.2);
  }

  function initScene() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 3000);
    camera.position.set(0, 30, 68);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.94;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0x1a1830, 0.55));
    const sunLight = new THREE.PointLight(0xfff2d8, 320, 0, 2);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    TEXTURES.dot = dotSpriteTexture();
    buildStarfield();
    buildSun();
    buildOrbits();
    buildBelts();
    buildHabitableZone();
    buildPlanets();

    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerleave", () => hideTooltip());

    resize();
  }

  function dotSpriteTexture() {
    const c = makeCanvas(32, 32);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return canvasToTexture(c, false);
  }

  function buildStarfield() {
    const count = 5200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 300 + Math.random() * 500;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, map: TEXTURES.dot, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
    starPoints = new THREE.Points(geo, mat);
    scene.add(starPoints);
  }

  function glowSpriteTexture() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,244,214,.9)");
    g.addColorStop(0.25, "rgba(255,200,110,.55)");
    g.addColorStop(0.6, "rgba(255,140,60,.16)");
    g.addColorStop(1, "rgba(255,110,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return canvasToTexture(c, true);
  }

  function buildSun() {
    const geo = new THREE.SphereGeometry(3.1, 48, 32);
    const tex = TEXTURES.sol;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    sunMesh = new THREE.Mesh(geo, mat);
    scene.add(sunMesh);

    const spriteMat = new THREE.SpriteMaterial({ map: glowSpriteTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    sunGlow = new THREE.Sprite(spriteMat);
    sunGlow.scale.set(20, 20, 1);
    scene.add(sunGlow);
  }

  function buildOrbits() {
    PLANETS.forEach((p) => {
      const r = orbitRadius(p);
      const points = [];
      const segs = 128;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 });
      const line = new THREE.LineLoop(geo, mat);
      line.userData.planetId = p.id;
      scene.add(line);
      orbitLines.push(line);
    });
  }

  function beltPoints(rIn, rOut, count, color, size) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rIn + Math.random() * (rOut - rIn);
      const y = (Math.random() - 0.5) * (rOut - rIn) * 0.045;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: TEXTURES.dot, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false });
    return new THREE.Points(geo, mat);
  }

  function buildBelts() {
    const mars = PLANETS.find((p) => p.id === "marte"), jup = PLANETS.find((p) => p.id === "jupiter");
    if (mars && jup) {
      asteroidPoints = beltPoints(orbitRadius(mars) + 2.4, orbitRadius(jup) - 3.2, 1400, 0xc4baa4, 0.11);
      asteroidPoints.visible = state.layers.asteroids;
      scene.add(asteroidPoints);
    }
    const nep = PLANETS.find((p) => p.id === "neptuno");
    if (nep) {
      kuiperPoints = beltPoints(orbitRadius(nep) + 2.6, WORLD_MAX_R + 4, 1100, 0x9fe0de, 0.13);
      kuiperPoints.visible = state.layers.kuiper;
      scene.add(kuiperPoints);
    }
  }

  function buildHabitableZone() {
    const earth = PLANETS.find((p) => p.id === "tierra");
    if (!earth) return;
    const rE = orbitRadius(earth);
    const geo = new THREE.RingGeometry(rE * 0.86, rE * 1.1, 96);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x78dc96, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    habitableRing = new THREE.Mesh(geo, mat);
    habitableRing.visible = state.layers.habitable;
    scene.add(habitableRing);
  }

  function missionMarkerTexture() {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext("2d");
    ctx.translate(32, 32);
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    return canvasToTexture(c, false);
  }

  function buildPlanets() {
    const markerTex = missionMarkerTexture();
    PLANETS.forEach((p) => {
      const group = new THREE.Group();
      const pr = planetWorldRadius(p);
      const geo = new THREE.SphereGeometry(pr, 48, 32);
      const tex = TEXTURES[p.id];
      let mat;
      if (p.id === "tierra") {
        mat = new THREE.MeshStandardMaterial({ map: tex, normalMap: TEXTURES.tierraNormal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85, metalness: 0.05 });
      } else {
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.z = p.tilt3d || 0;
      mesh.userData.planetId = p.id;
      group.add(mesh);
      planetMeshes[p.id] = mesh;

      if (p.id === "tierra") {
        const cloudGeo = new THREE.SphereGeometry(pr * 1.015, 48, 32);
        const cloudMat = new THREE.MeshStandardMaterial({ map: TEXTURES.tierraClouds, transparent: true, opacity: 0.75, depthWrite: false, roughness: 1 });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        cloudMesh.rotation.z = p.tilt3d || 0;
        group.add(cloudMesh);
        cloudMeshes[p.id] = cloudMesh;

        const moonGroup = new THREE.Group();
        const moonMat = new THREE.MeshStandardMaterial({ map: TEXTURES.luna, roughness: 1 });
        const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(pr * 0.27, 24, 18), moonMat);
        moonMesh.position.set(pr * 2.6, 0, 0);
        moonGroup.add(moonMesh);
        group.add(moonGroup);
        group.userData.moonGroup = moonGroup;
      }

      if (p.ring) {
        const ringGeo = new THREE.RingGeometry(pr * 1.35, pr * 2.35, 96, 1);
        const ringMat = new THREE.MeshBasicMaterial({ map: TEXTURES.anillo, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2 - 0.42;
        group.add(ringMesh);
      }

      if (MISSIONS[p.id]) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, transparent: true, depthWrite: false, sizeAttenuation: true }));
        sprite.scale.set(1.1, 1.1, 1);
        sprite.position.set(pr * 1.35, pr * 0.95, 0);
        sprite.visible = state.layers.missions;
        sprite.userData.planetId = p.id;
        group.add(sprite);
        missionMarkers[p.id] = sprite;
      }

      scene.add(group);
      group.userData.mesh = mesh;
      p._group = group;

      const el = document.createElement("div");
      el.className = "s3d-planet-label";
      el.innerHTML = `<button type="button" data-planet="${p.id}" aria-label="Ver datos de ${esc(p.name)}"></button><span class="s3d-planet-name">${esc(p.name)}</span>`;
      stageEl.appendChild(el);
      labelEls[p.id] = el;
    });
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  function ndcFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function pickPlanet(e) {
    ndcFromEvent(e);
    raycaster.setFromCamera(pointerNdc, camera);
    const meshes = Object.values(planetMeshes).concat([sunMesh]);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object : null;
  }
  function onPointerDown(e) {
    const obj = pickPlanet(e);
    if (!obj) return;
    const id = obj.userData.planetId;
    if (id) {
      const labelBtn = labelEls[id] && labelEls[id].querySelector("button");
      setFocus(id);
      if (window.openPlanetPanel) window.openPlanetPanel(id, labelBtn || canvas);
    } else if (obj === sunMesh) {
      focusSun();
    }
  }
  function onPointerMove(e) {
    const obj = pickPlanet(e);
    if (!obj || !tooltipEl) {
      hideTooltip();
      return;
    }
    const id = obj.userData.planetId;
    const name = id ? (PLANETS.find((p) => p.id === id) || {}).name : SUN.name;
    if (!name) {
      hideTooltip();
      return;
    }
    const rect = stageEl.getBoundingClientRect();
    tooltipEl.textContent = name;
    tooltipEl.style.display = "block";
    tooltipEl.style.left = e.clientX - rect.left + "px";
    tooltipEl.style.top = e.clientY - rect.top + "px";
    canvas.style.cursor = "pointer";
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
    canvas.style.cursor = "";
  }

  function setFocus(planetId) {
    state.focus = planetId || null;
    tabsEl.querySelectorAll(".s3d-tab").forEach((b) => {
      const active = (b.dataset.planet || null) === state.focus;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    });
    Object.entries(labelEls).forEach(([id, el]) => {
      el.classList.toggle("is-dim", !!state.focus && state.focus !== id);
    });
    if (!ready) return;
    if (state.focus) {
      const p = PLANETS.find((pp) => pp.id === state.focus);
      if (p && p._group) {
        const pr = planetWorldRadius(p);
        const dist = Math.max(7, pr * 7);
        const mult = SPEED_MULT[state.speedIndex];
        const futureAngle = angles[p.id] + camAnim.dur * mult * p.speed3d * BASE_RATE;
        const r = orbitRadius(p);
        const targetPos = new THREE.Vector3(Math.cos(futureAngle) * r, 0, Math.sin(futureAngle) * r);
        const sunward = targetPos.clone().negate().normalize();
        const viewDir = sunward.add(new THREE.Vector3(0, 0.4, 0)).normalize();
        startCameraTransition(targetPos.clone().add(viewDir.multiplyScalar(dist)), targetPos);
      }
    } else {
      resetCamera();
    }
  }
  function focusSun() {
    setFocus(null);
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".s3d-tab");
    if (!btn) return;
    setFocus(btn.dataset.planet || null);
  });
  toggleRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".s3d-toggle");
    if (!btn) return;
    const id = btn.dataset.toggle;
    state.layers[id] = !state.layers[id];
    btn.classList.toggle("is-active", state.layers[id]);
    btn.setAttribute("aria-pressed", String(state.layers[id]));
    applyLayerVisibility();
  });
  function applyLayerVisibility() {
    if (asteroidPoints) asteroidPoints.visible = state.layers.asteroids;
    if (kuiperPoints) kuiperPoints.visible = state.layers.kuiper;
    if (habitableRing) habitableRing.visible = state.layers.habitable;
    orbitLines.forEach((l) => (l.visible = state.layers.orbits));
    Object.values(missionMarkers).forEach((m) => (m.visible = state.layers.missions));
    Object.values(labelEls).forEach((el) => {
      const nameEl = el.querySelector(".s3d-planet-name");
      if (nameEl) nameEl.style.display = state.layers.names ? "" : "none";
    });
  }
  speedRange.addEventListener("input", () => {
    state.speedIndex = +speedRange.value;
  });
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.speedIndex = reduceMotion ? 0 : 2;
      speedRange.value = String(state.speedIndex);
      setFocus(null);
      TOGGLES.forEach((t) => (state.layers[t.id] = t.def));
      buildToggles();
      applyLayerVisibility();
      if (ready) resetCamera();
    });
  }
  if (fullscreenBtn) {
    if (!document.fullscreenEnabled) {
      fullscreenBtn.hidden = true;
    } else {
      fullscreenBtn.addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else root.requestFullscreen().catch(() => {});
      });
      document.addEventListener("fullscreenchange", () => {
        root.classList.toggle("is-fullscreen", !!document.fullscreenElement);
        resize();
      });
    }
  }

  const CAMERA_DEFAULT = { pos: new THREE.Vector3(0, 30, 68), target: new THREE.Vector3(0, 0, 0) };
  const camAnim = { active: false, startTime: 0, dur: 1.1, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3() };
  function startCameraTransition(toPos, toTarget) {
    camAnim.fromPos.copy(camera.position);
    camAnim.fromTarget.copy(controls.target);
    camAnim.toPos.copy(toPos);
    camAnim.toTarget.copy(toTarget);
    camAnim.startTime = performance.now();
    camAnim.active = true;
  }
  function resetCamera() {
    startCameraTransition(CAMERA_DEFAULT.pos, CAMERA_DEFAULT.target);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function currentPlanetTarget(id) {
    const p = PLANETS.find((pp) => pp.id === id);
    if (!p || !p._group) return null;
    return p._group.position;
  }

  const TEXTURES = {};
  const loader = new THREE.TextureLoader();
  function loadTex(path) {
    return new Promise((resolve) => {
      loader.load(
        path,
        (tex) => resolve(tex),
        undefined,
        () => resolve(null)
      );
    });
  }

  async function loadRealTextures() {
    const base = "assets/textures/solar/";
    const [earthDay, earthNormal, clouds, moon] = await Promise.all([
      loadTex(base + "earth_atmos_2048.jpg"),
      loadTex(base + "earth_normal_2048.jpg"),
      loadTex(base + "earth_clouds_1024.png"),
      loadTex(base + "moon_1024.jpg"),
    ]);
    if (earthDay) earthDay.colorSpace = THREE.SRGBColorSpace;
    if (clouds) clouds.colorSpace = THREE.SRGBColorSpace;
    if (moon) moon.colorSpace = THREE.SRGBColorSpace;
    TEXTURES.tierra = earthDay || proceduralFallback("#5AA9E6");
    TEXTURES.tierraNormal = earthNormal || null;
    TEXTURES.tierraClouds = clouds || proceduralFallback("#ffffff");
    TEXTURES.luna = moon || proceduralFallback("#B7B0C9");
  }
  function proceduralFallback(hex) {
    return canvasToTexture(rockyTexture(hex, 1, 40), true);
  }

  let initPromise = null;
  function ensureInit() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        Object.assign(TEXTURES, buildProceduralTextures());
        await loadRealTextures();
        initScene();
        ready = true;
        if (loadingEl) loadingEl.classList.add("is-hidden");
        draw(true);
        startLoop();
        observeVisibility();
      } catch (err) {
        if (loadingEl) {
          loadingEl.classList.add("is-error");
          loadingEl.textContent = "No se pudo cargar el explorador 3D en este navegador.";
        }
        console.error("[Cósmica] solar-explorer", err);
      }
    })();
    return initPromise;
  }

  function resize() {
    if (!renderer) return;
    const rect = stageEl.getBoundingClientRect();
    const w = Math.max(rect.width, 1), h = Math.max(rect.height, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function updateLabels() {
    const rect = stageEl.getBoundingClientRect();
    PLANETS.forEach((p) => {
      const el = labelEls[p.id];
      if (!el || !p._group) return;
      const v = p._group.position.clone().project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      el.style.display = behind ? "none" : "flex";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
  }

  function draw(force) {
    if (!ready) return;
    PLANETS.forEach((p) => {
      const r = orbitRadius(p);
      const a = angles[p.id];
      if (p._group) p._group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const mesh = planetMeshes[p.id];
      if (mesh && !force) mesh.rotation.y += 0.0035 * (p.id === "venus" ? -0.4 : 1);
      const cloud = cloudMeshes[p.id];
      if (cloud && !force) cloud.rotation.y += 0.0016;
      if (p._group && p._group.userData.moonGroup && !force) p._group.userData.moonGroup.rotation.y += 0.01;
    });
    if (camAnim.active) {
      const elapsed = (performance.now() - camAnim.startTime) / 1000;
      const t = Math.min(1, elapsed / camAnim.dur);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
      controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, e);
      if (t >= 1) camAnim.active = false;
    } else if (state.focus) {
      const t = currentPlanetTarget(state.focus);
      if (t) {
        const smoothed = controls.target.clone().lerp(t, 0.15);
        const delta = smoothed.clone().sub(controls.target);
        controls.target.copy(smoothed);
        camera.position.add(delta);
      }
    }
    controls.update();
    camera.updateMatrixWorld();
    updateLabels();
    renderer.render(scene, camera);
  }

  function frame(t) {
    if (!lastT) lastT = t;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    const mult = SPEED_MULT[state.speedIndex];
    if (mult > 0) {
      PLANETS.forEach((p) => {
        angles[p.id] += dt * mult * p.speed3d * BASE_RATE;
      });
    }
    draw(false);
    raf = requestAnimationFrame(frame);
  }
  function startLoop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  stageEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-planet]");
    if (!btn || !btn.dataset.planet) return;
    setFocus(btn.dataset.planet);
    if (window.openPlanetPanel) window.openPlanetPanel(btn.dataset.planet, btn);
  });

  window.addEventListener("resize", resize);

  function observeVisibility() {
    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.target !== stageEl) return;
          if (en.isIntersecting) {
            if (!raf && !reduceMotion) {
              lastT = 0;
              raf = requestAnimationFrame(frame);
            }
          } else if (raf) {
            cancelAnimationFrame(raf);
            raf = null;
          }
        });
      },
      { threshold: 0.05 }
    );
    io.observe(stageEl);
  }

  function lazyInit() {
    if ("IntersectionObserver" in window) {
      const trigger = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              trigger.disconnect();
              ensureInit();
            }
          });
        },
        { rootMargin: "400px 0px" }
      );
      trigger.observe(root);
    } else {
      ensureInit();
    }
  }

  PLANETS.forEach((p) => {
    if (MISSIONS[p.id]) p.missions = MISSIONS[p.id];
  });

  lazyInit();
})();
