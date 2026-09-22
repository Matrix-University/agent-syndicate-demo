// Blocks game start until the player verifies an email with a code (stored
// server-side for the marketing list) or has already done so — remembered via
// localStorage (fast path) and a signed session cookie (survives localStorage
// being cleared, since it's set by and checked against the server).
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

async function isGateEnabled() {
  try {
    const response = await fetch('/api/gate-status');
    const data = await response.json();
    return data.enabled !== false; // fail open to "required" if the field is missing
  } catch {
    return true; // server unreachable — default to requiring verification
  }
}

/**
 * Resolves once the player is allowed to play: immediately if the admin has
 * disabled the gate, or the player is already verified (localStorage or a
 * valid session cookie), otherwise after a successful code verification.
 */
export async function requestEmailAccess() {
  if (!(await isGateEnabled())) return;

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

  gate.hidden = false;
  emailInput.focus();

  return new Promise((resolve) => {
    let email = '';

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

    async function sendCode() {
      const data = await postJson('/api/subscribe/start', { email });
      if (data.status === 'already-subscribed') {
        rememberVerifiedEmail(email);
        gate.hidden = true;
        resolve();
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
      emailSubmit.disabled = true;
      emailSubmit.textContent = 'SENDING…';
      try {
        const stillPending = await sendCode();
        if (stillPending) {
          emailStep.hidden = true;
          codeStep.hidden = false;
          codeInput.focus();
        }
      } catch (err) {
        emailError.textContent = err.message;
      } finally {
        emailSubmit.disabled = false;
        emailSubmit.textContent = 'SEND CODE';
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
        rememberVerifiedEmail(email);
        gate.hidden = true;
        resolve();
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
        await sendCode();
      } catch (err) {
        codeError.textContent = err.message;
      } finally {
        resendButton.disabled = false;
      }
    });
  });
}

