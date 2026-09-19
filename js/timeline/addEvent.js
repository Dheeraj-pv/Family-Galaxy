// "+ Add a moment" / "Edit": one small form modal for both. It only collects and validates input;
// saving (localStorage + in-memory events + bus events) lives in eventActions.js. Same shape and
// warmth as the postcard form (js/postcards/addPostcard.js).

import { getPeople } from '../state.js';
import { announce } from '../a11y/announcer.js';
import { setBackgroundInert } from '../a11y/modalInert.js';
import { addEvent, editEvent } from './eventActions.js';
import {
  validateEventInput, EVENT_COLORS, MONTH_NAMES, LABEL_MAX_LENGTH, MIN_EVENT_YEAR, maxEventYear,
} from './eventModel.js';

let modalEl = null;
let returnFocusEl = null;

// Nothing to wire up at load: the ribbon's button calls openAddEvent. Kept so main.js has a
// stable init hook for the feature.
export function initAddEvent() {}

function makeField(labelText, control, id, { optional = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'add-event__field';
  const label = document.createElement('label');
  label.className = 'small-caps';
  label.htmlFor = id;
  label.textContent = optional ? `${labelText} (optional)` : labelText;
  const error = document.createElement('p');
  error.className = 'add-event__error';
  error.id = `${id}-error`;
  wrap.append(label, control, error);
  control.id = id;
  control.setAttribute('aria-describedby', error.id);
  return wrap;
}

export function openAddEvent({ year = new Date().getFullYear(), editing = null } = {}) {
  closeAddEvent();
  // Editing starts from the popover's Edit button, which is gone by the time the form closes, so
  // focus goes back to the moment's own marker (the ribbon re-finds it after redrawing).
  returnFocusEl = (editing && document.querySelector(`[data-event-id="${editing.id}"]`)) || document.activeElement;
  const people = getPeople();
  const currentYear = new Date().getFullYear();

  modalEl = document.createElement('div');
  modalEl.className = 'add-event';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'add-event-title');

  const backdrop = document.createElement('div');
  backdrop.className = 'add-event__backdrop';
  const panel = document.createElement('form');
  panel.className = 'add-event__panel';
  panel.noValidate = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'add-event__close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const title = document.createElement('h2');
  title.id = 'add-event-title';
  title.textContent = editing ? 'Edit this moment' : 'Add a moment';

  const yearInput = document.createElement('input');
  yearInput.type = 'number';
  yearInput.inputMode = 'numeric';
  yearInput.min = String(MIN_EVENT_YEAR);
  yearInput.max = String(maxEventYear(currentYear));
  yearInput.value = String(editing ? editing.year : year);

  const label = document.createElement('input');
  label.type = 'text';
  label.maxLength = LABEL_MAX_LENGTH;
  label.autocomplete = 'off';
  label.placeholder = 'Moved to Chennai';
  label.value = editing ? editing.label : '';

  // Whose moment: three plain-language choices, each with its marker colour as a dot.
  const colorSet = document.createElement('fieldset');
  colorSet.className = 'add-event__field add-event__colors';
  const legend = document.createElement('legend');
  legend.className = 'small-caps';
  legend.textContent = 'Whose moment';
  const colorError = document.createElement('p');
  colorError.className = 'add-event__error';
  colorError.id = 'add-event-color-error';
  const radios = EVENT_COLORS.map((c) => {
    const wrap = document.createElement('label');
    wrap.className = 'add-event__color';
    wrap.dataset.color = c.value;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'add-event-color';
    radio.value = c.value;
    radio.setAttribute('aria-describedby', colorError.id);
    radio.checked = c.value === (editing?.color ?? 'shared');
    const dot = document.createElement('span');
    dot.className = 'add-event__dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = c.label;
    wrap.append(radio, dot, text);
    return { wrap, radio };
  });
  const colorChoices = document.createElement('div');
  colorChoices.className = 'add-event__color-choices';
  radios.forEach(({ wrap }) => colorChoices.appendChild(wrap));
  colorSet.append(legend, colorChoices, colorError);

  const person = document.createElement('select');
  person.appendChild(new Option('Everyone', ''));
  people.forEach((p) => person.appendChild(new Option(p.name, p.id)));
  person.value = editing?.personId ?? '';

  const month = document.createElement('select');
  month.appendChild(new Option('Month', ''));
  MONTH_NAMES.forEach((name, i) => month.appendChild(new Option(name, String(i + 1))));
  month.value = editing?.month != null ? String(editing.month) : '';
  month.setAttribute('aria-label', 'Month');
  const day = document.createElement('input');
  day.type = 'number';
  day.inputMode = 'numeric';
  day.min = '1';
  day.max = '31';
  day.placeholder = 'Day';
  day.setAttribute('aria-label', 'Day');
  day.value = editing?.day != null ? String(editing.day) : '';

  // Month + day share one field (and one error): they only make sense together.
  const dateWrap = document.createElement('div');
  dateWrap.className = 'add-event__field';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'small-caps add-event__label';
  dateLabel.id = 'add-event-date-label';
  dateLabel.textContent = 'Day of the year (optional)';
  const dateRow = document.createElement('div');
  dateRow.className = 'add-event__date-row';
  dateRow.append(month, day);
  const dateError = document.createElement('p');
  dateError.className = 'add-event__error';
  dateError.id = 'add-event-date-error';
  dateRow.setAttribute('role', 'group');
  dateRow.setAttribute('aria-labelledby', dateLabel.id);
  [month, day].forEach((c) => c.setAttribute('aria-describedby', dateError.id));
  dateWrap.append(dateLabel, dateRow, dateError);

  const fields = {
    year: makeField('Year', yearInput, 'add-event-year'),
    label: makeField('What happened', label, 'add-event-label'),
    color: colorSet,
    personId: makeField('Who it’s about', person, 'add-event-person', { optional: true }),
    date: dateWrap,
  };

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'add-event__submit';
  submit.textContent = editing ? 'Save changes' : 'Add to the timeline';

  panel.append(close, title, fields.year, fields.label, fields.color, fields.personId, fields.date, submit);
  modalEl.append(backdrop, panel);

  const controls = { year: yearInput, label, color: radios[0].radio, personId: person, date: month };
  const errorEls = { year: fields.year.querySelector('.add-event__error'), label: fields.label.querySelector('.add-event__error'), color: colorError, personId: fields.personId.querySelector('.add-event__error'), date: dateError };
  const checkedColor = () => radios.find(({ radio }) => radio.checked)?.radio.value ?? '';

  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = validateEventInput(
      { year: yearInput.value, label: label.value, color: checkedColor(), personId: person.value, month: month.value, day: day.value },
      people.map((p) => p.id),
      currentYear,
    );
    Object.keys(fields).forEach((key) => {
      const message = result.ok ? '' : result.errors[key] ?? '';
      errorEls[key].textContent = message;
      const targets = key === 'date' ? [month, day] : key === 'color' ? radios.map((r) => r.radio) : [controls[key]];
      targets.forEach((t) => t.setAttribute('aria-invalid', String(Boolean(message))));
    });
    if (!result.ok) {
      const count = Object.keys(result.errors).length;
      announce(`${count} ${count === 1 ? 'field needs' : 'fields need'} attention.`, { delay: 0 });
      const firstBad = Object.keys(fields).find((key) => result.errors[key]);
      controls[firstBad].focus();
      return;
    }

    closeAddEvent(); // first, so focus returns to the opener before listeners re-render around it
    if (editing) {
      editEvent(editing.id, result.event);
      announce(`Moment updated: ${result.event.year}, ${result.event.label}.`, { delay: 300 });
    } else {
      addEvent(result.event);
      announce(`Moment added to ${result.event.year}: ${result.event.label}.`, { delay: 300 });
    }
  });

  close.addEventListener('click', closeAddEvent);
  backdrop.addEventListener('click', closeAddEvent);
  modalEl.addEventListener('keydown', onKeydown);

  document.body.appendChild(modalEl);
  setBackgroundInert(true);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modalEl?.classList.add('is-open');
    label.focus();
  }));
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeAddEvent();
    return;
  }
  if (e.key !== 'Tab') return;
  const stops = [...modalEl.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeAddEvent() {
  if (!modalEl) return;
  const el = modalEl;
  modalEl = null;
  el.classList.remove('is-open');
  el.inert = true; // fading out: no longer focusable, clickable, or read by assistive tech
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-card-entrance')) || 450;
  setTimeout(() => el.remove(), ms);
  setBackgroundInert(false); // before refocusing: inert elements can't take focus
  if (returnFocusEl && document.contains(returnFocusEl)) returnFocusEl.focus();
}
