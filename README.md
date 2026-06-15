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
sprint. The character turns to face its direction of travel and switches between
idle and run animations.

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

## Swapping in a Mixamo character

1. Grab a character + animations from [mixamo.com](https://www.mixamo.com) (free
   with an Adobe account). Download the rigged character, then download the
   **Idle** and **Running** animations for it ("Without Skin" once you have the
   base model). Mixamo exports `.fbx`.
2. Easiest path: open the model in [Blender](https://www.blender.org), import the
   animation clips onto it, and export a single `.glb`. Put it in `public/models/`.
3. In `Player.js`, replace `_buildPlaceholderRig()` with a GLTF load and drive an
   `AnimationMixer` from the state machine. Sketch:

   ```js
   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

   async _loadCharacter() {
     const gltf = await new GLTFLoader().loadAsync('/models/agent.glb');
     this.rig.add(gltf.scene);
     this.mixer = new THREE.AnimationMixer(gltf.scene);
     this.clips = {
       idle: this.mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Idle')),
       run:  this.mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Run')),
     };
     this.clips.idle.play();
   }
   ```

   Then in `_animate()`, crossfade clips on state change and call
   `this.mixer.update(dt)` each frame instead of rotating limbs by hand. The
   movement code in `update()` stays exactly the same.

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