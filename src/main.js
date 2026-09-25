import { Game } from './Game.js';
import { requestEmailAccess } from './EmailGate.js';

const canvas = document.getElementById('app');
// __APP_VERSION__ is package.json's version, inlined by vite.config.js.
document.getElementById('app-version').textContent = `prototype ${__APP_VERSION__}`;
const instructionsToggle = document.getElementById('instructions-toggle');
const instructionsMinimize = document.getElementById('instructions-minimize');
const controlInstructions = document.getElementById('control-instructions');
const touchInstructions = document.querySelector('.touch-help');
const coarsePointer = matchMedia('(any-pointer: coarse)');
const game = new Game(canvas);
// Dev-only handle for the run skill's CDP driver (stripped from production builds).
if (import.meta.env.DEV) window.__game = game;

const INSTRUCTIONS_MINIMIZED_COOKIE = 'agent_instructions_minimized';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const savedInstructionsState = readCookie(INSTRUCTIONS_MINIMIZED_COOKIE);

let showingTouchInstructions = false;
let instructionsOverridden = false;
let instructionsMinimized = matchMedia('(max-width: 700px)').matches
	|| savedInstructionsState === '1';

function readCookie(name) {
	const prefix = `${name}=`;
	const pair = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
	return pair ? decodeURIComponent(pair.slice(prefix.length)) : '';
}

function writeCookie(name, value) {
	document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function updateInstructionsToggle() {
	instructionsToggle.textContent = showingTouchInstructions ? 'KEYS' : 'TOUCH';
	instructionsToggle.setAttribute('aria-pressed', String(showingTouchInstructions));
	instructionsToggle.setAttribute(
		'aria-label',
		showingTouchInstructions ? 'Show keyboard and mouse controls' : 'Show touch controls'
	);
}

function updateInstructionsMinimize() {
	controlInstructions.hidden = instructionsMinimized;
	instructionsMinimize.textContent = instructionsMinimized ? 'SHOW' : 'HIDE';
	instructionsMinimize.setAttribute('aria-expanded', String(!instructionsMinimized));
	instructionsMinimize.setAttribute(
		'aria-label',
		instructionsMinimized ? 'Show control instructions' : 'Hide control instructions'
	);
}

function syncAutomaticInstructions() {
	if (!instructionsOverridden) {
		showingTouchInstructions = getComputedStyle(touchInstructions).display !== 'none';
		updateInstructionsToggle();
	}
}

function toggleInstructions() {
	instructionsOverridden = true;
	showingTouchInstructions = !showingTouchInstructions;
	document.body.classList.toggle('instructions-touch', showingTouchInstructions);
	document.body.classList.toggle('instructions-desktop', !showingTouchInstructions);
	updateInstructionsToggle();
}

function toggleInstructionsMinimized() {
	instructionsMinimized = !instructionsMinimized;
	writeCookie(INSTRUCTIONS_MINIMIZED_COOKIE, instructionsMinimized ? '1' : '0');
	updateInstructionsMinimize();
}

syncAutomaticInstructions();
updateInstructionsMinimize();
instructionsToggle.addEventListener('click', toggleInstructions);
instructionsMinimize.addEventListener('click', toggleInstructionsMinimized);
window.addEventListener('pointerdown', syncAutomaticInstructions);
coarsePointer.addEventListener('change', syncAutomaticInstructions);

// Start the loop first so the prompt sits over a rendered scene — the loop
// freezes itself while it is open, so nothing moves until the handle is in.
requestEmailAccess().then(() => {
	game.start();
	game.promptForHandleIfUnset();
});

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		instructionsToggle.removeEventListener('click', toggleInstructions);
		instructionsMinimize.removeEventListener('click', toggleInstructionsMinimized);
		window.removeEventListener('pointerdown', syncAutomaticInstructions);
		coarsePointer.removeEventListener('change', syncAutomaticInstructions);
		game.dispose();
	});
}
