# The Family Galaxy

A frontend-only, single-page family history site: relatives are stars in a night sky, memories are
before/after photo sliders, postcards are flippable corkboard notes, and a bottom timeline scrubber
ages the whole sky through the decades. No build step required. Handmade over slick. **The site
itself is still a static frontend deployable to GitHub Pages** — but as of the "Cloud sync" section
below, it talks to a small free Supabase backend (Postgres + Storage) so postcards, timeline moments,
and Then & Now photos are shared and persist beyond one browser's `localStorage`, on request after the
user raised that local-only data couldn't be seen or added to by anyone else.

## Emotional intent (the actual spec — weigh every decision against this)

Warmth, wonder, connection, timelessness. If a suggestion makes the site feel colder, faster, or more
"product-like," flag it before building it. A soft glow beats a sharp edge; a slow fade beats a snap;
hand-drawn beats pixel-perfect.

## Authoritative sources

- **Design**: `The Family Galaxy — Design Concept.html` in this folder. This is a claude.ai artifact
  export bundle (gzip+base64 payloads inside `<script type="__bundler/*">` tags, not plain HTML) — it
  is **not human-readable by opening the file directly in an editor**; see "Re-extracting the design
  mockups" below if pixel-level detail is ever needed beyond what's captured here. **Its 7 mockup
  boards override the prose "Design System" section of the original chat brief wherever they conflict**
  — the user explicitly said to ignore that prose section in favor of this file.
- **Functional spec / constraints**: the original chat brief (not stored as a file — summarized below).
  Re-ask the user if a constraint here seems ambiguous rather than assuming.

## The four features and how they interlock

They are one interlocking single-page experience, not four pages:

1. **Star Map** — the home surface. Clicking a star slides up that person's **Profile Card**.
2. **Profile Card** has three tabs: Memories (opens the **Then & Now slider** modal), Postcards
   (that person's corkboard), Timeline.
3. **Postcard system** — corkboard per person, flip animation reveals handwritten back. "+ Add
   Postcard" in the top bar writes a new one to `localStorage`.
4. **Timeline ribbon** is fixed at the bottom across everything — dragging its playhead filters the
   Star Map itself (stars fade in/out by whether that person was alive/relevant that year). It's a
   global lens, not a separate view.

## Non-negotiable technical constraints (do not cross without asking first)

- **Frontend only, no build step, no auth** — plain HTML/CSS/JS, deployable as static files
  (GitHub Pages-class hosting). **Amended on request (see "Cloud sync" below)**: the site does now
  talk to a Supabase project for shared/synced data and photo storage — this was a deliberate,
  user-requested exception to the original "no backend, no database" line, made because local-only
  data couldn't be seen or added to by anyone but the one browser that wrote it. It's still not a
  server the site depends on to load or render (`hasSupabaseConfig()` false → the whole app still
  works, `localStorage`-only, exactly as before) — treat *adding a second, different* backend
  dependency, or requiring login/auth, as still needing to be asked about first.
- **No 3D engines** (Three.js, Babylon, etc.) — canvas 2D, SVG, or CSS 3D transforms only.
- **Data lives in three places**: `family.json` (static structure), `localStorage` (this browser's
  cache of user-added postcards/events/photos, and the offline fallback), and, when configured,
  Supabase Postgres + Storage (the shared source of truth others also see — see "Cloud sync").
- **Hosting target**: static host (GitHub Pages-class). Total site < 100MB, individual files < 25MB.
- **Accessible**: stars keyboard-navigable (Tab + Enter), WCAG AA text contrast, `prefers-reduced-motion`
  disables twinkle/bob/parallax/orbital drift, screen readers get hidden DOM mirrors of canvas-rendered
  content.
- **Mobile-friendly**: responsive to 360px width, touch gestures for pan/zoom/scrub.
- **Don't invent new colors, fonts, or motion values** beyond what's documented below without confirming
  — this is a "design system already decided" project.

## Design tokens

**Color**
| Token | Hex/value | Use |
|---|---|---|
| Deep Space Navy | `#0a0e27` | background (outer) |
| Midnight | `#1a1f3a` | background (radial center) |
| Warm White | `#fff8e7` | star glow |
| Soft Gold | `#ffd89b` | star glow, accents, CTA gradient |
| Aged Cream | `#f5ecd9` | paper (postcard back) |
| Teal | `#5eead4` | maternal accent |
| Amber | `#fbbf24` | paternal accent |
| Rose | `#fb7185` | shared/family-wide accent |
| Text primary | `#f8f5f0` | body text on dark |
| Text secondary | `rgba(248,245,240,0.6)` | secondary text on dark |

**Typography**
- Headings / names: **Fraunces** (italic, weight ~500) — e.g. `font-style:italic;font-weight:500`
- Body / UI: **DM Sans**
- Handwritten accents (postcards, captions): **Caveat** (weight 600 for emphasis)
- Years/dates: DM Sans, small caps feel via `letter-spacing:0.14–0.18em; text-transform:uppercase`

**Motion (exact values from the mockup's "Motion & Micro-interactions" board)**
| Interaction | Timing | Easing | Notes |
|---|---|---|---|
| Star twinkle | 2–5s | ease-in-out | randomized per-star, decorrelated — never breathes as one |
| Constellation/orbit draw-in | 1.1s | ease-out | +150ms stagger per family line, on first load |
| Postcard orbit/bob | ±4px, 6s loop | ease-in-out | drifts + bobs near its star |
| Profile card entrance | 450ms | `cubic-bezier(.34,1.56,.64,1)` | soft overshoot, settles not snaps |
| Star select ripple | 400ms | ease-out | brief expanding ripple before card rises |
| Timeline scrub fade | 300ms | ease | opacity 0.15 → 1.0 |
| Postcard flip | 600ms | ease-in-out | `rotateY(180deg)`, shadow deepens mid-flip |
| Corkboard hover | 200ms | ease-out | scale to 1.03, shadow softens/deepens |
| Reduced motion | 120ms cross-fade | — | twinkle/orbit/drift pause entirely; entrances/fades collapse to this |

**Texture**: layered radial gradients for depth, 3–5% grain overlay, soft vignette at canvas edges,
nebula-cloud blobs (`mix-blend-mode:screen`, low-opacity radial gradients) for atmosphere.

## Layout (from the wireframe mockup, desktop 1440px reference)

- Header: 64px fixed, translucent navy + backdrop blur so starfield shows through. Wordmark+icon left;
  "Find a star" search, gradient "+ Add Postcard" button, user avatar right.
- Star map: fills remaining height, `overflow:hidden`. Zoom controls bottom-right (+/− stack).
- Timeline ribbon: 120px fixed at the bottom (desktop). Collapses to a 60px strip with pinch-zoom on
  mobile.

## Star map rendering mechanics — supersedes the brief's "constellation lines" description

The actual mockup does **not** connect people with point-to-point lines. Relationships are shown as
concentric dashed **orbit rings**, and blood relatives vs. spouses render differently:

- **Founders** (the root couple) render as a single combined **black hole**: a dark core with a
  spinning conic-gradient accretion ring (`animation: spin 16s linear infinite`), ~260px. Two people,
  one visual.
- **Blood relatives** = glowing, pulsing **stars** (`glowPulse`, size scales with generation: gen1
  ~30px, gen2 ~22–24px, gen3 ~14px). The current user gets a distinctive "Me!" star with a stronger,
  non-decaying glow.
- **Spouses** (married in, not blood) = smaller, **non-glowing, non-pulsing "planet"** spheres in a
  muted solid color, positioned on a **marriage orbit** around the blood relative they married into.
  Planet diameter (pulled from the mockup, not previously captured here): gen1 spouse ≈26px, gen2
  spouse ≈20px, keyed by the *blood partner's* generation. Generations beyond 2 continue the same
  ×0.77 decay ratio, per the same rule as star sizes/orbit radii below.
- **Orbit rings** (all `stroke-dasharray`, low-opacity, decorative — pointer-events:none). Each ring
  is centered on the parent/partner it belongs to, not on the founders' black hole:
  - Lineage orbit, centered on a parent (or the founders' black hole for parentGen 0): the radius
    that parent's **children** sit on — r≈230 around the black hole (gen1 children), r≈95 around a
    gen1 blood parent (gen2 children), r≈55 around a gen2 blood parent (gen3 children). Deeper
    generations continue the gen1→gen2 ratio (×0.579).
  - Marriage orbit, centered on the blood star itself: r≈45 for a gen1 blood partner, r≈32 for gen2
    (×0.711 decay beyond that).
  - Postcard orbit (envelope icons bobbing near a star): r≈55–70
- Postcards appear as small bobbing envelope icons directly on the map near their recipient, in
  addition to living on that person's corkboard in their profile card.

**Orbital drift (added post-mockup, on request)**: orbit rings aren't just decorative — every
orbiting body actually revolves, nested (a gen2 star orbits its gen1 parent, which is itself
slowly orbiting the black hole; a spouse orbits its blood partner independently on top of that).
A whole ring of siblings rotates together rigidly, preserving their wedge spacing. Speed is
proportional to orbit radius (bigger orbit = slower — not real Kepler physics, just "ambient
drift" tuned so nothing feels like a spinning carousel): reference is 4 minutes per 100px of
orbit radius (`orbitalAngleOffset` / `REFERENCE_PERIOD_MS_PER_100PX` in `orbitMath.js`), so the
gen1-around-black-hole orbit (r≈230) takes ~9 minutes per revolution while a marriage orbit
(r≈45) takes under 2. This is genuinely new motion, not in the design mockup — treat the period
constant as tunable to taste, not as a locked design-system value. Frozen (no drift at all, orbit
positions collapse to their static base angle) under `prefers-reduced-motion`, same category as
twinkle — driven by passing `timeMs=0` into `computeStarMapLayout` rather than a running clock.

**Overall scale (added post-mockup, on request)**: every size AND every orbit radius is
multiplied by `SIZE_SCALE` (in `orbitMath.js`) so proportions from the mockup stay exactly
intact. First set to 1.35 ("a little more larger"), then brought down to **0.75** once the full
24-person reference family was wired in — its worst-case radial extent (founder → gen1 → gen2 →
gen3 blood chain) is 230+95+55=380px at the mockup's own base values, which at 1.35× no longer
fit typical viewports without zooming out. Tune this one constant, not the base per-generation
tables, if the map should be bigger/smaller — and re-check that worst-case-extent math if the
family tree ever gets a 4th blood generation.

**Visual richness pass (added post-mockup, on request — "looks too plain")**: three changes, all
reversible/tunable, none altering the locked color/font tokens:
- **Star bloom**: `drawStar` (`starRenderer.js`) now layers an explicit large soft radial-gradient
  halo (radius ≈3.2× the star's own) *underneath* the core star gradient, rather than relying on
  `ctx.shadowBlur` alone — shadowBlur-only glow read thin/flat compared to the mockup's layered
  CSS glow. Same technique the black hole's halo already used.
- **Planet characteristics**: `drawPlanet` (`planetRenderer.js`) got a richer 4-stop gradient, a
  thin rim-light arc on the lit edge, and a **deterministic ~35% chance of a decorative ring**
  (hash-derived per id, so it's stable) — reviving a one-off detail from the mockup (a ring drawn
  behind "Husband of Aunty 1") that had been dropped since the mockup didn't tie it to any
  particular data field. `RING_CHANCE` in `planetRenderer.js` controls the odds.
- **Atmosphere**: the mockup's deep background starfield (18 tiny fixed specks) and 3 nebula-cloud
  color blobs were part of the design but never implemented — they're now `#star-map-container`
  `::before`/`::after` CSS layers (`css/star-map.css`), sitting behind the canvas (`z-index:0` vs.
  the canvas's `z-index:1`), with the exact position/color values pulled from the mockup. **Tech
  note, in answer to "can the stack do better here": this is intentionally CSS, not canvas** — it's
  static (no per-frame redraw cost) and it's how the mockup itself built it; only the parts that
  actually need per-frame JS control (the family stars/planets/rings, which move and respond to
  clicks) belong in canvas. Not yet doing the brief's "background drifts slower than foreground"
  parallax — now built, see "Starfield parallax" below.

**Click-to-follow camera (added post-mockup, on request)**: clicking (or, via the keyboard/
screen-reader mirror, selecting) any star, planet, or the black hole zooms the camera in on it
(`FOLLOW_ZOOM_SCALE`, currently 2.4×) and keeps it centered continuously — since bodies actually
orbit now, "follow" means re-centering every frame on the target's live position, not flying to a
single point. Clicking empty space releases the follow and flies back to exactly the camera
framing from before following started. Starting a manual drag or wheel/pinch zoom while following
cancels it immediately (no fighting an auto-recentering camera) and hands control back at the
current camera position, no snap. The fly-to/fly-back transition is 700ms eased, shortened to the
usual 120ms under `prefers-reduced-motion`. Implementation: `startFollowing`/`stopFollowing`/
`cancelFollow`/`updateFollowCamera` in `starMapRender.js`.

**Profile Card shell (build step 9)**: `js/profile/profileCard.js` + `css/profile-card.css`, mounted
on `#profile-card` in `index.html`. Opens on `starSelected` (canvas click or a11y mirror), shows
avatar (photo or `emoji`), name, `familyRole`, bio, and three ARIA tabs (Memories/Postcards/
Timeline) whose panels are placeholders until steps 10–12 fill `#profile-panel-*`. Closes via ×,
Escape, or `closeProfileCard()`; closing also calls `cancelFollow()` so the camera releases.
Clicking empty map space still releases the follow but does NOT close the card (undecided —
ask before changing). Emits `profileCardOpened`/`profileCardClosed`. Entrance uses
`--duration-card-entrance` + `--ease-overshoot`; reduced motion drops the slide, keeps the fade.

**Then & Now slider (build step 10)**: `js/profile/thenNowSlider.js` + `css/then-now.css`,
opened from a "Then & Now" button in the Memories tab. Body-mounted modal; "Then" is clipped over
"Now" by a draggable divider (Pointer Events) that is also an ARIA slider (arrows/Home/End/
PageUp/PageDown), Escape/backdrop/× close, focus trapped. Photos load from `assets/photos/<name>`
(no photos exist yet); a missing image shows a warm labelled placeholder instead of a broken
icon. Its entrance reuses the profile card's timing tokens (the motion table has no row for it —
flag if you want dedicated values). **Founder card**: the founding couple is one black hole, so
selecting it opens ONE card covering both founders (names joined, both bios/memories) —
otherwise only the first founder was reachable. Pure math is tested in `tests/test-then-now.html`.

**Postcard system (build step 11)**: `js/postcards/` — `postcardModel.js` (pure: date format,
sort, sender resolve, form validation), `postcardFlip.js` (one card = one `<button>`, front photo/
sender/date, back handwritten note; `aria-pressed` + only the visible face exposed to screen
readers), `corkboard.js` (grid inside the profile card's Postcards tab; founders' boards merge),
`addPostcard.js` (modal form: To/From/note/date → `localStorage` + in-memory person →
`postcardAdded`). `+ Add Postcard` is a real gradient button in `#app-header` (step 13 still owns
the rest of the header) and the Postcards tab has its own "+ Add a postcard" prefilled for that
person. `postcardMarkers.js` draws a bobbing envelope (±4px, 6s, frozen under reduced motion)
beside any star with postcards. `from` may be a person id (family.json) or a free-typed name.
Reduced motion swaps the 3D flip for a 120ms face cross-fade. Corkboard has no cork-brown — no
such token exists, so postcards sit on the card's own midnight surface. Photo upload was added
later — see "Photo uploads" below. Tests:
`tests/test-postcard-flip.html`.

**Timeline lens (build step 12)**: `js/timeline/timelineFilter.js` is pure (tests:
`tests/test-timeline-filter.html`) — `isPersonPresent` (birth..death inclusive; null birth never
hidden), `personOpacityForYear` (present 1, absent **0.15** — a ghost, not removed, so the family
stays findable), `absenceReason`, `getTimelineRange`. `starMapRender.js` eases each person's opacity
toward that target (300ms, 120ms reduced motion; no fade on first load) and applies it to stars,
planets, envelopes, orbit rings (a ring stays lit while anyone on it is present) and the black
hole (lit while either founder is). `starMapA11yMirror.js` appends ", not yet born" / ", no longer
living" to absent people's buttons. The default playhead is the current year, so people who have
died (Grandfather, Grandmother, Husband-Aunty1) start dimmed — including the black hole, since both
founders are gone by 2022. Absent people are still clickable. The ribbon UI is
`js/timeline/timelineRibbon.js` + `css/timeline.css`.

**App header (build step 13)**: `#app-header` in `index.html` + `css/header.css` +
`js/header/headerSearch.js`. Wordmark (star icon + "The Family Galaxy" in Fraunces italic; icon
only under 720px), "Find a star" ARIA combobox (ignores spaces/hyphens so "aunty1" finds
"Aunty 1"; arrows/Enter/Escape; a pick emits the same `starSelected` as a canvas click), the gold
"+ Add Postcard" button ("+" only under 420px), and an avatar button that jumps to the `me` star.
The header is translucent navy + blur. Also: while the profile card is open the follow camera
parks the followed star 20% of the map height higher (`FOLLOW_LIFT_WHEN_CARD_OPEN`) so the card
never covers it. Tests: `tests/test-search.html`. **Known gap for step 15**: the map's initial
framing doesn't fit a 360px-wide screen (tree is ~570px across) — needs a fit-to-viewport scale.

**Accessibility pass (build step 14)**: skip-to-timeline link, hidden `h1`, `#sr-live` polite live
region fed by `js/a11y/announcer.js` (debounced: timeline year + "N of 24 in the sky", search
counts, postcard sent/errors, flipped-postcard note); `js/a11y/modalInert.js` makes the app
inert behind modals; profile card is named by the person's heading and takes focus on open;
`css/a11y.css` (linked last) holds skip-link/focus styles and a global reduced-motion rule forcing
every transition/animation to 120ms linear. Every text pair audited AA (lowest 6.0:1, rose error
text); input borders raised to ~4.7:1. Not verified with a real screen reader.

**Responsive/touch pass (build step 15)**: the map fits the viewport on load/resize until the
first manual pan/zoom (`fitViewForBounds`/`layoutBounds`/`layoutReach` in `orbitMath.js`, scale =
clamp(min((W-32)/2R,(H-32)/2R), 0.3, 1), tests: `tests/test-fit-scale.html`); zoom +/- stack
(`js/starmap/zoomControls.js`, bottom-right, top-right on small screens); pinch pans too; 10px tap
tolerance for touch; `touch-action:none` on the canvas; `100dvh` + safe-area insets
(`viewport-fit=cover`); short-landscape rule. `releaseFollow()` (fly back to the fitted view) vs
`cancelFollow()` (just stop, on manual input) — closing the profile card uses `releaseFollow`.
Not verified on real touch hardware.

**Star select ripple + star list Tab stop (added after step 15)**: selecting any star/planet/
black hole plays the motion table's 400ms ease-out expanding ring (`js/starmap/selectRipple.js`,
timing tested in `tests/test-motion.html`), and the profile card rises only after it
(`STAR_SELECT_RIPPLE_MS`; no wait when the card is already open, and none under reduced motion,
where the ring is skipped entirely). The hidden star list (`starMapA11yMirror.js`) is now a single
Tab stop with roving tabindex: arrows move, Home/End jump, Enter opens.

**Starfield parallax (added on request)**: the CSS starfield layer follows the camera's pan at 25% of
its speed (`STARFIELD_PARALLAX` in `js/starmap/parallax.js`, pure + tested in `tests/test-motion.html`),
so it reads as distant. `render()` publishes `--starfield-x/-y` on `#star-map-container` and
`star-map.css` uses them as the layer's `background-position` (the layer tiles, so drift never runs
out). Frozen (offset 0) under reduced motion. Only pan is parallaxed — zoom is not, and the nebula
wash stays fixed. While following an orbiting star the background drifts ~1px/s with it.

**Postcard editing/deleting (added on request)**: user-added postcards can be edited and deleted;
postcards authored in `family.json` are deliberately read-only (that file is the family's own data,
and a stray click shouldn't destroy it — edit the JSON instead). "Editable" = the postcard has an
`id` (user-added ones get `pc_…` ids; postcards saved before this feature are given ids on load,
`ensureStoredPostcardIds`). All changes go through `js/postcards/postcardActions.js`
(`addPostcard`/`editPostcard`/`deletePostcard`: in-memory people + localStorage + bus events
`postcardAdded`/`postcardEdited`/`postcardDeleted`), never straight to state or storage. Each
editable card shows Edit / Delete under it; Edit reopens the send form prefilled ("Save changes",
and "To" can re-address it to someone else); Delete asks inline first ("Keep" is focused by
default, Escape cancels only the confirmation). After a change, focus returns to that card's Edit
button, or to "+ Add a postcard" after a delete. Tests: `tests/test-postcard-flip.html`.

**Story mode (added on request)**: a small round Play button beside the big year in the timeline
ribbon makes the playhead glide through the years by itself (`js/timeline/storyMode.js` = pure schedule,
tested in `tests/test-story.html`; the button/driver live in `timelineRibbon.js`, styles in
`css/timeline.css`). It rests 2.6s on every event year while the caption ("1966 · Mom born") shows, then
glides on, finishing at today. `STORY_MS_PER_YEAR` (260ms, ~23s across the reference family, ~33s with
the rests) and `STORY_DWELL_MS` are new tunable motion, not design-system values. Playing from the end
restarts from the beginning; otherwise it continues from the current year. Any manual touch (scrub, keys
on the playhead, an event marker, selecting a star) stops it in place; the button toggles pause. Under
reduced motion it hops event-to-event and rests on each (no gliding years). Announces start, each event,
pause and finish via the live region. **Smoothed on request**: `storyStateAt` originally floored the
travelling year to a whole number, so the playhead only actually moved once every `STORY_MS_PER_YEAR`
(260ms) and visibly hopped between ticks instead of gliding. It now returns a fractional year while
travelling (whole only while resting), and `timelineRibbon.js`'s `updatePlayhead(displayYear)` uses
that raw fractional value to position the playhead every animation frame, while still only rounding
to commit the whole year, emit `playheadChanged`, and fade the sky (`requestYear`) — so the star map's
fade cadence and the "N of 24 in the sky" announcements are unchanged, only the needle's own motion
got smoother.

**Placeholder Then & Now for everyone (added on request)**: every one of the 24 people in `family.json`
now has one `thenNow` memory so the slider is reachable from any card (before, only Me! and Grandmother
had one, and it read as "missing"). The captions are invented placeholders and the photo names
(`<id>_then.jpg` / `<id>_now.jpg`) point at files that don't exist, so the slider shows its warm
"a photo from then…" placeholders until real photos are dropped into `assets/photos/`. Replace the
captions and photos with real ones when known.

**Relationship highlight (added on request)**: selecting any star/planet/black hole softly lights
its parents, siblings, children and spouse(s) and eases everyone else down to `FOCUS_DIM` (0.3), on the same
300ms (120ms reduced-motion) fade as the timeline lens. No connecting lines (the design has none).
`js/starmap/relations.js` is pure (`relatedIds`, `describeRelations`; tests:
`tests/test-relations.html`): children = people whose `parents` include the id, spouses follow
`partnerOf` in both directions, siblings share at least one in-tree parent (half-siblings count; a
sibling's own spouse/children are not lit), and the founder couple counts as one selection (both are "self",
relations are the union). Focus is a second multiplier beside the timeline opacity in
`starMapRender.js` (`opacityOf` = timeline x focus), so rings, the black hole and envelopes take the
brightest body they hold for free. It is set on `starSelected` (re-selecting switches it) and cleared
on `profileCardClosed`, so it lasts exactly as long as the card is open; clicking empty map space
releases the camera but not the highlight. A polite announcement ("Highlighting Mom's family: parents
Grandfather and Grandmother, siblings Uncle 1, Uncle 2 and Aunty 1, child Me!, spouse Dad.") goes
through the announcer. Siblings were added on request after the first version (parents/children/spouse).

**Add events on the timeline (added on request)**: a "+" button beside Play in the ribbon opens a small modal (`js/timeline/addEvent.js`, styles in `css/events.css`) for adding your own moments: year (1800 to next year, prefilled with the playhead's), label (≤40 chars), whose moment ("Mom's side"/"Dad's side"/"Whole family" → `maternal`/`paternal`/`shared`), an optional person, and an optional month + day (both or neither, must be a real date in that year; anniversary greetings read `event.month`/`event.day`). Validation is pure (`js/timeline/eventModel.js`, tests: `tests/test-events.html`). All changes go through `js/timeline/eventActions.js` (`addEvent`/`editEvent`/`deleteEvent`: in-memory events via `setEvents` + `familyGalaxy.events.v1` + bus events `eventAdded {event}`/`eventEdited {event}`/`eventDeleted {eventId}`), never straight to state or storage. The ribbon re-reads events on those events, redrawing markers and range. Only user-added events carry an `id` (`ev_…`) and can be edited or removed; `family.json` events stay read-only, like postcards. Clicking a user-added marker moves the playhead and opens a small body-level popover (`js/timeline/momentMenu.js`, fixed-position because the ribbon's backdrop-filter traps fixed children) with Edit / Remove; Remove asks first with "Keep" focused, and Escape backs out. User markers wear a thin gold ring. Story mode picks new moments up as rest stops the next time Play starts. Not verified on real touch hardware.

**How are we related? (added on request)**: the profile card has a "How are we related?" select (`js/relationship/relationshipPicker.js`, `css/relationship.css`, mounted in `profileCard.js` between the bio and the tabs). Pick anyone and a calm italic-gold sentence says how they connect ("Cousin 3 is Me!'s first cousin, through Grandfather & Grandmother."), is announced through the live region, and the whole chain of people between them lights on the map via `setPathHighlight` (exported from `starMapRender.js`; everyone else eases to `FOCUS_DIM`; while set it wins over the selection highlight). The maths is `js/relationship/kinship.js` (pure; tests: `tests/test-kinship.html`). Blood relatives are read from the nearest common ancestor (u generations up, d down; "through" names everyone at that distance, so the founders read "Grandfather & Grandmother" and both light, since the black hole is one body); people related only by marriage are described through the spouse who is a blood relative ("aunt or uncle by marriage", "first cousin's spouse", "spouse's sibling", else "relative by marriage"); one shared parent with differing parent sets = "half-sibling". There is no gender field, so every term is neutral ("aunt or uncle", "niece or nephew", "first cousin once removed"). The founder card speaks as the couple. Because the open card covers the lower middle of the map, showing a path also stops the follow camera and flies (700ms, 120ms reduced motion) to frame the lit people in the sky above the card; clearing the picker, closing the card, or selecting another star flies/snaps back to the fitted view, and a manual pan/zoom cancels that restore. The picker registers its `starSelected` listener at import time on purpose, so it can put the camera back before `initStarMap`'s follow camera snapshots it (a proper `flyCameraTo` export in `starMapRender.js` would remove that trick). At 360px the sky above the card is small, so the framed chain is small there.

**Anniversary greeting (added on request)**: on load a quiet pill under the header greets an upcoming birthday or dated event ("Mom's birthday is in 2 days · turning 60"). `js/greeting/anniversaries.js` is pure (`upcomingCelebrations(people, events, today, {windowDays: 7, selfId: 'me'})`; tests: `tests/test-anniversaries.html`): it looks 7 days ahead, wraps Dec→Jan, celebrates Feb 29 birthdays on Feb 28 in non-leap years, drops the age when `birth` is unknown, skips events with no month/day and events still in the future or in their own year, and drops an "X born" event that lands on that person's birthday. People whose `death` year is before the birthday year are remembered rather than congratulated ("Today we remember Grandfather · would have turned 88"; "Me!" is greeted as "your"). `js/greeting/anniversaryBanner.js` owns the pill (`#anniversary-banner`, fixed under the header, only the pill takes pointer events; on small screens it keeps clear of the top-right zoom stack): fades in after `dataReady` (300ms, 120ms reduced motion), is announced once, "and N more" expands the rest, clicking a line opens that star, and × / Escape dismiss it for the rest of that calendar day (pref `greetingDismissedOn`, works with storage unavailable). It also refreshes when a moment is added/edited/removed (`eventAdded`/`eventEdited`/`eventDeleted`). New data fields: `person.birthday` ("MM-DD") and `event.month`/`event.day`, all optional; the ones in `family.json` are invented placeholders (Mom's is 09-20 so the banner shows on the dev date; replace with real dates). Testing aid: `?today=YYYY-MM-DD` overrides the date.

**Family stats card (added on request)**: a small constellation-glyph button in the header (`#stats-btn`, gold outline like the avatar) opens "The family at a glance", a non-modal popover (`#stats-card`, top-right under the header, clear of the bottom-centre profile card and the bottom-right zoom stack; full-width under 480px, where it can sit over the small-screen zoom buttons). `js/stats/familyStats.js` is pure (`familyStats`, `describeStats`, `ageInYear`; tests: `tests/test-stats.html`): people in the sky in the playhead year (with average age), generations, blood vs married-in, years of family (earliest birth to today), eldest/youngest in the sky, postcards (and who has the most, ties flagged), and moments on the timeline. A stat with nothing honest to say (unknown birth years, no events) is left out, never NaN. A tiny row-per-generation dot strip shows lit dots for those in the sky and the 0.15 ghost for those who aren't; it is decorative and `aria-hidden`, since the numbers are in a real `dl`. `js/stats/statsCard.js` re-renders live on `playheadChanged`, `postcardAdded/Edited/Deleted`, `eventAdded/eventDeleted` and `dataReady`. Escape or × closes it and returns focus to the button; a click outside closes it, except on the timeline (so you can scrub with it open); selecting a star closes it. Nothing is made inert behind it.

**Shooting star on postcards (added on request)**: sending a postcard (`postcardAdded`) launches a warm shooting star that streaks in from just off toward the top of the sky and lands on the recipient's envelope, ending in a soft gold bloom (`js/starmap/shootingStar.js`; pure timing/path/trail/bloom maths tested in `tests/test-shooting-star.html`). New motion, not in the mockup: 350ms wait (so the Add Postcard modal has faded), 1600ms ease-in-out flight along a gently bowed curve, 700ms ease-out bloom; head and trail keep a constant on-screen size at any zoom (start distance is 520 screen px / camera scale). It re-targets the recipient's live envelope position every frame (they orbit; the landing spot comes from `envelopeCenter` in `postcardMarkers.js`, shared with the envelope drawing), alternates the side it comes from per postcard, stacks up to 5 concurrent streaks (oldest dropped), and ignores recipients not on the map. Timing is timestamp-based, drawn from `drawShootingStars` inside the layout-space canvas context (called by `starMapRender.js` after the envelopes), never `setTimeout`. Drawn at full brightness regardless of the timeline year. Reduced motion: no streak at all. Not verified as a real-time animation in a visible tab (frames were forced in testing).

**First-visit tour (added on request)**: a handful of small, warm coach-mark cards (`js/tour/tour.js`,
script/layout maths in `js/tour/tourSteps.js` — pure, tests: `tests/test-tour.html`; styles in
`css/tour.css`) walk a newcomer round the galaxy: the sky itself, clicking a star (advances on
`starSelected`), "Find a star", the timeline, the Play button, and postcards/Then & Now. Each step
softly rings the thing it's talking about (no full-screen dim — the sky stays live underneath) and
picks which side to sit on by scoring candidate positions against the anchor, the header, the
ribbon, the greeting pill and an open profile card, so the card never covers what it's pointing at
or gets swallowed by another obstacle. Non-modal (`aria-modal="false"`): focus lands on the card and
returns to what had it before, Escape (while focus is inside) or Skip ends the tour, and each step
is announced. Runs once (finished-or-skipped is remembered in the `tourSeen` pref) after `dataReady`
settles, waiting out an open profile card or skipping entirely if a modal has the app inert;
`?tour=1` forces it, and "Take the tour again" in the family-stats card (`startTour()`) replays it
anytime. A step whose anchor isn't on the page (or hidden at this screen size) is skipped rather than
pointing at nothing. Reuses the card-entrance timing tokens; the ring glow is a plain fade, not a
pulse, so there is nothing to freeze under reduced motion beyond that fade collapsing to 120ms.

**Print a family sheet (added on request)**: "Print a family sheet" (a quiet text link at the foot
of the family-stats card; also triggered by the browser's own Ctrl/Cmd+P) prints a one-to-two-page
keepsake instead of the dark app. `js/print/sheetModel.js` is pure (`buildFamilySheet`, `lifeText`,
`birthdayText`; tests: `tests/test-print-sheet.html`): founders as a couple, then each branch as a
nested outline in birth order with married-in partners beside the blood relative they married
("✦ married Dad"), an "everyone at a glance" table (name, role, life years, birthday), the postcards
(sender ids resolved, newest first, a handwritten Caveat quote), and the moments in date order with
whose side they're on, closing with "Kept safe among the stars ✦". Anyone the tree can't place still
gets a line, and empty sections are left out rather than shown blank. `js/print/printSheet.js` fills
the hidden `#print-sheet` mount with `textContent` only (never markup) and reveals it only for
`beforeprint`/`afterprint` (or `matchMedia('print')` as a backup), also setting the page title to
"The Family Galaxy — family sheet" for that window (the suggested PDF filename) and restoring
everything after. `css/print.css` does the swap: on screen `#print-sheet` is always `display:none`;
under `@media print` the whole app (header, map, timeline, banner, stats card, tour, any modal) is
hidden and the page becomes Aged Cream paper with Deep Space Navy ink (Soft Gold only for rules and
ornaments — too faint on cream for body text), Fraunces/DM Sans/Caveat, `break-inside: avoid` on
each branch/row/postcard/moment. The ink reads fine even where a browser drops the cream background.
Not verified against real printed output or a saved PDF — only the on-screen result of applying the
print rules was checked, so pagination is estimated, not observed.

**Cloud sync (added on request)**: the user pointed out that `localStorage`-only data couldn't be
seen or added to by anyone but the one browser that wrote it, and asked for a free backend that kept
GitHub Pages hosting — the site is still fully static; only its data layer gained a network call.
Firebase was tried first (Firestore + Storage, photo upload, open write access, all on request) but
was dropped after discovering Firebase Storage now requires the card-linked Blaze plan even at $0
actual usage (a Feb 2026 policy change) — the user caught this and asked to **switch to Supabase**
instead (Postgres + Storage, genuinely free, no card, at the cost of free projects pausing after 7
days of inactivity — accepted, and resumed manually from the Supabase dashboard if it happens).
Setup lives in `supabase/schema.sql` (the `postcards`/`events`/`person_photos` tables, with `CHECK`
constraints doing the validation Postgres can enforce, plus each table added to the
`supabase_realtime` publication) and `supabase/storage.sql` (`postcards` and `then-now` public
Storage buckets, 8MB file-size limit, image-only MIME allow-list); run both once in a fresh project's
SQL editor, then fill `js/data/supabaseConfig.js`'s `url`/`anonKey` from Project Settings → API — both
values are meant to be public in client code (Supabase's own docs say so; Row Level Security is the
real boundary, not secrecy), and every RLS policy here is deliberately open
(`using(true)`/`with check(true)`) with **no login** — anyone with the link can add, edit, or delete
a postcard/moment or upload a photo, the same "anyone with the link can write" the user asked for,
accepted with the understanding that this also means anyone with the link could vandalize it.
`js/data/supabaseClient.js` lazily loads the `@supabase/supabase-js` SDK from jsDelivr's `+esm` build
(no npm install, no build step) and every function in `js/data/cloudStore.js` (the only file that
talks to Supabase directly) no-ops to "saved on this device only for now" — never throws — when
`hasSupabaseConfig()` is false, so the app works exactly as before with no config filled in.
`js/data/cloudModel.js` is the pure row-shape ↔ app-shape translation (tested in
`tests/test-cloud-model.html`), mirroring the project's existing pure/impure split (compare
`postcardModel.js` vs `postcardActions.js`). `js/data/cloudSync.js` is the orchestration: on
`dataReady` it reconciles once — pushes any local-only user-added postcards/moments up, pulls every
cloud row down — then opens one realtime subscription for the rest of the session.
`postcardActions.js`/`eventActions.js` keep their exact previous behavior (local mutate + localStorage
+ bus event, synchronous, so the UI never waits on the network) and now also fire the matching
`cloudStore` save/delete afterward, un-awaited. Incoming realtime changes are applied **self-healingly**
rather than trusting the payload's own bookkeeping: reassigning a postcard to a new person scans
*every* person and strips the postcard from anyone who isn't the new owner, and a delete removes it
from every person holding it — found necessary via live two-tab testing, where Postgres's default
replica identity doesn't include a changed non-key column (like the old owner) in an `UPDATE`'s `old`
row, which could otherwise leave a stale duplicate in another open tab.

**Photo uploads (added on request, part of the same work)**: `js/utils/imageUpload.js` is the one
shared, provider-agnostic piece (`validateImageFile`, `resizeImageFile` — resizes/re-encodes to JPEG
in the browser via `canvas`, capped at 1600px long edge, before anything is uploaded) used by both
features below. **Postcards**: `addPostcard.js` gets an optional photo field, uploaded to the
`postcards` bucket keyed by the postcard's own id, only at submit time — choosing a photo and then
cancelling the form never touches the network; "Remove photo" there just clears the field until
submit, since nothing is live yet. **Then & Now**: `thenNowSlider.js` gets a small "Add a real
photo" / "Replace this photo" control per side (only when `hasSupabaseConfig()` and a `personId`
are both available), uploaded to the `then-now` bucket keyed by `<personId>-then.jpg` /
`<personId>-now.jpg` and saved to the `person_photos` table via `savePersonPhoto`, which merges only
the one column touched so replacing one side never clobbers the other; `getCloudPhotoFor(personId)`
(`cloudSync.js`) then overrides the placeholder filenames from `family.json` wherever a real cloud
photo exists, read by `profileCard.js`'s `renderMemories`. Because both features reuse a **fixed**
filename when replacing an existing photo, the public URL Supabase returns is otherwise
byte-identical after a re-upload, and browsers (including the one that just uploaded it) would keep
serving the old cached bytes at that same URL — `uploadPhoto()` (`cloudStore.js`) appends a
`?v=<timestamp>` cache-busting suffix to every URL it returns/stores specifically to defeat that;
found and fixed via live testing of the "Replace this photo" flow. **Remove photo (added on
request)**: since a Then & Now photo is live and shared the moment it's uploaded — unlike the
postcard form's field, there's no "cancel" to fall back on — removing one asks first, inline
("Remove this photo? Keep / Remove"), the same pattern `postcardFlip.js`'s `createActionRow` uses
for deleting a postcard, and for the same reason: no browser `confirm()` popup, stays in the
slider's own voice, works with screen readers. Confirming calls the new `deletePhotoObject(bucket,
path)` (`cloudStore.js`) to actually remove the Storage object, then `savePersonPhoto(personId,
which, null)` to clear that column, then reverts the layer to its placeholder in place. `storage.
objects` has an open `DELETE` policy already (`supabase/storage.sql`) for exactly this; `person_
photos` itself still has none, since nothing deletes the *row* — a removed photo is a `null` column,
not a missing one. Verified live against a real Supabase project (not just the unit tests): two-tab
realtime propagation for postcards and moments including reassignment/deletion, postcard photo
upload/edit/remove, Then & Now upload/replace on both sides with the cache-busting fix confirmed,
Then & Now remove-photo confirmed to clear the Storage object and the database column and revert to
the placeholder, and cross-session persistence via `getCloudPhotoFor` confirmed on reopen after each.

**Milestone constellation (added on request)**: as the timeline plays or is scrubbed, anyone turning
a round-number age this year (every 10th birthday), or any dated event reaching a round-number
anniversary (every 5th year), gets a quiet static double gold ring on the map — the significant years
stand out while journeying through the family's history, not just what's coming up in real life (compare
the anniversary greeting above, which does a similar thing but off today's real-world date rather than
the playhead year). `js/timeline/milestones.js` is pure (`milestoneForPerson`, `milestoneForEvent`,
`milestonesInYear`; tests: `tests/test-milestones.html`) and, found via live testing, deliberately skips
an "X born" event once its year matches that same person's own `birth` — otherwise a birthday and its own
birth-record event both fire as separate milestones for the same year (same duplicate the anniversary
greeting's own `birthdaysSeen` logic already guards against, for the same reason). `starMapRender.js`
recomputes which people have a milestone this year on `dataReady`/`playheadChanged`/`eventAdded`/
`eventEdited`/`eventDeleted` (not every animation frame) and draws the ring (founders share one, like the
postcard envelopes); the ring is static — nothing to disable under reduced motion. `starMapA11yMirror.js`
names it in the hidden star list ("Mom, 60th birthday") since it's otherwise a purely visual cue, and the
family-stats card lists "Milestones this year" when there are any.

**Ambient discovery (added on request)**: every 45–90s, if nothing else has the user's attention (no
profile card open, no story mode playing, the tab isn't backgrounded, and no shooting star is already
flying), a warm shooting star wanders unprompted to a random person actually present in the sky that year
who has a memory caption or a postcard note, and a quiet caption pill low in the sky ("A memory of Dad:
“Same kitchen-table grin”") surfaces once it lands — so the galaxy feels alive to wander even when no one
is clicking anything, not just a backdrop that waits for input. `js/starmap/ambientDiscovery.js` reuses
the exact shooting-star visual built for postcards (`js/starmap/shootingStar.js`'s `launchShootingStar`)
rather than inventing new motion; the picking logic (`pickAmbientCandidate`, `pickAmbientMoment`) is pure
and takes a seeded rng for tests (`tests/test-ambient-discovery.html`). Skipped entirely under reduced
motion. `js/timeline/timelineRibbon.js` now emits `storyPlaybackChanged {playing}` specifically so this
feature can stand down while the story is driving the sky; the caption (`#ambient-caption`,
`css/ambient.css`) is clickable (opens that person's card, same as the greeting pill's lines) and
auto-hides after 6s.

**Family map (added on request)**: a "Sky / Map" toggle top-left of the star map (`js/starmap/
viewModeToggle.js`) switches between the lineage view (orbits, generations) and an alternate layout
grouping people by a new optional field, `person.region` (a short invented place label, e.g. "The Old
Farmhouse") — a second lens alongside the timeline's year lens, for "where is everyone" instead of "when
was everyone". Deliberately **not** a real geographic map: that would need a mapping library and possibly
an API key, a genuine exception to the no-heavy-dependency constraint, and would read colder/more
"product-like" than the rest of the site. Instead it's a stylized, still-canvas-drawn view — the same
stars/planets/black holes, same sizing rules, just grouped differently. `js/starmap/familyMapLayout.js`
is pure (`computeFamilyMapLayout`, `familyMapBounds`; tests: `tests/test-family-map.html`): each region's
members are scattered on a golden-angle spiral around their own local center (an organic, non-grid look),
founder couples get their usual black hole at the center of their region (reusing `orbitMath.js`'s
`groupFounders`), and regions are laid out left-to-right with enough gap that their soft backdrop "blobs"
(`js/starmap/regionBlobRenderer.js` — a radial wash + a faint dashed boundary + the region's name in the
usual italic display face, same visual register as the sky's own decorative orbit rings and nebula
atmosphere) never overlap. There are no orbit rings or orbital drift in this view (every position has
`orbitRadius: 0`, so the existing ring-drawing code already skips them for free) — it's a static
arrangement. Switching modes plays a plain CSS opacity cross-fade of the canvas itself (`css/family-
map.css`, `.is-switching-view`) rather than a snap-cut, per the emotional intent; `state.js`'s `viewMode`
+ the `viewModeChanged` bus event drive the swap, and everything that already worked generically off
`positions` (click-to-select, the follow camera, relationship highlighting, the "how are we related?"
path camera, postcard markers, shooting stars, milestone rings) keeps working unmodified since the map
view produces the identical `positions`/`founderGroups` shape `computeStarMapLayout` does — only
`relationshipPicker.js`'s own camera-framing helpers needed an explicit branch on `getViewMode()`, since
they call the layout function directly rather than reading `starMapRender.js`'s internal state.
`starMapA11yMirror.js` appends each person's region while this view is showing ("Mom, from The City").
The 24-person reference family's regions are invented placeholders (four regions, split so some
siblings' own children ended up in a different region than their parents — a small deliberate migration
story), same treatment as the invented birth years/birthdays elsewhere; replace with real places when
known.

**Known gaps / open items**: (1) nothing has been tried on real touch hardware or with a real screen
reader; (2) no real photos have been uploaded yet — the placeholders are still placeholders until a
family member actually uses the upload controls; (3) a Supabase free-tier project pauses after 7 days
with no traffic and needs manually resuming from the dashboard if that happens; (4) the family map's
regions and the milestone/ambient-discovery features have only been checked by hand in one browser
session, not on real touch hardware or with a screen reader.

**Rendering technology (decided)**: **Canvas 2D**, not SVG or DOM — this is the only reading that makes
the accessibility rule's literal "hidden DOM mirrors of canvas-rendered content" wording true. All mockup
effects map natively: `createConicGradient` for the black hole's accretion ring, `setLineDash` for orbit
rings, `shadowBlur`/radial gradients for glow. A hidden focusable DOM list (`starMapA11yMirror.js`) is
the parallel accessible/keyboard-nav path, built alongside pointer input from the start, not bolted on
later.

**Generations beyond 3 (decided)**: star size and orbit radius are only specified through gen3. Deeper
generations continue the same geometric decay already implied by gen1→gen2→gen3 (~×0.65–0.73 per
generation) for both star size and orbit radius, rather than capping at gen3's values. This is
implemented as a pure formula in `orbitMath.js`, not hardcoded per-generation values.

## Data shape

Extends the original brief's shape with fields needed for the founder/blood/spouse rendering above.
`data/family.json` is **not a toy fixture** — the user supplied the actual reference family data
(24 people) the mockups were designed against, and it's been transcribed in full: Grandfather &
Grandmother (founders) → Uncle 1/Uncle 2/Aunty 1/Mom (+ their spouses) → 5 cousins + "Me!" (+ their
spouses) → 4 nephews/nieces. Extend that file directly for new people rather than replacing it.

```json
{
  "people": [
    {
      "id": "grandmother",
      "name": "Grandmother",
      "familyRole": "Grandmother",
      "emoji": "👵",
      "birth": null,
      "death": null,
      "role": "blood",
      "partnerOf": "grandfather",
      "isFounder": true,
      "photo": null,
      "parents": [],
      "generation": 0,
      "side": "maternal",
      "bio": "Same laugh, every generation since.",
      "memories": [
        {
          "type": "thenNow",
          "then": "grandmother_young.jpg",
          "now": "grandmother_now.jpg",
          "caption": "Same laugh, 60 years apart"
        }
      ],
      "postcards": []
    },
    {
      "id": "dad",
      "name": "Dad",
      "familyRole": "Father",
      "emoji": "👨",
      "role": "spouse",
      "partnerOf": "mom",
      "isFounder": false,
      "generation": 1,
      "parents": [],
      "side": "paternal",
      "color": "#2E9A72"
    }
  ],
  "events": [
    { "year": 1962, "personId": "grandmother", "label": "Wedding", "color": "maternal" }
  ]
}
```

Field notes:
- `role`: `"blood"` (descends from a founder by lineage — renders as a glowing star) or `"spouse"`
  (married in — renders as a non-glowing planet). Required. **Naming collision to watch for**: the
  reference family data's own `role` field (e.g. `"Eldest Uncle"`, `"The Memory Keeper"`) is a
  *display label*, not this blood/spouse flag — it was transcribed into `familyRole` instead (see
  below). Never overwrite this `role` with that value.
- `partnerOf`: for `role:"spouse"`, the id of the `role:"blood"` person they married into. For two
  `role:"blood"` founders who are a couple, populate `partnerOf` **mutually** (each points at the
  other) — don't leave it `null` just because both are blood — so founder-couple grouping has one
  consistent rule instead of an inferred fallback. `null` only for a blood person with no
  in-tree partner. The reference data's founders already link this way via their own `spouse` field
  (by name, not id — resolved during transcription).
- `isFounder`: `true` for people who make up a founding couple (rendered together as one black hole).
  A tree can have more than one founder couple (e.g. disconnected maternal/paternal roots) — group by
  mutual `partnerOf` at render time, don't assume exactly one.
- `generation`: now used for both star size and orbit radius selection (see rendering mechanics above),
  not just size as originally stated.
- `familyRole` (new): display label from the reference data (e.g. "Eldest Uncle", "Cousin Spouse",
  "The Memory Keeper") — not yet shown anywhere in the UI (profile card isn't built), but carried
  through normalization so it's there when needed.
- `emoji` (new): avatar fallback from the reference data, used by the profile card mockup
  (`star_profile_card_TEMPLATE.html` shows 👵 for Grandmother) when there's no real `photo`. Every
  person in the reference data has one.
- `color` (new, spouses only): explicit hex from the reference data (e.g. Dad `#2E9A72`). Spouse
  planets use this hue (via `hexToHue` in `utils/math.js`) when present, falling back to the old
  id-hash hue (`hashStringToHue`) otherwise — same saturation/lightness recipe either way, only the
  hue source changes. **Blood stars ignore `color` entirely even though the reference data has one
  for them too** — the locked design system renders every blood star identically (warm gold/white
  glow, sized by generation), so per-person blood coloring was deliberately not applied without
  confirming it first; flag it if you actually want that.
- `x`/`y` (from the original brief's shape) are **dropped** — position is fully computed by
  `orbitMath.js` from `generation` + `parents`/`partnerOf` + assigned angle, not authored per-person.
  Authoring manual coordinates would fight the orbit-ring layout the mockup actually specifies.
- `birthday` (optional, "MM-DD") and event `month`/`day`/`id` (optional): feed the anniversary greeting and the add-event feature; the values in `family.json` are invented placeholders.
- `region` (optional, new): a short invented place label ("The Old Farmhouse") feeding the family map
  view (see "Family map" above); anyone without one is grouped into a single "Elsewhere" bucket rather
  than dropped. Purely a display grouping — doesn't affect `orbitMath.js`'s lineage layout at all.
- `birth`/`death` (years): the reference data had none, so **plausible years were invented** on
  request (2026-09-18) — they are placeholders, consistent with the fixture's events (Mom b.1966,
  wedding 1962, Me b.1991) and with each other (children born after parents), but not real family
  facts. Replace with real years when known. Grandfather (d.2012), Grandmother (d.2021) and Husband-Aunty1 (d.2021) are
  deliberately given deaths so the timeline has someone to fade out — Grandmother's makes the
  founders' black hole fade from 2022 (it stays lit while EITHER founder is present). `null` still means unknown
  (never hidden) / still living. Sibling order on the map follows birth year.

## How to behave when helping (from the original brief, section 8 — still in force)

1. Honor the emotional intent — flag anything that reads as colder/faster/corporate.
2. Respect the constraints above; don't introduce a backend, 3D engine, or heavy dependency unasked.
3. Ask one clarifying question rather than guessing broadly when a request is ambiguous.
4. Prefer small, incremental changes — this is handmade; big rewrites lose the soul.
5. Keep the design system intact — no new colors/fonts/motion without confirming.
6. Write clean, commented, vanilla-first code; suggest a framework but don't assume one.
7. Consider mobile and accessibility in every response, not as an afterthought.
8. When in doubt, default to warmth.

## Re-extracting the design mockups (only if deeper pixel detail is needed later)

The design HTML is a nested bundle: root `<script type="__bundler/template">` holds an outer page of
7 iframes; each iframe's source lives in the root `<script type="__bundler/manifest">` as
`{mime, compressed, data}` where `data` is gzip+base64. Each of those, once decoded, is itself another
full bundle — decode its own inner `__bundler/template` script tag to get the real static HTML/CSS
mockup. In short: manifest entry → base64-decode → gzip-decompress → parse as HTML → find that page's
own `__bundler/template` tag → that JSON string is the actual mockup markup. Everything load-bearing
from that process has already been captured above; re-extract only if a fact isn't covered here.

## Module architecture & build order

The implementation is split into modules under `/js` (`data/`, `starmap/`, `profile/`, `postcards/`,
`timeline/`, `a11y/`) communicating via a shared `state.js` + `EventTarget` pub/sub bus
(`starSelected`, `playheadChanged`, `postcardAdded`, `motionPrefChanged`, `dataReady`), with CSS split
by concern under `/css` (`tokens.css` holds every design token above as CSS custom properties). Full
file structure, module responsibilities/event contracts, and the 15-step build order (fixture data →
pure orbit math, unit-tested standalone → static star-map skeleton → input → a11y mirror → motion →
profile card → then/now slider → postcards → timeline → integration → accessibility pass →
responsive/touch pass) are recorded in the plan file:
`/home/dheeraj/.claude/plans/create-a-plan-to-cosmic-robin.md`. Follow that build order — each step is
meant to be independently viewable/testable in a browser before the next one starts.

**Dev-server caching gotcha**: a plain `python -m http.server` (or similar) will sometimes keep
serving a stale cached copy of a `.css`/`.js` file in the browser tab even after the file on disk
has changed and the tab has been re-navigated — a normal reload isn't always enough. If an edit
doesn't seem to have taken effect when checking in-browser, hard-reload (Ctrl+Shift+R) before
assuming the change is broken; `getComputedStyle(el, '::before')` (or an equivalent check) proved
useful for confirming whether new CSS had actually loaded vs. was silently stale.

## Project state

Build-order steps 1-15 are implemented (see the sections above); remaining work is the open items list. This file is the persistent memory of the spec; update it as
further decisions are made (new fields, structural choices) so future sessions don't have to re-derive
them from chat history. Track fine-grained "what's built so far" progress separately (todo list /
git history), not here — keep this section a pointer, not a changelog.
