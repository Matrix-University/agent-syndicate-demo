// Per-device play preferences set from the pause sheet. localStorage, like the
// radio's volume: they describe this phone and this player's hands, not the run.
const STORAGE_KEY = 'agentSyndicate.settings';

export class Settings {
  constructor() {
    const saved = loadSettings();
    this.leftHanded = saved.leftHanded === true;
    // On by default wherever the browser can buzz at all; the toggle only shows
    // on devices that support it.
    this.haptics = saved.haptics !== false;
    this._apply();
  }

  get hapticsSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  setLeftHanded(leftHanded) {
    this.leftHanded = leftHanded;
    this._save();
    this._apply();
  }

  setHaptics(haptics) {
    this.haptics = haptics;
    this._save();
  }

  vibrate(pattern) {
    if (this.haptics && this.hapticsSupported) navigator.vibrate(pattern);
  }

  // The mirrored layout is pure CSS: the controls read their offsets from the
  // body class, so MobileControls never needs to know which side it is on.
  _apply() {
    document.body.classList.toggle('left-handed', this.leftHanded);
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        leftHanded: this.leftHanded,
        haptics: this.haptics,
      }));
    } catch {
      // Private mode / blocked storage: the setting holds for this visit only.
    }
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
