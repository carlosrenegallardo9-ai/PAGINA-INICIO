import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

// ---------------------------------------------------------------------------
// MeteorSpawner
// Procedurally spawns low-poly deformed-rock meteors ahead of the ship,
// handles their drift/rotation, collisions against player projectiles and
// the ship itself, large->medium fragmentation on destruction, and pooling.
// ---------------------------------------------------------------------------

const SIZES = {
  large: { radius: 5.2, hp: 3, points: 150, rotSpeed: 0.4, driftSpeed: 2.5, color: 0x6b5a4d },
  medium: { radius: 2.6, hp: 2, points: 75, rotSpeed: 0.9, driftSpeed: 5, color: 0x7a6a5c },
  small: { radius: 1.1, hp: 1, points: 30, rotSpeed: 1.8, driftSpeed: 9, color: 0x8a7a6c },
};

function makeRockGeometry(radius, seed) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  let rnd = seed;
  const rand = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const displacement = 1 + (rand() - 0.5) * 0.45;
    v.copy(n.multiplyScalar(radius * displacement));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class MeteorSpawner {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this._seed = 1;
    this._spawnTimer = 0;
    this.spawnInterval = 0.85;
    this.speedMultiplier = 1;

    // Scratch vectors reused every frame by the swept collision test to
    // avoid per-frame allocation.
    this._prevPos = new THREE.Vector3();
    this._segDir = new THREE.Vector3();
    this._toCenter = new THREE.Vector3();
    this._closest = new THREE.Vector3();

    const sharedMats = {};
    for (const key of Object.keys(SIZES)) {
      sharedMats[key] = new THREE.MeshStandardMaterial({
        color: SIZES[key].color,
        flatShading: true,
        roughness: 0.95,
        metalness: 0.05,
        emissive: 0x1a0f08,
        emissiveIntensity: 0.15,
      });
    }
    this._mats = sharedMats;

    this.pool = new ObjectPool(
      () => {
        const mesh = new THREE.Mesh(makeRockGeometry(1, 1), sharedMats.small);
        mesh.visible = false;
        scene.add(mesh);
        return {
          mesh,
          size: 'small',
          hp: 1,
          radius: 1,
          points: 0,
          rotAxis: new THREE.Vector3(1, 0, 0),
          rotSpeed: 0,
          drift: new THREE.Vector3(),
        };
      },
      (m) => {
        m.mesh.visible = false;
      },
      60
    );
  }

  _nextSeed() {
    this._seed = (this._seed * 9301 + 49297) % 233280;
    return this._seed;
  }

  spawn(sizeKey, position, initialVelocity = null) {
    const def = SIZES[sizeKey];
    const m = this.pool.acquire();
    m.mesh.geometry.dispose();
    m.mesh.geometry = makeRockGeometry(def.radius, this._nextSeed());
    m.mesh.material = this._mats[sizeKey];
    m.mesh.position.copy(position);
    m.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.mesh.visible = true;
    m.size = sizeKey;
    m.hp = def.hp;
    m.radius = def.radius;
    m.points = def.points;
    m.rotAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    m.rotSpeed = def.rotSpeed * (0.6 + Math.random() * 0.8);
    if (initialVelocity) {
      m.drift.copy(initialVelocity);
    } else {
      m.drift.set(
        (Math.random() - 0.5) * def.driftSpeed,
        (Math.random() - 0.5) * def.driftSpeed,
        (Math.random() - 0.5) * def.driftSpeed * 0.3
      );
    }
    return m;
  }

  _spawnAhead(shipPos) {
    const roll = Math.random();
    const sizeKey = roll < 0.18 ? 'large' : roll < 0.55 ? 'medium' : 'small';
    const pos = new THREE.Vector3(
      shipPos.x + (Math.random() - 0.5) * 70,
      shipPos.y + (Math.random() - 0.5) * 42,
      shipPos.z - (140 + Math.random() * 120)
    );
    this.spawn(sizeKey, pos);
  }

  _destroy(m, awardPoints, killedBySelf) {
    const pos = m.mesh.position.clone();
    const size = m.size;
    this.fx?.explode(pos, size);
    this.audio?.playExplosion(size === 'small' ? 'small' : size === 'medium' ? 'small' : 'big');
    if (awardPoints) awardPoints(m.points, size);

    if (size === 'large') {
      for (let i = 0; i < 2; i++) {
        const offset = new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2);
        const spawnPos = pos.clone().add(offset);
        const vel = offset.clone().normalize().multiplyScalar(6 + Math.random() * 4);
        this.spawn('medium', spawnPos, vel);
      }
      if (killedBySelf) this.fx?.shockwave(pos, 12);
    }
    this.pool.release(m);
  }

  update(dt, player, weaponPool, callbacks = {}) {
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnAhead(player.group.position);
      this._spawnTimer = this.spawnInterval / this.speedMultiplier;
    }

    const shipPos = player.group.position;
    const shipRadius = 1.6;

    this.pool.forEachActive((m) => {
      m.mesh.rotateOnAxis(m.rotAxis, m.rotSpeed * dt);
      m.mesh.position.addScaledVector(m.drift, dt);
    });

    // Projectile <-> meteor collisions. Projectiles travel ~250+ units/sec,
    // easily covering more distance in one frame than a meteor's radius —
    // a plain end-of-frame distance check would let them tunnel straight
    // through, so instead we test the swept segment from each projectile's
    // previous position to its current one against the meteor's sphere.
    if (weaponPool) {
      weaponPool.forEachActive((p) => {
        if (!p.mesh.visible) return;
        this._prevPos.copy(p.mesh.position).addScaledVector(p.velocity, -dt);
        this._segDir.subVectors(p.mesh.position, this._prevPos);
        const segLenSq = this._segDir.lengthSq();
        this.pool.forEachActive((m) => {
          if (!m.mesh.visible || p.life <= 0) return;
          let closestDistSq;
          if (segLenSq < 1e-6) {
            closestDistSq = p.mesh.position.distanceToSquared(m.mesh.position);
          } else {
            let t = this._toCenter.subVectors(m.mesh.position, this._prevPos).dot(this._segDir) / segLenSq;
            t = Math.max(0, Math.min(1, t));
            this._closest.copy(this._prevPos).addScaledVector(this._segDir, t);
            closestDistSq = this._closest.distanceToSquared(m.mesh.position);
          }
          const hitDist = m.radius + p.radius;
          if (closestDistSq < hitDist * hitDist) {
            p.life = 0;
            p.mesh.visible = false;
            m.hp -= 1;
            this.fx?.hitSpark(p.mesh.position);
            if (m.hp <= 0) {
              this._destroy(m, callbacks.onKill, true);
            }
          }
        });
      });
      weaponPool.forEachActive((p) => {
        if (p.life <= 0) weaponPool.release(p);
      });
    }

    // Ship <-> meteor collisions
    if (player.alive && player.invulnerable <= 0) {
      this.pool.forEachActive((m) => {
        if (!m.mesh.visible) return;
        const dist = shipPos.distanceTo(m.mesh.position);
        if (dist < shipRadius + m.radius) {
          const dmg = m.size === 'large' ? 45 : m.size === 'medium' ? 25 : 12;
          player.takeDamage(dmg);
          this.fx?.hitSpark(m.mesh.position);
          this.audio?.playHit();
          if (callbacks.onPlayerHit) callbacks.onPlayerHit();
          this._destroy(m, null, false);
        }
      });
    }

    // Despawn meteors far behind the ship
    this.pool.forEachActive((m) => {
      if (m.mesh.position.z > shipPos.z + 60) {
        this.pool.release(m);
      }
    });
  }

  setDifficulty(spawnMultiplier, speedMultiplier) {
    this.speedMultiplier = speedMultiplier;
  }

  reset() {
    this.pool.releaseAll();
    this._spawnTimer = 0.4;
    this.spawnInterval = 0.85;
  }
}
