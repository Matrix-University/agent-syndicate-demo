// Tracks which keys are held and exposes simple movement axes.
export class Input {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Drop held keys if the window loses focus (prevents "stuck" movement).
    window.addEventListener('blur', () => this.keys.clear());
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // Forward/back axis in [-1, 1].
  get moveZ() {
    return (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  }

  // Left/right axis in [-1, 1].
  get moveX() {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  get sprint() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }
}
