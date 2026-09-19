// Pure "how are these two people related?" logic for the profile card's relationship finder.
// No DOM, canvas or state, so it is unit-tested standalone (tests/test-kinship.html).
//
// The data has no gender field, so every term is neutral ("parent", "aunt or uncle", "niece or
// nephew", "first cousin once removed"...). Blood relatives are found through their nearest common
// ancestor (u generations up from the first person, d up from the second); people related only
// through a marriage are described through the spouse who IS a blood relative ("aunt or uncle by
// marriage", "sibling's spouse", "spouse's sibling"). The returned `path` holds every person on the
// chain, so the map can light the whole route.

// ---- graph helpers --------------------------------------------------------------------------

function indexPeople(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentsOf = (id) => (byId.get(id)?.parents ?? []).filter((pid) => byId.has(pid));
  // Spouses follow partnerOf in both directions (founders point at each other).
  const spousesOf = (id) => {
    const spouses = new Set();
    const self = byId.get(id);
    if (self?.partnerOf && byId.has(self.partnerOf)) spouses.add(self.partnerOf);
    people.forEach((p) => { if (p.partnerOf === id) spouses.add(p.id); });
    spouses.delete(id);
    return [...spouses];
  };
  return { byId, parentsOf, spousesOf };
}

// Generations from `id` up to every ancestor (itself = 0), taking the shortest route.
function ancestorDistances(id, parentsOf) {
  const dist = new Map([[id, 0]]);
  let frontier = [id];
  while (frontier.length > 0) {
    const next = [];
    frontier.forEach((current) => {
      parentsOf(current).forEach((parentId) => {
        if (!dist.has(parentId)) { dist.set(parentId, dist.get(current) + 1); next.push(parentId); }
      });
    });
    frontier = next;
  }
  return dist;
}

// [from, ..., ancestor] following parent links (shortest).
function upChain(from, ancestor, parentsOf) {
  const previous = new Map([[from, null]]);
  let frontier = [from];
  while (frontier.length > 0 && !previous.has(ancestor)) {
    const next = [];
    frontier.forEach((current) => {
      parentsOf(current).forEach((parentId) => {
        if (!previous.has(parentId)) { previous.set(parentId, current); next.push(parentId); }
      });
    });
    frontier = next;
  }
  const chain = [];
  for (let at = ancestor; at !== null && at !== undefined; at = previous.get(at)) chain.unshift(at);
  return chain;
}

// ---- blood relationships -------------------------------------------------------------------

// { up, down, commons, path, half } for two people who share an ancestor (or one is the other's),
// else null. `up` = generations from a to the nearest common ancestor, `down` = from b.
function bloodRelation(aId, bId, graph) {
  if (aId === bId) return null;
  const fromA = ancestorDistances(aId, graph.parentsOf);
  const fromB = ancestorDistances(bId, graph.parentsOf);
  let best = null;
  fromA.forEach((up, id) => {
    if (!fromB.has(id)) return;
    const down = fromB.get(id);
    if (!best || up + down < best.up + best.down) best = { up, down };
  });
  if (!best) return null;
  // Everyone who is a common ancestor at exactly that distance (the couple both people descend from).
  const commons = [...fromA.keys()].filter((id) => fromA.get(id) === best.up && fromB.get(id) === best.down);

  const first = commons[0];
  const path = [...upChain(aId, first, graph.parentsOf), ...upChain(bId, first, graph.parentsOf).reverse().slice(1)];
  commons.slice(1).forEach((id) => { if (!path.includes(id)) path.splice(path.indexOf(first) + 1, 0, id); });

  let half = false;
  if (best.up === 1 && best.down === 1) {
    const pa = graph.parentsOf(aId);
    const pb = graph.parentsOf(bId);
    const shared = pa.filter((id) => pb.includes(id)).length;
    half = shared < Math.max(pa.length, pb.length);
  }
  return { ...best, commons, path, half };
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n) => ORDINALS[n] || `${n}th`;
const greats = (n) => 'great-'.repeat(Math.max(0, n));
const removed = (n) => (n === 1 ? 'once removed' : n === 2 ? 'twice removed' : `${n} times removed`);

// What `b` is to `a`, given up/down generations to their nearest common ancestor.
export function bloodLabel({ up, down, half = false }) {
  if (up === 0) { // b is a's descendant
    return down === 1 ? 'child' : `${greats(down - 2)}grandchild`;
  }
  if (down === 0) { // b is a's ancestor
    return up === 1 ? 'parent' : `${greats(up - 2)}grandparent`;
  }
  if (up === 1 && down === 1) return half ? 'half-sibling' : 'sibling';
  if (up === 1) return `${greats(down - 2)}niece or ${greats(down - 2)}nephew`;
  if (down === 1) return `${greats(up - 2)}aunt or ${greats(up - 2)}uncle`;
  const degree = Math.min(up, down) - 1;
  const gap = Math.abs(up - down);
  return `${ordinal(degree)} cousin${gap > 0 ? ` ${removed(gap)}` : ''}`;
}

// ---- the public entry point ------------------------------------------------------------------

const possessive = (name) => `${name}'s`;

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// The founding couple is one black hole: if either founder is on the path, both light up.
function withFounderPartners(path, byId) {
  const out = [];
  const add = (id) => { if (!out.includes(id)) out.push(id); };
  path.forEach((id) => {
    add(id);
    const p = byId.get(id);
    const partner = p?.isFounder ? byId.get(p.partnerOf) : null;
    if (partner?.isFounder && partner.partnerOf === id) add(partner.id);
  });
  return out;
}

// Labels where "<label> by marriage" reads naturally (older generation than the first person).
const isElderLabel = (rel) => rel.down === 0 || (rel.down === 1 && rel.up >= 2);

/**
 * How is person `bId` related to person `aId`?
 * @param {object[]} people  normalized people
 * @param {string} aId       the person whose card is open
 * @param {string} bId       the person picked
 * @param {{ ownerName?: string }} [options]  ownerName overrides A's name in the sentence (the
 *   founder card is "Grandfather & Grandmother")
 * @returns {{ kind: 'self'|'spouse'|'blood'|'marriage'|'none', label: string, path: string[],
 *   through: string[], sentence: string }}
 *   Reads as "<B> is <A>'s <label>": e.g. "Cousin 3 is Me!'s first cousin, through Grandfather & Grandmother."
 */
export function findRelationship(people, aId, bId, options = {}) {
  const graph = indexPeople(people);
  const { byId, spousesOf } = graph;
  const a = byId.get(aId);
  const b = byId.get(bId);
  if (!a || !b) return { kind: 'none', label: '', path: [], through: [], sentence: '' };
  const nameOf = (id) => byId.get(id)?.name ?? id;
  const owner = possessive(options.ownerName ?? a.name);
  const finish = (kind, label, path, through = []) => ({
    kind,
    label,
    path: withFounderPartners(path, byId),
    through,
    sentence: `${b.name} is ${owner} ${label}${through.length ? `, through ${joinNames(through.map(nameOf))}` : ''}.`,
  });

  if (aId === bId) {
    return { kind: 'self', label: '', path: [aId], through: [], sentence: 'That is the same person.' };
  }
  if (spousesOf(aId).includes(bId)) return finish('spouse', 'spouse', [aId, bId]);

  const blood = bloodRelation(aId, bId, graph);
  if (blood) {
    const through = blood.up > 0 && blood.down > 0 ? blood.commons : [];
    return finish('blood', bloodLabel(blood), blood.path, through);
  }

  // Related only through marriage. 1) B's spouse is A's blood relative; 2) A's spouse is B's blood
  // relative; 3) both of those at once.
  const viaB = spousesOf(bId)
    .map((s) => ({ s, rel: bloodRelation(aId, s, graph) })).find((x) => x.rel);
  if (viaB) {
    const rest = bloodLabel(viaB.rel);
    const label = isElderLabel(viaB.rel) ? `${rest} by marriage` : `${rest}'s spouse`;
    return finish('marriage', label, [...viaB.rel.path, bId], [viaB.s]);
  }
  const viaA = spousesOf(aId)
    .map((s) => ({ s, rel: bloodRelation(s, bId, graph) })).find((x) => x.rel);
  if (viaA) {
    return finish('marriage', `spouse's ${bloodLabel(viaA.rel)}`, [aId, ...viaA.rel.path], [viaA.s]);
  }
  for (const sa of spousesOf(aId)) {
    for (const sb of spousesOf(bId)) {
      const rel = bloodRelation(sa, sb, graph);
      if (rel) return finish('marriage', 'relative by marriage', [aId, ...rel.path, bId], [sa, sb]);
    }
  }

  return { kind: 'none', label: '', path: [], through: [], sentence: 'No connection in this tree yet.' };
}
