// Blocks game start until the player submits an email (stored server-side for the
// marketing list) or has already done so in a previous session on this browser.
const STORAGE_KEY = 'agent-syndicate:subscribed-email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolves once the player is allowed to play: immediately if already
 * subscribed on this browser, otherwise after a successful form submission.
 */
export function requestEmailAccess() {
  let alreadySubscribed = false;
  try {
    alreadySubscribed = Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private browsing / storage disabled — fall through to asking every time.
  }
  if (alreadySubscribed) return Promise.resolve();

  const gate = document.getElementById('email-gate');
  const form = document.getElementById('email-gate-form');
  const input = document.getElementById('email-gate-input');
  const error = document.getElementById('email-gate-error');
  const submitButton = document.getElementById('email-gate-submit');

  gate.hidden = false;
  input.focus();

  return new Promise((resolve) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = input.value.trim();
      if (!EMAIL_RE.test(email)) {
        error.textContent = 'Enter a valid email address.';
        return;
      }

      error.textContent = '';
      submitButton.disabled = true;
      submitButton.textContent = 'JOINING…';
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');

        try {
          localStorage.setItem(STORAGE_KEY, email);
        } catch {
          // Non-fatal — the player just gets asked again next visit.
        }
        gate.hidden = true;
        resolve();
      } catch (err) {
        error.textContent = err.message;
        submitButton.disabled = false;
        submitButton.textContent = 'ENTER';
      }
    });
  });
}
