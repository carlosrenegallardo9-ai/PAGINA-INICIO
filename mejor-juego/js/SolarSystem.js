import * as THREE from 'three';
import { canvasTexture } from './Galaxy.js';

// ---------------------------------------------------------------------------
// SolarSystem.js
// The player starts at Earth and flies an ordered tour of the solar system:
// Earth -> Moon -> Mercury -> Venus -> Mars -> (asteroid belt) -> Jupiter ->
// Saturn -> Uranus -> Neptune. Unlike Galaxy.js's endless random backdrop,
// these bodies are a fixed, hand-tuned sequence so each one is recognizable
// and the HUD can tell the player what's coming up next.
// ---------------------------------------------------------------------------

function ringTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(225,205,175,0.6)');
    g.addColorStop(0.5, 'rgba(190,165,130,0.2)');
    g.addColorStop(0.65, 'rgba(225,205,175,0.5)');
    g.addColorStop(0.8, 'rgba(200,175,140,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function craterTexture(size, baseHsl, darkHsl, craterCount, seedIn) {
  return canvasTexture(size, (ctx, s) => {
    let seed = seedIn;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    ctx.fillStyle = baseHsl;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < craterCount; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const r = 2 + rand() * (size * 0.05);
      ctx.fillStyle = darkHsl.replace('ALPHA', String(0.15 + rand() * 0.25));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function bandedTexture(size, bands, seedIn) {
  return canvasTexture(size, (ctx, s) => {
    let seed = seedIn;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const g = ctx.createLinearGradient(0, 0, 0, s);
    bands.forEach((b, i) => g.addColorStop(i / (bands.length - 1), b));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // subtle turbulent streaks along the bands
    for (let i = 0; i < 26; i++) {
      const y = rand() * s;
      const h = 2 + rand() * 6;
      const band = bands[(rand() * bands.length) | 0];
      ctx.globalAlpha = 0.12 + rand() * 0.15;
      ctx.fillStyle = band;
      ctx.fillRect(0, y, s, h);
    }
    ctx.globalAlpha = 1;
  });
}

function earthTexture() {
  return canvasTexture(256, (ctx, s) => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    ctx.fillStyle = '#1c4f8f';
    ctx.fillRect(0, 0, s, s);
    // continents
    for (let i = 0; i < 9; i++) {
      const cx = rand() * s;
      const cy = rand() * s;
      ctx.fillStyle = rand() < 0.5 ? '#2f8f4e' : '#3f7a3a';
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.6) {
        const rr = (14 + rand() * 20);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr * 0.7;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // cloud swirls
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 16; i++) {
      const cx = rand() * s;
      const cy = rand() * s;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 10 + rand() * 22, 4 + rand() * 8, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // poles
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, s, s * 0.06);
    ctx.fillRect(0, s * 0.94, s, s * 0.06);
  });
}

function marsTexture() {
  return canvasTexture(256, (ctx, s) => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#b6501f');
    g.addColorStop(0.5, '#c9622a');
    g.addColorStop(1, '#8f3d18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.fillStyle = `rgba(90,40,15,${0.15 + rand() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + rand() * 16, 3 + rand() * 8, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 0, s, s * 0.05);
    ctx.fillRect(0, s * 0.95, s, s * 0.05);
  });
}

const BODY_DEFS = [
  {
    name: 'Tierra', z: -60, radius: 46, y: -18,
    build: () => earthTexture(),
    emissive: 0x0a2a4a, emissiveIntensity: 0.5,
  },
  {
    name: 'Luna', z: -520, radius: 13, y: -6,
    build: () => craterTexture(128, '#9a9a9a', 'hsla(0,0%,20%,ALPHA)', 60, 101),
    emissive: 0x1a1a1a, emissiveIntensity: 0.3,
  },
  {
    name: 'Mercurio', z: -1400, radius: 18, y: 10,
    build: () => craterTexture(128, '#8a7d6e', 'hsla(25,20%,25%,ALPHA)', 70, 211),
    emissive: 0x1a140f, emissiveIntensity: 0.3,
  },
  {
    name: 'Venus', z: -2500, radius: 34, y: -14,
    build: () => bandedTexture(128, ['#e8c98a', '#f0d9a0', '#dcb877', '#f2e0ae'], 333),
    emissive: 0x3a2f14, emissiveIntensity: 0.4,
  },
  {
    name: 'Marte', z: -3700, radius: 24, y: 12,
    build: () => marsTexture(),
    emissive: 0x3a1505, emissiveIntensity: 0.45,
  },
  {
    name: 'Júpiter', z: -6200, radius: 150, y: -30,
    build: () => bandedTexture(256, ['#d8b691', '#e8dcc0', '#c9945f', '#e0c79a', '#b97b4a', '#ecdcb8'], 555),
    emissive: 0x2a1c0e, emissiveIntensity: 0.35,
    redSpot: true,
  },
  {
    name: 'Saturno', z: -8700, radius: 128, y: 28,
    build: () => bandedTexture(256, ['#e8dcb0', '#f2e9c9', '#dccb96', '#efe2ba'], 777),
    emissive: 0x2a2412, emissiveIntensity: 0.35,
    rings: true,
  },
  {
    name: 'Urano', z: -11000, radius: 68, y: -20,
    build: () => bandedTexture(128, ['#a8e4e0', '#bdf0ec', '#9fd8d4'], 999),
    emissive: 0x0f2a28, emissiveIntensity: 0.4,
  },
  {
    name: 'Neptuno', z: -13300, radius: 64, y: 16,
    build: () => bandedTexture(128, ['#2f4fd0', '#3c60e0', '#2540a8', '#3855c8'], 1234),
    emissive: 0x0d1a4a, emissiveIntensity: 0.45,
  },
];

const LATERAL_OFFSET_SIGN = [1, -1, 1, -1, 1, -1, 1, -1, 1];

export class SolarSystem {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this._ringTexture = ringTexture();
    this._nextIndex = 0;
    this._spawnLookahead = 2200;
    this.currentTargetIndex = 0;
    this.finished = false;

    // The very first body (Earth) is placed immediately so the player
    // starts right next to home.
    this._trySpawnNext(0);
  }

  _trySpawnNext(shipZ) {
    while (this._nextIndex < BODY_DEFS.length && BODY_DEFS[this._nextIndex].z > shipZ - this._spawnLookahead) {
      this._spawnBody(BODY_DEFS[this._nextIndex]);
      this._nextIndex++;
    }
  }

  _spawnBody(def) {
    const geo = new THREE.SphereGeometry(def.radius, 48, 48);
    const mat = new THREE.MeshStandardMaterial({
      map: def.build(),
      roughness: 0.9,
      metalness: 0.05,
      emissive: new THREE.Color(def.emissive),
      emissiveIntensity: def.emissiveIntensity,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Alternate which side of the flight corridor each body sits on so the
    // tour reads as a deliberate flyby, always just clear of the ship path.
    const sign = LATERAL_OFFSET_SIGN[this.bodies.length % LATERAL_OFFSET_SIGN.length];
    const lateral = def.radius * 0.55 + 95;
    mesh.position.set(sign * lateral, def.y, def.z);
    mesh.userData.spin = 0.03 + Math.random() * 0.03;
    this.scene.add(mesh);

    if (def.rings) {
      const ringGeo = new THREE.RingGeometry(def.radius * 1.5, def.radius * 2.3, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        map: this._ringTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.9,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + 0.4;
      mesh.add(ring);
    }

    if (def.redSpot) {
      const spotGeo = new THREE.CircleGeometry(def.radius * 0.16, 24);
      const spotMat = new THREE.MeshBasicMaterial({ color: 0xc1512f, transparent: true, opacity: 0.75 });
      const spot = new THREE.Mesh(spotGeo, spotMat);
      spot.position.set(0, -def.radius * 0.15, def.radius * 0.995);
      mesh.add(spot);
    }

    this.bodies.push({ mesh, def, passed: false, arrivalAwarded: false });
  }

  /** Distance from asteroid belt (between Mars and Jupiter) used to spike meteor density. */
  isInAsteroidBelt(shipZ) {
    const mars = BODY_DEFS.find((b) => b.name === 'Marte');
    const jupiter = BODY_DEFS.find((b) => b.name === 'Júpiter');
    return shipZ < mars.z - 300 && shipZ > jupiter.z + 600;
  }

  /** Info for the HUD: the next body ahead and how far to it. */
  getNextTarget(shipZ) {
    const next = BODY_DEFS.find((b) => b.z < shipZ);
    if (!next) return null;
    return { name: next.name, distance: Math.max(0, shipZ - next.z) };
  }

  update(dt, shipZ, onArrive) {
    this._trySpawnNext(shipZ);

    for (const b of this.bodies) {
      b.mesh.rotation.y += b.mesh.userData.spin * dt;
      if (!b.arrivalAwarded && shipZ < b.def.z + 40) {
        b.arrivalAwarded = true;
        onArrive?.(b.def.name, this.bodies.indexOf(b));
      }
    }

    if (!this.finished && this._nextIndex >= BODY_DEFS.length) {
      const last = BODY_DEFS[BODY_DEFS.length - 1];
      if (shipZ < last.z - 300) this.finished = true;
    }
  }

  reset() {
    this.bodies.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    });
    this.bodies = [];
    this._nextIndex = 0;
    this.finished = false;
    this._trySpawnNext(0);
  }

  dispose() {
    this.bodies.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    });
  }
}
