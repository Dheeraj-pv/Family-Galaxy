// The first-visit tour's script and its layout maths — pure (no DOM), so tests/test-tour.html can
// check them. tour.js owns everything that touches the page.
//
// Each step names an element to glow softly around (`selector`, or null for a welcome that isn't
// about any one thing) and which side of it the little card would like to sit on (`prefer`).
// The voice is the family's, not a product's: short, warm, a little hand-written.

export const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to your galaxy',
    body: 'Every light in this sky is someone in your family. Come wander for a minute — we’ll show you around.',
    hand: 'it only takes a minute',
    selector: null,
    prefer: 'top',
  },
  {
    id: 'stars',
    title: 'Every star is a story',
    body: 'Bright stars are relatives by blood, the small planets are the ones who married in, and the dark ring in the middle is where it all began. Try clicking one.',
    hand: 'go on, pick a star',
    selector: '#star-map-container',
    ring: false, // the whole sky is the "anchor" — a glow around all of it would say nothing
    prefer: 'left',
    advanceOn: 'starSelected', // clicking a star is the answer to this step
  },
  {
    id: 'search',
    title: 'Looking for someone?',
    body: 'Start typing a name and the sky will find them for you.',
    selector: '#star-search-input',
    prefer: 'below',
  },
  {
    id: 'timeline',
    title: 'Watch the years go by',
    body: 'Drag the gold playhead along the bottom to see who was here in any year. Stars glow as they’re born and grow quiet when they’re gone.',
    selector: '.timeline__viewport',
    prefer: 'above',
  },
  {
    id: 'play',
    title: 'Or let the story play',
    body: 'Press play and the years drift by on their own, pausing on the moments that mattered.',
    selector: '.timeline__play',
    prefer: 'above',
  },
  {
    id: 'postcards',
    title: 'Leave a little note',
    body: 'Send a postcard to anyone — it flips over to show your handwriting. And every star’s card hides a Then & Now photo slider under Memories. Enjoy the galaxy.',
    hand: 'that’s everything',
    selector: '#add-postcard-btn',
    prefer: 'below',
  },
];

// ---- stepping ------------------------------------------------------------------------------

export function clampIndex(index, count) {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}
export function nextIndex(index, count) { return clampIndex(index + 1, count); }
export function prevIndex(index, count) { return clampIndex(index - 1, count); }
export function isLastStep(index, count) { return index >= count - 1; }

// "2 of 6" — for the counter (and the dots).
export function progressLabel(index, count) {
  return `${clampIndex(index, count) + 1} of ${count}`;
}

// Steps whose anchor isn't on the page (or is hidden at this screen size) are simply skipped, so
// the tour never points at nothing. `hasAnchor(selector)` is supplied by the caller.
export function playableSteps(steps, hasAnchor) {
  return steps.filter((step) => step.selector === null || hasAnchor(step.selector));
}

// The tour is offered once: the pref stores that it was finished or skipped. `?tour=1` forces it.
export function shouldAutoStart({ seen, forced }) {
  return Boolean(forced) || !seen;
}

// ---- placement -----------------------------------------------------------------------------
// Rects are { left, top, width, height } in viewport pixels.

export function overlapArea(a, b) {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

const OPPOSITE = { above: 'below', below: 'above', left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

// Where to put the coach card. Tries the preferred side first, then the opposite, then the
// sides, each centred on the anchor and also flush to its start/end edge; picks the spot that
// covers the least of the anchor and of the `obstacles` (header, greeting pill, the open profile
// card, …) and needs the least nudging to stay on screen. An obstacle that contains the anchor's
// centre (a bar the anchor sits in, like the header) isn't an obstacle to avoid; instead the card
// is placed beyond that bar's edge.
//
// A missing anchor, or one so big it fills the screen (the whole sky), has no "side" to sit
// beside, so the card takes a free spot in `field` (the open sky between the header and the
// ribbon; defaults to the whole viewport): top / bottom / left / right.
//
// Returns { left, top, placement, overlap } — always fully inside the viewport (margin apart).
export function placeCoach({ anchor, viewport, card, obstacles = [], field = null, prefer = 'below', gap = 14, margin = 12 }) {
  const cw = Math.min(card.width, viewport.width - 2 * margin);
  const ch = Math.min(card.height, viewport.height - 2 * margin);
  const maxLeft = Math.max(margin, viewport.width - cw - margin);
  const maxTop = Math.max(margin, viewport.height - ch - margin);

  const bigAnchor = !anchor || (anchor.width * anchor.height) / (viewport.width * viewport.height) > 0.35;
  const relevantObstacles = anchor && !bigAnchor
    ? obstacles.filter((o) => !contains(o, anchor.left + anchor.width / 2, anchor.top + anchor.height / 2))
    : obstacles;

  const candidates = [];
  const add = (placement, left, top) => candidates.push({ placement, left, top });

  if (bigAnchor) {
    const f = field ?? { left: 0, top: 0, width: viewport.width, height: viewport.height };
    const cx = f.left + (f.width - cw) / 2;
    const cy = f.top + (f.height - ch) / 2;
    const top = f.top + margin;
    const bottom = f.top + f.height - ch - margin;
    const start = f.left + margin;
    const end = f.left + f.width - cw - margin;
    add('top', cx, top);
    add('bottom', cx, bottom);
    add('left', start, cy);
    add('right', end, cy);
    // Room to slide sideways along the top/bottom edge if the middle is taken.
    add('top', start, top);
    add('top', end, top);
    add('bottom', start, bottom);
    add('bottom', end, bottom);
  } else {
    const cx = anchor.left + anchor.width / 2 - cw / 2;
    const cy = anchor.top + anchor.height / 2 - ch / 2;
    // An anchor sitting inside a bar (a button in the header, Play in the ribbon) puts the card
    // beyond the bar's own edge rather than just beyond the button, so it never overlaps the bar.
    const bars = obstacles.filter((o) => !relevantObstacles.includes(o));
    const topEdge = Math.min(anchor.top, ...bars.map((o) => o.top));
    const bottomEdge = Math.max(anchor.top + anchor.height, ...bars.map((o) => o.top + o.height));
    const above = topEdge - gap - ch;
    const below = bottomEdge + gap;
    const leftOf = anchor.left - gap - cw;
    const rightOf = anchor.left + anchor.width + gap;
    // Along the anchor's edge: centred, then flush start, then flush end.
    [cx, anchor.left, anchor.left + anchor.width - cw].forEach((x) => { add('above', x, above); add('below', x, below); });
    [cy, anchor.top, anchor.top + anchor.height - ch].forEach((y) => { add('left', leftOf, y); add('right', rightOf, y); });
  }

  const order = [prefer, OPPOSITE[prefer], 'below', 'above', 'right', 'left', 'top', 'bottom'];
  const rank = (placement) => order.indexOf(placement);

  let best = null;
  candidates.forEach((candidate, index) => {
    const left = Math.min(maxLeft, Math.max(margin, candidate.left));
    const top = Math.min(maxTop, Math.max(margin, candidate.top));
    const rect = { left, top, width: cw, height: ch };
    const overlapObstacles = relevantObstacles.reduce((sum, o) => sum + overlapArea(rect, o), 0);
    const overlapAnchor = !bigAnchor && anchor ? overlapArea(rect, anchor) : 0;
    const shift = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
    // Covering the thing we're pointing at is the worst; then covering other UI; then being
    // pushed around. Ties go to the preferred side, then to earlier (more centred) candidates.
    const score = overlapAnchor * 10 + overlapObstacles + shift * 20;
    const tieBreak = rank(candidate.placement) * 1000 + index;
    if (!best || score < best.score || (score === best.score && tieBreak < best.tieBreak)) {
      best = { score, tieBreak, placement: candidate.placement, left, top, overlap: overlapAnchor + overlapObstacles };
    }
  });
  return { left: Math.round(best.left), top: Math.round(best.top), placement: best.placement, overlap: best.overlap };
}
