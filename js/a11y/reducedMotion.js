// Detects prefers-reduced-motion and keeps state/the bus in sync with live changes (a user can
// toggle this OS setting while the page is open). The RESPONSE to a change (skipping a twinkle
// loop, swapping an entrance for a cross-fade, etc.) stays in each feature module — this module
// only owns detection, per CLAUDE.md "Accessibility & responsive/touch placement".

import { setReducedMotion } from '../state.js';
import { emit } from '../utils/events.js';

export function initReducedMotion() {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');

  function apply(matches) {
    setReducedMotion(matches);
    emit('motionPrefChanged', { reducedMotion: matches });
  }

  apply(query.matches);
  query.addEventListener('change', (e) => apply(e.matches));
}
