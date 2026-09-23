// Admin dashboard: login, toggle the email gate, download the CSV export.
const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

const dashboardSection = document.getElementById('dashboard-section');
const gateToggle = document.getElementById('gate-toggle');
const gateError = document.getElementById('gate-error');
const gateLevelNote = document.getElementById('gate-level');
const logoutButton = document.getElementById('logout-button');

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function showDashboard() {
  loginSection.hidden = true;
  dashboardSection.hidden = false;
}

function showLogin() {
  loginSection.hidden = false;
  dashboardSection.hidden = true;
}

// Read-only: the level is set by EMAIL_GATE_LEVEL at build/start, not from here.
// Showing it matters because it decides whether stored addresses were verified.
const LEVEL_NOTES = {
  1: 'Level 1 (collect) — addresses are saved as soon as the form is submitted, so they are unverified. No SMTP needed.',
  2: 'Level 2 (verify) — addresses are saved only after the emailed 6-digit code matches, so every entry is confirmed.',
};

async function loadGateStatus() {
  try {
    const response = await fetch('/api/admin/gate');
    const data = await response.json();
    gateToggle.checked = Boolean(data.enabled);
    gateLevelNote.textContent = LEVEL_NOTES[data.level] || 'Gate level unknown — check EMAIL_GATE_LEVEL on the server.';
  } catch {
    gateError.textContent = 'Could not load the current setting.';
  }
}

async function checkExistingSession() {
  const response = await fetch('/api/admin/me');
  const data = await response.json().catch(() => ({}));
  if (data.loggedIn) {
    showDashboard();
    await loadGateStatus();
  } else {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'LOGGING IN…';
  try {
    await postJson('/api/admin/login', { password: loginPassword.value });
    loginPassword.value = '';
    showDashboard();
    await loadGateStatus();
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'LOG IN';
  }
});

gateToggle.addEventListener('change', async () => {
  const desired = gateToggle.checked;
  gateToggle.disabled = true;
  gateError.textContent = '';
  try {
    const data = await postJson('/api/admin/gate', { enabled: desired });
    gateToggle.checked = Boolean(data.enabled);
  } catch (err) {
    gateToggle.checked = !desired; // revert on failure
    gateError.textContent = err.message;
  } finally {
    gateToggle.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await postJson('/api/admin/logout');
  showLogin();
});

checkExistingSession();
