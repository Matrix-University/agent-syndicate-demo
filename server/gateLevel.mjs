// The email gate has three levels. One setting drives all of them, read at build
// time by vite.config.js and at runtime by the server, so what the form asks for
// and what actually gets stored can never disagree.
//
//   0 (off)     — no gate, no dashboard; players go straight to the game. Needs
//                 no server at all, which is what a static deploy gets.
//   1 (collect) — the form saves the address the moment it is submitted. No SMTP,
//                 so addresses are unverified; the admin still sees them.
//   2 (verify)  — the form emails a 6-digit code and saves only once it matches.
//                 Requires a working SMTP relay (see docs/postfix-security.md).
//
// Anything unset or unrecognized is 0: the gate is opt-in, and a typo should let
// people play rather than collect addresses nobody planned to collect.
export const GATE_OFF = 0;
export const GATE_COLLECT = 1;
export const GATE_VERIFY = 2;

export function readGateLevel(env = process.env) {
  const level = Number(env.EMAIL_GATE_LEVEL);
  return level === GATE_COLLECT || level === GATE_VERIFY ? level : GATE_OFF;
}
