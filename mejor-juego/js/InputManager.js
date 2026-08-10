// Centralized keyboard/mouse/touch state, polled once per frame by the
// systems that need it (PlayerController, Weapons, GameManager for pause).
export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.justPressed = new Set();
    this._prevKeys = new Set();

    this._onKeyDown = (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      const r = this.dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };
    this._onMouseDown = () => (this.mouse.down = true);
    this._onMouseUp = () => (this.mouse.down = false);
    this._onTouchMove = (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      const r = this.dom.getBoundingClientRect();
      this.mouse.x = ((t.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((t.clientY - r.top) / r.height) * 2 + 1;
      this.mouse.down = true;
    };
    this._onTouchEnd = () => (this.mouse.down = false);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('touchstart', this._onTouchMove, { passive: true });
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });
    window.addEventListener('touchend', this._onTouchEnd);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasJustPressed(code) {
    return this.justPressed.has(code);
  }

  // Call once at the end of each frame to clear one-shot "just pressed" state.
  endFrame() {
    this.justPressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('touchstart', this._onTouchMove);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
  }
}
