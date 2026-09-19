// While a modal dialog is open, everything behind it (#app-shell) is made inert: unreachable by
// Tab, pointer, and assistive tech, which is what aria-modal promises but not every screen reader
// enforces. Modals are body-level siblings of #app-shell, so they stay interactive.
// Always call setBackgroundInert(false) BEFORE returning focus to the opener (inert elements
// can't take focus).

export function setBackgroundInert(isInert) {
  const shell = document.getElementById('app-shell');
  if (shell) shell.inert = isInert;
}
