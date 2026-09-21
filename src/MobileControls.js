const JOYSTICK_RADIUS = 52;
const JOYSTICK_DEAD_ZONE = 0.14;
const SPRINT_ENTER = 0.95;
const SPRINT_EXIT = 0.85;

export class MobileControls {
  constructor(input, elements) {
    this.input = input;
    this.root = elements.root;
    this.joystick = elements.joystick;
    this.thumb = elements.thumb;
    this.jumpButton = elements.jumpButton;
    this.punchButton = elements.punchButton;
    this.liftButton = elements.liftButton;

    this._joystickPointerId = null;
    this._joystickCenterX = 0;
    this._joystickCenterY = 0;
    this._sprinting = false;

    this._onFirstTouch = (event) => {
      if (event.pointerType === 'touch') document.body.classList.add('touch-controls');
    };
    this._onJoystickDown = (event) => this._claimJoystick(event);
    this._onJoystickMove = (event) => this._moveJoystick(event);
    this._onJoystickEnd = (event) => this._releaseJoystick(event.pointerId);
    // One entry per action button, so adding a button (LIFT) is data, not another
    // branch through _claimAction/_releaseAction.
    this._actions = [
      { button: this.jumpButton, trigger: () => this.input.triggerMobileJump() },
      { button: this.punchButton, trigger: () => this.input.triggerMobilePunch() },
      { button: this.liftButton, trigger: () => this.input.triggerMobileLift() },
    ].filter((action) => !!action.button);
    for (const action of this._actions) {
      action.pointerId = null;
      action.onDown = (event) => this._claimAction(event, action);
      action.onEnd = (event) => this._releaseAction(event.pointerId, action);
    }

    this._onBlur = () => this.reset();
    this._onVisibilityChange = () => {
      if (document.hidden) this.reset();
    };
    this._onContextMenu = (event) => event.preventDefault();

    window.addEventListener('pointerdown', this._onFirstTouch, { passive: true });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this.root.addEventListener('contextmenu', this._onContextMenu);

    this.joystick.addEventListener('pointerdown', this._onJoystickDown);
    this.joystick.addEventListener('pointermove', this._onJoystickMove);
    this.joystick.addEventListener('pointerup', this._onJoystickEnd);
    this.joystick.addEventListener('pointercancel', this._onJoystickEnd);
    this.joystick.addEventListener('lostpointercapture', this._onJoystickEnd);

    for (const action of this._actions) {
      this._addActionListeners(action.button, action.onDown, action.onEnd);
    }
  }

  // Dim the LIFT button when there is nothing to grab, and relabel it once the
  // car is overhead — the same button throws.
  setLiftState(enabled, label) {
    if (!this.liftButton) return;
    this.liftButton.disabled = !enabled;
    this.liftButton.classList.toggle('unavailable', !enabled);
    if (this.liftButton.textContent !== label) {
      this.liftButton.textContent = label;
      this.liftButton.setAttribute('aria-label', label);
    }
  }

  _addActionListeners(button, onDown, onEnd) {
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('pointerup', onEnd);
    button.addEventListener('pointercancel', onEnd);
    button.addEventListener('lostpointercapture', onEnd);
  }

  _removeActionListeners(button, onDown, onEnd) {
    button.removeEventListener('pointerdown', onDown);
    button.removeEventListener('pointerup', onEnd);
    button.removeEventListener('pointercancel', onEnd);
    button.removeEventListener('lostpointercapture', onEnd);
  }

  _claimJoystick(event) {
    if (this._joystickPointerId === null) {
      const bounds = this.joystick.getBoundingClientRect();
      this._joystickPointerId = event.pointerId;
      this._joystickCenterX = bounds.left + bounds.width / 2;
      this._joystickCenterY = bounds.top + bounds.height / 2;
      this.joystick.setPointerCapture(event.pointerId);
      this.joystick.classList.add('active');
      this._moveJoystick(event);
      event.preventDefault();
    }
  }

  _moveJoystick(event) {
    if (event.pointerId === this._joystickPointerId) {
      const offsetX = event.clientX - this._joystickCenterX;
      const offsetY = event.clientY - this._joystickCenterY;
      const distance = Math.hypot(offsetX, offsetY);
      const rawMagnitude = Math.min(distance / JOYSTICK_RADIUS, 1);
      const directionX = distance > 0 ? offsetX / distance : 0;
      const directionY = distance > 0 ? offsetY / distance : 0;
      const thumbDistance = Math.min(distance, JOYSTICK_RADIUS);
      const magnitude = rawMagnitude > JOYSTICK_DEAD_ZONE
        ? (rawMagnitude - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE)
        : 0;

      if (!this._sprinting && rawMagnitude >= SPRINT_ENTER) this._sprinting = true;
      else if (this._sprinting && rawMagnitude <= SPRINT_EXIT) this._sprinting = false;

      this.thumb.style.transform = `translate(${directionX * thumbDistance}px, ${directionY * thumbDistance}px)`;
      this.input.setMobileMovement(directionX * magnitude, -directionY * magnitude, this._sprinting);
      event.preventDefault();
    }
  }

  _releaseJoystick(pointerId) {
    if (pointerId === this._joystickPointerId) {
      this._joystickPointerId = null;
      this._sprinting = false;
      this.thumb.style.transform = 'translate(0, 0)';
      this.joystick.classList.remove('active');
      this.input.resetMobileMovement();
    }
  }

  _claimAction(event, action) {
    if (action.pointerId === null && !action.button.disabled) {
      action.pointerId = event.pointerId;
      action.button.setPointerCapture(event.pointerId);
      action.button.classList.add('active');
      action.trigger();
      event.preventDefault();
    }
  }

  _releaseAction(pointerId, action) {
    if (pointerId === action.pointerId) {
      action.pointerId = null;
      action.button.classList.remove('active');
    }
  }

  reset() {
    this._releaseJoystick(this._joystickPointerId);
    for (const action of this._actions) this._releaseAction(action.pointerId, action);
    this.input.reset();
  }

  dispose() {
    this.reset();
    window.removeEventListener('pointerdown', this._onFirstTouch);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.root.removeEventListener('contextmenu', this._onContextMenu);

    this.joystick.removeEventListener('pointerdown', this._onJoystickDown);
    this.joystick.removeEventListener('pointermove', this._onJoystickMove);
    this.joystick.removeEventListener('pointerup', this._onJoystickEnd);
    this.joystick.removeEventListener('pointercancel', this._onJoystickEnd);
    this.joystick.removeEventListener('lostpointercapture', this._onJoystickEnd);

    for (const action of this._actions) {
      this._removeActionListeners(action.button, action.onDown, action.onEnd);
    }
  }
}
