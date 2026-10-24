(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlotLogic = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ZONE = 'America/Argentina/Buenos_Aires';
  function dateKey(value) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  }
  function addDays(day, count) {
    return new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
  }
  function generate(options) {
    options = options || {};
    var now = new Date(options.now || Date.now()).getTime();
    var today = dateKey(now), last = addDays(today, 14);
    var from = options.from && options.from > today ? options.from : today;
    var to = options.to && options.to < last ? options.to : last;
    var busy = options.busy || [], result = [];
    for (var day = from; day <= to; day = addDays(day, 1)) {
      var weekday = new Date(day + 'T12:00:00Z').getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      for (var hour = 9; hour <= 16; hour++) {
        var start = Date.parse(day + 'T' + String(hour).padStart(2, '0') + ':00:00-03:00');
        var end = start + 30 * 60000;
        if (start < now + 2 * 3600000) continue;
        if (busy.some(function (b) { return start < Date.parse(b.end) && end > Date.parse(b.start); })) continue;
        result.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), date: day });
      }
    }
    return result;
  }
  return { generate: generate, dateKey: dateKey, addDays: addDays, timeZone: ZONE };
}));
