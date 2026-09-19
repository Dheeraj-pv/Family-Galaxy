// Polite screen-reader announcements for state changes that are otherwise silent (playhead year,
// search results, postcards sent). One shared aria-live region (#sr-live in index.html); the
// most recent message wins after `delay` ms, so rapid changes (scrubbing, typing) produce one
// calm sentence instead of chatter. Never used for per-frame updates.

let timer = null;

export function announce(message, { delay = 600 } = {}) {
  const region = document.getElementById('sr-live');
  if (!region) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    // Clear first so an identical repeat message is still announced.
    region.textContent = '';
    setTimeout(() => { region.textContent = message; }, 50); // timeout, not rAF: works in background tabs
  }, delay);
}
