# Interactive Game Plan

This document outlines what the prototype may need to become an interactive
game based on the story described in the project README. The playable demo
starts with **Scene 2**, after the Twins have already combined into the Hulk-sized
Agent Rayment.

## Player Experience

The demo should begin in the Hel Club parking garage and place the player into
the central conflict quickly. Agent Lewis gives the objective over a radio call:
fight through the attacking System Agents and reach a hardline. Activating the
hardline completes the parking-garage mission and transports Agent Rayment to
Debir Court.

This creates a clear first playable loop:

1. Receive an objective from Agent Lewis.
2. Fight a small group of System Agents.
3. Move through successive areas of the parking garage.
4. Defeat a stronger Agent guarding the exit.
5. Reach and activate the hardline checkpoint.
6. Transition to the Debir Court encounter.

## Scene 2: Parking Garage Escape

The garage should be a short sequence of connected combat spaces rather than a
single open arena:

- **Arrival area:** Introductory radio call and one tutorial enemy.
- **Garage ramp:** Enemies approach from different elevations.
- **Parked-car section:** Tighter movement around cars, barriers, and pillars.
- **Security gate:** Opens after the player completes an encounter.
- **Exit area:** A Heavy Agent or miniboss guards the hardline.
- **Hardline zone:** A clear interaction point that ends the mission.

Useful environmental elements include concrete pillars, fluorescent fixtures,
parked vehicles, ramps, barriers, wall signs, tire marks, impact debris, and
security gates. Invisible boundaries and enemy navigation constraints will be
needed to prevent characters from becoming trapped behind scenery.

The hardline should be visually distinct and require a brief hold interaction.
Activating it should stop combat, play a transition effect, save checkpoint
progress, and load the next scene.

## Scene 3: Debir Court

Debir Court can expand the systems introduced in the garage:

- Larger waves of Agents arrive from multiple entrances.
- New enemy archetypes require different combat responses.
- The player can pick up a pole and use an alternate moveset.
- The encounter ends after defeating a boss, defeating a target number of
  enemies, or surviving for a specified time.
- Agent Lewis contacts Rayment and explains how to separate back into the Twins.
- The final objective changes from combat to an undetected return to Hel Club.

## Core Combat

The current punch can grow into a compact melee system with:

- A three-hit light attack combo.
- A heavy attack that breaks guards or causes strong knockback.
- A dodge or evasive dash.
- Blocking and an optional timed parry.
- Jump attacks and, later, launchers or aerial follow-ups.
- Soft targeting that turns attacks toward a nearby opponent.
- Hit reactions, knockdowns, recovery, and brief damage invulnerability.
- Player and enemy health, damage, defeat, restart, and checkpoints.
- Contextual pole pickup with a temporary alternate moveset.
- A green-code particle burst when an enemy is defeated.

The first combat milestone should use only one enemy. Strikes, reactions,
targeting, timing, and impact feedback should feel reliable before increasing
the crowd size.

## Enemy System

A small roster can create useful variety without requiring many entirely
different systems:

- **Standard Agent:** Basic melee behavior and readable attacks.
- **Aggressor:** Attacks frequently and pressures the player.
- **Defender:** Blocks light attacks and encourages heavy attacks or parries.
- **Heavy Agent:** Slow, resistant to knockback, and suitable as a garage
  miniboss.
- **Boss Agent:** Uses recognizable patterns and multiple combat phases.

Each enemy needs behavior for:

- Approaching the player.
- Circling at combat range.
- Waiting for permission to attack.
- Starting and completing an attack.
- Reacting to hits and knockback.
- Falling, recovering, and returning to combat.
- Dying and triggering the green-code effect.

Crowd combat also needs an encounter coordinator. Enemies can surround and
reposition around Rayment, but only one or two should hold attack slots at a
time. This avoids unreadable simultaneous attacks and creates a more staged,
cinematic fight.

## Fuse and Split Mechanic

The transformation system can become the game's main strategic distinction:

- **Fused Agent Rayment:** Can attack and use weapons, but can take damage.
- **Separated Twins:** Cannot attack, cannot be targeted by normal enemies, and
  slowly regenerate health.
- Splitting may require a safe moment, a cooldown, or a limited resource.
- Recombining should take time and may be interrupted in dangerous areas.
- Security systems, story objectives, or marked detection zones can still
  threaten the Twins so the separated state does not bypass every challenge.

For the first parking-garage vertical slice, this mechanic can remain locked.
Agent Lewis can introduce it at the end of Debir Court, where it becomes central
to the non-combat return to Hel Club.

## Mission and Progression Systems

The playable sequence will need supporting game-state systems in addition to
combat:

- Objective tracker.
- Encounter triggers and wave-completion conditions.
- Dialogue and subtitle queue for Agent Lewis.
- Interaction prompts.
- Checkpoint and restart behavior.
- Scene-transition controller.
- Pause menu and control reference.
- Loading, victory, and defeat states.

A simple parking-garage mission state machine could be:

```text
Intro call
-> Tutorial enemy
-> Garage wave
-> Security gate opens
-> Miniboss
-> Hardline available
-> Level complete
```

## Game Feel and Presentation

The following details will contribute significantly to the Burly Brawl-inspired
experience:

- Brief hit-stop on strong impacts.
- Camera shake scaled to attack strength.
- Distinct hit, block, movement, and exertion sounds.
- Attack trails, sparks, dust, and debris at contact points.
- Clear anticipation before enemy attacks.
- Strong hit, block, knockdown, and defeat reactions.
- Context-sensitive camera framing for major attacks or finishers.
- Music intensity that rises with encounter pressure.
- Controller support and optional vibration.
- Settings for camera shake, flashes, subtitles, and difficulty.

## Recommended Implementation Order

1. Add one enemy with health, hit detection, hit reactions, and death.
2. Build a reliable three-hit player combo.
3. Add enemy approach, circling, attack, and recovery behavior.
4. Add dodge, block, player damage, defeat, and restart.
5. Support multiple enemies with attack-slot coordination.
6. Add garage encounter triggers, gates, objectives, and checkpoints.
7. Add the green-code enemy defeat effect.
8. Add the Heavy Agent and hardline completion sequence.
9. Add the transition to Debir Court.
10. Add pole combat and the fuse/split state machine.

## MVP Coding Plan

The minimum viable product is one complete combat loop in the existing parking
garage. It uses primitive characters and temporary effects so gameplay can be
tested before an artist creates final skins.

### MVP Scope

The MVP contains:

- One garage room using the current `World`.
- One primitive System Agent.
- One player punch with a short, visible damage window.
- Enemy health, hit reaction, and death.
- One slow, telegraphed enemy attack so the player can lose.
- A simple green particle burst when the enemy dies.
- A hardline that unlocks after the enemy dies.
- Mission-complete and player-defeat states.
- A restart control that resets the encounter.

### Code Ownership

Keep gameplay independent from final character art:

- `Player.js` continues to own player movement, health, and attack intent.
  `Player.root` remains the gameplay transform and `Player.rig` remains the
  replaceable visual body.
- Add `Enemy.js` with the same `root` and `rig` separation. It owns enemy health,
  attack timing, hit reactions, and its primitive placeholder.
- Add `CombatSystem.js` to resolve attack ranges and apply each attack only once.
  Hit detection uses gameplay positions and radii, never mesh or bone names.
- Add `GreenCodeBurst.js` for the temporary enemy-death particle effect and its
  resource cleanup.
- Add `Hardline.js` to own the hardline mesh, locked/unlocked appearance, and
  player proximity check.
- `Game.js` owns the MVP mission state, creates these systems, updates them in a
  fixed order, updates the HUD, and resets or disposes the encounter.
- `index.html` provides minimal health, objective, outcome, and restart UI.
- `World.js` remains responsible for garage geometry and static collision only.

### Mission State

Use a small explicit state machine:

```text
FIGHT
-> HARDLINE_READY
-> COMPLETE

FIGHT or HARDLINE_READY
-> DEFEAT
-> RESTART
-> FIGHT
```

Only the `FIGHT` state allows the enemy to attack. The hardline remains locked
until the enemy death callback changes the state to `HARDLINE_READY`. Reaching
the unlocked hardline changes the state to `COMPLETE`.

### Milestone 1: Enemy Target

1. Create `Enemy.js` with a primitive rig, collision radius, maximum health, and
  current health.
2. Give it `takeDamage(amount)`, `update(dt, player)`, `reset()`, and `dispose()`
  methods.
3. Add a short color flash or recoil offset as the temporary hit reaction.
4. Spawn one enemy in `Game.js` at a fixed position in front of the player.

**Done when:** the enemy renders, resets to full health, and all of its resources
are released by `dispose()`.

### Milestone 2: Player Punch and Hit Detection

1. Expose a single attack sequence from `Player` with startup, active, and
  recovery timing driven by `dt`.
2. Keep the punch animation request in `AnimationController`; combat timing must
  still work when the procedural placeholder is active.
3. During the active window, have `CombatSystem` test a forward-facing attack
  radius against the enemy gameplay position.
4. Record whether the current punch has already hit so one input cannot deal
  damage every frame.

**Done when:** pressing punch near and facing the enemy removes health exactly
once; punching out of range or in the wrong direction does no damage.

### Milestone 3: Enemy Reaction and Death

1. Interrupt the enemy briefly when it takes a valid hit.
2. Mark it defeated at zero health and stop its movement and attacks.
3. Hide or remove the enemy rig after its defeat reaction.
4. Notify `Game` once so the mission can unlock the hardline.

**Done when:** repeated punches visibly damage and defeat the enemy, and a dead
enemy can neither attack nor emit duplicate death events.

### Milestone 4: Player Damage and Defeat

1. Add maximum and current health to `Player`, plus `takeDamage(amount)` and
  `resetCombat()` methods.
2. Give the enemy one slow attack with an obvious wind-up, one active damage
  window, and a recovery period.
3. Use `CombatSystem` to apply the enemy attack once when the player is in range.
4. Enter `DEFEAT` when player health reaches zero and stop combat updates while
  continuing to render the scene and UI.

**Done when:** ignoring the enemy eventually defeats the player, while moving
away during the wind-up avoids damage.

### Milestone 5: Green-Code Death Effect

1. Spawn a small pool of green particles at the enemy position on death.
2. Update particle position, opacity, and lifetime using `dt` without allocating
  objects each frame.
3. Remove and dispose the particle geometry and material when the effect ends or
  the encounter restarts.

**Done when:** the burst plays once on enemy death, disappears automatically,
and does not leave scene objects or GPU resources behind after repeated restarts.

### Milestone 6: Hardline Objective

1. Place a clearly visible hardline at the far side of the garage.
2. Show it as locked during `FIGHT` and switch its appearance when the enemy dies.
3. In `HARDLINE_READY`, test player proximity and complete the mission when the
  player enters its interaction radius.
4. Update the objective text from `Defeat the Agent` to `Reach the hardline`, then
  show the mission-complete state.

**Done when:** the hardline cannot complete the mission before the enemy dies and
always completes it afterward when the player reaches it.

### Milestone 7: Restart and HUD

1. Display player health, enemy health, and the current objective in `index.html`.
2. Show a compact overlay for `COMPLETE` and `DEFEAT` with a restart button.
3. Reset player position and health, enemy position and health, hardline state,
  active effects, objective text, and mission state without reloading the page.
4. Preserve keyboard and mobile controls after every reset.

**Done when:** the player can repeatedly win, lose, and restart without duplicate
objects, input handlers, animation loops, or stale UI.

### Update Order

Preserve the existing single render loop and use this order:

```text
player intent and movement
-> enemy behavior
-> combat resolution
-> death effects and mission state
-> hardline objective
-> follow camera
-> render
-> clear edge-triggered input
```

All timers and motion use the clamped `dt`. Per-frame methods reuse scratch
vectors and must not allocate new vectors, geometries, materials, or arrays.

### MVP Acceptance Test

The MVP is complete when this sequence works from a fresh page load:

1. The player spawns in one garage arena facing one primitive Agent.
2. Punches miss when out of range and damage once when correctly positioned.
3. The enemy reacts, loses health, counterattacks, and can defeat the player.
4. Defeating the enemy produces a green-code burst and unlocks the hardline.
5. Entering the hardline shows mission completion.
6. Restart restores the original encounter after either victory or defeat.
7. Ten consecutive restarts produce no duplicate scene objects or controls.
8. `npm run build` completes successfully.

### Not Included in the MVP

- Final character or environment skins.
- Multiple enemies or attack-slot coordination.
- Combos, heavy attacks, blocking, dodging, or pole combat.
- A Heavy Agent, boss phases, or multiple garage encounters.
- Dialogue, voice acting, checkpoints, or saved progress.
- Debir Court, scene loading, fusion, splitting, or stealth.

After this MVP is stable, the next target is the five-minute parking-garage
vertical slice with three encounters, a Heavy Agent, Agent Lewis dialogue, and a
hardline transition to Debir Court.