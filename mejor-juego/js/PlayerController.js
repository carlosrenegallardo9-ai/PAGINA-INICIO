import * as THREE from 'three';

// ---------------------------------------------------------------------------
// PlayerController
// Builds the ship mesh from primitives, owns movement/inertia/rotation,
// the 3rd/1st person camera rig, and hull/shield state. Forward flight is
// automatic (constant -Z drift, modulated by boost); X/Y is player-controlled.
// ---------------------------------------------------------------------------

const BOUNDS_X = 42;
const BOUNDS_Y = 26;
const BASE_FORWARD_SPEED = 46; // units / second
const BOOST_MULTIPLIER = 1.9;
const LATERAL_SPEED = 46;

export class PlayerController {
  constructor(scene, camera, input) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;

    this.group = new THREE.Group();
    this._buildShip();
    this.scene.add(this.group);

    this.velocity = new THREE.Vector2(0, 0); // x/y lateral velocity
    this.targetRoll = 0;
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;

    this.forwardSpeed = BASE_FORWARD_SPEED;
    this.boostAmount = 1; // 0..1 fuel
    this.boosting = false;

    this.hull = 100;
    this.hullMax = 100;
    this.shield = 100;
    this.shieldMax = 100;
    this._shieldRegenDelay = 0;
    this.alive = true;
    this.invulnerable = 0;

    this.cameraMode = 'third'; // 'third' | 'first'
    this._camPos = new THREE.Vector3(0, 6, 18);
    this.camera.position.copy(this._camPos);

    this.distanceTraveled = 0;

    this.onDamaged = null; // callback(amount)
    this.onDeath = null; // callback()
  }

  _buildShip() {
    const g = new THREE.Group();

    // The ship flies through near-black space, so its hull carries a soft
    // self-illumination (emissive) on top of the lit color — otherwise it
    // reads as an unreadable silhouette against the starfield.
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5972a8, emissive: 0x10203f, emissiveIntensity: 0.7, metalness: 0.65, roughness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x00f6ff, emissive: 0x00e6ff, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.3 });
    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x2ad4ff, emissiveIntensity: 1.1, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.9 });

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.6, 8), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    g.add(fuselage);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), cockpitMat);
    cockpit.position.set(0, 0.35, 0.4);
    cockpit.scale.set(0.9, 0.7, 1.3);
    g.add(cockpit);

    const wingGeo = new THREE.BoxGeometry(3.2, 0.12, 1.3);
    const wingL = new THREE.Mesh(wingGeo, hullMat);
    wingL.position.set(-1.7, -0.1, 0.2);
    wingL.rotation.z = 0.05;
    g.add(wingL);
    const wingR = wingL.clone();
    wingR.position.x = 1.7;
    wingR.rotation.z = -0.05;
    g.add(wingR);

    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.15), accentMat);
    stripeL.position.set(-1.6, -0.03, 0.7);
    g.add(stripeL);
    const stripeR = stripeL.clone();
    stripeR.position.x = 1.6;
    g.add(stripeR);

    // Engines (two), used also as anchor points for thruster VFX.
    const engineGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 10);
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x11151f, metalness: 0.6, roughness: 0.5 });
    this.engineAnchors = [];
    [-1.1, 1.1].forEach((x) => {
      const engine = new THREE.Mesh(engineGeo, engineMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(x, -0.05, 1.6);
      g.add(engine);
      const glow = new THREE.PointLight(0x00e6ff, 1.4, 6);
      glow.position.set(x, -0.05, 2.05);
      g.add(glow);
      const anchor = new THREE.Object3D();
      anchor.position.set(x, -0.05, 2.1);
      g.add(anchor);
      this.engineAnchors.push(anchor);
    });

    // Cannon tips (weapon muzzle anchors), one per wingtip.
    const cannonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);
    const cannonMat = new THREE.MeshStandardMaterial({ color: 0x445066, metalness: 0.8, roughness: 0.3 });
    this.cannonAnchors = [];
    [-2.9, 2.9].forEach((x) => {
      const cannon = new THREE.Mesh(cannonGeo, cannonMat);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(x * 0.59, -0.08, -0.4);
      g.add(cannon);
      const anchor = new THREE.Object3D();
      anchor.position.set(x * 0.59, -0.08, -0.8);
      g.add(anchor);
      this.cannonAnchors.push(anchor);
    });

    g.rotation.y = Math.PI; // face -Z (forward)
    this.group.add(g);
    this.visual = g;
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
  }

  takeDamage(amount) {
    if (!this.alive || this.invulnerable > 0) return;
    this._shieldRegenDelay = 2.5;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) {
      this.hull -= amount;
    }
    this.invulnerable = 0.15;
    if (this.onDamaged) this.onDamaged(amount);
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  }

  addShield(amount) {
    this.shield = Math.min(this.shieldMax, this.shield + amount);
  }

  repairHull(amount) {
    this.hull = Math.min(this.hullMax, this.hull + amount);
  }

  getCannonWorldPositions() {
    return this.cannonAnchors.map((a) => a.getWorldPosition(new THREE.Vector3()));
  }

  getEngineWorldPositions() {
    return this.engineAnchors.map((a) => a.getWorldPosition(new THREE.Vector3()));
  }

  update(dt) {
    if (!this.alive) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // ---- Movement input: WASD/arrows (digital) blended with mouse offset ----
    let ix = 0, iy = 0;
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) ix -= 1;
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) ix += 1;
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) iy += 1;
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) iy -= 1;

    // Mouse nudges the target too (soft aim-steer), weighted lightly.
    ix += this.input.mouse.x * 0.6;
    iy += this.input.mouse.y * 0.6;
    ix = THREE.MathUtils.clamp(ix, -1, 1);
    iy = THREE.MathUtils.clamp(iy, -1, 1);

    this.boosting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (this.boosting && this.boostAmount > 0.02) {
      this.boostAmount = Math.max(0, this.boostAmount - dt * 0.35);
    } else {
      this.boosting = false;
      this.boostAmount = Math.min(1, this.boostAmount + dt * 0.18);
    }
    this.forwardSpeed = BASE_FORWARD_SPEED * (this.boosting ? BOOST_MULTIPLIER : 1);

    // ---- Lateral movement with light inertia ----
    const accel = 90;
    const damping = 6.5;
    this.velocity.x += (ix * LATERAL_SPEED - this.velocity.x) * Math.min(1, accel * dt / LATERAL_SPEED);
    this.velocity.y += (iy * LATERAL_SPEED - this.velocity.y) * Math.min(1, accel * dt / LATERAL_SPEED);
    this.velocity.multiplyScalar(1 - Math.min(1, damping * dt * 0.15));

    const pos = this.group.position;
    pos.x = THREE.MathUtils.clamp(pos.x + this.velocity.x * dt, -BOUNDS_X, BOUNDS_X);
    pos.y = THREE.MathUtils.clamp(pos.y + this.velocity.y * dt, -BOUNDS_Y, BOUNDS_Y);
    pos.z -= this.forwardSpeed * dt;
    this.distanceTraveled += this.forwardSpeed * dt;

    // ---- Visual banking (roll/pitch) with inertia toward target ----
    this.targetRoll = -this.velocity.x * 0.035 - ix * 0.25;
    const targetPitch = this.velocity.y * 0.02 + iy * 0.12;
    const targetYaw = -this.velocity.x * 0.01;
    this.roll += (this.targetRoll - this.roll) * Math.min(1, 6 * dt);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, 6 * dt);
    this.yaw += (targetYaw - this.yaw) * Math.min(1, 6 * dt);
    this.visual.rotation.set(this.pitch, Math.PI + this.yaw, this.roll);

    // ---- Shield regen ----
    if (this._shieldRegenDelay > 0) {
      this._shieldRegenDelay -= dt;
    } else if (this.shield < this.shieldMax) {
      this.shield = Math.min(this.shieldMax, this.shield + dt * 8);
    }

    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const shipPos = this.group.position;
    const lerpSpeed = Math.min(1, dt * 4.5);

    if (this.cameraMode === 'third') {
      const desired = new THREE.Vector3(
        shipPos.x * 0.3,
        shipPos.y * 0.3 + 5.5,
        shipPos.z + 15.5
      );
      this.camera.position.lerp(desired, lerpSpeed);
      const lookTarget = new THREE.Vector3(shipPos.x * 0.5, shipPos.y * 0.5, shipPos.z - 30);
      const m = new THREE.Matrix4().lookAt(this.camera.position, lookTarget, THREE.Object3D.DEFAULT_UP);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, lerpSpeed);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.boosting ? 82 : 72, lerpSpeed);
      this.camera.updateProjectionMatrix();
    } else {
      const desired = new THREE.Vector3(shipPos.x, shipPos.y + 0.55, shipPos.z - 0.4);
      this.camera.position.lerp(desired, Math.min(1, dt * 10));
      const lookTarget = new THREE.Vector3(shipPos.x, shipPos.y, shipPos.z - 30);
      const m = new THREE.Matrix4().lookAt(this.camera.position, lookTarget, THREE.Object3D.DEFAULT_UP);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, Math.min(1, dt * 10));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.boosting ? 95 : 85, lerpSpeed);
      this.camera.updateProjectionMatrix();
    }
  }

  reset() {
    this.group.position.set(0, 0, 0);
    this.velocity.set(0, 0);
    this.hull = this.hullMax;
    this.shield = this.shieldMax;
    this.alive = true;
    this.boostAmount = 1;
    this.distanceTraveled = 0;
    this.invulnerable = 1.5;
  }
}
