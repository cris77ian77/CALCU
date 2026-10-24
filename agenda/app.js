(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const logic = window.SlotLogic;
  const endpoint = (window.BOOKING_CONFIG || {}).APPS_SCRIPT_URL || '';
  const mock = !endpoint || new URLSearchParams(location.search).get('mock') === '1';
  const today = logic.dateKey(new Date()), last = logic.addDays(today, 14);
  let month = today.slice(0, 7), slots = [], selectedDate = '', chosen = null, loading = false;
  const booked = new Set();
  const dayFormat = new Intl.DateTimeFormat('es-AR', { timeZone: logic.timeZone, weekday: 'long', day: 'numeric', month: 'long' });
  const timeFormat = new Intl.DateTimeFormat('es-AR', { timeZone: logic.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const summary = slot => `${dayFormat.format(new Date(slot.start))} · ${timeFormat.format(new Date(slot.start))} · 30 min · Rosario`;
  function view(name) {
    ['choose', 'form', 'confirmation'].forEach(v => { $(v + '-view').hidden = v !== name; });
    $('step-date').classList.toggle('active', name === 'choose');
    $('step-form').classList.toggle('active', name !== 'choose');
  }
  function calendar() {
    const first = month + '-01';
    $('month-label').textContent = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(first + 'T12:00:00Z'));
    $('prev-month').disabled = month <= today.slice(0, 7) || loading;
    $('next-month').disabled = month >= last.slice(0, 7) || loading;
    const grid = $('calendar-grid'); grid.replaceChildren();
    const offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(document.createElement('span'));
    for (let day = first; day.slice(0, 7) === month; day = logic.addDays(day, 1)) {
      const date = day, button = document.createElement('button');
      button.textContent = String(Number(day.slice(8)));
      button.disabled = loading || !slots.some(s => s.date === date);
      button.classList.toggle('selected', date === selectedDate);
      button.setAttribute('aria-label', dayFormat.format(new Date(day + 'T12:00:00-03:00')));
      button.setAttribute('aria-pressed', String(date === selectedDate));
      button.onclick = () => { selectedDate = date; calendar(); times(); };
      grid.append(button);
    }
  }
  function times() {
    $('selected-day').textContent = selectedDate ? dayFormat.format(new Date(selectedDate + 'T12:00:00-03:00')) : 'Seleccioná una fecha';
    const list = $('slot-list'); list.replaceChildren();
    const available = slots.filter(s => s.date === selectedDate);
    if (!available.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = selectedDate ? 'No quedan horarios para este día. Elegí otra fecha.' : 'Elegí un día para ver sus horarios.'; list.append(p); }
    available.forEach(slot => {
      const button = document.createElement('button'); button.className = 'slot-button'; button.textContent = timeFormat.format(new Date(slot.start));
      button.onclick = () => { chosen = slot; $('chosen-summary').textContent = summary(slot); $('status').textContent = ''; view('form'); document.querySelector('[name="name"]').focus(); };
      list.append(button);
    });
  }
  async function load() {
    loading = true; $('status').textContent = 'Buscando horarios disponibles…'; $('reload').hidden = true; calendar();
    try {
      if (mock) slots = logic.generate({ from: today, to: last }).filter(s => !booked.has(s.start));
      else {
        const url = new URL(endpoint); url.searchParams.set('action', 'slots'); url.searchParams.set('from', today); url.searchParams.set('to', last);
        const response = await fetch(url); const data = await response.json();
        if (!response.ok || !data.ok || !Array.isArray(data.slots)) throw new Error(data.error || 'No pudimos consultar la agenda.');
        slots = data.slots;
      }
      $('status').textContent = slots.length ? '' : 'No hay turnos disponibles en los próximos 15 días. Volvé a consultar más adelante.';
    } catch (error) { slots = []; $('status').textContent = error.message || 'No pudimos conectar. Intentá de nuevo.'; $('reload').hidden = false; }
    finally { loading = false; calendar(); times(); }
  }
  $('mock-banner').hidden = !mock;
  $('prev-month').onclick = () => { month = logic.addDays(month + '-01', -1).slice(0, 7); calendar(); };
  $('next-month').onclick = () => { month = logic.addDays(month + '-28', 4).slice(0, 7); calendar(); };
  $('reload').onclick = load;
  $('back').onclick = () => { view('choose'); load(); };
  $('start-over').onclick = () => { view('choose'); $('booking-form').reset(); chosen = null; load(); };
  $('booking-form').onsubmit = async event => {
    event.preventDefault(); if (!chosen) return;
    const form = new FormData(event.target), payload = { start: chosen.start };
    ['name', 'email', 'location', 'experience', 'whatsapp'].forEach(key => { payload[key] = String(form.get(key) || '').trim(); });
    payload.guests = String(form.get('guests') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (Object.keys(payload).some(k => typeof payload[k] === 'string' && !payload[k])) { $('status').textContent = 'Completá todos los campos obligatorios.'; return; }
    if (payload.guests.length > 5 || payload.guests.some(e => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e))) { $('status').textContent = 'Revisá los invitados: ingresá hasta 5 emails válidos separados por coma.'; return; }
    $('submit').disabled = true; $('submit').textContent = 'Confirmando…'; $('status').textContent = '';
    try {
      let data;
      if (mock) {
        if (!logic.generate().some(s => s.start === chosen.start) || booked.has(chosen.start)) throw new Error('Ese horario ya no está disponible. Volvé a elegirlo.');
        booked.add(chosen.start); data = { ok: true };
      } else {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
        data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'No pudimos confirmar la reunión.');
      }
      $('confirmation-summary').textContent = summary(chosen);
      $('confirmation-message').textContent = mock ? 'Esta es una reserva de demostración. No creamos un evento ni enviamos emails.' : `Enviamos la invitación a ${payload.email}. Revisá tu correo para encontrar el enlace de Google Meet.`;
      const meet = $('meet-link'); meet.hidden = true;
      if (!mock && data.meetUrl && /^https:\/\/meet\.google\.com\//.test(data.meetUrl)) { meet.href = data.meetUrl; meet.hidden = false; }
      view('confirmation'); $('confirmation-view').focus();
    } catch (error) { $('status').textContent = error.message + ' Si hubo un problema de conexión, revisá tu correo antes de volver a intentar.'; }
    finally { $('submit').disabled = false; $('submit').textContent = 'Confirmar reunión →'; }
  };
  load();
}());
