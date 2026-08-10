import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

// ---------------------------------------------------------------------------
// PowerUps
// Small rotating pickups spawned ahead of the ship: shield recharge, weapon
// coolant (clears overheat + faster cooling for a while) and score multiplier.
// ---------------------------------------------------------------------------

const TYPES = {
  shield: { color: 0x37ff8b, label: 'ESCUDO RESTAURADO' },
  coolant: { color: 0x2ec8ff, label: 'ARMAS ENFRIADAS' },
  multiplier: { color: 0xffab2e, label: 'MULTIPLICADOR x2' },
};

export class PowerUps {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this._spawnTimer = 6;

    const geo = new THREE.OctahedronGeometry(1.1, 0);
    this.pool = new ObjectPool(
      () => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 });
        const mesh = new THREE.Mesh(geo, mat);
        const light = new THREE.PointLight(0xffffff, 1.2, 10);
        mesh.add(light);
        mesh.visible = false;
        scene.add(mesh);
        return { mesh, light, type: 'shield', spin: 1 };
      },
      (p) => {
        p.mesh.visible = false;
      },
      8
    );
  }

  _spawnAhead(shipPos) {
    const keys = Object.keys(TYPES);
    const type = keys[(Math.random() * keys.length) | 0];
    const def = TYPES[type];
    const p = this.pool.acquire();
    p.type = type;
    p.mesh.material.color.setHex(def.color);
    p.mesh.material.emissive.setHex(def.color);
    p.light.color.setHex(def.color);
    p.mesh.position.set(
      shipPos.x + (Math.random() - 0.5) * 50,
      shipPos.y + (Math.random() - 0.5) * 30,
      shipPos.z - (160 + Math.random() * 100)
    );
    p.mesh.visible = true;
    p.spin = 1 + Math.random();
  }

  update(dt, player, onCollect) {
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnAhead(player.group.position);
      this._spawnTimer = 9 + Math.random() * 7;
    }

    const shipPos = player.group.position;
    this.pool.forEachActive((p) => {
      p.mesh.rotation.x += dt * p.spin;
      p.mesh.rotation.y += dt * p.spin * 1.4;
      if (p.mesh.position.z > shipPos.z + 40) {
        this.pool.release(p);
        return;
      }
      if (player.alive && shipPos.distanceTo(p.mesh.position) < 3.2) {
        this.audio?.playPowerup();
        onCollect(p.type, TYPES[p.type].label);
        this.pool.release(p);
      }
    });
  }

  reset() {
    this.pool.releaseAll();
    this._spawnTimer = 6;
  }
}
