import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { FX } from './FX.js';
import { Galaxy } from './Galaxy.js';
import { PlayerController } from './PlayerController.js';
import { WeaponSystem } from './Weapons.js';
import { MeteorSpawner } from './MeteorSpawner.js';
import { PowerUps } from './PowerUps.js';
import { UIManager } from './UIManager.js';

// ---------------------------------------------------------------------------
// GameManager
// Top-level orchestrator: owns the renderer/scene/camera, wires every
// subsystem together, drives the fixed game loop, tracks score/combo/
// difficulty, and handles the menu/playing/paused/gameover state machine.
// ---------------------------------------------------------------------------

const COMBO_WINDOW = 2.2;
const LY_PER_UNIT = 1 / 4000; // purely cosmetic scale for the HUD distance readout

export class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'start'; // start | playing | paused | gameover

    this._initThree();
    this.input = new InputManager(this.renderer.domElement);
    this.audio = new AudioManager();
    this.fx = new FX(this.scene);
    this.galaxy = new Galaxy(this.scene);
    this.player = new PlayerController(this.scene, this.camera, this.input);
    this.weapons = new WeaponSystem(this.scene, this.player, this.audio, this.fx);
    this.meteors = new MeteorSpawner(this.scene, this.fx, this.audio);
    this.powerups = new PowerUps(this.scene, this.audio);

    this.player.onDamaged = () => this.ui.flashDamage();
    this.player.onDeath = () => this._onPlayerDeath();

    this.ui = new UIManager({
      onStart: () => this.startRun(),
      onResume: () => this._resume(),
      onQuit: () => this._quitToMenu(),
      onRetry: () => this.startRun(),
      onMenu: () => this._quitToMenu(),
      onMusicVolume: (v) => this.audio.setMusicVolume(v),
      onSfxVolume: (v) => this.audio.setSfxVolume(v),
      onSensitivity: (v) => (this._sensitivity = v),
      onAutofireToggle: (v) => (this.weapons.autoFire = v),
    });

    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this._comboTimer = 0;
    this.kills = 0;
    this.elapsed = 0;
    this._scoreMultTimer = 0;
    this._demoZ = 0;

    this._clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));

    this.ui.hideLoading();
    this.ui.setHudVisible(false);
    this.ui.showScreen('start');
    this._animate();
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Use the pre-r155 (non physically-based) light intensity scale — the
    // scene's light intensities below are tuned for that simpler model.
    this.renderer.useLegacyLights = true;
    // Filmic tone mapping desaturates/softens the additively-blended neon
    // glows (lasers, thrusters, nebulae) into a washed grey haze — plain
    // clamping keeps the accent colors punchy and the void properly black.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    // Space has no atmosphere to scatter light, so only apply a very gentle
    // linear fade to give nearby meteors depth cueing without hiding the
    // distant galaxy (planets, nebulae, starfield) the player is flying through.
    this.scene.fog = new THREE.Fog(0x05050f, 220, 900);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 6000);

    const hemi = new THREE.HemisphereLight(0x7799ff, 0x0a0a18, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(120, 200, 100);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4477ff, 0.35);
    fill.position.set(-100, -50, -150);
    this.scene.add(fill);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _onKeyDown(e) {
    if (e.code === 'KeyC' && this.state === 'playing') {
      this.player.toggleCamera();
    }
    if ((e.code === 'KeyP' || e.code === 'Escape') && (this.state === 'playing' || this.state === 'paused')) {
      if (this.state === 'playing') this._pause();
      else this._resume();
    }
  }

  // ------------------------------------------------------------- FLOW ----
  startRun() {
    this.audio.init();
    this.audio.resume();
    this.audio.startMusic();
    this.audio.startEngine();

    this.player.reset();
    this.weapons.reset();
    this.meteors.reset();
    this.powerups.reset();

    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this._comboTimer = 0;
    this.kills = 0;
    this.elapsed = 0;
    this._scoreMultTimer = 0;

    this.ui.hideAllScreens();
    this.ui.setHudVisible(true);
    this.state = 'playing';
    this._clock.getDelta();
  }

  _pause() {
    this.state = 'paused';
    this.ui.showScreen('pause');
  }

  _resume() {
    this.state = 'playing';
    this.ui.hideAllScreens();
    this._clock.getDelta();
  }

  _quitToMenu() {
    this.audio.stopMusic();
    this.audio.stopEngine();
    this.state = 'start';
    this.ui.setHudVisible(false);
    this.ui.showScreen('start');
  }

  _onPlayerDeath() {
    this.state = 'gameover';
    this.audio.stopMusic();
    this.audio.stopEngine();
    this.audio.playExplosion('big');
    this.fx.explode(this.player.group.position, 'large');
    this.fx.shockwave(this.player.group.position, 18);

    const stats = {
      score: this.score,
      kills: this.kills,
      time: this.elapsed,
      maxCombo: this.maxCombo,
      distanceLy: this.player.distanceTraveled * LY_PER_UNIT,
    };
    const isNewRecord = UIManager.saveScore(stats);
    this.ui.setHudVisible(false);
    setTimeout(() => this.ui.showGameOver(stats, isNewRecord), 700);
  }

  // ------------------------------------------------------------ SCORE ----
  _onKill(points, size) {
    this._comboTimer = COMBO_WINDOW;
    const scoreMult = this._scoreMultTimer > 0 ? 2 : 1;
    this.score += points * this.combo * scoreMult;
    this.combo = Math.min(20, this.combo + (size === 'large' ? 2 : 1));
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.kills++;
  }

  _onPlayerHit() {
    this.combo = 1;
    this._comboTimer = 0;
  }

  _onPowerupCollect(type) {
    if (type === 'shield') this.player.addShield(45);
    if (type === 'coolant') {
      this.weapons.heat = 0;
      this.weapons.overheated = false;
    }
    if (type === 'multiplier') this._scoreMultTimer = 10;
  }

  // ------------------------------------------------------------- LOOP ----
  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(0.05, this._clock.getDelta());

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else {
      // Idle ambient drift behind the menus so the galaxy still feels alive.
      this._demoZ -= dt * 6;
      this.galaxy.update(dt, this._demoZ);
      this.camera.position.set(Math.sin(this._demoZ * 0.02) * 20, 6 + Math.sin(this._demoZ * 0.01) * 4, this._demoZ + 20);
      this.camera.lookAt(0, 0, this._demoZ - 20);
    }

    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    this.elapsed += dt;

    // Difficulty ramps up over the first few minutes then plateaus.
    const spawnRateMult = Math.min(3.2, 1 + this.elapsed * 0.018);
    this.meteors.setDifficulty(1, spawnRateMult);

    this.player.update(dt);
    this.weapons.update(dt);
    this.meteors.update(dt, this.player, this.weapons.pool, {
      onKill: (points, size) => this._onKill(points, size),
      onPlayerHit: () => this._onPlayerHit(),
    });
    this.powerups.update(dt, this.player, (type, label) => {
      this._onPowerupCollect(type);
      this.ui.showPowerupToast(label);
    });
    this.galaxy.update(dt, this.player.group.position.z);
    this.audio.setEngineIntensity(this.player.boosting);

    // thruster particle trail from both engines
    this.player.getEngineWorldPositions().forEach((pos) => {
      this.fx.emitThruster(pos, this.player.boosting ? 3 : 1.4);
    });

    if (this._comboTimer > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) this.combo = 1;
    }
    if (this._scoreMultTimer > 0) this._scoreMultTimer -= dt;

    this._updateRadar();

    this.ui.updateHUD({
      hull: this.player.hull,
      hullMax: this.player.hullMax,
      shield: this.player.shield,
      shieldMax: this.player.shieldMax,
      boost: this.player.boostAmount,
      heat: this.weapons.heat,
      overheated: this.weapons.overheated,
      score: this.score,
      combo: this.combo,
      distanceLy: this.player.distanceTraveled * LY_PER_UNIT,
    });
  }

  _updateRadar() {
    const shipPos = this.player.group.position;
    const candidates = [];
    this.meteors.pool.forEachActive((m) => {
      if (!m.mesh.visible) return;
      if (m.mesh.position.z > shipPos.z) return; // behind or level, ignore
      candidates.push(m);
    });
    candidates.sort((a, b) => a.mesh.position.distanceTo(shipPos) - b.mesh.position.distanceTo(shipPos));

    const w = window.innerWidth;
    const h = window.innerHeight;
    const points = candidates.slice(0, 5).map((m) => {
      const v = m.mesh.position.clone().project(this.camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      return {
        visible: onScreen,
        x: (v.x * 0.5 + 0.5) * w,
        y: (-v.y * 0.5 + 0.5) * h,
      };
    });
    this.ui.renderLockMarkers(points);
  }
}
