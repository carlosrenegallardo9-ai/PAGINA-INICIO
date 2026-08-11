import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Galaxy.js
// Builds the whole "flying through the Milky Way" backdrop: a deep static
// skybox of stars, a galactic band of dense stars, drifting nebula clouds,
// distant/near planets that appear procedurally along the flight path, and
// a foreground "stardust" particle system that streaks past to sell speed.
// Everything is generated procedurally on <canvas> textures — no binary
// assets are shipped with the repo.
// ---------------------------------------------------------------------------

const FORWARD = -1; // ship travels toward -Z

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeGlowSprite(size, colorInner, colorOuter) {
  return canvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, colorInner);
    g.addColorStop(0.4, colorOuter);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// A tight, hard-cored point texture for stars/dust — unlike makeGlowSprite's
// wide soft falloff (meant for big nebula clouds), this keeps a crisp bright
// center so thousands of overlapping points read as pinpricks of light
// instead of blurring together into a uniform haze.
function makeStarSprite() {
  return canvasTexture(32, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function makePlanetTexture(baseHue, seed) {
  return canvasTexture(256, (ctx, s) => {
    let rnd = seed;
    const rand = () => {
      rnd = (rnd * 9301 + 49297) % 233280;
      return rnd / 233280;
    };
    // base gradient
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, `hsl(${baseHue}, 60%, ${28 + rand() * 12}%)`);
    g.addColorStop(0.5, `hsl(${baseHue + 15}, 55%, ${40 + rand() * 14}%)`);
    g.addColorStop(1, `hsl(${baseHue - 10}, 50%, ${20 + rand() * 10}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // banding
    for (let i = 0; i < 10; i++) {
      const y = rand() * s;
      const h = 4 + rand() * 18;
      ctx.fillStyle = `hsla(${baseHue + rand() * 40 - 20}, 50%, ${30 + rand() * 30}%, ${0.15 + rand() * 0.25})`;
      ctx.fillRect(0, y, s, h);
    }
    // craters / spots
    for (let i = 0; i < 40; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const r = 2 + rand() * 10;
      ctx.fillStyle = `hsla(${baseHue}, 40%, ${10 + rand() * 20}%, ${0.2 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeRingTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(220,200,170,0.55)');
    g.addColorStop(0.55, 'rgba(180,150,120,0.15)');
    g.addColorStop(0.75, 'rgba(220,200,170,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export class Galaxy {
  constructor(scene) {
    this.scene = scene;
    this.planets = [];
    this.nebulae = [];
    this._planetSeed = 1;
    this._nextPlanetZ = -200;
    this._nextNebulaZ = -100;

    this._starTexture = makeStarSprite();
    this._buildDeepSky();
    this._buildGalacticBand();
    this._buildStardust();
    this._ringTexture = makeRingTexture();

    for (let i = 0; i < 2; i++) this._spawnNebula(-300 - i * 700);
    for (let i = 0; i < 4; i++) this._spawnPlanet(-150 - i * 400);
  }

  // Huge static sphere of far background stars — the deep galaxy backdrop.
  _buildDeepSky() {
    const count = 9000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      [1, 1, 1], [0.7, 0.85, 1], [1, 0.85, 0.7], [0.75, 0.95, 1], [1, 0.7, 0.9],
    ];
    for (let i = 0; i < count; i++) {
      const r = 3800 + Math.random() * 1800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = palette[(Math.random() * palette.length) | 0];
      const brightness = 0.5 + Math.random() * 0.5;
      colors[i * 3] = c[0] * brightness;
      colors[i * 3 + 1] = c[1] * brightness;
      colors[i * 3 + 2] = c[2] * brightness;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 11,
      map: this._starTexture,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: false, // fixed screen-space size so distant stars stay crisp pinpricks, not attenuated to nothing
      blending: THREE.AdditiveBlending,
      fog: false, // the deep backdrop must stay visible at any flight distance
    });
    this.deepSky = new THREE.Points(geo, mat);
    this.scene.add(this.deepSky);
  }

  // A denser, flattened disk of stars representing the Milky Way's own
  // galactic plane, tilted so it reads as a huge diagonal band in the sky.
  _buildGalacticBand() {
    const count = 14000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.pow(Math.random(), 0.5) * 3200;
      const theta = Math.random() * Math.PI * 2;
      const thickness = (Math.random() - 0.5) * 220 * (1 - r / 3600);
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = thickness;
      positions[i * 3 + 2] = Math.sin(theta) * r;
      const t = Math.random();
      const warm = t < 0.5;
      const brightness = 0.4 + Math.random() * 0.6;
      if (warm) {
        colors[i * 3] = 0.85 * brightness;
        colors[i * 3 + 1] = 0.8 * brightness;
        colors[i * 3 + 2] = 1.0 * brightness;
      } else {
        colors[i * 3] = 1.0 * brightness;
        colors[i * 3 + 1] = 0.9 * brightness;
        colors[i * 3 + 2] = 0.75 * brightness;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 6,
      map: this._starTexture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.band = new THREE.Points(geo, mat);
    this.band.rotation.set(0.55, 0.3, 0.9);
    this.scene.add(this.band);
  }

  // Foreground fast-moving dust particles that stream past the ship,
  // recycled in a ring buffer around the ship's Z position for infinite flight.
  _buildStardust() {
    this.dustCount = 700;
    this.dustRange = 260;
    const positions = new Float32Array(this.dustCount * 3);
    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 2] = -Math.random() * this.dustRange;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 5,
      map: this._starTexture,
      color: 0xbfefff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
    this._dustBasePositions = positions;
  }

  _spawnNebula(z) {
    const hueSets = [
      ['rgba(0,246,255,0.55)', 'rgba(0,120,255,0)'],
      ['rgba(255,46,151,0.5)', 'rgba(150,0,120,0)'],
      ['rgba(177,77,255,0.5)', 'rgba(80,0,160,0)'],
      ['rgba(55,255,139,0.35)', 'rgba(0,120,80,0)'],
    ];
    const set = hueSets[(Math.random() * hueSets.length) | 0];
    const tex = makeGlowSprite(512, set[0], set[1]);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      // Kept deliberately subtle — these are big soft sprites, and a handful
      // of them at high opacity stacks into a hazy screen-filling wash
      // rather than reading as distant colored clouds.
      opacity: 0.18 + Math.random() * 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 700 + Math.random() * 900;
    let nx = (Math.random() - 0.5) * 2600;
    let ny = (Math.random() - 0.5) * 1200;
    // Keep clouds off the flight corridor so they never sit right in front
    // of the camera and blot out the view.
    const minDist = scale * 0.35 + 160;
    const d = Math.hypot(nx, ny) || 1;
    if (d < minDist) {
      const s = minDist / d;
      nx *= s;
      ny *= s;
    }
    sprite.position.set(nx, ny, z);
    this.scene.add(sprite);
    this.nebulae.push(sprite);
  }

  _spawnPlanet(z) {
    this._planetSeed += 7919;
    const rand = () => {
      this._planetSeed = (this._planetSeed * 9301 + 49297) % 233280;
      return this._planetSeed / 233280;
    };
    const radius = 40 + rand() * 140;
    const hue = Math.floor(rand() * 360);
    const geo = new THREE.SphereGeometry(radius, 48, 48);
    const mat = new THREE.MeshStandardMaterial({
      map: makePlanetTexture(hue, this._planetSeed),
      roughness: 0.95,
      metalness: 0.05,
      emissive: new THREE.Color(`hsl(${hue}, 60%, 12%)`),
      emissiveIntensity: 0.35,
    });
    // Keep planets clear of the player's narrow flight corridor (X in
    // [-42,42], Y in [-26,26]) — push any that would land too close out
    // radially so the ship/camera can never end up inside a planet mesh.
    let px = (Math.random() - 0.5) * 2200;
    let py = (Math.random() - 0.5) * 900 - 60;
    const minDist = radius + 140;
    const dist = Math.hypot(px, py) || 1;
    if (dist < minDist) {
      const scale = minDist / dist;
      px *= scale;
      py *= scale;
    }

    const planet = new THREE.Mesh(geo, mat);
    planet.position.set(px, py, z);
    planet.userData.spin = (Math.random() - 0.5) * 0.08;
    this.scene.add(planet);
    this.planets.push(planet);

    // ~1 in 3 planets get a ring for visual variety.
    if (rand() < 0.33) {
      const ringGeo = new THREE.RingGeometry(radius * 1.5, radius * 2.4, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        map: this._ringTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      ring.rotation.z = Math.random() * Math.PI;
      planet.add(ring);
    }

    // Small chance of a glowing star/sun instead-of/alongside a planet look.
    if (rand() < 0.12) {
      mat.emissiveIntensity = 1.4;
      mat.emissive = new THREE.Color(`hsl(${hue}, 90%, 55%)`);
      const light = new THREE.PointLight(mat.emissive.getHex(), 2.2, radius * 40);
      planet.add(light);
    }
  }

  // Called every frame with the ship's world Z (negative, decreasing as it flies)
  update(dt, shipZ) {
    // Spawn new planets/nebulae ahead of the ship as it advances.
    while (this._nextPlanetZ > shipZ - 1600) {
      this._spawnPlanet(this._nextPlanetZ);
      this._nextPlanetZ -= 380 + Math.random() * 500;
    }
    while (this._nextNebulaZ > shipZ - 1200) {
      this._spawnNebula(this._nextNebulaZ);
      this._nextNebulaZ -= 550 + Math.random() * 500;
    }

    // Despawn planets/nebulae well behind the ship.
    this.planets = this.planets.filter((p) => {
      p.rotation.y += p.userData.spin * dt;
      if (p.position.z > shipZ + 400) {
        this.scene.remove(p);
        p.geometry.dispose();
        return false;
      }
      return true;
    });
    this.nebulae = this.nebulae.filter((n) => {
      if (n.position.z > shipZ + 600) {
        this.scene.remove(n);
        return false;
      }
      return true;
    });

    // Recycle stardust particles around the ship for an endless streak effect.
    // Ship flies toward -Z, so a particle has been "passed" once its Z is
    // behind (greater than) the ship's Z; recycle it back out ahead.
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < this.dustCount; i++) {
      const z = pos.getZ(i);
      if (z > shipZ + this.dustRange * 0.15) {
        pos.setX(i, (Math.random() - 0.5) * 140);
        pos.setY(i, (Math.random() - 0.5) * 140);
        pos.setZ(i, shipZ - this.dustRange);
      }
    }
    pos.needsUpdate = true;

    // parallax the deep sky / band very slightly for depth cue
    this.deepSky.position.z = shipZ * 0.02;
    this.band.position.z = shipZ * 0.05;
  }

  dispose() {
    [this.deepSky, this.band, this.dust].forEach((o) => {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    });
    this.planets.forEach((p) => this.scene.remove(p));
    this.nebulae.forEach((n) => this.scene.remove(n));
  }
}
