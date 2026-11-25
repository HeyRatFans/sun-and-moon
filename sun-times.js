/*
 * Sunrise / sunset for a latitude and longitude (NOAA solar position equations; good to about
 * a minute away from the poles), plus the time warp that makes the SWF's fixed daily schedule
 * (sunrise at 07:00, sunset at 19:00) follow the real sunrise and sunset.
 * Times are returned as hours on the visitor's local clock, so the browser's time zone should
 * match the location.
 */
(function (global) {
  'use strict';
  const rad = d => d * Math.PI / 180;
  const mod = (a, n) => ((a % n) + n) % n;
  const DEFAULT = { sunrise: 7, length: 12 };   // what the SWF assumes: 07:00 - 19:00

  function times(date, lat, lon) {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const doy = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (doy - 1);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
      + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
    const localHours = utcMinutes => {
      const t = new Date(Date.UTC(y, m, d) + utcMinutes * 60000);
      return t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600;
    };
    const noonUtc = 720 - 4 * lon - eqtime;
    let length, sunrise, polar = null;
    if (cosH > 1) { polar = 'night'; length = 4; }          // sun never rises: keep a short token day
    else if (cosH < -1) { polar = 'day'; length = 20; }     // sun never sets: keep a short token night
    else length = 2 * Math.acos(cosH) * 180 / Math.PI / 15;
    sunrise = polar ? mod(localHours(noonUtc) - length / 2, 24) : localHours(noonUtc - length * 30);
    return { sunrise, length, sunset: sunrise + length, polar };
  }

  // Maps a real local clock hour onto the SWF's design hour: sunrise -> 7, sunset -> 19.
  function design(hour, st) {
    st = st || DEFAULT;
    const u = mod(hour - st.sunrise, 24);
    const d = u < st.length ? 7 + u / st.length * 12 : 19 + (u - st.length) / (24 - st.length) * 12;
    return mod(d, 24);
  }

  const fmt = h => { h = mod(h, 24); const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return String(mm === 60 ? (hh + 1) % 24 : hh).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'); };

  global.SunTimes = { times, design, fmt, DEFAULT };
})(window);
