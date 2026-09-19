// Unified mouse+touch input via the Pointer Events API — one code path for pan (drag),
// zoom (wheel + pinch), and click/tap, rather than separate mouse/touch handlers. Emits
// layout-space click coordinates for starMapRender.js to hit-test (it already owns the layout
// data from computeStarMapLayout, so duplicating that here would mean two sources of truth).

import { getViewportTransform, setViewportTransform } from '../state.js';
import { emit } from '../utils/events.js';
import { clamp } from '../utils/math.js';
import { cancelFollow, ZOOM_MIN as MIN_SCALE, ZOOM_MAX as MAX_SCALE } from './starMapRender.js';
import { initZoomControls } from './zoomControls.js';

const CLICK_DRAG_THRESHOLD = 6; // px of movement before a mouse press counts as a drag, not a click
const TOUCH_DRAG_THRESHOLD = 10; // fingers jitter more than a mouse, so a tap tolerates more movement

function screenToLayout(rect, screenX, screenY, transform) {
  const localX = screenX - rect.left;
  const localY = screenY - rect.top;
  const originX = rect.width / 2 + transform.x;
  const originY = rect.height / 2 + transform.y;
  return {
    x: (localX - originX) / transform.scale,
    y: (localY - originY) / transform.scale,
  };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointOf(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function initStarMapInput(canvas) {
  initZoomControls(canvas.parentElement);
  const pointers = new Map(); // pointerId -> {x, y} in client (screen) coordinates
  let dragStart = null; // {x, y, moved, transform}
  let pinchStart = null; // {distance, midpoint, transform} — fixed at gesture start, not updated per-move

  // Zooms so the layout point that was under `screenPoint` (in the base transform) ends up under
  // `targetPoint` (defaults to the same spot). A pinch passes a moving target, so dragging two
  // fingers together also pans.
  function applyZoomAroundScreenPoint(screenPoint, baseTransform, newScale, targetPoint = screenPoint) {
    const rect = canvas.getBoundingClientRect();
    const layoutPoint = screenToLayout(rect, screenPoint.x, screenPoint.y, baseTransform);
    const localX = targetPoint.x - rect.left;
    const localY = targetPoint.y - rect.top;
    setViewportTransform({
      scale: newScale,
      x: localX - rect.width / 2 - layoutPoint.x * newScale,
      y: localY - rect.height / 2 - layoutPoint.y * newScale,
    });
    emit('viewportChanged', getViewportTransform());
  }

  canvas.addEventListener('pointerdown', (e) => {
    // Capture keeps the drag alive if the pointer leaves the canvas mid-gesture. It's a nice-to-
    // have, not a requirement for pan/click detection below, so a failure here (e.g. an already-
    // released or otherwise invalid pointer id) must not abort the rest of the handler.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn('[starMapInput] setPointerCapture failed, continuing without capture.', err);
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      dragStart = {
        x: e.clientX, y: e.clientY, moved: false, transform: { ...getViewportTransform() },
        threshold: e.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : CLICK_DRAG_THRESHOLD,
      };
    } else if (pointers.size === 2) {
      cancelFollow(); // a second finger is unambiguous manual pinch-zoom intent
      dragStart = null; // a second finger joining cancels any single-pointer click/drag in progress
      const pts = [...pointers.values()];
      pinchStart = {
        distance: distanceBetween(pts[0], pts[1]),
        midpoint: midpointOf(pts[0], pts[1]),
        transform: { ...getViewportTransform() },
      };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > dragStart.threshold || Math.abs(dy) > dragStart.threshold) {
        if (!dragStart.moved) cancelFollow(); // first frame this reads as a real drag, not a click
        dragStart.moved = true;
      }
      // Until the press has clearly become a drag, leave the camera alone: a tap that wobbles a
      // few pixels must not nudge the map out from under the star being tapped.
      if (!dragStart.moved) return;
      setViewportTransform({
        ...getViewportTransform(),
        x: dragStart.transform.x + dx,
        y: dragStart.transform.y + dy,
      });
      emit('viewportChanged', getViewportTransform());
    } else if (pointers.size === 2 && pinchStart) {
      const pts = [...pointers.values()];
      const scaleRatio = distanceBetween(pts[0], pts[1]) / pinchStart.distance;
      const newScale = clamp(pinchStart.transform.scale * scaleRatio, MIN_SCALE, MAX_SCALE);
      applyZoomAroundScreenPoint(pinchStart.midpoint, pinchStart.transform, newScale, midpointOf(pts[0], pts[1]));
    }
  });

  function endPointer(e, { canClick }) {
    if (!pointers.has(e.pointerId)) return;
    if (canClick && pointers.size === 1 && dragStart && !dragStart.moved) {
      const rect = canvas.getBoundingClientRect();
      const layoutPoint = screenToLayout(rect, e.clientX, e.clientY, getViewportTransform());
      emit('starMapClicked', layoutPoint);
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) dragStart = null;
    if (pointers.size === 1) {
      // One finger lifted mid-pinch: the remaining finger carries on as a pan, never as a tap.
      const [rest] = pointers.values();
      dragStart = { x: rest.x, y: rest.y, moved: true, transform: { ...getViewportTransform() }, threshold: 0 };
    }
  }

  canvas.addEventListener('pointerup', (e) => endPointer(e, { canClick: true }));
  // A cancelled gesture (the browser took over the touch) was never a tap, so it must not click.
  canvas.addEventListener('pointercancel', (e) => endPointer(e, { canClick: false }));

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelFollow(); // any wheel input is unambiguous manual zoom intent
    const current = getViewportTransform();
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const newScale = clamp(current.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
    applyZoomAroundScreenPoint({ x: e.clientX, y: e.clientY }, current, newScale);
  }, { passive: false });
}
