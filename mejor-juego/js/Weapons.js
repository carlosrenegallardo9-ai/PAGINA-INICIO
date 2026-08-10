import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

// ---------------------------------------------------------------------------
// WeaponSystem
// Dual laser cannons with cooldown + overheat, backed by an object pool of
// projectile meshes so firing never allocates during gameplay.
// ---------------------------------------------------------------------------

const FIRE_INTERVAL = 0.11; // seconds between shots per trigger-hold
const PROJECTILE_SPEED = 210;
const PROJECTILE_LIFE = 2.2;
const HEAT_PER_SHOT = 0.09;
const HEAT_COOL_RATE = 0.32;
const OVERHEAT_LOCK_TIME = 1.4;

export class WeaponSystem {
  constructor(scene, player, audio, fx) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.fx = fx;

    this.heat = 0;
    this.overheated = false;
    this._overheatTimer = 0;
    this._cooldown = 0;
    this._cannonIndex = 0;
    this.autoFire = true;

    const geo = new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x66ffe0, toneMapped: false });

    this.pool = new ObjectPool(
      () => {
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.visible = false;
        const light = new THREE.PointLight(0x55ffe6, 0.8, 5);
        mesh.add(light);
        scene.add(mesh);
        return { mesh, velocity: new THREE.Vector3(), life: 0, radius: 0.9, damage: 12 };
      },
      (p) => {
        p.mesh.visible = false;
        p.life = 0;
      },
      40
    );
  }

  get wantsToFire() {
    if (this.autoFire) {
      return this.player.input.isDown('Space') || this.player.input.mouse.down;
    }
    return this.player.input.wasJustPressed('Space');
  }

  update(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    if (this.overheated) {
      this._overheatTimer -= dt;
      this.heat = Math.min(1, this.heat);
      if (this._overheatTimer <= 0) {
        this.overheated = false;
        this.heat = 0.2;
      }
    } else {
      this.heat = Math.max(0, this.heat - dt * HEAT_COOL_RATE);
    }

    if (!this.overheated && this.player.alive && this.wantsToFire && this._cooldown <= 0) {
      this._fireOnce();
    }

    // advance projectiles
    this.pool.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        return;
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
    });
  }

  _fireOnce() {
    const anchors = this.player.getCannonWorldPositions();
    const anchor = anchors[this._cannonIndex % anchors.length];
    this._cannonIndex++;

    const p = this.pool.acquire();
    p.mesh.position.copy(anchor);
    p.mesh.visible = true;
    // The two cannons sit either side of the hull; aim both toward the
    // ship's forward centerline (the crosshair) so they converge on
    // whatever is dead ahead instead of firing two dumb parallel lines
    // that can straddle — and miss — a target right in the reticle.
    const shipPos = this.player.group.position;
    const convergeTarget = new THREE.Vector3(shipPos.x, shipPos.y, shipPos.z - 140);
    const dir = convergeTarget.sub(anchor).normalize();
    p.velocity.copy(dir).multiplyScalar(PROJECTILE_SPEED + this.player.forwardSpeed);
    p.life = PROJECTILE_LIFE;
    p.damage = 12;

    this._cooldown = FIRE_INTERVAL;
    this.heat = Math.min(1, this.heat + HEAT_PER_SHOT);
    if (this.heat >= 1) {
      this.overheated = true;
      this._overheatTimer = OVERHEAT_LOCK_TIME;
    }

    this.audio?.playLaser();
    this.fx?.muzzleFlash(anchor);
  }

  reset() {
    this.pool.releaseAll();
    this.heat = 0;
    this.overheated = false;
    this._cooldown = 0;
  }
}
