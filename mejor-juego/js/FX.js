import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

// ---------------------------------------------------------------------------
// FX
// All particle-based visual effects: meteor explosions, hit sparks, muzzle
// flashes, shockwaves for big kills, and continuous engine thruster trails.
// Every effect type is backed by a pool of pre-allocated geometries/sprites
// so gameplay never triggers a fresh allocation.
// ---------------------------------------------------------------------------

function glowTexture(colorInner, colorOuter) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, colorInner);
  g.addColorStop(0.5, colorOuter);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const BURST_PARTICLES = 20;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this._sparkTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,180,80,0.6)');
    this._flashTex = glowTexture('rgba(255,255,255,1)', 'rgba(120,220,255,0.4)');
    this._smokeTex = glowTexture('rgba(200,200,200,0.9)', 'rgba(80,80,80,0)');

    this._initBurstPool();
    this._initMuzzlePool();
    this._initShockwavePool();
    this._initThrusters();
  }

  _initBurstPool() {
    this.burstPool = new ObjectPool(
      () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_PARTICLES * 3), 3));
        const mat = new THREE.PointsMaterial({
          size: 1.4,
          map: this._sparkTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: false,
        });
        const points = new THREE.Points(geo, mat);
        points.visible = false;
        points.frustumCulled = false;
        this.scene.add(points);
        return {
          points,
          velocities: new Array(BURST_PARTICLES).fill(0).map(() => new THREE.Vector3()),
          life: 0,
          maxLife: 1,
        };
      },
      (b) => {
        b.points.visible = false;
      },
      16
    );
  }

  _initMuzzlePool() {
    this.muzzlePool = new ObjectPool(
      () => {
        const mat = new THREE.SpriteMaterial({ map: this._flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        this.scene.add(sprite);
        return { sprite, life: 0 };
      },
      (m) => {
        m.sprite.visible = false;
      },
      10
    );
  }

  _initShockwavePool() {
    this.shockwavePool = new ObjectPool(
      () => {
        const geo = new THREE.RingGeometry(1, 1.25, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        return { mesh, life: 0, maxRadius: 12 };
      },
      (s) => {
        s.mesh.visible = false;
      },
      6
    );
  }

  _initThrusters() {
    const count = 240;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const ages = new Float32Array(count).fill(999);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9,
      map: this._flashTex,
      color: 0x66e0ff,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.thrusterPoints = new THREE.Points(geo, mat);
    this.thrusterPoints.frustumCulled = false;
    this.scene.add(this.thrusterPoints);
    this._thrusterCount = count;
    this._thrusterAges = ages;
    this._thrusterCursor = 0;
    this._thrusterSpawnAccum = 0;
  }

  explode(position, size = 'medium') {
    const b = this.burstPool.acquire();
    const scale = size === 'large' ? 2.2 : size === 'medium' ? 1.4 : 0.8;
    b.points.position.copy(position);
    b.points.visible = true;
    b.points.material.size = 1.2 * scale;
    b.life = b.maxLife = 0.55 + scale * 0.25;
    const pos = b.points.geometry.attributes.position;
    for (let i = 0; i < BURST_PARTICLES; i++) {
      pos.setXYZ(i, 0, 0, 0);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      b.velocities[i].copy(dir).multiplyScalar((6 + Math.random() * 10) * scale);
    }
    pos.needsUpdate = true;
  }

  hitSpark(position) {
    const b = this.burstPool.acquire();
    b.points.position.copy(position);
    b.points.visible = true;
    b.points.material.size = 0.6;
    b.life = b.maxLife = 0.2;
    const pos = b.points.geometry.attributes.position;
    for (let i = 0; i < BURST_PARTICLES; i++) {
      pos.setXYZ(i, 0, 0, 0);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      b.velocities[i].copy(dir).multiplyScalar(4 + Math.random() * 4);
    }
    pos.needsUpdate = true;
  }

  muzzleFlash(position) {
    const m = this.muzzlePool.acquire();
    m.sprite.position.copy(position);
    m.sprite.visible = true;
    m.sprite.scale.set(1.4, 1.4, 1);
    m.life = 0.08;
    this.scene.add(m.sprite);
  }

  shockwave(position, maxRadius = 12) {
    const s = this.shockwavePool.acquire();
    s.mesh.position.copy(position);
    s.mesh.scale.setScalar(0.6);
    s.mesh.visible = true;
    s.mesh.material.opacity = 0.85;
    s.life = 0.5;
    s.maxRadius = maxRadius;
  }

  // Called once per frame per engine anchor to emit thruster particles.
  emitThruster(position, intensity) {
    this._thrusterSpawnAccum += intensity;
    const pos = this.thrusterPoints.geometry.attributes.position;
    while (this._thrusterSpawnAccum > 1) {
      this._thrusterSpawnAccum -= 1;
      const i = this._thrusterCursor;
      this._thrusterCursor = (this._thrusterCursor + 1) % this._thrusterCount;
      pos.setXYZ(i, position.x + (Math.random() - 0.5) * 0.15, position.y + (Math.random() - 0.5) * 0.15, position.z);
      this._thrusterAges[i] = 0;
    }
  }

  update(dt) {
    // bursts
    this.burstPool.forEachActive((b) => {
      b.life -= dt;
      if (b.life <= 0) {
        this.burstPool.release(b);
        return;
      }
      const pos = b.points.geometry.attributes.position;
      for (let i = 0; i < BURST_PARTICLES; i++) {
        pos.setX(i, pos.getX(i) + b.velocities[i].x * dt);
        pos.setY(i, pos.getY(i) + b.velocities[i].y * dt);
        pos.setZ(i, pos.getZ(i) + b.velocities[i].z * dt);
        b.velocities[i].multiplyScalar(1 - Math.min(1, dt * 1.5));
      }
      pos.needsUpdate = true;
      b.points.material.opacity = Math.max(0, b.life / b.maxLife);
    });

    // muzzle flashes
    this.muzzlePool.forEachActive((m) => {
      m.life -= dt;
      if (m.life <= 0) {
        this.muzzlePool.release(m);
        return;
      }
      m.sprite.material.opacity = Math.max(0, m.life / 0.08);
      m.sprite.scale.multiplyScalar(1 + dt * 4);
    });

    // shockwaves
    this.shockwavePool.forEachActive((s) => {
      s.life -= dt;
      if (s.life <= 0) {
        this.shockwavePool.release(s);
        return;
      }
      const t = 1 - s.life / 0.5;
      s.mesh.scale.setScalar(0.6 + t * s.maxRadius);
      s.mesh.material.opacity = 0.85 * (1 - t);
      s.mesh.lookAt(s.mesh.position.clone().add(new THREE.Vector3(0, 0, 1)));
    });

    // thruster particles: age out & fade via per-vertex culling trick
    const ages = this._thrusterAges;
    const pos = this.thrusterPoints.geometry.attributes.position;
    for (let i = 0; i < this._thrusterCount; i++) {
      if (ages[i] > 0.4) continue;
      ages[i] += dt;
      pos.setZ(i, pos.getZ(i) + 14 * dt);
      if (ages[i] > 0.4) pos.setY(i, 9999); // park far away, effectively invisible
    }
    pos.needsUpdate = true;
  }

  dispose() {
    [this.thrusterPoints].forEach((o) => this.scene.remove(o));
  }
}
