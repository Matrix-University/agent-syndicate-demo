# Mobile Character Controls Plan

**Status:** Proposed for AI review before implementation  
**Scope:** Browser runtime only; no asset or Decentraland runtime changes

## Goal

Add mobile controls without introducing device-specific behavior in `Player` or changing the existing render loop. One device-agnostic movement change will preserve analog input magnitude while keeping keyboard movement behavior unchanged. The control scheme will provide:

- A left analog stick for camera-relative movement.
- Automatic sprint when the stick reaches its outer ring.
- Right-side dragging for camera orbit.
- Separate jump and punch buttons.
- Continued keyboard and mouse support for desktop and hybrid devices.

The implementation must preserve `Input` as the gameplay-facing input contract. `Player.update` must not contain touch, pointer, or DOM branches.

## Existing Architecture

- `src/Input.js` exposes `moveX`, `moveZ`, `sprint`, `punchPressed`, and `jumpPressed`.
- `src/Player.js` consumes those values and moves `Player.root`. It currently normalizes `_move`, which discards analog magnitude, so it needs a small device-agnostic change.
- `src/ThirdPersonCamera.js` owns camera yaw and pitch through mouse pointer lock.
- `src/Game.js` runs one simulate -> camera -> render loop and calls `input.endFrame()` after input consumers have run.
- `index.html` contains the canvas and desktop HUD. It currently has no mobile controls.

## Proposed Design

### 1. Device-Agnostic Input Aggregation

Extend `src/Input.js` while preserving its public getters and keyboard behavior.

- Add preallocated touch movement state and one-frame touch action flags.
- Add methods for setting and resetting mobile movement state.
- Add methods for triggering mobile jump and punch edges.
- Combine keyboard and touch movement in the existing axis getters, clamped to `[-1, 1]`.
- Return sprint when either Shift is held or the joystick reports the outer-ring threshold.
- Clear keyboard, movement, sprint, and action state on window blur.
- Continue clearing one-shot edges only through `endFrame()`.
- Keep action getters non-consuming. `Player.update` reads `jumpPressed` more than once in a frame, so reading a getter must never clear its state.
- Store each action as frame-edge state matching the existing keyboard semantics. Do not add an action queue or counter for multiple same-action taps within one rendered frame.

### 2. Analog Magnitude in Player

Update `src/Player.js` so the existing camera-relative movement path retains stick magnitude without knowing which device produced it.

- Measure `_move.length()` before normalizing it.
- Clamp the magnitude to `1`, so keyboard diagonals do not exceed full speed.
- Use a named movement epsilon to decide whether movement is active.
- Normalize only the movement direction.
- Multiply walk or sprint speed by the clamped magnitude.
- Keep facing based on the normalized direction and animation speed based on actual horizontal velocity.

Keyboard cardinal and diagonal movement will remain at full speed. A partially tilted stick will produce proportionally slower movement.

### 3. Mobile Control Adapter

Add `src/MobileControls.js` to own mobile-control DOM events and visuals.

- Use Pointer Events instead of separate mouse and touch implementations.
- Use pointer capture so controls continue receiving events when a finger leaves a hit region.
- Give the joystick, jump button, and punch button one nullable `pointerId` slot each.
- Ignore `pointerdown` when that control's slot is already occupied. Do not use `event.isPrimary`, because it prevents the intended multitouch behavior.
- Normalize joystick displacement against a fixed control radius.
- Negate screen-space Y when writing `moveZ`, because screen Y increases downward while positive `moveZ` means forward.
- Apply a named, tunable dead zone near the center.
- Clamp displacement to the outer ring.
- Use named sprint hysteresis thresholds, initially `SPRINT_ENTER = 0.95` and `SPRINT_EXIT = 0.85`, so input near the outer ring does not flicker between walking and sprinting.
- Update the visible joystick thumb only when pointer events occur; do not add per-frame UI work.
- Trigger jump and punch once on each action-button `pointerdown`.
- Allow joystick, action button, and camera pointers to operate simultaneously.
- Ignore additional pointers attempting to claim a control that is already active.
- Reset held state on `pointerup`, `pointercancel`, window blur, visibility loss, and disposal.
- Suppress `contextmenu` on controls in addition to disabling touch callouts in CSS.

The adapter will call methods on `Input`; it will not call `Player` directly.

### 4. Touch Camera Orbit

Extend `src/ThirdPersonCamera.js` to support right-side touch dragging alongside mouse pointer lock.

- Track one nullable camera `pointerId` and ignore another camera `pointerdown` while it is occupied. Do not use `event.isPrimary`.
- Listen for camera `pointerdown` on the canvas. Claim a touch or pen pointer only when `event.target` is the canvas and its starting coordinate is in the right-side camera zone.
- Keep controls as real overlay elements with hit testing enabled. Because they are canvas siblings, their events do not target or bubble through the canvas; control hit-rectangle checks are unnecessary unless camera events later move to a global listener.
- Apply pointer deltas to the existing yaw and pitch fields.
- Reuse the existing pitch clamp.
- Use pointer capture and release ownership on `pointerup` or `pointercancel`.
- Reset pointer state on blur and disposal.
- Preserve desktop click-to-lock and mouse movement behavior.
- Record the most recent canvas `pointerdown` type and allow `_onClick` to request pointer lock only when it was `mouse`. Do not rely on a rejected pointer-lock promise to suppress touch behavior.

Camera movement must remain event-driven and must not allocate objects in `update()`.

### 5. Responsive Mobile UI

Update `index.html` with a mobile control overlay.

- Add a fixed-size joystick base and thumb on the left.
- Add distinct jump and punch buttons on the right.
- Implement action controls as `<button type="button">` elements with accessible names.
- Keep enough open space on the right for camera dragging.
- Use familiar symbols or concise labels and provide accessible names.
- Use stable dimensions so active and pressed states do not shift the layout.
- Apply `touch-action: none` to game interaction regions.
- Disable text selection and touch callouts on controls.
- Add `viewport-fit=cover` to the viewport meta tag so `env(safe-area-inset-*)` values work on iOS, then account for those insets in control placement.
- Apply `overscroll-behavior: none` to the page to prevent pull-to-refresh where supported.
- Provide visible active/pressed states.
- Hide inactive mobile controls with `display: none`, not opacity alone.
- Show controls with an `any-pointer: coarse` media query and a JS-added body class after the first `pointerdown` whose `pointerType` is `touch`. This covers hybrid devices whose primary pointer is a mouse.
- Provide concise touch-specific HUD instructions.
- Support portrait and landscape layouts without forcing device orientation.
- Ensure the controls, HUD, and browser safe areas do not overlap.

### 6. Game Wiring, Viewport, and Lifecycle

Update `src/Game.js` to instantiate `MobileControls` with the existing `Input` instance and mobile-control elements.

- Preserve the existing simulate -> camera -> render order.
- Preserve the single `input.endFrame()` call after all input consumers run.
- Keep listener cleanup encapsulated in each owning class.
- Replace anonymous listeners touched by this work with stored handler references.
- Add `Input.dispose()` to remove its keyboard and blur listeners.
- Add `Game.dispose()` to stop the animation loop, remove resize listeners, and dispose mobile controls, input, camera, player, renderer, and world-owned disposable resources where applicable.
- Expose `Game.dispose()` for host teardown and register it with Vite's `import.meta.hot.dispose` hook in `src/main.js` during development. Do not use `pagehide` teardown because pages restored from the back-forward cache would otherwise return to a disposed game.
- Keep `window.resize` and also listen to `visualViewport.resize` when available, routing both through the same resize handler. Do not add a separate `orientationchange` path unless real-device testing shows a remaining stale-size issue.
- Keep canvas CSS dimensions aligned with its containing viewport while allowing `renderer.setSize(window.innerWidth, window.innerHeight)` to set the drawing and inline display size.

### 7. Documentation

Update `README.md` after implementation to document:

- Left-stick movement.
- Outer-ring sprint.
- Right-side camera dragging.
- Jump and punch buttons.
- Real-device testing on the same local network with `npm run dev -- --host`.

## Files

| File | Planned responsibility |
| --- | --- |
| `src/Input.js` | Aggregate keyboard and mobile state behind the existing gameplay contract. |
| `src/MobileControls.js` | New pointer-event adapter for joystick and action controls. |
| `src/ThirdPersonCamera.js` | Add right-side touch orbit while preserving pointer-lock input. |
| `src/Player.js` | Preserve analog movement magnitude without adding device-specific logic. |
| `src/Game.js` | Instantiate controls, coordinate viewport resizing, and own teardown. |
| `src/main.js` | Register development HMR teardown. |
| `index.html` | Add viewport configuration plus responsive control markup and styles. |
| `README.md` | Document mobile controls and LAN testing. |

## Edge Cases

The implementation must explicitly handle:

- More than one finger touching the same control.
- Joystick movement while jump, punch, and camera drag are used concurrently.
- A pointer leaving its original hit region while held.
- `pointercancel` during browser gestures or system interruption.
- App switching, tab visibility changes, and window blur.
- Device rotation while a control is held.
- Touch-generated click events on the canvas.
- Hybrid devices that expose both coarse and fine pointers.
- A quick action tap whose `pointerdown` and `pointerup` both occur between rendered frames; it must still produce one action edge.
- Stick magnitude near the sprint threshold without walk/sprint flicker.
- Opposing simultaneous keyboard and touch axes without values leaving `[-1, 1]`.

## Out of Scope

- Gamepad support.
- Gyroscope camera control.
- Haptic feedback.
- Orientation locking.
- Unrelated changes to movement physics, animation behavior, or character assets.
- Changes to the shared browser/Decentraland GLB pipeline.
- A Decentraland SDK7 input implementation.
- New runtime dependencies.

## Verification

1. Run `npm run build` to catch syntax, unresolved import, and production bundling failures. It does not replace runtime input or layout testing.
2. Run `npm run dev -- --host` and open the LAN URL on a real iOS or Android phone.
3. Verify analog movement is camera-relative in all directions, partial tilt produces partial speed, keyboard diagonals remain capped at full speed, and the joystick recenters after release or cancellation.
4. Verify walking enters sprint at the configured outer threshold and remains sprinting until magnitude falls below the lower exit threshold.
5. Hold the joystick while repeatedly tapping jump and punch and dragging the camera; confirm all pointers work concurrently.
6. Verify each action fires once per tap, including quick taps between rendered frames.
7. Verify camera pitch remains clamped and touch input never opens a pointer-lock prompt.
8. Interrupt held controls through app switching, blur, visibility changes, pointer cancellation, and orientation changes; confirm no state remains stuck.
9. Confirm the browser does not scroll, zoom, select text, or show touch callouts during play.
10. Verify desktop WASD/arrows, Shift, J, Space, click-to-lock, mouse camera, and Esc behavior remain unchanged.
11. Use coarse-pointer emulation at representative portrait and landscape sizes to check dimensions, safe-area clearance, labels, and overlap.
12. Inspect the running canvas on desktop and mobile to verify controls do not obscure each other or essential HUD content.
13. On representative mid-range phones, observe frame rate and responsiveness at device pixel ratio up to `2` with `PCFSoftShadowMap`. Record a follow-up if rendering quality must adapt on mobile; renderer-quality changes are not part of this control implementation.

## Acceptance Criteria

- A phone user can move, sprint, rotate the camera, jump, and punch without a keyboard.
- Partial joystick tilt produces proportional movement speed, while keyboard movement remains unchanged.
- Movement and actions can be used simultaneously with multiple fingers.
- No mobile input remains active after release, cancellation, blur, visibility loss, or rotation.
- `Player` remains independent of keyboard, pointer, and DOM details.
- Desktop controls behave as before.
- The render loop order, frame-time clamp, and allocation discipline remain intact.
- No dependency or asset-pipeline changes are introduced.
- The production build succeeds.
- Real-device testing finds no control-related frame pacing or input-latency regression. Any broader mobile rendering limitation is documented for follow-up.

## Resolved Review Decisions

- `Input` remains the only gameplay-facing input contract, but `Player` will preserve analog magnitude through a device-agnostic calculation.
- Jump and punch getters remain non-consuming frame-edge state cleared by `endFrame()`; no action queue is planned.
- Each control owns one nullable pointer ID and does not use `event.isPrimary`.
- Sprint uses enter/exit hysteresis, and joystick screen Y is inverted into forward `moveZ`.
- Pointer lock is gated on mouse pointer type.
- DOM ownership prevents control events from reaching a canvas-only camera listener; geometric control hit testing is not planned.
- Mobile UI discovery uses `any-pointer: coarse` plus first-touch runtime detection for hybrid devices.
- Safe-area support includes `viewport-fit=cover`.
- `Game.dispose()` is part of the implementation and has a concrete Vite HMR caller.
- `window.resize` plus `visualViewport.resize` is preferred over an unconditional orientation listener.

## Remaining AI Review Focus

Before implementation, the reviewer should challenge the following points:

1. Are the initial dead-zone and sprint hysteresis values likely to feel natural across phone sizes, or should acceptance testing tune them before merge?
2. Are all cancellation paths covered on current iOS Safari and Android Chrome, including lost pointer capture and visibility changes?
3. Is `any-pointer: coarse` plus first-touch detection the right visibility policy, or should users have an explicit control-visibility setting?
4. Does the proposed teardown cover every owned Three.js and DOM resource without disposing shared assets twice?
5. Are the portrait, landscape, safe-area, accessibility, and camera hit-region requirements sufficient for the intended devices?
6. Is a documented performance follow-up adequate if mobile rendering is slow, or should adaptive pixel ratio become a prerequisite?
7. Are any behavioral regressions or real-device validation scenarios still missing?
