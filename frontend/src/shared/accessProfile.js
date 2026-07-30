// Creative Access Mode — a single, shared, cross-cutting preference (not
// its own page or mode) read by every existing mode plus the landing
// page, so choosing "I'm experiencing this as blind / low-vision /
// dyslexic / deaf / motor-impaired" once actually changes behavior
// everywhere instead of requiring five separate settings screens.

const STORAGE_KEY = 'prism:accessProfile';
const PROFILES = ['none', 'blind', 'low-vision', 'dyslexic', 'deaf', 'motor'];

function getAccessProfile() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return PROFILES.includes(stored) ? stored : 'none';
}

function setAccessProfile(profile) {
  localStorage.setItem(STORAGE_KEY, PROFILES.includes(profile) ? profile : 'none');
  applyAccessProfile();
}

// Moves focus to the first actionable control on the page — for a blind
// or screen-reader-first user, this skips having to Tab past intro/hero
// text to reach the thing they actually came to do. Generic and reusable
// rather than a bespoke per-page implementation, since every Prism page
// already follows the same "intro text, then the first real control"
// layout.
function focusFirstActionable() {
  const el = document.querySelector(
    'input:not([type=hidden]):not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
  );
  if (el) el.focus();
}

function applyAccessProfile() {
  const profile = getAccessProfile();
  document.body.classList.remove(...PROFILES.map((p) => `access-${p}`));
  document.body.classList.add(`access-${profile}`);
  if (profile === 'blind') focusFirstActionable();
  return profile;
}

export { getAccessProfile, setAccessProfile, applyAccessProfile, PROFILES };
