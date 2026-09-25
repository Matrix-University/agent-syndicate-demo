// In-game player for Radio Free Zion's Icecast stream, dressed as a Winamp-2-style
// window (RFZAMP). It is plain DOM audio, not Three.js — the stream has no place in
// the scene graph and never touches the render loop; its readouts run off audio
// events and a slow now-playing poll.
export const RADIO_STREAM_URL = 'https://stream.radiofreezion.net:8061/listen.mp3';
export const RADIO_SITE_URL = 'https://radiofreezion.net/';
// The station host's (Centova Cast) public now-playing feed. It sends CORS headers,
// unlike the Icecast status page, but it is undocumented — every read is optional.
const NOW_PLAYING_URL = 'https://cast2.asurahosting.com/rpc/radiofreezion/streaminfo.get';
const NOW_PLAYING_POLL_MS = 15000;
const TICKER_SECONDS_PER_CHAR = 0.22;
const TICKER_GAP = '  ***  ';
const MAX_TRACK_LENGTH = 120;

const STORAGE_KEY = 'agentSyndicate.radio';
const DEFAULT_VOLUME = 0.6;

const STATUS_LABEL = {
  off: 'OFF',
  connecting: 'CONNECTING',
  buffering: 'BUFFERING',
  live: 'LIVE',
  blocked: 'BLOCKED',
  offline: 'OFFLINE',
};

export class Radio {
  constructor({ root, shoutButton = null }) {
    this.root = root;
    // The compact HUD's stand-in for the whole window: one megaphone, lit by
    // the stream's status, that switches the radio on and off.
    this.shoutButton = shoutButton;
    const part = (id) => root.querySelector(`#${id}`);
    this.powerButton = part('radio-power');
    this.playButton = part('radio-play');
    this.stopButton = part('radio-stop');
    this.muteButton = part('radio-mute');
    this.volumeInput = part('radio-volume');
    this.statusEl = part('radio-status');
    this.timeEl = part('radio-time');
    this.tickerEl = part('radio-ticker');
    this.kbpsEl = part('radio-kbps');
    this.listenersEl = part('radio-listeners');

    const saved = loadSettings();
    this.volume = saved.volume;
    this.muted = saved.muted;
    this.on = false; // never autoplay: browsers block it, and a surprise stream is rude
    // Audio actually coming out, not just "switched on": the lamp only lights
    // once the stream answers, and drops back while it rebuffers.
    this.playing = false;
    this.status = 'off';
    this.nowPlaying = null; // { track, kbps, listeners, offline } from the feed
    this._tickerKey = null;
    this._shownSecond = -1;
    this._pollTimer = 0;
    this._pollAbort = null;

    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.volume = this.volume;
    this.audio.muted = this.muted;

    // A focused control would swallow Space (jump) and the arrows (move), so
    // every click hands focus straight back.
    this._onPower = () => { this.toggle(); this.powerButton.blur(); };
    this._onShout = () => { this.toggle(); this.shoutButton.blur(); };
    this._onPlay = () => { this.turnOn(); this.playButton.blur(); };
    this._onStop = () => { this.turnOff(); this.stopButton.blur(); };
    this._onMute = () => { this.toggleMute(); this.muteButton.blur(); };
    this._onVolume = () => this.setVolume(Number(this.volumeInput.value) / 100);
    this._onVolumeDone = () => this.volumeInput.blur();
    this._onPlaying = () => { this.playing = true; this.status = 'live'; this._render(); };
    this._onWaiting = () => { this.playing = false; this.status = 'buffering'; this._render(); };
    this._onTimeUpdate = () => this._renderTime();
    this._onError = () => {
      if (this.on) this._shutDown('offline');
    };

    this.powerButton.addEventListener('click', this._onPower);
    this.shoutButton?.addEventListener('click', this._onShout);
    this.playButton.addEventListener('click', this._onPlay);
    this.stopButton.addEventListener('click', this._onStop);
    this.muteButton.addEventListener('click', this._onMute);
    this.volumeInput.addEventListener('input', this._onVolume);
    this.volumeInput.addEventListener('change', this._onVolumeDone);
    this.audio.addEventListener('playing', this._onPlaying);
    this.audio.addEventListener('waiting', this._onWaiting);
    this.audio.addEventListener('timeupdate', this._onTimeUpdate);
    this.audio.addEventListener('error', this._onError);

    this._render();
  }

  toggle() {
    if (this.on) this.turnOff();
    else this.turnOn();
  }

  turnOn() {
    if (this.on) return;
    this.on = true;
    this.playing = false;
    this.status = 'connecting';
    // Re-point at the stream each time so it resumes live rather than from the
    // stale buffer left when it was switched off.
    this.audio.src = RADIO_STREAM_URL;
    this._render();
    this._renderTime();
    this._startNowPlaying();
    this.audio.play().catch((err) => {
      // NotAllowedError is the autoplay policy (no user gesture yet), not the stream.
      if (this.on) this._shutDown(err?.name === 'NotAllowedError' ? 'blocked' : 'offline');
    });
  }

  turnOff() {
    if (this.on) this._shutDown('off');
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setMuted(muted) {
    this.muted = muted;
    this.audio.muted = muted;
    saveSettings(this);
    this._render();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.audio.volume = this.volume;
    // Dragging the slider up is an unmute, as on any media player.
    if (this.muted && this.volume > 0) this.setMuted(false);
    else {
      saveSettings(this);
      this._render();
    }
  }

  _shutDown(status) {
    this.on = false;
    this.playing = false;
    this.status = status;
    this._stopNowPlaying();
    this._stopStream();
    this._render();
  }

  // Pausing a live stream keeps the connection downloading; dropping the source
  // is what actually hangs up.
  _stopStream() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  // Polls only while the radio is on, so nobody's tab hits the station's host
  // for a stream they aren't listening to.
  _startNowPlaying() {
    this._stopNowPlaying();
    const poll = async () => {
      const abort = new AbortController();
      this._pollAbort = abort;
      try {
        const res = await fetch(NOW_PLAYING_URL, { signal: abort.signal, cache: 'no-store' });
        if (res.ok) this._applyNowPlaying(await res.json());
      } catch {
        // Best effort: the ticker falls back to the station name.
      }
      if (this.on && !abort.signal.aborted) {
        this._pollTimer = setTimeout(poll, NOW_PLAYING_POLL_MS);
      }
    };
    poll();
  }

  _stopNowPlaying() {
    clearTimeout(this._pollTimer);
    this._pollAbort?.abort();
    this._pollAbort = null;
  }

  _applyNowPlaying(json) {
    const info = json?.data?.[0];
    if (!info || !this.on) return;
    const artist = cleanText(info.track?.artist);
    const title = cleanText(info.track?.title);
    const listeners = Number.parseInt(info.listeners, 10);
    const kbps = Number.parseInt(info.bitrate, 10);
    this.nowPlaying = {
      track: artist && title ? `${artist} - ${title}` : cleanText(info.song),
      listeners: Number.isFinite(listeners) ? listeners : null,
      kbps: Number.isFinite(kbps) ? kbps : null,
      offline: info.offline === true,
    };
    this._render();
  }

  _render() {
    const silent = this.muted || this.volume === 0;
    this.root.classList.toggle('on', this.on);
    this.root.classList.toggle('playing', this.playing);
    this.root.classList.toggle('muted', silent);
    this.powerButton.setAttribute('aria-pressed', String(this.on));
    this.powerButton.title = this.on ? 'Turn radio off' : 'Turn radio on';
    this.muteButton.setAttribute('aria-pressed', String(this.muted));
    this.statusEl.textContent = STATUS_LABEL[this.status];
    if (this.shoutButton) {
      const label = `Radio Free Zion: ${STATUS_LABEL[this.status]}${this.on && silent ? ', muted' : ''}`
        + ` — turn ${this.on ? 'off' : 'on'}`;
      this.shoutButton.dataset.status = this.status;
      this.shoutButton.classList.toggle('muted', silent);
      this.shoutButton.setAttribute('aria-pressed', String(this.on));
      this.shoutButton.setAttribute('aria-label', label);
      this.shoutButton.title = label;
    }

    const volumePercent = Math.round(this.volume * 100);
    this.volumeInput.value = String(volumePercent);
    this.volumeInput.setAttribute('aria-valuetext', `${volumePercent}%`);
    // Winamp's volume bar changed colour with level; in mono, it brightens.
    this.volumeInput.style.setProperty('--radio-vol', `${volumePercent}%`);
    this.volumeInput.style.setProperty('--radio-vol-colour', `hsl(105 100% ${22 + volumePercent * 0.33}%)`);

    const info = this.nowPlaying;
    this.kbpsEl.textContent = info?.kbps ?? '--';
    this.listenersEl.textContent = info?.listeners ?? '--';
    this._setTicker(this._tickerLine(), this.playing);
  }

  _tickerLine() {
    if (this.status === 'connecting') return 'CONNECTING TO RADIO FREE ZION...';
    if (this.status === 'buffering') return 'BUFFERING...';
    if (this.nowPlaying?.offline) return 'STATION OFFLINE';
    return this.nowPlaying?.track || 'RADIO FREE ZION';
  }

  // Only touch the DOM when the line (or whether it scrolls) changes: rewriting
  // it restarts the scroll from the first character.
  _setTicker(text, scrolling) {
    const key = `${scrolling}|${text}`;
    if (key === this._tickerKey) return;
    this._tickerKey = key;
    const loop = text + TICKER_GAP;
    this.tickerEl.textContent = scrolling ? loop + loop : text;
    this.tickerEl.classList.toggle('scrolling', scrolling);
    this.tickerEl.style.setProperty('--ticker-steps', String(loop.length));
    this.tickerEl.style.setProperty('--ticker-duration', `${loop.length * TICKER_SECONDS_PER_CHAR}s`);
  }

  // Listening time, Winamp's elapsed clock. `timeupdate` fires a few times a
  // second; the DOM is only written when the displayed second changes.
  _renderTime() {
    const second = this.on ? Math.floor(this.audio.currentTime || 0) : 0;
    if (second === this._shownSecond) return;
    this._shownSecond = second;
    const minutes = String(Math.floor(second / 60)).padStart(2, '0');
    this.timeEl.textContent = `${minutes}:${String(second % 60).padStart(2, '0')}`;
  }

  dispose() {
    this.powerButton.removeEventListener('click', this._onPower);
    this.shoutButton?.removeEventListener('click', this._onShout);
    this.playButton.removeEventListener('click', this._onPlay);
    this.stopButton.removeEventListener('click', this._onStop);
    this.muteButton.removeEventListener('click', this._onMute);
    this.volumeInput.removeEventListener('input', this._onVolume);
    this.volumeInput.removeEventListener('change', this._onVolumeDone);
    this.audio.removeEventListener('playing', this._onPlaying);
    this.audio.removeEventListener('waiting', this._onWaiting);
    this.audio.removeEventListener('timeupdate', this._onTimeUpdate);
    this.audio.removeEventListener('error', this._onError);
    this.on = false;
    this.playing = false;
    this._stopNowPlaying();
    this._stopStream();
  }
}

// Track names come from the station's metadata and only ever reach textContent;
// this just keeps a malformed one from blowing out the display.
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, MAX_TRACK_LENGTH);
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const volume = Number(saved.volume);
    return {
      volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_VOLUME,
      muted: saved.muted === true,
    };
  } catch {
    return { volume: DEFAULT_VOLUME, muted: false };
  }
}

function saveSettings({ volume, muted }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // Private mode / blocked storage: the radio still works, it just forgets.
  }
}
