// Tracks which keys are held and exposes movement axes plus edge-triggered
// "pressed this frame" intents. Call endFrame() once per frame (after the consumer
// has read input) to clear the edge state.
export class Input {
  constructor() {
    this.keys = new Set();
    this._pressed = new Set(); // keys that went down since the last endFrame()
    this.suspended = false;
    this._mobileMoveX = 0;
    this._mobileMoveZ = 0;
    this._mobileSprint = false;
    this._mobilePunchPressed = false;
    this._mobileJumpPressed = false;
    this._mobileLiftPressed = false;
    this._shortThrowAllowed = false;
    this._shortThrowEnabled = false;
    this._shortThrowSequence = 0;
    this._desktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    this._onDesktopPointerChange = () => {
      this._shortThrowEnabled = false;
      this._shortThrowSequence = 0;
    };
    this._desktopPointer.addEventListener('change', this._onDesktopPointerChange);

    this._onKeyDown = (e) => {
      if (this.suspended) return;
      this._trackShortThrowCode(e);
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
    this._mobileLiftPressed = false;
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

  triggerMobileLift() {
    this._mobileLiftPressed = true;
  }

  // Held while a text overlay (the handle prompt) is up: typing a handle must not
  // also drive the player, and the keys held when it opened must not stay stuck.
  setSuspended(suspended) {
    this.suspended = suspended;
    if (suspended) this.reset();
  }

  setShortThrowAllowed(allowed) {
    this._shortThrowAllowed = allowed;
    this._shortThrowEnabled = false;
    this._shortThrowSequence = 0;
  }

  _trackShortThrowCode(event) {
    const editing = event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest('input, textarea, select'));
    if (!this._shortThrowAllowed || !this._desktopPointer.matches || editing ||
      event.isComposing || event.defaultPrevented ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      this._shortThrowSequence = 0;
      return;
    }
    if (event.repeat || this.keys.has(event.code)) return;

    const expected = this._shortThrowSequence === 1 ? '0' : '1';
    this._shortThrowSequence = event.key === expected
      ? this._shortThrowSequence + 1
      : event.key === '1' ? 1 : 0;
    if (this._shortThrowSequence === 3) {
      this._shortThrowEnabled = !this._shortThrowEnabled;
      this._shortThrowSequence = 0;
    }
  }

  reset() {
    this.keys.clear();
    this._pressed.clear();
    this._shortThrowSequence = 0;
    this.resetMobileMovement();
    this._mobilePunchPressed = false;
    this._mobileJumpPressed = false;
    this._mobileLiftPressed = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._desktopPointer.removeEventListener('change', this._onDesktopPointerChange);
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

  // Pick up whatever liftable prop is in range.
  get liftPressed() {
    return this.wasPressed('KeyE') || this._mobileLiftPressed;
  }

  get shortThrow() {
    return this._shortThrowEnabled && this._shortThrowAllowed &&
      !this.suspended && this._desktopPointer.matches;
  }

  get shortThrowPressed() {
    // Touch attack/lift intents always keep the normal throw, even on a hybrid.
    return this.shortThrow && this.wasPressed('KeyJ', 'KeyE');
  }

  get restartPressed() {
    return this.wasPressed('KeyR');
  }

  get pausePressed() {
    return this.wasPressed('KeyP');
  }

  get radioMutePressed() {
    return this.wasPressed('KeyM');
  }
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}
