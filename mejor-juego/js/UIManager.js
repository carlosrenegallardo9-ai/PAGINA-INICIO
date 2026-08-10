// ---------------------------------------------------------------------------
// UIManager
// Owns every DOM interaction: HUD readouts, the crosshair/lock markers,
// screen switching (start/settings/scores/pause/game-over), and the
// localStorage-backed high score table.
// ---------------------------------------------------------------------------

const SCORES_KEY = 'viaLacteaMeteorRun.highScores';
const MAX_SCORES = 10;

const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this._cacheDom();
    this._bindButtons();
    this._bindSettings();
    this._damageTimeout = null;
  }

  _cacheDom() {
    this.el = {
      hud: $('hud'),
      hullFill: $('hull-fill'),
      shieldFill: $('shield-fill'),
      boostFill: $('boost-fill'),
      heatFill: $('heat-fill'),
      heatWarning: $('heat-warning'),
      scoreValue: $('score-value'),
      comboValue: $('combo-value'),
      distanceValue: $('distance-value'),
      powerupToast: $('powerup-toast'),
      damageVignette: $('damage-vignette'),
      lockMarkers: $('lock-markers'),
      loading: $('loading-screen'),

      screens: {
        start: $('menu-start'),
        settings: $('menu-settings'),
        scores: $('menu-scores'),
        pause: $('menu-pause'),
        gameover: $('menu-gameover'),
      },

      scoresList: $('scores-list'),
      goScore: $('go-score'),
      goKills: $('go-kills'),
      goTime: $('go-time'),
      goCombo: $('go-combo'),
      goDistance: $('go-distance'),
      goNewRecord: $('go-newrecord'),

      optMusic: $('opt-music'),
      optSfx: $('opt-sfx'),
      optSens: $('opt-sens'),
      optAutofire: $('opt-autofire'),
    };
  }

  _bindButtons() {
    $('btn-start').onclick = () => this.cb.onStart?.();
    $('btn-settings').onclick = () => this.showScreen('settings');
    $('btn-settings-back').onclick = () => this.showScreen('start');
    $('btn-scores').onclick = () => { this.renderScores(); this.showScreen('scores'); };
    $('btn-scores-back').onclick = () => this.showScreen('start');
    $('btn-resume').onclick = () => this.cb.onResume?.();
    $('btn-quit').onclick = () => this.cb.onQuit?.();
    $('btn-retry').onclick = () => this.cb.onRetry?.();
    $('btn-menu').onclick = () => this.cb.onMenu?.();
  }

  _bindSettings() {
    this.el.optMusic.oninput = (e) => this.cb.onMusicVolume?.(e.target.value / 100);
    this.el.optSfx.oninput = (e) => this.cb.onSfxVolume?.(e.target.value / 100);
    this.el.optSens.oninput = (e) => this.cb.onSensitivity?.(e.target.value / 100);
    this.el.optAutofire.onchange = (e) => this.cb.onAutofireToggle?.(e.target.checked);
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showScreen(name) {
    Object.entries(this.el.screens).forEach(([key, node]) => {
      node.classList.toggle('hidden', key !== name);
    });
  }

  hideAllScreens() {
    Object.values(this.el.screens).forEach((n) => n.classList.add('hidden'));
  }

  setHudVisible(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
  }

  updateHUD(state) {
    const hullPct = Math.max(0, state.hull / state.hullMax) * 100;
    const shieldPct = Math.max(0, state.shield / state.shieldMax) * 100;
    this.el.hullFill.style.width = `${hullPct}%`;
    this.el.shieldFill.style.width = `${shieldPct}%`;
    this.el.hullFill.style.background = hullPct < 30 ? '#ff3b3b' : '';

    this.el.boostFill.style.width = `${state.boost * 100}%`;
    this.el.heatFill.style.width = `${Math.min(1, state.heat) * 100}%`;
    this.el.heatWarning.classList.toggle('hidden', !state.overheated);

    this.el.scoreValue.textContent = Math.floor(state.score).toLocaleString('es-ES');
    this.el.comboValue.textContent = `x${state.combo}`;
    this.el.distanceValue.textContent = `${state.distanceLy.toFixed(2)} ly`;
  }

  flashDamage() {
    this.el.damageVignette.classList.add('hit');
    clearTimeout(this._damageTimeout);
    this._damageTimeout = setTimeout(() => this.el.damageVignette.classList.remove('hit'), 180);
  }

  showPowerupToast(text) {
    const el = this.el.powerupToast;
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 1600);
  }

  // Projects a world position to screen space and drops/updates a lock
  // marker div for the nearest threats. `points` is [{x,y,visible}]
  renderLockMarkers(points) {
    const container = this.el.lockMarkers;
    while (container.children.length < points.length) {
      const d = document.createElement('div');
      d.className = 'lock-marker';
      container.appendChild(d);
    }
    while (container.children.length > points.length) {
      container.removeChild(container.lastChild);
    }
    points.forEach((p, i) => {
      const node = container.children[i];
      node.style.display = p.visible ? 'block' : 'none';
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
    });
  }

  showGameOver(stats, isNewRecord) {
    this.el.goScore.textContent = Math.floor(stats.score).toLocaleString('es-ES');
    this.el.goKills.textContent = stats.kills;
    this.el.goTime.textContent = `${Math.floor(stats.time)}s`;
    this.el.goCombo.textContent = `x${stats.maxCombo}`;
    this.el.goDistance.textContent = `${stats.distanceLy.toFixed(2)} ly`;
    this.el.goNewRecord.classList.toggle('hidden', !isNewRecord);
    this.showScreen('gameover');
  }

  renderScores() {
    const scores = UIManager.loadScores();
    const list = this.el.scoresList;
    list.innerHTML = '';
    if (!scores.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Aún no hay puntuaciones registradas.';
      list.appendChild(li);
      return;
    }
    scores.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = `${Math.floor(s.score).toLocaleString('es-ES')} pts — ${s.kills} meteoritos — ${Math.floor(s.time)}s — ${s.distanceLy.toFixed(2)} ly`;
      list.appendChild(li);
    });
  }

  static loadScores() {
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  static saveScore(entry) {
    const scores = UIManager.loadScores();
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const trimmed = scores.slice(0, MAX_SCORES);
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(trimmed));
    } catch (e) { /* storage unavailable, ignore */ }
    const isNewRecord = trimmed[0] === entry;
    return isNewRecord;
  }
}
