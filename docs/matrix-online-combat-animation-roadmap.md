# Matrix Online Combat Animation Roadmap

This document records the hand-to-hand animation vocabulary that should
eventually inform Agent Syndicate. The goal is not to reproduce every animation
from *The Matrix Online* at once. It is to preserve the basic combat language now
and introduce more elaborate moves only after the underlying combat systems are
ready.

## Research Scope

No specific video URL or title was supplied for this reference. The list below
is therefore reconstructed from archived official *Matrix Online* material, the
Prima guide, and the broad action categories visible in surviving combat footage.
It should not be treated as a frame-by-frame inventory of one particular video.

The original game also did not use one short, fixed move list. Its Interlock
Combat System selected an attack, defense, result, and victim reaction, then
assembled synchronized choreography. An official animation article described
more than 4,000 animation segments and many generated combinations. Recreating
that entire system is outside this project's scope.

For Agent Syndicate, the useful lesson is to build a compact set of reusable
attacks, defenses, counters, and reactions that can combine into varied fights.

## Source Confidence

The move list uses three confidence labels:

- **Verified name:** Named in the archived official site or Prima guide.
- **Verified category:** The action type is documented, but individual animation
  variants were generated dynamically and were not given stable public names.
- **Project adaptation:** A practical animation needed by this brawler, inferred
  from the footage and combat design rather than copied as an official move name.

## Matrix Online Combat Language

The original close-combat presentation had several defining qualities:

- Two fighters appeared physically connected rather than attacking empty space.
- The defender used a matching block, dodge, counter, or hit reaction.
- Feints and misses were part of the choreography.
- Successful attacks pushed the fight across the environment.
- Karate emphasized direct, hard strikes.
- Aikido emphasized redirection, counters, and throws.
- Kung Fu mixed linear strikes, circular motion, and acrobatics.
- Capoeira, Taekwondo, and Muay Thai influenced aerial attacks, kicking
  combinations, flowing movement, and powerful close strikes.
- Bullet-time highlighted selected dramatic moves; it was presentation layered
  over combat, not a move by itself.
- Large acrobatic moves had compact alternatives for confined spaces.

Agent Syndicate should borrow this combat language without copying the original
MMO's stat system or one-on-one Interlock controls.

## Foundational Animation Set

These are the basic moves the game should acquire first. Most are verified
categories rather than official ability names because Matrix Online generated
many unnamed variants for ordinary exchanges.

| Animation | Purpose | Confidence | Target phase |
| --- | --- | --- | --- |
| Combat idle | Ready stance with guarded hands | Verified category | MVP |
| Guard transition | Enter and leave the combat stance | Project adaptation | MVP |
| Lead jab | Fast opening strike | Verified category | MVP |
| Rear cross | Strong straight follow-up | Verified category | MVP |
| Hook punch | Circular finishing punch | Verified category | MVP |
| Body punch | Mid-level strike with a folded reaction | Verified category | Phase 2 |
| Front kick | Quick spacing attack | Verified category | MVP |
| Side kick | Strong linear kick and knockback | Verified category | Phase 2 |
| Roundhouse kick | Circular combo finisher | Verified category | Phase 2 |
| Leg sweep | Low attack that causes knockdown | Project adaptation | Phase 2 |
| High block | Deflect a head-level strike | Verified category | Phase 2 |
| Body block | Absorb or redirect a middle strike | Verified category | Phase 2 |
| Duck/weave | Avoid a high punch without leaving range | Verified category | Phase 2 |
| Backstep dodge | Escape a heavy attack | Verified category | Phase 2 |
| Punch reversal | Catch or redirect a punch into a counter | Verified name | Phase 3 |
| Counter throw | Redirect an off-balance attacker | Verified name | Phase 3 |
| Forward hit reaction | Snap or fold from a frontal hit | Verified category | MVP |
| Head hit reaction | Sell a successful high strike | Verified category | MVP |
| Body hit reaction | Sell a successful middle strike | Verified category | MVP |
| Stagger | Remain standing but lose initiative | Verified category | MVP |
| Knockback | Travel backward after a heavy hit | Verified category | MVP |
| Knockdown | Fall to the floor after a finisher | Verified category | Phase 2 |
| Ground recovery | Return from knockdown to combat idle | Project adaptation | Phase 2 |
| Defeat | Final fall before the green-code effect | Project adaptation | MVP |

## Verified Signature Moves

These names appear in archived Matrix Online sources. They are references for
future move design, not a requirement to reproduce the original choreography
exactly.

### Kung Fu

| Move | Archived description or character | Suggested game role | Target phase |
| --- | --- | --- | --- |
| Misdirect Punch | A deceptive punch that exploits a dazed opponent | Fast guard opener | Phase 2 |
| Dim Mak Strike | A focused stunning and damaging strike | Precision heavy attack | Phase 3 |
| Machinegun Fist Combo | A rapid sequence of punches | Multi-hit light finisher | Phase 2 |
| Piston Kicks | Alternating acrobatic kicks | Showcase launcher/finisher | Phase 3 |
| Suicidal Butterfly | High-level acrobatic Kung Fu attack | Risky area finisher | Phase 4 |
| Extreme Falling Kick | High-level falling or aerial kick | Aerial heavy attack | Phase 4 |
| Triple Front Kick | Repeating front-kick sequence | Forward combo finisher | Phase 3 |

The archived official animation article specifically discusses **Piston Kicks**
and **Machine Gun Fist** as examples of attacks whose names describe their visual
rhythm.

### Karate

| Move | Archived description or character | Suggested game role | Target phase |
| --- | --- | --- | --- |
| Ki-Charged Punch | Powerful punch against a staggered opponent | Charged heavy punch | Phase 3 |
| Sidekick Combo | Damaging kick combination | Heavy combo branch | Phase 2 |
| Sky High Sidekick | Rising or high side kick that weakens a target | Launcher | Phase 3 |
| Swirling Ki Summon | Close-range attack affecting nearby opponents | Crowd-control special | Phase 4 |
| 540 Kick | Spinning aerial kick named by the stunt team | Showcase finisher | Phase 4 |
| Machinegun Kick | High-level rapid kicking sequence | Multi-hit kick finisher | Phase 3 |

Karate should read as direct and forceful. Its attacks need strong anticipation,
clear contact poses, and substantial defender recoil rather than excessive
flourish on every strike.

### Aikido

| Move | Archived description or character | Suggested game role | Target phase |
| --- | --- | --- | --- |
| Counter Throw | Throw against an off-balance opponent | Parry reward | Phase 3 |
| Maki-Otoshi | Counter that takes the opponent to the ground | Knockdown counter | Phase 3 |
| Punch Reversal | Redirects an incoming punch | Defensive counter | Phase 3 |
| Wrist Throw | High-damage redirection and throw | Advanced counter | Phase 4 |

The guide OCR renders some names inconsistently. `Maki-Otoshi` is retained here
as the normalized project spelling. Before commissioning a move under a historic
name, confirm its spelling and visual reference with the artist.

### Other Officially Mentioned Choreography

- **Triple Front Kick:** Named by the lead animator as a favorite move.
- **Body Shot:** A deliberately exaggerated weapon-assisted attack. It does not
  belong in the initial hand-to-hand set but may inform later pole combat.
- **Wall-assisted attacks:** The lead animator mentioned attacks where the
  aggressor leaps from walls. These require environment detection and should be
  treated as contextual moves.
- **Punt to the groin:** Mentioned as an amusing animation, but not recommended
  for the core Agent Rayment moveset.
- **Pistol Slide:** A backward dive while firing. It is outside the hand-to-hand
  scope but useful as reference if enemy gunplay is added later.

## Agent Syndicate Move Roadmap

### MVP: One Working Combat Exchange

The MVP should prove that one attack can connect, deal damage, produce a matching
reaction, and recover cleanly.

- Combat idle.
- Current one-shot hook punch.
- One enemy frontal hit reaction.
- One enemy stagger.
- One enemy defeat fall.
- Return to idle after every non-defeating exchange.

The current project already has `Idle`, locomotion, jump phases, and a punch path.
The primitive punch is temporary reference animation; an artist can later replace
it with a properly authored clip without changing input or movement.

### Phase 2: Basic Brawler Vocabulary

Add enough moves to produce readable short combinations:

- Lead jab, rear cross, and hook as a three-hit light combo.
- Front kick as a separate spacing attack.
- Sidekick Combo as the first heavy finisher.
- Machinegun Fist Combo as the first rapid special.
- High block and body block.
- Backstep dodge and duck/weave.
- Head hit, body hit, stagger, knockback, and knockdown reactions.
- Ground recovery.
- Leg sweep and matching swept fall.

Phase 2 is complete when the player can recognize why each attack hit, missed,
or was defended without relying on HUD text.

### Phase 3: Matrix-Style Counters and Acrobatics

Add the moves that establish the Matrix Online influence:

- Misdirect Punch.
- Dim Mak Strike.
- Triple Front Kick.
- Machinegun Kick.
- Sky High Sidekick.
- Punch Reversal.
- Counter Throw.
- Maki-Otoshi.
- A contextual wall-assisted kick in approved arena locations.
- Selective slow-motion presentation for finishers.

Counters and throws require paired attacker/defender animations or reliable
alignment constraints. They should not be scheduled before basic targeting,
attack timing, and hit reactions are stable.

### Phase 4: Showcase and Crowd Specials

These moves are expensive, highly contextual, or mechanically disruptive:

- Piston Kicks.
- 540 Kick.
- Extreme Falling Kick.
- Suicidal Butterfly.
- Wrist Throw.
- Swirling Ki Summon as a crowd-control adaptation.
- Pole-assisted Body Shot.
- Additional wall and environmental attacks.

Each showcase move needs a gameplay purpose. It should not be added solely
because an animation is available.

## Input Shape

Do not assign a separate button to every move. Use a small action vocabulary:

- **Light attack:** Chains jab, cross, and hook.
- **Heavy attack:** Uses a kick or charged strike.
- **Block:** Holds guard; a well-timed block enables a reversal.
- **Dodge:** Uses direction to choose backstep or lateral evade.
- **Jump + attack:** Selects an aerial kick when one is available.
- **Context action:** Picks up a pole or performs an approved wall move.

Signature moves can be selected by combo position, directional input, enemy
state, equipped weapon, or a meter. This keeps keyboard, controller, and mobile
controls manageable.

## Animation Asset Requirements

All shipped character clips must remain embedded in the shared
`public/models/agent-dcl.glb` so the browser and Decentraland use the same asset.

Artist-authored clips should follow these rules:

- Use skeletal animation and the established character armature.
- Author locomotion and ordinary attacks in place. Gameplay displacement remains
  on `Player.root`; visual animation remains on `Player.rig`.
- Use stable, engine-friendly clip names.
- Include clear startup, contact, and recovery poses.
- Avoid baked translation that silently moves the rig away from `Player.root`.
- Provide mirrored or alternate variants only after the primary move works.
- Keep attacker and victim clips at matching duration for synchronized moves.
- Mark a clear contact frame in the delivery notes for combat timing.
- Export one GLB with embedded clips and Draco-compatible geometry.
- Do not use Meshopt or KTX2 for this shared character asset.

Suggested project clip names:

```text
CombatIdle
AttackLight1_Jab
AttackLight2_Cross
AttackLight3_Hook
AttackHeavy_FrontKick
AttackHeavy_SideKick
BlockHigh
BlockBody
DodgeBack
DodgeLeft
DodgeRight
HitHead
HitBody
HitStagger
HitKnockback
Knockdown
GetUp
Defeat
CounterPunchReversal
CounterThrow
SpecialMachinegunFist
SpecialTripleFrontKick
SpecialPistonKicks
```

Historic display names can remain in design documents and UI while clip names
stay predictable for code.

## Code Integration Checklist

For each new move:

1. Add its source clip to the animation bake inputs.
2. Add the final clip name to `KEEP` in `scripts/bake-animations.mjs`.
3. Rebuild the shared GLB with `npm run bake:anims:dcl`.
4. Add the move mapping to `AnimationController`.
5. Add an edge-triggered intent or combo transition in `Input` and `Player`.
6. Define startup, active, and recovery timing independently from visual mesh
   names or bones.
7. Add matching hit, block, or dodge reactions before considering the move done.
8. Test interruption priority against jumping, landing, damage, and defeat.
9. Verify keyboard, mobile, and eventual controller input.
10. Verify the browser build and the DCL-compatible GLB constraints.

## Synchronized Combat Strategy

Matrix Online sold its attacks through matching victim animation. Agent
Syndicate can approach that quality in stages:

1. Begin with independent attacks and directional hit reactions.
2. Add a short hit-stop at the contact frame.
3. Add knockback driven by gameplay, not baked root translation.
4. For throws, align both gameplay roots to a temporary interaction anchor.
5. Play equal-length attacker and victim clips from the same timestamp.
6. Release both characters back to normal simulation after the paired move.
7. Reserve paired choreography for one attacker at a time when crowds are active.

This avoids making every ordinary punch depend on a fragile two-character
animation lock while preserving the option for dramatic counters and finishers.

## References

- [Archived official combat overview](https://www.mxoarchive.net/archives/dn1/thematrixonline.warnerbros.com/web/live/game_info/combat.html)
- [Archived official martial arts article, part one](https://www.mxoarchive.net/archives/dn1/thematrixonline.warnerbros.com/web/live/news_display1de8.html?id=040105_insidemartialarts)
- [Archived official martial arts article, part two](https://www.mxoarchive.net/archives/dn1/thematrixonline.warnerbros.com/web/live/news_display3edb.html?id=040405_martialarts)
- [The Matrix Online Prima Official eGuide archive](https://archive.org/details/The_Matrix_Online_Prima_Official_eGuide)
- [Archived official disciplines and abilities overview](https://www.mxoarchive.net/archives/dn1/thematrixonline.warnerbros.com/web/live/game_info/disciplines_abilities.html)

When the exact inspiration video is identified, add its URL here and compare its
visible sequence against this roadmap. Any move seen only in that footage should
be labeled **footage-derived** until another source confirms its name.