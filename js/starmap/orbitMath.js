// Pure geometry/sizing functions for the star map. No DOM, no canvas, no state — everything
// here is (people[]) -> derived numbers, so it can be unit-tested standalone (see
// /tests/test-orbit-math.html) before any rendering code exists. See CLAUDE.md "Star map
// rendering mechanics" for the mockup values this is built from.
//
// Known values only go up through generation 2 or 3 (mockup only shows that many levels).
// Beyond the last known generation, every table below continues the SAME ratio observed
// between its last two known points — this is the "geometric decay formula" the user chose
// for generations the mockup didn't cover, applied uniformly to every generation-keyed value
// (star size, planet size, orbit radius), not just star size.

// Applied uniformly to every size AND every orbit radius below, so proportions from the mockup
// stay exactly intact. Tunable; not a locked design-system value the way the base mockup numbers
// are. The real 24-person reference family (see data/family.json) has a worst-case radial extent
// of 230+95+55=380px at the mockup's own base values (founder -> gen1 -> gen2 -> gen3 blood
// chain) — at 1.35x that was overflowing typical viewports, so this now scales DOWN instead, to
// keep the whole tree visible without zooming/panning on load.
export const SIZE_SCALE = 0.75;

export const BLACK_HOLE_DIAMETER = 260 * SIZE_SCALE; // founders' combined black-hole visual
export const FOUNDER_GROUP_SPACING = 700 * SIZE_SCALE; // horizontal gap between independent founder groups

// diameter, px, keyed by generation — raw mockup values; SIZE_SCALE is applied in bloodStarSize()
const BLOOD_STAR_SIZE = { 1: 30, 2: 22, 3: 14 };
// diameter, px, keyed by the BLOOD PARTNER's generation (spouses don't have their own generation
// tier in the data — they inherit sizing/orbit context from who they married into)
const SPOUSE_PLANET_SIZE = { 1: 26, 2: 20 };
// radius, px, keyed by the PARENT's generation (0 = founders' black hole) — this is the orbit
// their CHILDREN sit on, e.g. lineageOrbitRadius(1) is how far gen2 sits from its gen1 parent
const LINEAGE_ORBIT_RADIUS = { 0: 230, 1: 95, 2: 55 };
// radius, px, keyed by the BLOOD PARTNER's generation
const MARRIAGE_ORBIT_RADIUS = { 1: 45, 2: 32 };

// Given a table of known values keyed by generation, returns the table value directly for a
// known generation, or extrapolates using the ratio between the table's last two known points
// for anything deeper.
function decayFrom(table, generation) {
  const knownGens = Object.keys(table).map(Number).sort((a, b) => a - b);
  const maxKnown = knownGens[knownGens.length - 1];
  if (generation <= maxKnown) {
    if (generation in table) return table[generation];
    // generation sits below the lowest known key (shouldn't happen for valid data) — fall back
    // to the smallest known value rather than extrapolating upward.
    return table[knownGens[0]];
  }
  const prevKnown = knownGens[knownGens.length - 2];
  const ratio = table[maxKnown] / table[prevKnown];
  return table[maxKnown] * Math.pow(ratio, generation - maxKnown);
}

export function bloodStarSize(generation) {
  if (generation === 0) return BLACK_HOLE_DIAMETER;
  return decayFrom(BLOOD_STAR_SIZE, generation) * SIZE_SCALE;
}

export function spousePlanetSize(bloodPartnerGeneration) {
  return decayFrom(SPOUSE_PLANET_SIZE, bloodPartnerGeneration) * SIZE_SCALE;
}

export function lineageOrbitRadius(parentGeneration) {
  return decayFrom(LINEAGE_ORBIT_RADIUS, parentGeneration) * SIZE_SCALE;
}

export function marriageOrbitRadius(bloodPartnerGeneration) {
  return decayFrom(MARRIAGE_ORBIT_RADIUS, bloodPartnerGeneration) * SIZE_SCALE;
}

// Actual orbiting motion (not just the decorative static rings): every orbit slowly rotates,
// nested — a gen2 star orbits its gen1 parent, which is itself slowly orbiting the black hole,
// moon-around-planet-around-star style. Bigger orbits move slower (a whole ring of siblings
// rotates together, rigidly, preserving their wedge spacing) so it reads as slow ambient drift,
// not a spinning carousel. Not in the original mockup — added on request; tune
// REFERENCE_PERIOD_MS_PER_100PX to taste if it feels too fast/slow.
const REFERENCE_PERIOD_MS_PER_100PX = 240000; // 4 minutes per 100px of orbit radius

export function orbitalAngleOffset(orbitRadius, timeMs) {
  if (orbitRadius <= 0 || timeMs === 0) return 0;
  const periodMs = (orbitRadius / 100) * REFERENCE_PERIOD_MS_PER_100PX;
  return (timeMs / periodMs) * Math.PI * 2;
}

// Groups founders into couples by MUTUAL partnerOf (each points at the other) — see CLAUDE.md
// "Data shape" field notes. A founder with no reciprocal partner in the data becomes its own
// single-person group rather than being dropped. Exported so familyMapLayout.js (the family-map
// view's alternate layout) can reuse the exact same couple-pairing rule instead of duplicating it.
export function groupFounders(founders) {
  const byId = new Map(founders.map((f) => [f.id, f]));
  const grouped = new Set();
  const groups = [];
  for (const founder of founders) {
    if (grouped.has(founder.id)) continue;
    const partner = founder.partnerOf ? byId.get(founder.partnerOf) : null;
    if (partner && partner.partnerOf === founder.id && !grouped.has(partner.id)) {
      groups.push([founder, partner]);
      grouped.add(founder.id);
      grouped.add(partner.id);
    } else {
      groups.push([founder]);
      grouped.add(founder.id);
    }
  }
  return groups;
}

// All role:"blood" people whose parents[] includes any of parentIds, deduplicated (a child of
// two founders lists both, but should only be laid out once).
function findBloodChildrenOf(parentIds, people) {
  const idSet = new Set(parentIds);
  const seen = new Set();
  const result = [];
  for (const person of people) {
    if (person.role !== 'blood' || seen.has(person.id)) continue;
    if (person.parents.some((id) => idSet.has(id))) {
      seen.add(person.id);
      result.push(person);
    }
  }
  return result;
}

// Recursively places a set of siblings within an angular wedge [angleStart, angleEnd) around
// orbitCenter, then recurses into each sibling's own blood children within that sibling's own
// slice of the wedge — a sunburst layout, so cousins' descendants never cross into each other's
// branch. Siblings are ordered by birth year for stable left-to-right placement.
function layoutChildrenWedge(children, orbitCenter, angleStart, angleEnd, people, positions, parentGeneration, timeMs) {
  if (children.length === 0) return;
  const sorted = [...children].sort((a, b) => (a.birth ?? 0) - (b.birth ?? 0));
  const sector = (angleEnd - angleStart) / sorted.length;
  const orbitRadius = lineageOrbitRadius(parentGeneration);
  const rotation = orbitalAngleOffset(orbitRadius, timeMs); // shared by all siblings on this ring — they rotate together, rigidly

  sorted.forEach((child, i) => {
    const childAngleStart = angleStart + i * sector;
    const childAngleEnd = childAngleStart + sector;
    const angle = childAngleStart + sector / 2 + rotation;
    const x = orbitCenter.x + orbitRadius * Math.cos(angle);
    const y = orbitCenter.y + orbitRadius * Math.sin(angle);

    positions.set(child.id, {
      x, y, angle, orbitRadius, orbitCenter,
      orbitKind: 'lineage',
      ringDepth: parentGeneration, // reveal-order for the draw-in stagger: closer to the black hole first
      size: bloodStarSize(child.generation),
      isBlackHole: false,
    });

    const grandchildren = findBloodChildrenOf([child.id], people);
    layoutChildrenWedge(grandchildren, { x, y }, childAngleStart, childAngleEnd, people, positions, child.generation, timeMs);
  });
}

/**
 * Computes screen-space-agnostic positions (an arbitrary local coordinate space, centered on
 * (0,0) for a single-founder-group tree — starMapRender.js applies pan/zoom on top of this) for
 * every person, plus the deduplicated founder-couple groups for drawing one black hole per
 * couple instead of one per person.
 *
 * @param {Array} people - normalized people[] (see js/data/schema.js)
 * @param {number} [timeMs] - elapsed time driving orbital rotation; 0 (default) freezes every
 *   orbit at its base wedge angle — pass 0 (not a running clock) when reduced motion is on.
 * @returns {{ positions: Map<string, object>, founderGroups: Array<object> }}
 */
export function computeStarMapLayout(people, timeMs = 0) {
  const founders = people.filter((p) => p.isFounder);
  const founderGroupList = groupFounders(founders);
  const positions = new Map();
  const founderGroups = [];

  founderGroupList.forEach((group, i) => {
    const anchor = {
      x: (i - (founderGroupList.length - 1) / 2) * FOUNDER_GROUP_SPACING,
      y: 0,
    };
    const groupId = group.map((p) => p.id).join('+');

    group.forEach((founder) => {
      positions.set(founder.id, {
        x: anchor.x, y: anchor.y, angle: 0, orbitRadius: 0, orbitCenter: anchor,
        orbitKind: 'none', size: BLACK_HOLE_DIAMETER, isBlackHole: true, groupId,
      });
    });
    founderGroups.push({ groupId, personIds: group.map((p) => p.id), x: anchor.x, y: anchor.y, diameter: BLACK_HOLE_DIAMETER });

    const gen1Children = findBloodChildrenOf(group.map((p) => p.id), people);
    layoutChildrenWedge(gen1Children, anchor, 0, 2 * Math.PI, people, positions, 0, timeMs);
  });

  // Spouses orbit their blood partner's own (already time-rotated) position — the marriage
  // orbit circle in the mockup is centered ON the blood star, not on the founders' black hole —
  // plus their own independent rotation on top, so a spouse doesn't just rigidly mirror its
  // partner's angle forever.
  people.filter((p) => p.role === 'spouse').forEach((spouse) => {
    const partner = people.find((p) => p.id === spouse.partnerOf);
    const partnerPos = partner && positions.get(partner.id);
    if (!partner || !partnerPos) {
      console.warn(`[orbitMath] spouse "${spouse.id}" has no resolvable partnerOf ("${spouse.partnerOf}") — skipped.`);
      return;
    }
    const orbitRadius = marriageOrbitRadius(partner.generation);
    const angle = partnerPos.angle + orbitalAngleOffset(orbitRadius, timeMs);
    positions.set(spouse.id, {
      x: partnerPos.x + orbitRadius * Math.cos(angle),
      y: partnerPos.y + orbitRadius * Math.sin(angle),
      angle, orbitRadius, orbitCenter: { x: partnerPos.x, y: partnerPos.y },
      orbitKind: 'marriage',
      ringDepth: partner.generation,
      size: spousePlanetSize(partner.generation),
      isBlackHole: false,
    });
  });

  return { positions, founderGroups };
}

// ---- Fit-to-viewport framing ---------------------------------------------------------------
// The tree keeps rotating, so a fixed snapshot of positions would under- or over-estimate how far
// out things swing. Instead this measures the WORST-CASE radial reach from a founder anchor:
// each body's distance is the sum of the orbit radii in its chain (lineage rings down to its
// parent's generation, plus its own marriage ring for a spouse) plus its own drawn size. That is
// rotation-invariant, and derives from the same generation tables as the layout itself.

const BODY_GLOW_FACTOR = 1.6; // bloom/ring accessories extend past the body's own radius
const EDGE_MARGIN = 30; // layout px of breathing room (covers a postcard envelope beside an outer star)

function lineageChainRadius(generation) {
  let sum = 0;
  for (let g = 0; g < generation; g++) sum += lineageOrbitRadius(g);
  return sum;
}

export function layoutReach(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  let reach = (BLACK_HOLE_DIAMETER / 2) * BODY_GLOW_FACTOR;
  people.forEach((person) => {
    if (person.isFounder) return;
    if (person.role === 'blood') {
      reach = Math.max(reach, lineageChainRadius(person.generation) + (bloodStarSize(person.generation) / 2) * BODY_GLOW_FACTOR);
    } else {
      const partner = byId.get(person.partnerOf);
      if (!partner) return;
      const g = partner.generation;
      reach = Math.max(reach, lineageChainRadius(g) + marriageOrbitRadius(g) + (spousePlanetSize(g) / 2) * BODY_GLOW_FACTOR);
    }
  });
  return reach + EDGE_MARGIN;
}

// Axis-aligned box (layout space) that contains everything at any moment, or null with no data.
export function layoutBounds(people) {
  const { founderGroups } = computeStarMapLayout(people);
  if (founderGroups.length === 0) return null;
  const reach = layoutReach(people);
  return {
    minX: Math.min(...founderGroups.map((g) => g.x)) - reach,
    maxX: Math.max(...founderGroups.map((g) => g.x)) + reach,
    minY: Math.min(...founderGroups.map((g) => g.y)) - reach,
    maxY: Math.max(...founderGroups.map((g) => g.y)) + reach,
  };
}

/**
 * The camera ({scale, x, y}, same meaning as state's viewportTransform) that frames `bounds`
 * inside a canvas of `viewport` size: scale = min((W - 2*pad) / boundsW, (H - 2*pad) / boundsH),
 * clamped to [minScale, maxScale] (maxScale defaults to 1 — never blow the map up on a big
 * screen), then panned so the bounds' centre sits at the canvas centre.
 */
export function fitViewForBounds(bounds, viewport, { padding = 16, minScale = 0.3, maxScale = 1 } = {}) {
  if (!bounds || viewport.width <= 0 || viewport.height <= 0) return { scale: 1, x: 0, y: 0 };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const raw = Math.min((viewport.width - 2 * padding) / width, (viewport.height - 2 * padding) / height);
  const scale = Math.min(maxScale, Math.max(minScale, raw));
  return {
    scale,
    x: -((bounds.minX + bounds.maxX) / 2) * scale,
    y: -((bounds.minY + bounds.maxY) / 2) * scale,
  };
}
