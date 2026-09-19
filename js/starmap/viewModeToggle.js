// "Sky / Map" toggle (top-left of the star map, clear of the zoom stack, the greeting pill and the
// header): switches between the lineage view (orbits, generations) and the family map view
// (grouped by person.region — see familyMapLayout.js). The actual layout swap happens in
// starMapRender.js, driven by state.js's viewMode + the `viewModeChanged` bus event; this file only
// owns the two buttons and the plain CSS opacity cross-fade of the canvas itself while switching
// (see css/family-map.css) — the soft "the sky dissolves and reforms" a snap-cut would lack.

import { getViewMode, setViewMode } from '../state.js';
import { emit } from '../utils/events.js';
import { announce } from '../a11y/announcer.js';

export function initViewModeToggle(containerEl) {
  const canvas = document.getElementById('star-map-canvas');
  const wrap = document.createElement('div');
  wrap.className = 'view-mode-toggle';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Star map view');

  const skyBtn = makeButton('Sky');
  const mapBtn = makeButton('Map');
  wrap.append(skyBtn, mapBtn);
  containerEl.appendChild(wrap);

  function sync() {
    const mode = getViewMode();
    skyBtn.setAttribute('aria-pressed', String(mode === 'sky'));
    mapBtn.setAttribute('aria-pressed', String(mode === 'map'));
  }

  function switchTo(mode) {
    if (getViewMode() === mode || canvas.classList.contains('is-switching-view')) return;
    canvas.classList.add('is-switching-view');
    const ms = parseFloat(getComputedStyle(canvas).transitionDuration) * 1000 || 0;
    setTimeout(() => {
      setViewMode(mode);
      emit('viewModeChanged', { mode });
      canvas.classList.remove('is-switching-view');
      sync();
      announce(
        mode === 'map' ? 'Showing the family by where they are.' : 'Showing the family sky, by generation.',
        { delay: 200 },
      );
    }, ms);
  }

  skyBtn.addEventListener('click', () => switchTo('sky'));
  mapBtn.addEventListener('click', () => switchTo('map'));
  sync();
}

function makeButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-mode-toggle__button';
  button.textContent = label;
  return button;
}
