import { formatDuration } from './PlayerProfile.js';

// The pause sheet: resume, handle, the radio, the controls legend and the
// device settings. It only shows and hides itself — Game owns what "paused"
// means for the run (the frozen loop, the suspended input).
export class PauseMenu {
  constructor({
    root, resumeButton, restartButton, handleEditButton, handleLabel, sessionLabel,
    radioSlot, radioRoot, touchLegend, keysLegend,
    leftHandedRow, leftHandedInput, hapticsRow, hapticsInput,
    settings, onResume, onRestart, onEditHandle,
  }) {
    this.root = root;
    this.resumeButton = resumeButton;
    this.restartButton = restartButton;
    this.handleEditButton = handleEditButton;
    this.handleLabel = handleLabel;
    this.sessionLabel = sessionLabel;
    this.radioSlot = radioSlot;
    this.radioRoot = radioRoot;
    this.touchLegend = touchLegend;
    this.keysLegend = keysLegend;
    this.leftHandedRow = leftHandedRow;
    this.leftHandedInput = leftHandedInput;
    this.hapticsRow = hapticsRow;
    this.hapticsInput = hapticsInput;
    this.settings = settings;
    this._radioHome = null;

    this._onResume = () => onResume();
    this._onRestart = () => onRestart();
    this._onEditHandle = () => onEditHandle();
    this._onLeftHanded = () => this.settings.setLeftHanded(this.leftHandedInput.checked);
    this._onHaptics = () => {
      this.settings.setHaptics(this.hapticsInput.checked);
      this.settings.vibrate(30); // a sample buzz, so turning it on proves it works
    };
    // Input is suspended while the sheet is open, so the sheet listens for its
    // own way out. The handle prompt (over the sheet) keeps the keyboard.
    this._onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        onResume();
      }
    };

    this.resumeButton.addEventListener('click', this._onResume);
    this.restartButton.addEventListener('click', this._onRestart);
    this.handleEditButton.addEventListener('click', this._onEditHandle);
    this.leftHandedInput.addEventListener('change', this._onLeftHanded);
    this.hapticsInput.addEventListener('change', this._onHaptics);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open({ handle, sessionTime }) {
    if (this.isOpen) return;
    const touch = document.body.classList.contains('touch-controls')
      || matchMedia('(any-pointer: coarse)').matches;
    this.setHandle(handle);
    this.sessionLabel.textContent = `RUN FROZEN · ${formatDuration(sessionTime)}`;
    this.touchLegend.hidden = !touch;
    this.keysLegend.hidden = touch;
    this.leftHandedRow.hidden = !touch;
    this.hapticsRow.hidden = !touch || !this.settings.hapticsSupported;
    this.leftHandedInput.checked = this.settings.leftHanded;
    this.hapticsInput.checked = this.settings.haptics;

    // One radio, two homes: the real player moves into the sheet so its full
    // controls are reachable where the HUD only has room for the megaphone.
    this._radioHome = { parent: this.radioRoot.parentNode, next: this.radioRoot.nextSibling };
    this.radioSlot.appendChild(this.radioRoot);

    this.root.hidden = false;
    window.addEventListener('keydown', this._onKeyDown);
    this.resumeButton.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    const focused = this.root.contains(document.activeElement) ? document.activeElement : null;
    this.root.hidden = true;
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._radioHome) {
      this._radioHome.parent.insertBefore(this.radioRoot, this._radioHome.next);
      this._radioHome = null;
    }
    // Hand focus back to the page so Space/arrows drive the player again.
    focused?.blur();
  }

  setHandle(handle) {
    this.handleLabel.textContent = handle;
  }

  dispose() {
    this.close();
    this.resumeButton.removeEventListener('click', this._onResume);
    this.restartButton.removeEventListener('click', this._onRestart);
    this.handleEditButton.removeEventListener('click', this._onEditHandle);
    this.leftHandedInput.removeEventListener('change', this._onLeftHanded);
    this.hapticsInput.removeEventListener('change', this._onHaptics);
  }
}
