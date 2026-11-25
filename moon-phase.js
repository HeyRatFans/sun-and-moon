/*
 * Real moon phase, moonrise and moonset, calculated in the browser (no network, no libraries).
 * Uses the larger terms of Meeus' lunar series and his solar series: good to about 0.01 degrees, enough to
 * show eclipses.
 */
(function (global) {
  'use strict';
  const SYNODIC = 29.530588853;
  const rad = d => d * Math.PI / 180;
  const mod = (a, n) => ((a % n) + n) % n;

  const julian = date => date.getTime() / 86400000 + 2440587.5;

  // The larger terms of Meeus' tables 47.A and 47.B. Multiples of D, M, M', F, then the amplitudes: for longitude
  // (1e-6 degrees) and distance (metres) in the first table, latitude (1e-6 degrees) in the second.
  const table = text => text.split(';').map(row => row.split(' ').map(Number));
  const LON_DIST = table(`0 0 1 0 6288774 -20905355;2 0 -1 0 1274027 -3699111;2 0 0 0 658314 -2955968;0 0 2 0 213618 -569925;0 1 0 0 -185116 48888;0 0 0 2 -114332 -3149
2 0 -2 0 58793 246158;2 -1 -1 0 57066 -152138;2 0 1 0 53322 -170733;2 -1 0 0 45758 -204586;0 1 -1 0 -40923 -129620;1 0 0 0 -34720 108743
0 1 1 0 -30383 104755;2 0 0 -2 15327 10321;0 0 1 2 -12528 0;0 0 1 -2 10980 79661;4 0 -1 0 10675 -34782;0 0 3 0 10034 -23210
4 0 -2 0 8548 -21636;2 1 -1 0 -7888 24208;2 1 0 0 -6766 30824;1 0 -1 0 -5163 -8379;1 1 0 0 4987 -16675;2 -1 1 0 4036 -12831
2 0 2 0 3994 -10445;4 0 0 0 3861 -11650;2 0 -3 0 3665 14403;0 1 -2 0 -2689 -7003;2 0 -1 2 -2602 0;2 -1 -2 0 2390 10056
1 0 1 0 -2348 6322;2 -2 0 0 2236 -9884;0 1 2 0 -2120 5751;0 2 0 0 -2069 0;2 -2 -1 0 2048 -4950`.replace(/\n/g, ';'));
  const LATITUDE = table(`0 0 0 1 5128122;0 0 1 1 280602;0 0 1 -1 277693;2 0 0 -1 173237;2 0 -1 1 55413;2 0 -1 -1 46271
2 0 0 1 32573;0 0 2 1 17198;2 0 1 -1 9266;0 0 2 -1 8822;2 -1 0 -1 8216;2 0 -2 -1 4324
2 0 1 1 4200;2 1 0 -1 -3359;2 -1 -1 1 2463;2 -1 0 1 2211;2 -1 -1 -1 2065;0 1 -1 -1 -1870
4 0 -1 -1 1828;0 1 0 1 -1794;0 0 0 3 -1749;0 1 -1 1 -1565;1 0 0 1 -1491`.replace(/\n/g, ';'));
  const DELTA_T = 69;                     // seconds that the astronomical time scale is ahead of clock time (2020s)

  // Geocentric moon position (ecliptic longitude / latitude in degrees, distance in km) and the sun's apparent
  // ecliptic longitude, both referred to the equinox of the date.
  function bodies(date) {
    const T = (julian(date) + DELTA_T / 86400 - 2451545) / 36525;
    const Lm = 218.3164477 + 481267.88123421 * T;
    const D = rad(mod(297.8501921 + 445267.1114034 * T, 360));
    const M = rad(mod(357.5291092 + 35999.0502909 * T, 360));
    const Mp = rad(mod(134.9633964 + 477198.8675055 * T, 360));
    const F = rad(mod(93.272095 + 483202.0175233 * T, 360));
    const A1 = rad(119.75 + 131.849 * T), A2 = rad(53.09 + 479264.29 * T), A3 = rad(313.45 + 481266.484 * T);
    const s = Math.sin, c = Math.cos, L = rad(mod(Lm, 360));
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;     // terms involving the sun's anomaly shrink slowly
    let l = 3958 * s(A1) + 1962 * s(L - F) + 318 * s(A2), r = 0;
    let b = -2235 * s(L) + 382 * s(A3) + 175 * (s(A1 - F) + s(A1 + F)) + 127 * s(L - Mp) - 115 * s(L + Mp);
    for (const [d, m, mp, f, al, ar] of LON_DIST) {
      const arg = d * D + m * M + mp * Mp + f * F, k = E ** Math.abs(m);
      l += k * al * s(arg); r += k * ar * c(arg);
    }
    for (const [d, m, mp, f, ab] of LATITUDE) b += E ** Math.abs(m) * ab * s(d * D + m * M + mp * Mp + f * F);
    const L0 = 280.46646 + 36000.76983 * T;
    const sun = L0 + (1.914602 - 0.004817 * T) * s(M) + 0.019993 * s(2 * M) + 0.000289 * s(3 * M) - 0.00569;
    return { T, moonLon: Lm + l / 1e6, moonLat: b / 1e6, dist: 385000.56 + r / 1000, sunLon: sun };
  }

  // Moon-minus-sun ecliptic longitude in degrees: 0 = new moon, 180 = full moon.
  const elongation = date => { const b = bodies(date); return mod(b.moonLon - b.sunLon, 360); };

  // Days since the last new moon (0 .. 29.53).
  const age = date => elongation(date) / 360 * SYNODIC;
  // Fraction of the disc that is lit (0 .. 1).
  const illumination = date => (1 - Math.cos(rad(elongation(date)))) / 2;

  // Geocentric right ascension and declination (degrees) of the moon and sun, the moon's horizontal parallax
  // (degrees) and distance (km).
  function position(date) {
    const b = bodies(date), deg = 180 / Math.PI;
    const eps = rad(23.439291 - 0.0130042 * b.T);
    const equatorial = (lon, lat) => {
      const l = rad(lon), be = rad(lat);
      return { ra: mod(Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(be) * Math.sin(eps), Math.cos(l)) * deg, 360),
               dec: Math.asin(Math.sin(be) * Math.cos(eps) + Math.cos(be) * Math.sin(eps) * Math.sin(l)) * deg };
    };
    return { ...equatorial(b.moonLon, b.moonLat), sun: equatorial(b.sunLon, 0),
             parallax: Math.asin(6378.14 / b.dist) * deg, distance: b.dist };
  }

  // Altitude of the moon above the horizon (degrees, geocentric) minus the altitude at which it
  // counts as risen/set (accounts for parallax and refraction). Positive = up.
  function moonUp(ms, lat, lon) {
    const date = new Date(ms), m = position(date);
    const gmst = mod(280.46061837 + 360.98564736629 * (julian(date) - 2451545), 360);
    const H = rad(gmst + lon - m.ra), dec = rad(m.dec);
    const alt = Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(H)) * 180 / Math.PI;
    return alt - (0.7275 * m.parallax - 0.5667);
  }

  // Finds moonrise / moonset events for a place and maps the moon's real day onto the SWF's arc:
  // moonrise -> 7 (left horizon), moonset -> 19 (right horizon), exactly like the sun.
  function tracker(lat, lon) {
    let events = [], centre = -Infinity;
    const HOUR = 3600000, STEP = 10 * 60000;
    function build(ms) {
      events = [];
      let t = ms - 30 * HOUR, prev = moonUp(t, lat, lon);
      for (t += STEP; t <= ms + 30 * HOUR; t += STEP) {
        const cur = moonUp(t, lat, lon);
        if ((prev < 0) !== (cur < 0)) {
          let a = t - STEP, b = t;
          for (let i = 0; i < 18; i++) {
            const m = (a + b) / 2;
            if ((moonUp(m, lat, lon) < 0) === (prev < 0)) a = m; else b = m;
          }
          events.push({ t: (a + b) / 2, rise: cur >= 0 });
        }
        prev = cur;
      }
      centre = ms;
    }
    function around(ms) {
      if (Math.abs(ms - centre) > 6 * HOUR) build(ms);
      let last = null, next = null;
      for (const e of events) { if (e.t <= ms) last = e; else if (!next) next = e; }
      return { last, next };
    }
    return {
      // design hour (7..31 mod 24) of the moon, or null when it has no rise/set nearby (polar regions)
      design(ms) {
        const { last, next } = around(ms);
        if (!last || !next) return null;
        return mod((last.rise ? 7 : 19) + (ms - last.t) / (next.t - last.t) * 12, 24);
      },
      // the next moonrise and moonset after ms (timestamps, or null)
      upcoming(ms) {
        around(ms);
        return { rise: (events.find(e => e.rise && e.t > ms) || {}).t || null,
                 set: (events.find(e => !e.rise && e.t > ms) || {}).t || null };
      },
    };
  }

  // Is the visitor in the southern hemisphere? (There the lit side of the moon is mirrored.)
  // Starts with a guess from the time zone, then refines it from the browser's location if the
  // visitor allows it. The location is only used locally and is never sent anywhere.
  const SOUTH_ZONES = /^(Australia\/|Antarctica\/|Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Tahiti|Noumea|Port_Moresby|Guadalcanal|Efate|Rarotonga|Niue|Pago_Pago|Midway|Easter|Galapagos)|Indian\/(Antananarivo|Mauritius|Reunion|Mayotte|Comoro|Kerguelen)|Africa\/(Johannesburg|Maseru|Mbabane|Maputo|Harare|Lusaka|Windhoek|Gaborone|Luanda|Lubumbashi|Blantyre|Bujumbura|Kigali|Dar_es_Salaam)|America\/(Sao_Paulo|Argentina\/|Buenos_Aires|Santiago|Lima|La_Paz|Montevideo|Asuncion|Cuiaba|Campo_Grande|Bahia|Recife|Fortaleza|Belem|Manaus|Porto_Velho|Rio_Branco|Maceio|Araguaina|Punta_Arenas)|Atlantic\/(St_Helena|Stanley|South_Georgia))/;
  function guessSouth() {
    try { return SOUTH_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); }
    catch (e) { return false; }
  }
  function locate(callback) {             // callback(isSouth, source, coords?) - called once, when the lookup ends
    const fallback = () => callback(guessSouth(), 'time zone');
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      p => callback(p.coords.latitude < 0, 'location', p.coords),
      fallback, { maximumAge: 864e5, timeout: 15000 });
  }

  global.MoonPhase = { SYNODIC, elongation, age, illumination, position, locate, tracker, isUp: (ms, lat, lon) => moonUp(ms, lat, lon) >= 0 };
})(window);
