'use strict';
const assert = require('node:assert/strict');
const slots = require('../slots.js');
const now = '2026-10-26T00:00:00-03:00'; // lunes
const all = slots.generate({ now });
assert.equal(slots.dateKey('2026-10-26T01:00:00Z'), '2026-10-25', 'La fecha sigue la zona de Rosario');
assert.equal(all.length, 11 * 8, '15 días inclusivos contienen 11 días hábiles en este rango');
assert.equal(new Set(all.map(s => s.date)).size, 11);
for (const s of all) {
  const weekday = new Date(s.date + 'T12:00:00Z').getUTCDay();
  assert.ok(weekday !== 0 && weekday !== 6, 'Se excluyen fines de semana');
  assert.ok(s.date >= '2026-10-26' && s.date <= '2026-11-09', 'Ventana de 15 días');
  assert.equal(Date.parse(s.end) - Date.parse(s.start), 30 * 60000);
}
for (const date of new Set(all.map(s => s.date))) {
  const day = all.filter(s => s.date === date);
  assert.equal(day.length, 8, 'Ocho inicios por día hábil');
  assert.equal(day[0].start, date + 'T12:00:00.000Z');
  assert.equal(day[7].start, date + 'T19:00:00.000Z');
}
const notice = slots.generate({ now: '2026-10-26T10:00:00-03:00', from: '2026-10-01', to: '2026-10-26' });
assert.equal(notice.length, 5);
assert.equal(notice[0].start, '2026-10-26T15:00:00.000Z', 'Dos horas exactas de aviso se permiten');
const after = slots.generate({ now: '2026-10-26T10:00:01-03:00', to: '2026-10-26' });
assert.equal(after.length, 4, 'Se excluye el turno que incumple el aviso por un segundo');
const busy = slots.generate({ now, to: '2026-10-26', busy: [
  { start: '2026-10-26T09:15:00-03:00', end: '2026-10-26T10:00:00-03:00' },
  { start: '2026-10-26T11:30:00-03:00', end: '2026-10-26T12:00:00-03:00' },
  { start: '2026-10-26T13:00:00-03:00', end: '2026-10-26T13:30:00-03:00' }
] });
assert.equal(busy.length, 6, 'Solapamientos excluidos; límites contiguos permitidos');
assert.ok(busy.some(s => s.start === '2026-10-26T13:00:00.000Z'), '10:00 permitido cuando el evento termina a las 10:00');
assert.ok(busy.some(s => s.start === '2026-10-26T14:00:00.000Z'), '11:00 permitido si el evento empieza a las 11:30');
assert.equal(slots.generate({ now, from: '2026-11-10', to: '2026-12-31' }).length, 0);
assert.equal(slots.generate({ now, to: '2026-10-25' }).length, 0, 'Nunca devuelve fechas pasadas');
assert.equal(slots.generate({ now, from: '2026-10-31', to: '2026-11-01' }).length, 0);
console.log('OK: zona horaria, fines de semana, aviso, pasado, solapamientos, ventana y 8 turnos diarios.');
