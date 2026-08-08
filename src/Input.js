// Tracks which keys are held and exposes movement axes plus edge-triggered
// "pressed this frame" intents. Call endFrame() once per frame (after the consumer
// has read input) to clear the edge state.
export class Input {
  constructor() {
    this.keys = new Set();
    this._pressed = new Set(); // keys that went down since the last endFrame()
    this._mobileMoveX = 0;
    this._mobileMoveZ = 0;
    this._mobileSprint = false;
    this._mobilePunchPressed = false;
    this._mobileJumpPressed = false;

    this._onKeyDown = (e) => {
      if (!this.keys.has(e.code)) this._pressed.add(e.code); // ignore auto-repeat
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.reset();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // Drop held/pressed keys if the window loses focus (prevents "stuck" input).
    window.addEventListener('blur', this._onBlur);
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
    this._mobilePunchPressed = false;
    this._mobileJumpPressed = false;
  }

  setMobileMovement(moveX, moveZ, sprint) {
    this._mobileMoveX = clampAxis(moveX);
    this._mobileMoveZ = clampAxis(moveZ);
    this._mobileSprint = sprint;
  }

  resetMobileMovement() {
    this._mobileMoveX = 0;
    this._mobileMoveZ = 0;
    this._mobileSprint = false;
  }

  triggerMobilePunch() {
    this._mobilePunchPressed = true;
  }

  triggerMobileJump() {
    this._mobileJumpPressed = true;
  }

  reset() {
    this.keys.clear();
    this._pressed.clear();
    this.resetMobileMovement();
    this._mobilePunchPressed = false;
    this._mobileJumpPressed = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.reset();
  }

  // Forward/back axis in [-1, 1].
  get moveZ() {
    const keyboard = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) -
      (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    return clampAxis(keyboard + this._mobileMoveZ);
  }

  // Left/right axis in [-1, 1].
  get moveX() {
    const keyboard = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) -
      (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    return clampAxis(keyboard + this._mobileMoveX);
  }

  get sprint() {
    return this.isDown('ShiftLeft', 'ShiftRight') || this._mobileSprint;
  }

  // One-shot action intents (edge-triggered): fire once per key press.
  get punchPressed() {
    return this.wasPressed('KeyJ') || this._mobilePunchPressed;
  }

  get jumpPressed() {
    return this.wasPressed('Space') || this._mobileJumpPressed;
  }
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}
