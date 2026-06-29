import * as THREE from 'three';

// Locomotion states. Player decides which one applies from movement; this
// controller maps it to a clip and crossfades.
export const STATE = { IDLE: 'idle', WALK: 'walk', RUN: 'run' };

// State -> clip name fragments, matched case-insensitively as a substring and
// tried in order, so a neutral "Idle_No_Loop" wins over "Idle_Lantern_Loop".
// NOTE: substring matching assumes reasonably curated clip names.
const CLIP_NAMES = {
  [STATE.IDLE]: ['idle_no', 'idle', 'breath'],
  [STATE.WALK]: ['walk'],
  [STATE.RUN]: ['run', 'jog', 'sprint'],
};

// If a state's own clip is missing, borrow one of these — so a model shipping a
// single locomotion clip still animates all movement.
const CLIP_FALLBACK = {
  [STATE.IDLE]: [],
  [STATE.WALK]: [STATE.RUN, STATE.IDLE],
  [STATE.RUN]: [STATE.WALK, STATE.IDLE],
};

// One-shot actions: triggered, played ONCE, then control returns to locomotion.
const ACTIONS = {
  punch: ['melee_hook', 'punch'],
};

// Jump is a 3-phase clip sequence layered over the vertical physics in Player.
// Any phase whose clip is missing is skipped.
const JUMP_CLIPS = {
  start: ['ninjajump_start', 'jump_start'],
  air: ['ninjajump_idle', 'jump_air', 'jump_loop', 'falling'],
  land: ['ninjajump_land', 'jump_land'],
};

// Crossfade durations (seconds).
const FADE = 0.2;        // locomotion <-> locomotion
const FADE_FAST = 0.12;  // jump phase transitions
const FADE_ACTION = 0.1; // one-shot actions

// Drives a character's AnimationMixer from high-level intent: locomotion state,
// one-shot actions (punch), and a jump sequence. Owns all clip/action bookkeeping
// so Player can stay about movement.
//
// Override priority (what suspends locomotion):
//   airborne (jump start/air) — locked; only landing ends it.
//   action   (punch)          — locked until the clip finishes.
//   landing  (jump land)      — a flourish; movement or a new action cancels it.
export class AnimationController {
  constructor(model, clips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};   // STATE -> looping AnimationAction
    this.oneShots = {};  // action name -> AnimationAction
    this.jump = {};      // phase -> AnimationAction
    this.current = null; // locomotion AnimationAction currently playing

    this._action = null;     // blocking one-shot (punch)
    this._airborne = false;  // jump start/air phases
    this._landing = false;   // jump land phase (interruptible)
    this._jumpPhase = null;  // 'start' | 'air' | 'land'
    this._jumpAction = null; // jump AnimationAction currently playing

    bind(clips, CLIP_NAMES, (state, action) => { this.actions[state] = action; }, this.mixer);
    bind(clips, ACTIONS, (name, action) => { this.oneShots[name] = action; }, this.mixer);
    bind(clips, JUMP_CLIPS, (phase, action) => { this.jump[phase] = action; }, this.mixer);

    this._onFinished = this._onFinished.bind(this);
    this.mixer.addEventListener('finished', this._onFinished);

    const idle = this._resolve(STATE.IDLE);
    if (idle) { idle.play(); this.current = idle; }
  }

  // True while the character is in the air — Player uses this to keep air control
  // but suspend ground-only actions.
  get airborne() { return this._airborne; }
  // True during a blocking one-shot (punch) — Player roots movement while it plays.
  get acting() { return !!this._action; }

  update(dt) { this.mixer.update(dt); }

  // Crossfade to the locomotion clip for `state`. Ignored while airborne or mid
  // action; during the land flourish, a moving state cancels it but idle lets it
  // finish. `speedFactor` (speed / walkSpeed) scales playback so feet don't skate.
  setLocomotion(state, speedFactor = 1) {
    if (this._airborne || this._action) return;
    if (this._landing) {
      if (state === STATE.IDLE) return; // let the land flourish play out
      this._endLanding();               // moving out of a landing cancels it
    }
    const next = this._resolve(state);
    if (next && next !== this.current) {
      next.reset().fadeIn(FADE).play();
      if (this.current) this.current.fadeOut(FADE);
      this.current = next;
    }
    if (this.current) {
      this.current.timeScale = state === STATE.IDLE
        ? 1
        : THREE.MathUtils.clamp(speedFactor, 0.6, 2.2);
    }
  }

  // Play a one-shot action once (e.g. 'punch'). Returns false if it can't (no clip,
  // airborne, or already mid-action). Cancels a landing flourish if one is playing.
  playAction(name) {
    const action = this.oneShots[name];
    if (!action || this._airborne || this._action) return false;
    if (this._landing) this._endLanding();
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; // hold the final pose while it fades out
    action.timeScale = 1;
    action.fadeIn(FADE_ACTION).play();
    if (this.current) this.current.fadeOut(FADE_ACTION);
    this.current = null; // setLocomotion re-crossfades once the action ends
    this._action = action;
    return true;
  }

  // Called by Player's physics when the character leaves the ground.
  jumpTakeoff() {
    this._airborne = true;
    this._landing = false;
    if (this.current) this.current.fadeOut(FADE_FAST);
    this.current = null;
    if (this._action) { this._action.fadeOut(FADE_FAST); this._action = null; }
    this._playJump(this.jump.start ? 'start' : 'air');
  }

  // Called by Player's physics on touchdown. Plays the land flourish (interruptible)
  // or resumes locomotion immediately if there's no land clip.
  jumpLand() {
    this._airborne = false;
    if (this.jump.land) { this._landing = true; this._playJump('land'); }
    else this._endLanding();
  }

  dispose() {
    this.mixer.removeEventListener('finished', this._onFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }

  // -- internals --------------------------------------------------------------
  _onFinished(e) {
    if (e.action === this._action) {
      this._action.fadeOut(FADE_ACTION);
      this._action = null;
      this.current = null; // setLocomotion re-crossfades next frame
      return;
    }
    if (e.action === this.jump.start && this._jumpPhase === 'start' && this._airborne) {
      this._playJump('air'); // takeoff done, still airborne -> loop the air pose
    } else if (e.action === this.jump.land && this._jumpPhase === 'land') {
      this._endLanding();
    }
  }

  _endLanding() {
    this._landing = false;
    this._jumpPhase = null;
    if (this._jumpAction) { this._jumpAction.fadeOut(FADE); this._jumpAction = null; }
    this.current = null; // setLocomotion re-crossfades next frame
  }

  // Crossfade to a jump phase's clip. 'air' loops; 'start'/'land' play once.
  _playJump(phase) {
    const action = this.jump[phase];
    this._jumpPhase = phase;
    if (!action) return;
    const loop = phase === 'air';
    if (this._jumpAction && this._jumpAction !== action) this._jumpAction.fadeOut(FADE_FAST);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop; // hold the last pose between phases
    action.fadeIn(FADE_FAST).play();
    this._jumpAction = action;
  }

  // Action for a state, borrowing a CLIP_FALLBACK action if its own clip is absent.
  _resolve(state) {
    if (this.actions[state]) return this.actions[state];
    for (const fb of CLIP_FALLBACK[state] ?? []) {
      if (this.actions[fb]) return this.actions[fb];
    }
    return null;
  }
}

// Bind clips to a map: for each key, find the best-matching clip and hand its
// AnimationAction to `assign(key, action)`.
function bind(clips, table, assign, mixer) {
  for (const [key, fragments] of Object.entries(table)) {
    const clip = findClip(clips, fragments);
    if (clip) assign(key, mixer.clipAction(clip));
  }
}

// Best clip for a set of fragments: fragments are tried in priority order, so an
// earlier fragment ("idle_no") wins over a later one ("idle") even if both match.
function findClip(clips, fragments) {
  for (const f of fragments) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(f));
    if (hit) return hit;
  }
  return null;
}
