# Agent Syndicate — Three.js prototype

A third-person seed for the brawler demo: a movable character with an animation
state machine, a follow camera, and a blockout arena. The character is a
placeholder built from primitives so the project runs with zero external assets;
swap it for a Mixamo model when you're ready (see below).

## Run it

Requires [Node.js](https://nodejs.org) (18+).

```bash
npm install
npm run dev
```

Vite opens `http://localhost:5173`. Move with **WASD / arrow keys**, **Shift** to
sprint, **J** to punch, **Space** to jump. The character turns to face its direction
of travel and switches between idle, walk/run, and one-shot action animations.

`npm run build` produces a static `dist/` you can host anywhere — that's how
you'll share the playable demo as a link later.

## Project structure

```
index.html              canvas + HUD, loads src/main.js
src/main.js             boots the Game
src/Game.js             renderer, scene, camera, the update loop
src/World.js            lights, floor, grid, blockout pillars
src/Player.js           the character: rig, movement, animation state machine
src/ThirdPersonCamera.js smooth follow camera
src/Input.js            keyboard state + movement axes
```

The important architecture choice: `Player.root` is the thing that moves through
the world (the camera follows it), and `Player.rig` is the visible body. Keeping
them separate means you replace the *visuals* without touching the *movement*.

## Swapping in a real character

The GLTF loader is already wired up. `Player` loads a rigged `.glb`, binds its
clips to the animation state machine via a `THREE.AnimationMixer`, and crossfades
on state change. **No model is required** — without one, the primitive placeholder
shows, so the project always runs.

To use a real character:

1. Drop a rigged `.glb` (with Idle + Run clips) at **`public/models/agent.glb`**.
   See [public/models/README.md](public/models/README.md) for sources — the
   recommended one is [Quaternius](https://quaternius.com) (**CC0**, public domain,
   GLB-ready, suited figures that read well as Agents).
2. Run `npm run dev`. The character idles, then runs while you move.
3. Tune in [src/Game.js](src/Game.js): `modelScale` (so the body is ~3 units tall)
   and `modelYaw` (`Math.PI` if it faces the camera when moving forward).

Clips bind by case-insensitive name match (`CLIP_NAMES` in `Player.js`); the
movement code in `update()` is untouched. **Mixamo** also works — it exports
`.fbx`, so convert to `.glb` in [Blender](https://www.blender.org) first.

## Where this goes next (the roadmap)

1. ✅ Move a character around an arena (this seed).
2. Add a punch: an `ATTACK` state, an attack animation, and hit detection.
3. One dummy enemy that takes damage and explodes into green code (a particle
   burst on death).
4. A crowd of enemies that encircle you, with an "attack slot" limiter so only
   one or two strike at a time.
5. Pole pickup + an alternate moveset.
6. The fuse/split state machine: Hulk combat mode <-> invulnerable, regenerating
   twins mode.

## Agent Syndicate (seed idea)

Agent Syndicate Burly Brawl Game Demo
The Cliff Notes (Short Version) Re-skin the Burly Brawl Scene from Path of Neo (ps2). Playable game built with unreal engine.

**The longer version:**

The idea is to make a playable game demo. I'm looking for a gameplay style like the burly brawl from the Matrix reloaded/PON.
This is also a recreation of the Matrix Reloaded scene, just after the Oracle & Seraph leave, where Neo & Agent Smith fight in Debir Court during the sequel. But instead of Neo as the main Character I want Keanu to be substituted or 're-skinned' with a hulk sized "Agent Rayment",

In the Agent Syndicate webcomic they are identical twins, but in the proposed game demo, these twins combine to make one Hulk Sized Super Exile/Agent. This is the user, or playable character (Neo substitute).

Instead of fighting Smith clones, the enemies should be random NPCs. The NPCs should explode into green code when they are defeated.

All fighting should be hand to hand melee combat, perhaps Agent Rayment could grab poles out of the ground like we see Neo using the pole as a weapon in Reloaded.

One tricky game play detail, I'd want the player to be able to combine the twins to make the hulk version, but if they separate or undo hulk mode, making them separate twins again, then the health would slowly regenerate and the NPC bots wouldn't be able to attack them while they appear as non hostile twins. The twins would not be able to attack, or be attacked in this state to allow health regeneration.

_You can see the Twins here:_

https://agentsyndicate.online/

So let's say scene 1 is the Twins in Hel club, Agent Lewis instructs them to run into each other, they combine and transform into Hulk mode. Agent Lewis tells them they're flagged as exiles and that they need to draw the system Agents away from the club. Scene 2, the Hulk version gets attacked by system Agents in the parking garage of Hel club, mission one is to fight your way out of the parking garage to a hardline. Get to the handline and that's a check point. Scene 3, hardline takes you to Debir court where the Hulk version is attacked by more Agents. After defeating some kind of boss Agent, or specific number of Agents or survive long enough & Agent Lewis calls and gives them instructions on how to separate back into twins. Once they split she tells them to return to Hel club undetected.

That's just a rough game play flow.

Game demo visible [here](https://agent-syndicate-demo.vercel.app/)