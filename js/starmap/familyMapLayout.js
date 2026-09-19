// Family map (added on request): an alternate, non-geographic layout that groups people by
// `person.region` (a short invented place label — see CLAUDE.md "Data shape") instead of by
// lineage. Deliberately NOT a real map with tiles/coordinates (that would need a mapping library
// and possibly an API key, a real exception to the no-heavy-dependency constraint) — it's a
// stylized, hand-drawn-feeling canvas view, same rendering technology as the sky itself, just a
// different arrangement of the same stars/planets/black holes.
//
// Pure geometry only (no DOM/canvas/state), mirroring orbitMath.js's own split, so
// tests/test-family-map.html can check it standalone. Reuses orbitMath's founder-couple grouping
// and generation-based sizing so the same body renders exactly the same size in both views —
// only its position (and the lineage orbit rings, which this view has none of) differs.

import {
  groupFounders,
  bloodStarSize,
  spousePlanetSize,
  BLACK_HOLE_DIAMETER,
  SIZE_SCALE,
} from './orbitMath.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5°, for an even, organic (non-grid) scatter
const MEMBER_SPACING = 30 * SIZE_SCALE; // spiral step: how quickly members spread out from their region's center
const BLOB_PADDING = 50 * SIZE_SCALE; // breathing room between the outermost member and the region's blob edge
const REGION_GAP = 70 * SIZE_SCALE; // clearance between two adjacent regions' blob edges

const UNKNOWN_REGION = 'Elsewhere'; // fallback bucket for anyone without a region on record

function spiralPoint(index) {
  const angle = index * GOLDEN_ANGLE;
  const radius = MEMBER_SPACING * Math.sqrt(index);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

// Lays out one region's members around its own local origin (0,0): founder couples first (the
// first at dead center, since a region usually reads as "built around" its founders; any further
// founder groups spiral out like everyone else, just with black-hole sizing), then everyone else
// on a golden-angle spiral so the scatter looks organic rather than a grid.
function layoutRegionMembers(members) {
  const positions = new Map();
  const founderGroups = [];

  const founders = members.filter((p) => p.isFounder);
  const groups = groupFounders(founders);
  groups.forEach((group, gi) => {
    const { x, y } = gi === 0 ? { x: 0, y: 0 } : spiralPoint(gi);
    const groupId = group.map((p) => p.id).join('+');
    group.forEach((founder) => {
      positions.set(founder.id, {
        x, y, angle: 0, orbitRadius: 0, orbitCenter: { x, y }, orbitKind: 'none',
        size: BLACK_HOLE_DIAMETER, isBlackHole: true, groupId,
      });
    });
    founderGroups.push({ groupId, personIds: group.map((p) => p.id), x, y, diameter: BLACK_HOLE_DIAMETER });
  });

  members.filter((p) => !p.isFounder).forEach((person, idx) => {
    const { x, y } = spiralPoint(groups.length + idx + 1);
    // Spouses don't carry the blood partner's generation the way the lineage view keys off of
    // (there's no "partner's cluster index" to look up here), so this view uses the spouse's own
    // `generation` field directly — a deliberate simplification for this alternate view, not a
    // data-model change.
    const size = person.role === 'blood' ? bloodStarSize(person.generation) : spousePlanetSize(person.generation);
    positions.set(person.id, {
      x, y, angle: 0, orbitRadius: 0, orbitCenter: { x, y }, orbitKind: 'none',
      size, isBlackHole: false,
    });
  });

  let reach = groups.length > 0 ? BLACK_HOLE_DIAMETER / 2 : 0;
  positions.forEach((pos) => { reach = Math.max(reach, Math.hypot(pos.x, pos.y) + pos.size / 2); });

  return { positions, founderGroups, reach };
}

/**
 * @param {Array} people - normalized people[] (see js/data/schema.js); anyone without a `region`
 *   is grouped into a single "Elsewhere" bucket rather than dropped.
 * @returns {{ positions: Map<string, object>, founderGroups: Array<object>, blobs: Array<{region, x, y, radius}> }}
 *   Same positions/founderGroups shape computeStarMapLayout produces, so every existing renderer
 *   (star/planet/black hole/postcard marker) works unchanged; `blobs` is new, for the soft
 *   region backdrop + label.
 */
export function computeFamilyMapLayout(people) {
  const byRegion = new Map();
  people.forEach((p) => {
    const key = p.region || UNKNOWN_REGION;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(p);
  });
  const regionNames = [...byRegion.keys()].sort(); // stable, deterministic order

  const clusters = regionNames.map((region) => ({ region, ...layoutRegionMembers(byRegion.get(region)) }));

  const positions = new Map();
  const founderGroups = [];
  const blobs = [];

  let cursorX = 0;
  clusters.forEach((cluster, i) => {
    const radius = cluster.reach + BLOB_PADDING;
    if (i === 0) {
      cursorX = 0;
    } else {
      cursorX += clusters[i - 1].reach + BLOB_PADDING + REGION_GAP + radius;
    }
    const anchorX = cursorX;

    cluster.positions.forEach((pos, id) => {
      positions.set(id, { ...pos, x: pos.x + anchorX, orbitCenter: { x: pos.orbitCenter.x + anchorX, y: pos.orbitCenter.y } });
    });
    cluster.founderGroups.forEach((g) => founderGroups.push({ ...g, x: g.x + anchorX }));
    blobs.push({ region: cluster.region, x: anchorX, y: 0, radius });
  });

  // Recenter the whole row on x=0 so it frames the same way computeStarMapLayout's tree does.
  const center = blobs.length ? (Math.min(...blobs.map((b) => b.x - b.radius)) + Math.max(...blobs.map((b) => b.x + b.radius))) / 2 : 0;
  if (center !== 0) {
    positions.forEach((pos) => { pos.x -= center; pos.orbitCenter.x -= center; });
    founderGroups.forEach((g) => { g.x -= center; });
    blobs.forEach((b) => { b.x -= center; });
  }

  return { positions, founderGroups, blobs };
}

// Axis-aligned box (layout space) containing every body and every region blob, for
// fitViewForBounds (orbitMath.js) to frame on entering map mode. null with no data.
export function familyMapBounds(people) {
  const { positions, blobs } = computeFamilyMapLayout(people);
  if (positions.size === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  blobs.forEach((b) => {
    minX = Math.min(minX, b.x - b.radius);
    maxX = Math.max(maxX, b.x + b.radius);
    minY = Math.min(minY, b.y - b.radius);
    maxY = Math.max(maxY, b.y + b.radius);
  });
  const margin = 30;
  return { minX: minX - margin, maxX: maxX + margin, minY: minY - margin, maxY: maxY + margin };
}
