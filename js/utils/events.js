// Tiny pub/sub wrapper around a native EventTarget, so modules can talk to siblings
// without importing each other. See CLAUDE.md "Module architecture" for the event catalog
// (dataReady, starSelected, playheadChanged, postcardAdded, motionPrefChanged, ...).

const bus = new EventTarget();

export function on(eventName, handler) {
  bus.addEventListener(eventName, handler);
  return () => bus.removeEventListener(eventName, handler);
}

export function off(eventName, handler) {
  bus.removeEventListener(eventName, handler);
}

export function emit(eventName, detail) {
  bus.dispatchEvent(new CustomEvent(eventName, { detail }));
}
