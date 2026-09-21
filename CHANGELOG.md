# Changelog

All notable changes to this project are documented in this file, which follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Crowd combat: up to 7 agents can now be active at once, circling you and taking
  turns attacking through a limited number of "attack slots" (one slot normally,
  two once the crowd grows to four or more). A reinforcement spawns in whenever an
  agent drops to its last hit, and agents are now visually distinguishable by hair
  color.
- A HUD prompt ("KEEP MOVING TO CONTROL THE CROWD") appears during the fight.
- The camera now stays within the garage walls instead of drifting through them.

### Changed

- You now start at the far end of the garage, facing back toward the entry ramp.
- Running now uses its own animation instead of a sped-up walk, for a more natural
  sprinting stride.
- Punches now auto-target the nearest engaged agent — favoring whichever one
  you're already fighting and weaker agents — instead of only ever hitting a
  single fixed enemy.
- The enemy health bar and objective text now track the crowd: they show whichever
  agent is nearest or already engaged, how many agents remain, and how many can
  attack at once.
