// Pure "who is this person's immediate family" logic for the relationship highlight — selecting a
// star softly lights up its parents, siblings, children and spouse(s) and dims everyone else. No DOM, canvas
// or state, so it is unit-tested standalone (tests/test-relations.html).

// How bright everyone NOT related to the selection stays (multiplied with the timeline opacity).
export const FOCUS_DIM = 0.3;

// The founding couple is one black hole, so selecting either founder means selecting both.
function selfIds(people, personId) {
  const person = people.find((p) => p.id === personId);
  if (!person) return [];
  const partner = person.isFounder ? people.find((p) => p.id === person.partnerOf && p.isFounder) : null;
  return partner ? [person.id, partner.id] : [person.id];
}

/**
 * @returns {{ self: string[], parents: string[], siblings: string[], children: string[], spouses: string[], all: Set<string> }}
 * `parents` are only ids that exist in the tree. `siblings` are anyone sharing at least one in-tree
 * parent (so half-siblings count). `spouses` follows `partnerOf` in both directions
 * (a planet's own partnerOf, or a blood person some planet points at). For a founder couple, `self`
 * holds both founders (they don't count as each other's spouse) and the relations are the union.
 */
export function relatedIds(people, personId) {
  const self = selfIds(people, personId);
  const ids = new Set(people.map((p) => p.id));
  const parents = new Set();
  const siblings = new Set();
  const children = new Set();
  const spouses = new Set();

  self.forEach((id) => {
    const person = people.find((p) => p.id === id);
    (person.parents ?? []).forEach((parentId) => { if (ids.has(parentId)) parents.add(parentId); });
    if (person.partnerOf && ids.has(person.partnerOf)) spouses.add(person.partnerOf);
    people.forEach((other) => {
      if ((other.parents ?? []).includes(id)) children.add(other.id);
      if ((person.parents ?? []).some((parentId) => ids.has(parentId) && (other.parents ?? []).includes(parentId))) siblings.add(other.id);
      if (other.partnerOf === id) spouses.add(other.id);
    });
  });

  self.forEach((id) => { parents.delete(id); siblings.delete(id); children.delete(id); spouses.delete(id); });
  return {
    self,
    parents: [...parents],
    siblings: [...siblings],
    children: [...children],
    spouses: [...spouses],
    all: new Set([...self, ...parents, ...siblings, ...children, ...spouses]),
  };
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// One calm sentence for the screen-reader live region, e.g.
// "Highlighting Mom's family: parents Grandfather and Grandmother, siblings Uncle 1, Uncle 2 and Aunty 1, child Me!, spouse Dad."
export function describeRelations(people, personId) {
  const relations = relatedIds(people, personId);
  if (relations.self.length === 0) return '';
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? id;
  const owner = joinNames(relations.self.map(nameOf));
  const parts = [
    ['parent', relations.parents],
    ['sibling', relations.siblings],
    ['child', relations.children],
    ['spouse', relations.spouses],
  ]
    .filter(([, ids]) => ids.length > 0)
    .map(([noun, ids]) => `${ids.length === 1 ? noun : noun === 'child' ? 'children' : `${noun}s`} ${joinNames(ids.map(nameOf))}`);
  if (parts.length === 0) return `Highlighting ${owner}: no relatives in the tree.`;
  return `Highlighting ${owner}'s family: ${parts.join(', ')}.`;
}
