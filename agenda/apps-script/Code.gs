/* Configuración: la agenda y las invitaciones pertenecen a quien despliega. */
var SETTINGS = {
  CALENDAR_ID: 'primary',
  TIME_ZONE: 'America/Argentina/Buenos_Aires',
  EVENT_NAME: 'Reunión Informativa',
  DURATION_MINUTES: 30,
  WINDOW_DAYS: 15,
  NOTICE_HOURS: 2,
  FIRST_HOUR: 9,
  LAST_HOUR: 16,
  MAX_GUESTS: 5,
  DESCRIPTION: 'Reunión de 30 minutos para conversar sobre tu proyecto de fábrica de hielo. Vemos juntos qué equipo se ajusta mejor (producción diaria, espacio, inversión), resolvemos dudas técnicas y, si querés, armamos un número estimado de retorno. Sin compromiso. Si tenés fotos del lugar o ya pensaste en una zona, traelas a mano.'
};
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function day_(date) { return Utilities.formatDate(date, SETTINGS.TIME_ZONE, 'yyyy-MM-dd'); }
function addDays_(day, count) { return new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10); }
function validDay_(day) { return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day + 'T12:00:00Z')) && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day; }
function freeSlots_(from, to, now) {
  var today = day_(now), last = addDays_(today, SETTINGS.WINDOW_DAYS - 1);
  from = from > today ? from : today; to = to < last ? to : last;
  if (from > to) return [];
  var response = Calendar.Freebusy.query({ timeMin: from + 'T00:00:00-03:00', timeMax: addDays_(to, 1) + 'T00:00:00-03:00', timeZone: SETTINGS.TIME_ZONE, items: [{ id: SETTINGS.CALENDAR_ID }] });
  var calendars = response.calendars || {}, calendar = calendars[SETTINGS.CALENDAR_ID];
  if (!calendar || (calendar.errors && calendar.errors.length)) throw new Error('No se pudo consultar el calendario.');
  var busy = calendar.busy || [], slots = [];
  for (var day = from; day <= to; day = addDays_(day, 1)) {
    var weekday = new Date(day + 'T12:00:00Z').getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (var hour = SETTINGS.FIRST_HOUR; hour <= SETTINGS.LAST_HOUR; hour++) {
      var start = Date.parse(day + 'T' + ('0' + hour).slice(-2) + ':00:00-03:00'), end = start + SETTINGS.DURATION_MINUTES * 60000;
      if (start < now.getTime() + SETTINGS.NOTICE_HOURS * 3600000) continue;
      if (busy.some(function (b) { return start < Date.parse(b.end) && end > Date.parse(b.start); })) continue;
      slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), date: day });
    }
  }
  return slots;
}
function doGet(e) {
  try {
    var p = e && e.parameter || {};
    if (p.action !== 'slots') throw new Error('Acción inválida.');
    if (!validDay_(p.from) || !validDay_(p.to) || p.from > p.to) throw new Error('Rango de fechas inválido.');
    return json_({ ok: true, timeZone: SETTINGS.TIME_ZONE, slots: freeSlots_(p.from, p.to, new Date()) });
  } catch (error) { console.error(error); return json_({ ok: false, error: error.message || 'No pudimos consultar la agenda.' }); }
}
function text_(value, max) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Completá los campos obligatorios con datos válidos.'); return value.trim(); }
function email_(value) { value = text_(value, 254); if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value)) throw new Error('Ingresá un email válido.'); return value; }
function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    if (!e || !e.postData || e.postData.contents.length > 16000) throw new Error('Solicitud inválida.');
    var p = JSON.parse(e.postData.contents);
    var name = text_(p.name, 120), email = email_(p.email), location = text_(p.location, 300), experience = text_(p.experience, 1500), whatsapp = text_(p.whatsapp, 60);
    if (!Array.isArray(p.guests) || p.guests.length > SETTINGS.MAX_GUESTS) throw new Error('Podés agregar hasta 5 invitados.');
    var attendees = [email].concat(p.guests.map(email_)).filter(function (value, index, list) { return list.map(function (v) { return v.toLowerCase(); }).indexOf(value.toLowerCase()) === index; }).map(function (value) { return { email: value }; });
    if (typeof p.start !== 'string' || isNaN(Date.parse(p.start))) throw new Error('Horario inválido.');
    var start = new Date(p.start).toISOString(), date = day_(new Date(start));
    lock.waitLock(30000); locked = true;
    var slot = freeSlots_(date, date, new Date()).filter(function (s) { return s.start === start; })[0];
    if (!slot) throw new Error('Ese horario ya no está disponible. Volvé a elegir una fecha.');
    var event = Calendar.Events.insert({
      summary: SETTINGS.EVENT_NAME + ' · ' + name,
      description: SETTINGS.DESCRIPTION + '\n\nNombre: ' + name + '\nEmail: ' + email + '\n¿De dónde sos?: ' + location + '\n¿Ya fabricás hielo o querés emprender?: ' + experience + '\nNúmero de WhatsApp: ' + whatsapp,
      start: { dateTime: slot.start, timeZone: SETTINGS.TIME_ZONE }, end: { dateTime: slot.end, timeZone: SETTINGS.TIME_ZONE },
      attendees: attendees,
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    }, SETTINGS.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });
    try {
      var cuando = Utilities.formatDate(new Date(slot.start), SETTINGS.TIME_ZONE, "EEEE dd/MM/yyyy HH:mm");
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Nueva reserva: ' + name + ' · ' + cuando,
        'Nueva Reunión Informativa agendada.\n\nCuándo: ' + cuando + ' (hora de Rosario)\nNombre: ' + name + '\nEmail: ' + email +
        '\n¿De dónde sos?: ' + location + '\n¿Ya fabricás hielo o querés emprender?: ' + experience + '\nWhatsApp: ' + whatsapp +
        '\nMeet: ' + (event.hangoutLink || '-') + '\nEvento: ' + (event.htmlLink || '-'));
    } catch (mailError) { console.error(mailError); }
    return json_({ ok: true, start: slot.start, end: slot.end, meetUrl: event.hangoutLink || '', eventId: event.id });
  } catch (error) { console.error(error); return json_({ ok: false, error: error.message || 'No pudimos reservar. Revisá tu correo antes de reintentar.' }); }
  finally { if (locked) lock.releaseLock(); }
}
