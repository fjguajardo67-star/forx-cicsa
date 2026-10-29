// One presentation preference for both modules. Never part of the business data.
const KEY = 'forx-v2-theme';
const valid = value => value === 'light' || value === 'dark';
const read = storage => { try { return window[storage].getItem(KEY); } catch { return null; } };

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('#forx-module')?.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f6fc' : '#071a3d');
  const roots = [document, document.querySelector('#forx-module')?.shadowRoot].filter(Boolean);
  for (const root of roots) {
    for (const control of root.querySelectorAll('[data-theme-toggle]')) syncThemeControl(control);
  }
}

export function initializeTheme() {
  const saved = read('localStorage'), legacy = read('sessionStorage');
  const theme = valid(saved) ? saved : valid(legacy) ? legacy : 'dark';
  applyTheme(theme);
  // Preserve the previous FORX choice when upgrading from session-only storage.
  if (!valid(saved) && valid(legacy)) {
    try { window.localStorage.setItem(KEY, theme); } catch { /* In-memory fallback. */ }
  }
  return theme;
}

export function toggleTheme() {
  const theme = currentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  for (const storage of ['localStorage', 'sessionStorage']) {
    try { window[storage].setItem(KEY, theme); } catch { /* Theme still works with storage blocked. */ }
  }
}

export function syncThemeControl(control) {
  const label = currentTheme() === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
  control.setAttribute('aria-label', label);
  control.title = label;
  const text = control.querySelector('[data-theme-label]');
  if (text) text.textContent = label;
}
