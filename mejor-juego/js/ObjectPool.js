// Generic object pool to avoid runtime allocation / GC churn for
// short-lived gameplay objects (projectiles, meteors, particles).
export class ObjectPool {
  constructor(factory, reset, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = new Set();
    for (let i = 0; i < initialSize; i++) {
      this.free.push(this.factory());
    }
  }

  acquire() {
    const obj = this.free.pop() || this.factory();
    this.active.add(obj);
    return obj;
  }

  release(obj) {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    this.reset(obj);
    this.free.push(obj);
  }

  releaseAll() {
    for (const obj of [...this.active]) this.release(obj);
  }

  forEachActive(fn) {
    for (const obj of this.active) fn(obj);
  }

  get activeCount() {
    return this.active.size;
  }
}
