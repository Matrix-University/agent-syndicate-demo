import { Game } from './Game.js';

const canvas = document.getElementById('app');
const instructionsToggle = document.getElementById('instructions-toggle');
const touchInstructions = document.querySelector('.touch-help');
const coarsePointer = matchMedia('(any-pointer: coarse)');
const game = new Game(canvas);
// Dev-only handle for the run skill's CDP driver (stripped from production builds).
if (import.meta.env.DEV) window.__game = game;

let showingTouchInstructions = false;
let instructionsOverridden = false;

function updateInstructionsToggle() {
	instructionsToggle.textContent = showingTouchInstructions ? 'KEYS' : 'TOUCH';
	instructionsToggle.setAttribute('aria-pressed', String(showingTouchInstructions));
	instructionsToggle.setAttribute(
		'aria-label',
		showingTouchInstructions ? 'Show keyboard and mouse controls' : 'Show touch controls'
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

syncAutomaticInstructions();
instructionsToggle.addEventListener('click', toggleInstructions);
window.addEventListener('pointerdown', syncAutomaticInstructions);
coarsePointer.addEventListener('change', syncAutomaticInstructions);
game.start();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		instructionsToggle.removeEventListener('click', toggleInstructions);
		window.removeEventListener('pointerdown', syncAutomaticInstructions);
		coarsePointer.removeEventListener('change', syncAutomaticInstructions);
		game.dispose();
	});
}
