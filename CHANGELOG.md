# Changelog

All notable changes to this project are documented in this file, which follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Pick up and throw a car. One car — the one parked by the entry ramp — can be
  lifted overhead with **E** (or the touch LIFT button) and hurled with **J**,
  flattening any agent it ploughs through. It tumbles, crashes off pillars and
  walls, settles wherever it lands as solid cover, and can be picked up again.
- An overhead carry pose: the character walks and stands holding the car up,
  slowed down while loaded, with punching and jumping unavailable until it is
  thrown.
- Crowd combat: five agents circle the player and take turns through two attack
  slots. Last-hit reinforcements grow the crowd to seven, defeated agents respawn,
  and hair variants keep the agents visually distinguishable.
- Enemy strikes, player health and invulnerability, defeat feedback, scoring, and
  keyboard or touch retry.
- The camera now stays within the garage walls instead of drifting through them.

### Changed

- The car throw is now a two-handed overhead heave instead of a one-armed toss.
  The library's only throw is a grenade throw, so bound to the car it played as a
  punch thrown while the car floated overhead. The new `Throw_Overhead` is authored
  by the bake: the car is cocked back over the head, whipped forward with the hips
  and trunk driving through it, and released at full extension, with the car
  tracking the hands the whole way. The old clip still ships, unbound.
- The character GLB now ships fourteen clips instead of ten. The four new ones —
  authored `Carry_Overhead_Loop` and `Carry_Overhead_Idle` for the overhead hold,
  the authored `Throw_Overhead`, plus the library's `Throw` — are purely additive:
  every previously shipped clip, and the character mesh itself, is byte-for-byte
  unchanged.
- You now start near the garage elevator, facing into the parking deck.
- Running now uses its own animation instead of a sped-up walk, for a more natural
  sprinting stride.
- Punches now auto-target the nearest engaged agent — favoring whichever one
  you're already fighting and weaker agents — instead of only ever hitting a
  single fixed enemy.
- The HUD now tracks player health, aggregate crowd health, active and defeated
  agent counts, and the number of attack slots.

### Fixed

- Throwing the carried car now works from the lift control as well as the attack
  control. The HUD prompt reads `J / LIFT — THROW THE CAR` and the touch button
  relabels itself to `THROW`, but only the attack input actually threw — pressing
  **E**, or tapping that THROW button, did nothing.
