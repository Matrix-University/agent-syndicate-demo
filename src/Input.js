// Tracks which keys are held and exposes movement axes plus edge-triggered
// "pressed this frame" intents. Call endFrame() once per frame (after the consumer
// has read input) to clear the edge state.
export class Input {
  constructor() {
    this.keys = new Set();
    this._pressed = new Set(); // keys that went down since the last endFrame()

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this._pressed.add(e.code); // ignore auto-repeat
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Drop held/pressed keys if the window loses focus (prevents "stuck" input).
    window.addEventListener('blur', () => { this.keys.clear(); this._pressed.clear(); });
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // True only on the frame a key first goes down (edge), for one-shot actions.
  wasPressed(...codes) {
    return codes.some((c) => this._pressed.has(c));
  }

  endFrame() {
    this._pressed.clear();
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

  // One-shot action intents (edge-triggered): fire once per key press.
  get punchPressed() {
    return this.wasPressed('KeyJ');
  }

  get jumpPressed() {
    return this.wasPressed('Space');
  }
}
