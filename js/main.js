import { loadFamilyData } from './data/dataLoader.js';
import { initCloudSync } from './data/cloudSync.js';
import { initReducedMotion } from './a11y/reducedMotion.js';
import { initStarMap } from './starmap/starMapRender.js';
import { initStarMapInput } from './starmap/starMapInput.js';
import { initStarMapA11yMirror } from './starmap/starMapA11yMirror.js';
import { initProfileCard } from './profile/profileCard.js';
import { openAddPostcard } from './postcards/addPostcard.js';
import { initTimelineRibbon } from './timeline/timelineRibbon.js';
import { initHeader } from './header/headerSearch.js';
import { initShootingStar } from './starmap/shootingStar.js';
import { initAnniversaryBanner } from './greeting/anniversaryBanner.js';
import { initStatsCard } from './stats/statsCard.js';
import { initAddEvent } from './timeline/addEvent.js';
import { initTour } from './tour/tour.js';
import { initPrintSheet } from './print/printSheet.js';

// Bootstrap. Modules are wired in here as each one is built, per the build order in
// /home/dheeraj/.claude/plans/create-a-plan-to-cosmic-robin.md.
const starMapContainer = document.getElementById('star-map-container');
const canvas = document.getElementById('star-map-canvas');
const profileCard = document.getElementById('profile-card');

initReducedMotion();
initStarMap(canvas);
initStarMapInput(canvas);
initStarMapA11yMirror(starMapContainer);
initProfileCard(profileCard);
initTimelineRibbon(document.getElementById('timeline-container'));
initHeader();
initShootingStar();
initAnniversaryBanner(document.getElementById('anniversary-banner'));
initStatsCard(document.getElementById('stats-btn'), document.getElementById('stats-card'));
initAddEvent();
initPrintSheet();
initTour();
initCloudSync();
document.getElementById('add-postcard-btn').addEventListener('click', () => openAddPostcard());

loadFamilyData().catch((err) => {
  console.error('[main] failed to load family data:', err);
});
