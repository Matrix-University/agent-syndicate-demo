# Changelog

All notable changes to this project are documented in this file, which follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Crowd combat: five agents circle the player and take turns through two attack
  slots. Last-hit reinforcements grow the crowd to seven, defeated agents respawn,
  and hair variants keep the agents visually distinguishable.
- Enemy strikes, player health and invulnerability, defeat feedback, scoring, and
  keyboard or touch retry.
- The camera now stays within the garage walls instead of drifting through them.

### Changed

- You now start near the garage elevator, facing into the parking deck.
- Running now uses its own animation instead of a sped-up walk, for a more natural
  sprinting stride.
- Punches now auto-target the nearest engaged agent — favoring whichever one
  you're already fighting and weaker agents — instead of only ever hitting a
  single fixed enemy.
- The HUD now tracks player health, aggregate crowd health, active and defeated
  agent counts, and the number of attack slots.
