// The +/- zoom stack, bottom-right of the star map (CLAUDE.md "Layout"). Real <button>s, so mouse,
// touch and keyboard (Tab, Enter/Space) all work without extra handlers. Zooms about the canvas
// centre, cancels any follow (manual zoom intent, same as the wheel), and announces
// `viewportChanged` like every other manual camera change.

import { getViewportTransform, setViewportTransform } from '../state.js';
import { on, emit } from '../utils/events.js';
import { clamp } from '../utils/math.js';
import { cancelFollow, ZOOM_MIN, ZOOM_MAX } from './starMapRender.js';

const ZOOM_STEP = 1.25;

export function initZoomControls(containerEl) {
  const wrap = document.createElement('div');
  wrap.className = 'zoom-controls';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Zoom');

  const zoomIn = makeButton('+', 'Zoom in');
  const zoomOut = makeButton('−', 'Zoom out');
  wrap.append(zoomIn, zoomOut);
  containerEl.appendChild(wrap);

  function zoomBy(factor) {
    cancelFollow();
    const t = getViewportTransform();
    const scale = clamp(t.scale * factor, ZOOM_MIN, ZOOM_MAX);
    const ratio = scale / t.scale;
    // A point at the canvas centre stays put: pan offsets scale by the same ratio as the map.
    setViewportTransform({ scale, x: t.x * ratio, y: t.y * ratio });
    emit('viewportChanged', getViewportTransform());
  }

  // aria-disabled (not `disabled`) so a keyboard user zooming to a limit doesn't lose focus.
  function syncLimits() {
    const { scale } = getViewportTransform();
    zoomIn.setAttribute('aria-disabled', String(scale >= ZOOM_MAX - 1e-6));
    zoomOut.setAttribute('aria-disabled', String(scale <= ZOOM_MIN + 1e-6));
  }

  zoomIn.addEventListener('click', () => { if (zoomIn.getAttribute('aria-disabled') !== 'true') zoomBy(ZOOM_STEP); });
  zoomOut.addEventListener('click', () => { if (zoomOut.getAttribute('aria-disabled') !== 'true') zoomBy(1 / ZOOM_STEP); });
  on('viewportChanged', syncLimits);
  syncLimits();
}

function makeButton(glyph, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zoom-controls__button';
  button.setAttribute('aria-label', label);
  button.textContent = glyph;
  return button;
}
