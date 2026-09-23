// Blocks game start until the player verifies an email with a code (stored
// server-side for the marketing list) or has already done so — remembered via
// localStorage (fast path) and a signed session cookie (survives localStorage
// being cleared, since it's set by and checked against the server).
// Mirrors server/gateLevel.mjs, which is the source of truth for what these
// mean. __EMAIL_GATE_LEVEL__ is inlined by vite.config.js from EMAIL_GATE_LEVEL.
const GATE_OFF = 0;
const GATE_COLLECT = 1;
const GATE_VERIFY = 2;
const BUILT_LEVEL = __EMAIL_GATE_LEVEL__;

const STORAGE_KEY = 'agent-syndicate:subscribed-email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

function rememberVerifiedEmail(email) {
  try {
    localStorage.setItem(STORAGE_KEY, email);
  } catch {
    // Non-fatal — the session cookie still covers returning players.
  }
}

async function hasValidSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    return Boolean(data.email);
  } catch {
    return false; // server unreachable — fall through to asking for the email
  }
}

/**
 * Asks the server whether the gate is on and which form to show. The server's
 * level wins over the built-in one: both read the same EMAIL_GATE_LEVEL, but
 * only the server's answer reflects what /api/subscribe/* will actually store.
 */
async function fetchGateMode() {
  const fallback = { enabled: true, level: BUILT_LEVEL }; // fail closed — see below
  try {
    const response = await fetch('/api/gate-status');
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      enabled: data.enabled !== false, // treat a missing field as "required"
      level: data.level === GATE_COLLECT || data.level === GATE_VERIFY ? data.level : BUILT_LEVEL,
    };
  } catch {
    // Unreachable server — keep requiring the gate rather than letting a network
    // failure become a way around it. Level 0 never gets this far.
    return fallback;
  }
}

/**
 * Resolves once the player is allowed to play: immediately if the gate is off,
 * or the player is already on the list (localStorage or a valid session
 * cookie), otherwise once the form has been satisfied.
 *
 * Level 0 returns before touching the network, and because the level is inlined
 * at build time the rest of this compiles away entirely. That matters: a static
 * deploy has no server, so every /api/* call 404s and fetchGateMode fails closed
 * — which would raise a prompt no player could ever get past.
 */
export async function requestEmailAccess() {
  if (BUILT_LEVEL === GATE_OFF) return;

  const mode = await fetchGateMode();
  if (!mode.enabled) return;

  let alreadySubscribed = false;
  try {
    alreadySubscribed = Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private browsing / storage disabled — fall through to checking the session cookie.
  }
  if (alreadySubscribed || (await hasValidSession())) return;

  const gate = document.getElementById('email-gate');
  const emailStep = document.getElementById('email-gate-step-email');
  const emailInput = document.getElementById('email-gate-input');
  const emailError = document.getElementById('email-gate-email-error');
  const emailSubmit = document.getElementById('email-gate-email-submit');

  const codeStep = document.getElementById('email-gate-step-code');
  const codeInput = document.getElementById('email-gate-code-input');
  const codeError = document.getElementById('email-gate-code-error');
  const codeSubmit = document.getElementById('email-gate-code-submit');
  const resendButton = document.getElementById('email-gate-resend');

  // Level 1 stores the address on submit, so there is no code to send and the
  // copy must not promise one.
  if (mode.level === GATE_COLLECT) {
    emailSubmit.textContent = 'ENTER';
    document.getElementById('email-gate-copy').textContent =
      "Enter your email to play the demo. We'll use it only for occasional " +
      'updates about Agent Syndicate — no spam, unsubscribe anytime.';
  }

  gate.hidden = false;
  emailInput.focus();

  return new Promise((resolve) => {
    let email = '';

    function admit() {
      rememberVerifiedEmail(email);
      gate.hidden = true;
      resolve();
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      return data;
    }

    /**
     * Returns true when a code was sent and the second step should open. The
     * server's reply decides, not mode.level, so a level the client guessed
     * wrong still ends up on the right step.
     */
    async function submitEmail() {
      const data = await postJson('/api/subscribe/start', { email });
      if (data.status === 'subscribed' || data.status === 'already-subscribed') {
        admit();
        return false;
      }
      return true;
    }

    emailStep.addEventListener('submit', async (event) => {
      event.preventDefault();
      const candidate = emailInput.value.trim();
      if (!EMAIL_RE.test(candidate)) {
        emailError.textContent = 'Enter a valid email address.';
        return;
      }

      email = candidate;
      emailError.textContent = '';
      const submitLabel = emailSubmit.textContent;
      emailSubmit.disabled = true;
      emailSubmit.textContent = mode.level === GATE_COLLECT ? 'SAVING…' : 'SENDING…';
      try {
        const codeSent = await submitEmail();
        if (codeSent) {
          emailStep.hidden = true;
          codeStep.hidden = false;
          codeInput.focus();
        }
      } catch (err) {
        emailError.textContent = err.message;
      } finally {
        emailSubmit.disabled = false;
        emailSubmit.textContent = submitLabel;
      }
    });

    codeStep.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = codeInput.value.trim();
      if (!CODE_RE.test(code)) {
        codeError.textContent = 'Enter the 6-digit code.';
        return;
      }

      codeError.textContent = '';
      codeSubmit.disabled = true;
      codeSubmit.textContent = 'VERIFYING…';
      try {
        await postJson('/api/subscribe/verify', { email, code });
        admit();
      } catch (err) {
        codeError.textContent = err.message;
        codeSubmit.disabled = false;
        codeSubmit.textContent = 'ENTER';
      }
    });

    resendButton.addEventListener('click', async () => {
      codeError.textContent = '';
      resendButton.disabled = true;
      try {
        await submitEmail();
      } catch (err) {
        codeError.textContent = err.message;
      } finally {
        resendButton.disabled = false;
      }
    });
  });
}

