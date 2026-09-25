import * as THREE from 'three';
import { buildWorld, LIFTABLE_CAR_SLOT } from './World.js';
import { Player } from './Player.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { Input } from './Input.js';
import { MobileControls } from './MobileControls.js';
import { EnemyManager } from './EnemyManager.js';
import { CombatSystem } from './CombatSystem.js';
import { GreenCodeBurst } from './GreenCodeBurst.js';
import { LiftableCar } from './LiftableCar.js';
import {
  PlayerProfile, formatDuration, ordinal, outranks, HIGH_SCORE_SLOTS,
} from './PlayerProfile.js';
import { HandleDialog } from './HandleDialog.js';
import { RemoteScores } from './RemoteScores.js';
import { Radio } from './Radio.js';

const PLAYER_SPAWN = new THREE.Vector3(-27.5, 0, 51);
const PLAYER_SPAWN_YAW = Math.PI;
const ENEMY_SPAWN_CENTER = new THREE.Vector3(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z - 10);
const ENEMY_COUNT = 5;
const PLAYER_MAX_HEALTH = 9;
const CAR_OBJECTIVE_UNLOCK_KILLS = 3;
const DEATH_FLASH_IN = 0.3;
const DEATH_REVEAL_DELAY = 0.9;
const DEATH_FLASH_OUT = 0.7;

export class Game {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 250
    );
    this.camera.position.set(0, 7, -11);

    this.world = buildWorld(this.scene);

    // Single baked asset shared with Decentraland: character + embedded clips in
    // one Draco-compressed GLB (produced by `npm run bake:anims:dcl`). The browser
    // decodes it via DRACOLoader; DCL loads the same file. Until it exists, the
    // primitive placeholder shows. Tune modelScale so the body is ~3 units tall,
    // and set modelYaw to Math.PI if it faces away.
    this.player = new Player({
      modelUrl: '/models/agent-dcl.glb',
      modelScale: 1.7,
      modelYaw: 0,
      maxHealth: PLAYER_MAX_HEALTH,
    });
    this.player.root.position.copy(PLAYER_SPAWN);
    this.player.root.rotation.y = PLAYER_SPAWN_YAW;
    this.scene.add(this.player.root);

    // One liftable car, parked in the bay World leaves empty by the entry ramp.
    this.liftableCar = new LiftableCar(this.scene, this.world, LIFTABLE_CAR_SLOT);

    this.combat = new CombatSystem();
    this.greenCodeBurst = new GreenCodeBurst(this.scene);
    this.enemyManager = new EnemyManager(ENEMY_COUNT, ENEMY_SPAWN_CENTER);
    this.enemyManager.addAll(this.scene);
    this._focusEnemy = null;

    this.enemyHealthMeter = document.getElementById('enemy-health-meter');
    this.enemyHealthFill = document.getElementById('enemy-health-fill');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.playerHealthMeter = document.getElementById('player-health-meter');
    this.playerHealthFill = document.getElementById('player-health-fill');
    this.playerHealthValue = document.getElementById('player-health-value');
    this.objective = document.getElementById('objective');
    this.runHandle = document.getElementById('run-handle');
    this.arcadeBar = document.getElementById('arcade-bar');
    this.arcadeRun = document.getElementById('arcade-run');
    this.arcadeHigh = document.getElementById('arcade-high');
    this.liftPrompt = document.getElementById('lift-prompt');
    this.damageFlash = document.getElementById('damage-flash');
    this.gameOverPanel = document.getElementById('game-over');
    this.gameOverScore = document.getElementById('game-over-score');
    this.gameOverHandle = document.getElementById('game-over-handle');
    this.gameOverSession = document.getElementById('game-over-session');
    this.gameOverRecord = document.getElementById('game-over-record');
    this.gameOverBoardLabel = document.getElementById('game-over-best');
    this.highScoreTable = document.getElementById('high-score-table');
    this.gameOver = false;
    this._downTime = 0;
    this._lastFlash = 0;

    // A session is one life: it starts at spawn and stops when the player goes
    // down, because the high score ranks kills against how long they took.
    this.profile = new PlayerProfile();
    this.sessionTime = 0;
    this._shownSecond = -1;
    this._shownKills = -1;
    this._pendingEntry = null; // row waiting to be named, arcade "enter your initials"
    // The shared board when the API answers, the localStorage one when it does
    // not — a static deploy still gets a leaderboard, just a private one.
    this.remoteScores = new RemoteScores();
    this._sessionRun = null;
    this._sessionId = 0;
    this._updateEnemyHud();
    this._updatePlayerHud();
    this._updateHandleHud();
    this._updateRunHud();

    this.input = new Input();
    this.followCam = new ThirdPersonCamera(this.camera, this.player.root, canvas, {
      bounds: this.world.cameraBounds,
    });
    this.mobileControls = new MobileControls(this.input, {
      root: document.getElementById('mobile-controls'),
      joystick: document.getElementById('move-stick'),
      thumb: document.getElementById('move-stick-thumb'),
      jumpButton: document.getElementById('jump-button'),
      punchButton: document.getElementById('punch-button'),
      liftButton: document.getElementById('lift-button'),
    });
    this.clock = new THREE.Clock();
    this._idleInput = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jumpPressed: false,
      punchPressed: false,
      liftPressed: false,
    };
    this.radio = new Radio({ root: document.getElementById('radio') });
    this._liftPromptText = '';
    this._disposed = false;

    this.handleDialog = new HandleDialog({
      root: document.getElementById('handle-gate'),
      form: document.getElementById('handle-gate-form'),
      input: document.getElementById('handle-gate-input'),
      error: document.getElementById('handle-gate-error'),
      title: document.getElementById('handle-gate-title'),
      copy: document.getElementById('handle-gate-copy'),
      leetButton: document.getElementById('handle-gate-leet'),
      skipButton: document.getElementById('handle-gate-skip'),
      profile: this.profile,
      onSave: () => this._updateHandleHud(),
    });
    this._onHandleEdit = () => this.promptForHandle({ skipLabel: 'CANCEL' });
    this.handleEditButton = document.getElementById('handle-edit');
    this.handleEditButton.addEventListener('click', this._onHandleEdit);

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
  }

  start() {
    this.renderer.setAnimationLoop(this._loop);
    // Fire and forget: the HUD shows the local board until this lands, then
    // repaints with the global one.
    this.remoteScores.load().then(() => {
      this._shownSecond = -1; // force the readout to repaint against the new best
      this._updateRunHud();
    });
  }

  _loop() {
    // Clamp dt so a paused/backgrounded tab doesn't teleport the player.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // The handle prompt freezes the run — it owns the keyboard, and someone
    // typing a name shouldn't be taking hits.
    if (this.handleDialog.isOpen) {
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }
    if (!this.gameOver) this.sessionTime += dt;
    if (this.input.radioMutePressed) this.radio.toggleMute();
    const canRetry = this.gameOver && !this.gameOverPanel.hidden;
    if (canRetry && (this.input.restartPressed || this.input.punchPressed)) this._restart();

    // Pickup is an intent like any other, but it needs the car, so it is resolved
    // here rather than inside Player — Player only ever sees "a prop".
    if (!this.gameOver && this.input.liftPressed && this.liftableCar.canLift(this.player)) {
      this.player.startLift(this.liftableCar);
    }

    this.player.update(
      dt,
      this.gameOver ? this._idleInput : this.input,
      this.camera,
      this.world
    );
    this.liftableCar.update(dt, this.world, this.player);
    const respawned = this.enemyManager.update(dt, this.player, this.world);

    if (!this.gameOver) {
      const preferredEnemy = this._focusEnemy?.alive ? this._focusEnemy : null;
      const result = this.combat.update(
        this.player,
        this.enemyManager.enemies,
        preferredEnemy
      );
      if (result.hitEnemy) {
        this._focusEnemy = result.hitEnemy;
        if (result.hitEnemy.health === 1 && !result.hitEnemy.spawnedOnLastHit) {
          result.hitEnemy.spawnedOnLastHit = true;
          this.enemyManager.addReinforcement(this.player, this.world);
        }
        this._updateEnemyHud();
      }
      if (result.defeatedEnemy) this.greenCodeBurst.play(result.hitEnemy.root.position);
      if (result.playerHit) this._updatePlayerHud();

      const flattened = this.combat.resolveThrownProp(
        this.liftableCar, this.enemyManager.enemies
      );
      if (flattened.length) {
        this.greenCodeBurst.play(flattened[flattened.length - 1].root.position);
        this._updateEnemyHud();
      }

      if (this.player.health === 0) this._endGame();
      this.world.collide(this.player.root.position, this.player.collisionRadius);
    }
    if (respawned) this._updateEnemyHud();
    this._updateLiftPrompt();
    this._updateRunHud();

    this._updateDeathFade(dt);
    this.greenCodeBurst.update(dt);
    this.followCam.update(dt, this.player.velocity.lengthSq() > 0.01);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame(); // clear edge-triggered input after everyone has read it
  }

  _updateEnemyHud() {
    let health = 0;
    let maxHealth = 0;
    for (const enemy of this.enemyManager.enemies) {
      health += enemy.health;
      maxHealth += enemy.maxHealth;
    }
    const healthRatio = maxHealth > 0 ? health / maxHealth : 0;
    this.enemyHealthFill.style.transform = `scaleX(${healthRatio})`;
    this.enemyHealthValue.textContent =
      `${this.enemyManager.aliveCount} ACTIVE / ${this.enemyManager.defeated} DOWN`;
    this.enemyHealthMeter.setAttribute('aria-valuenow', String(health));
    this.enemyHealthMeter.setAttribute('aria-valuemax', String(maxHealth));
    this.objective.textContent = this.enemyManager.defeated >= CAR_OBJECTIVE_UNLOCK_KILLS
      ? 'OBJECTIVE // THROW CAR TO DESTROY AGENTS AND ESCAPE THE GARAGE'
      : 'OBJECTIVE // DEFEND YOURSELF';
  }

  _updatePlayerHud() {
    const { health, maxHealth } = this.player;
    this.playerHealthFill.style.transform = `scaleX(${health / maxHealth})`;
    this.playerHealthValue.textContent = `${health} / ${maxHealth}`;
    this.playerHealthMeter.setAttribute('aria-valuenow', String(health));
    this.playerHealthMeter.setAttribute('aria-valuemax', String(maxHealth));
  }

  _updateHandleHud() {
    const handle = this.profile.handle || 'UNSET';
    this.runHandle.textContent = handle;
    // Also the game-over headline, which the post-run name prompt sits over.
    this.gameOverHandle.textContent = handle;
    this.playerHealthMeter.setAttribute('aria-label', `${handle} health`);
  }

  // The cabinet readout: this run beside the score to beat. Rewrites only when
  // the displayed values change — it runs every frame.
  _updateRunHud() {
    const second = Math.floor(this.sessionTime);
    const kills = this.enemyManager.defeated;
    if (second === this._shownSecond && kills === this._shownKills) return;
    this._shownSecond = second;
    this._shownKills = kills;

    const run = { kills, seconds: second };
    const best = this._boardBest();
    // Pass the top row and the HIGH SCORE column becomes your run, still live.
    const leading = kills > 0 && outranks(run, best);
    this.arcadeRun.textContent = formatRun(run);
    this.arcadeHigh.textContent = leading ? formatRun(run) : formatRun(best);
    this.arcadeBar.classList.toggle('leading', leading);
  }

  /** The score to beat: the shared board's top row, or this browser's own. */
  _boardBest() {
    return this.remoteScores.available ? this.remoteScores.best : this.profile.best;
  }

  /**
   * Renders one board. `global` only labels it — which rows arrive is the
   * caller's call, so the heading always matches what is on screen even while a
   * submission is still in flight.
   */
  _renderBoard(scores, currentIndex, global) {
    this.gameOverBoardLabel.textContent = global ? 'GLOBAL HIGH SCORES' : 'LOCAL HIGH SCORES';
    const rows = [];
    for (let index = 0; index < HIGH_SCORE_SLOTS; index += 1) {
      const entry = scores[index];
      const classes = ['score-row'];
      if (!entry) classes.push('empty');
      if (entry && index === currentIndex) classes.push('current');
      rows.push(
        `<li class="${classes.join(' ')}">` +
        `<span class="score-rank">${ordinal(index)}</span>` +
        `<span class="score-name">${escapeHtml(entry?.handle || (entry ? 'ANON' : '---'))}</span>` +
        `<span class="score-kills">${entry ? `${entry.kills} ${entry.kills === 1 ? 'AGENT' : 'AGENTS'}` : '--'}</span>` +
        `<span class="score-time">${entry ? formatDuration(entry.seconds) : '--'}</span>` +
        '</li>'
      );
    }
    this.highScoreTable.innerHTML = rows.join('');
  }

  _showRank(rank) {
    this.gameOverRecord.hidden = rank === 0;
    this.gameOverRecord.textContent =
      rank === 1 ? 'NEW HIGH SCORE' : `RANKED ${ordinal(rank - 1)}`;
  }

  /** Opens the handle prompt, freezing the run until it closes. */
  async promptForHandle(options) {
    this.input.setSuspended(true);
    try {
      return await this.handleDialog.open(options);
    } finally {
      this.input.setSuspended(false);
    }
  }

  /** Boot-time ask: first-time players name themselves before the first run. */
  promptForHandleIfUnset() {
    return this.profile.handle ? Promise.resolve(null) : this.promptForHandle();
  }

  // One prompt drives both the desktop HUD line and the touch button's label.
  _updateLiftPrompt() {
    let text = '';
    if (this.gameOver || this.player.busyWithProp) text = '';
    else if (this.player.carrying) text = 'J / LIFT — THROW THE CAR';
    else if (this.liftableCar.canLift(this.player)) text = 'E / LIFT — PICK UP THE CAR';

    if (text !== this._liftPromptText) {
      this._liftPromptText = text;
      this.liftPrompt.textContent = text;
      this.liftPrompt.hidden = !text;
      this.mobileControls.setLiftState(!!text, this.player.carrying ? 'THROW' : 'LIFT');
    }
  }

  _endGame() {
    this.gameOver = true;
    this._downTime = 0;
    const count = this.enemyManager.defeated;
    const seconds = this.sessionTime;
    const { rank, entry } = this.profile.recordRun(count, seconds);
    this._sessionId += 1;
    this._sessionRun = count > 0 ? { kills: count, seconds } : null;

    this.gameOverScore.textContent =
      `${count} ${count === 1 ? 'AGENT' : 'AGENTS'} NEUTRALIZED`;
    this.gameOverSession.textContent = `SESSION ${formatDuration(this.sessionTime)}`;
    this._showRank(rank);
    // The local board goes up immediately; the shared one replaces it when the
    // submission answers, so there is always a board on screen.
    this._renderBoard(this.profile.scores, rank - 1, false);

    // A row with nobody's name on it gets one the way a cabinet asks: once the
    // board is actually on screen (_updateDeathFade reveals it). The run is
    // submitted after that, so the shared board gets the name too.
    this._pendingEntry = entry && !entry.handle ? entry : null;
    if (!this._pendingEntry) this._submitSession();
  }

  async _promptForEntryName() {
    const entry = this._pendingEntry;
    this._pendingEntry = null;
    const handle = await this.promptForHandle({
      title: 'YOU MADE THE BOARD',
      copy: 'Name the run that goes up on the high score table.',
      skipLabel: 'ANON',
    });
    if (handle) this.profile.nameEntry(entry, handle);
    this._renderBoard(this.profile.scores, this.profile.scores.indexOf(entry), false);
    this._submitSession();
  }

  /**
   * Sends the finished run to the shared board and shows what came back. The
   * session id guards against a slow reply landing on the next run's panel.
   */
  async _submitSession() {
    const run = this._sessionRun;
    this._sessionRun = null;
    if (!run) return;

    const sessionId = this._sessionId;
    const result = await this.remoteScores.submit({ ...run, handle: this.profile.handle });
    if (!result || sessionId !== this._sessionId) return;

    this._showRank(result.rank);
    this._renderBoard(result.scores, result.rank - 1, true);
  }

  _restart() {
    this.gameOver = false;
    document.body.classList.remove('game-over-visible');
    this._downTime = 0;
    this.sessionTime = 0;
    this._pendingEntry = null;
    this._lastFlash = 0;
    this.damageFlash.style.opacity = '0';
    this.gameOverPanel.hidden = true;
    this.player.reset();
    this.player.root.position.copy(PLAYER_SPAWN);
    this.player.root.rotation.y = PLAYER_SPAWN_YAW;
    this.liftableCar.reset();
    this.enemyManager.reset(ENEMY_SPAWN_CENTER);
    this._focusEnemy = null;
    this._updateEnemyHud();
    this._updatePlayerHud();
    this._updateRunHud();
  }

  _updateDeathFade(dt) {
    if (!this.gameOver) return;
    this._downTime += dt;
    const rampIn = Math.min(this._downTime / DEATH_FLASH_IN, 1);
    const fadeOut = Math.min(
      Math.max(this._downTime - DEATH_REVEAL_DELAY, 0) / DEATH_FLASH_OUT,
      1
    );
    const intensity = rampIn * (1 - fadeOut);
    if (intensity !== this._lastFlash) {
      this._lastFlash = intensity;
      this.damageFlash.style.opacity = (intensity * 0.75).toFixed(3);
    }
    if (this._downTime >= DEATH_REVEAL_DELAY && this.gameOverPanel.hidden) {
      this.gameOverPanel.hidden = false;
      document.body.classList.add('game-over-visible');
      if (this._pendingEntry) this._promptForEntryName();
    }
  }

  _onResize() {
    this.mobileControls.reset();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Re-apply in case the window moved to a display with a different DPI.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.renderer.setAnimationLoop(null);
      window.removeEventListener('resize', this._onResize);
      window.visualViewport?.removeEventListener('resize', this._onResize);
      this.handleEditButton.removeEventListener('click', this._onHandleEdit);
      this.handleDialog.dispose();
      this.radio.dispose();
      this.mobileControls.dispose();
      this.input.dispose();
      this.followCam.dispose();
      this.player.dispose();
      this.liftableCar.dispose();
      this.enemyManager.dispose();
      this.greenCodeBurst.dispose();
      this.world.dispose();
      this.scene.clear();
      this.renderer.dispose();
    }
  }
}

// "3 · 1:05" — the two halves of a score on this cabinet.
function formatRun(run) {
  return run ? `${run.kills} · ${formatDuration(run.seconds)}` : '-- · --';
}

// Handles are sanitized to a known alphabet on the way in, but the board is the
// one place they reach innerHTML, so escape rather than rely on that.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
