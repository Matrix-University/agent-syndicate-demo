import { HANDLE_MIN_LENGTH, leetify, sanitizeHandle, suggestHandle } from './PlayerProfile.js';

/**
 * The overlay that takes the player's handle — shown once at boot when none is
 * stored, and reopened from the HUD button. It only reads and writes the
 * profile; the caller owns when it appears and suspending input while it does.
 */
export class HandleDialog {
  constructor({
    root, form, input, error, title, copy, leetButton, skipButton, profile, onSave,
  }) {
    this.root = root;
    this.form = form;
    this.input = input;
    this.error = error;
    this.title = title;
    this.copy = copy;
    // The markup's own wording is the default; the board's name-entry step
    // swaps it and this puts it back.
    this._defaultTitle = title.textContent;
    this._defaultCopy = copy.textContent;
    this.leetButton = leetButton;
    this.skipButton = skipButton;
    this.profile = profile;
    this.onSave = onSave;
    this._resolve = null;
    this._placeholder = suggestHandle();

    this._onSubmit = this._onSubmit.bind(this);
    this._onLeetify = this._onLeetify.bind(this);
    this._onSkip = this._onSkip.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    this.form.addEventListener('submit', this._onSubmit);
    this.leetButton.addEventListener('click', this._onLeetify);
    this.skipButton.addEventListener('click', this._onSkip);
    this.root.addEventListener('keydown', this._onKeyDown);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** Resolves with the saved handle, or null if the player skipped/cancelled. */
  open({ skipLabel = 'SKIP', title, copy } = {}) {
    if (this._resolve) return Promise.resolve(null); // already open — ignore re-entry

    this.title.textContent = title ?? this._defaultTitle;
    this.copy.textContent = copy ?? this._defaultCopy;
    this.input.value = this.profile.handle;
    this.input.placeholder = this._placeholder;
    this.error.textContent = '';
    this.skipButton.textContent = skipLabel;
    this.root.hidden = false;
    this.input.focus();
    this.input.select();

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  _close(handle) {
    this.root.hidden = true;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(handle);
  }

  _onSubmit(event) {
    event.preventDefault();
    // Empty means "use the suggestion" — the placeholder is a real handle, not a hint.
    const typed = sanitizeHandle(this.input.value) || this._placeholder;
    if (typed.length < HANDLE_MIN_LENGTH) {
      this.error.textContent = `Handles are at least ${HANDLE_MIN_LENGTH} characters.`;
      return;
    }
    const handle = this.profile.setHandle(typed);
    this.onSave?.(handle);
    this._close(handle);
  }

  _onLeetify() {
    this.input.value = leetify(this.input.value || this._placeholder);
    this.input.focus();
  }

  _onSkip() {
    this._close(null);
  }

  _onKeyDown(event) {
    if (event.key === 'Escape') this._close(null);
  }

  dispose() {
    this.form.removeEventListener('submit', this._onSubmit);
    this.leetButton.removeEventListener('click', this._onLeetify);
    this.skipButton.removeEventListener('click', this._onSkip);
    this.root.removeEventListener('keydown', this._onKeyDown);
    this._close(null);
  }
}
