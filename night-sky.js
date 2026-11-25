/*
 * The real night sky for a place and time, calculated in the browser (no network, no libraries).
 * Stars come from sky-data.js. Planets use JPL's approximate Keplerian elements (valid 1800 - 2050,
 * good to a few arc minutes). There are five views:
 *   equator - faces south in the northern hemisphere and north in the southern: 180 degrees of compass direction
 *             across the width, the horizon at the bottom and the point overhead at the top.
 *   zenith  - looks straight up, with north at the top and east on the left. The point overhead is in the middle
 *             and the width covers 150 degrees; a stereographic projection keeps constellation shapes true.
 *   sunpath - faces the midday sun, rescaled each day so that the sun's whole route above the horizon fits.
 *   noon    - like zenith, but tilted to centre on the height of the midday sun, which crosses the middle.
 *   raised  - like equator, with the horizon lifted so that a body on it shows its whole disc.
 */
(function (global) {
  'use strict';
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const mod = (a, n) => ((a % n) + n) % n;
  const days = ms => ms / 86400000 + 2440587.5 - 2451545;       // since J2000

  // Height above the horizon and compass direction (from north through east), in degrees.
  function horizontal(ra, dec, ms, lat, lon) {
    const H = rad(280.46061837 + 360.98564736629 * days(ms) + lon - ra), d = rad(dec), p = rad(lat);
    const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
    const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p));
    return { alt: deg(alt), az: mod(deg(az), 360) };
  }

  const SHAPE = 400 / 60;                          // width / height of the display
  const ZENITH_EDGE = Math.tan(rad(150 / 4));      // stereographic radius at the left and right edges
  const TILTED = ['zenith', 'noon'];               // the conformal views
  // the narrow zenith and noon strips show less sky, so they include fainter stars
  const faintest = mode => TILTED.includes(mode) ? 4.5 : 4;
  // Where a body sits in the sunpath and raised views, as fractions: the horizon is a disc's radius above the bottom
  // and the highest point a radius below the top. The sunpath view also stays right of the cut bottom-left corner.
  const HORIZON = 45 / 60, TOP = 15 / 60, LEFT = 62 / 400, RIGHT = 384 / 400;

  // The direction faced to see the midday sun, and its height then.
  function midday(lat, sunDec) {
    return { facing: sunDec > lat ? 0 : 180, height: 90 - Math.abs(lat - sunDec) };
  }

  // Position in a view as fractions (0,0 = top left). The result may lie outside the view (outside 0 .. 1).
  // The sunpath and noon views depend on the season, so they need the sun's declination.
  function place(h, lat, mode, sunDec = 0) {
    if (TILTED.includes(mode)) {
      // stereographic projection about the middle of the view: straight up, or the midday sun
      const { facing, height } = mode === 'noon' ? midday(lat, sunDec) : { facing: 180, height: 90 };
      const az = rad(h.az - facing), alt = rad(h.alt), c = rad(height);
      const right = Math.cos(alt) * Math.sin(az), ahead = Math.cos(alt) * Math.cos(az), above = Math.sin(alt);
      const forward = ahead * Math.cos(c) + above * Math.sin(c), up = above * Math.cos(c) - ahead * Math.sin(c);
      const k = 1 / Math.max(1e-6, 1 + forward) / ZENITH_EDGE / 2;       // in display widths from the middle
      return { x: 0.5 + right * k, y: 0.5 - up * k * SHAPE };
    }
    if (mode === 'sunpath') {
      const { facing, height } = midday(lat, sunDec);
      // how far from the facing direction the sun rises and sets (180 when it never sets)
      const rise = deg(Math.acos(Math.max(-1, Math.min(1, Math.sin(rad(sunDec)) / Math.cos(rad(lat))))));
      const half = Math.max(30, facing === 0 ? rise : 180 - rise);
      return { x: (LEFT + RIGHT) / 2 + (mod(h.az - facing + 180, 360) - 180) / half * (RIGHT - LEFT) / 2,
               y: HORIZON - h.alt / Math.max(10, height) * (HORIZON - TOP) };
    }
    // directions behind the viewer are split between the two sides, so x runs from -0.5 to 1.5
    return { x: (mod(h.az - (lat < 0 ? 270 : 90) + 90, 360) - 90) / 180,
             y: mode === 'raised' ? HORIZON - h.alt / 90 * (HORIZON - TOP) : 1 - h.alt / 90 };
  }

  // As place(), but null when below the horizon or outside the view.
  function project(h, lat, mode, sunDec) {
    if (h.alt < 0) return null;
    const { x, y } = place(h, lat, mode, sunDec);
    return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
  }

  // [a (au), e, inclination, mean longitude, longitude of perihelion, ascending node], then the change per century.
  const ORBITS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  };
  // Brightness: magnitude at 1 au from the sun and the earth, plus terms for the phase angle (Saturn's rings are ignored).
  const BRIGHTNESS = {
    mercury: i => -0.42 + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i,
    venus:   i => -4.40 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i,
    mars:    i => -1.52 + 0.016 * i,
    jupiter: i => -9.40 + 0.005 * i,
    saturn:  i => -8.88 + 0.044 * i,
  };

  function heliocentric(name, T) {       // ecliptic x, y, z in au
    const [a, e, inc, L, peri, node] = ORBITS[name][0].map((v, i) => v + ORBITS[name][1][i] * T);
    const M = rad(mod(L - peri + 180, 360) - 180);
    let E = M;
    for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const u = a * (Math.cos(E) - e), v = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = rad(peri - node), O = rad(node), I = rad(inc);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I);
    return [(cw * cO - sw * sO * cI) * u - (sw * cO + cw * sO * cI) * v,
            (cw * sO + sw * cO * cI) * u - (sw * sO - cw * cO * cI) * v,
            sw * Math.sin(I) * u + cw * Math.sin(I) * v];
  }

  // The five naked-eye planets as seen from the earth: right ascension, declination and magnitude.
  function planets(ms) {
    const T = days(ms) / 36525, earth = heliocentric('earth', T), eps = rad(23.43928);
    return Object.keys(BRIGHTNESS).map(name => {
      const p = heliocentric(name, T), [x, y, z] = p.map((v, i) => v - earth[i]);
      const yq = y * Math.cos(eps) - z * Math.sin(eps), zq = y * Math.sin(eps) + z * Math.cos(eps);
      const r = Math.hypot(...p), dist = Math.hypot(x, y, z), R = Math.hypot(...earth);
      const phase = deg(Math.acos(Math.max(-1, Math.min(1, (r * r + dist * dist - R * R) / (2 * r * dist)))));
      return { name, ra: mod(deg(Math.atan2(yq, x)), 360), dec: deg(Math.atan2(zq, Math.hypot(x, yq))),
               mag: BRIGHTNESS[name](phase) + 5 * Math.log10(r * dist) };
    });
  }

  const AU = 149597870.7, EARTH = 6378.14, SUN_RADIUS = 695700, MOON_RADIUS = 1737.4;      // km
  function sunDeclination(ms) { return MoonPhase.position(new Date(ms)).sun.dec; }
  const sunDistance = ms => Math.hypot(...heliocentric('earth', days(ms) / 36525)) * AU;
  const diameter = (radius, km) => 2 * deg(Math.asin(radius / km));
  const vector = (ra, dec, r) => [r * Math.cos(rad(dec)) * Math.cos(rad(ra)), r * Math.cos(rad(dec)) * Math.sin(rad(ra)), r * Math.sin(rad(dec))];
  const separation = (a, b) => deg(Math.acos(Math.min(1, a.reduce((n, v, i) => n + v * b[i], 0) / Math.hypot(...a) / Math.hypot(...b))));

  // Apparent diameters of the sun and moon in degrees, seen from the centre of the earth.
  function diameters(ms) {
    return { sun: diameter(SUN_RADIUS, sunDistance(ms)),
             moon: diameter(MOON_RADIUS, MoonPhase.position(new Date(ms)).distance) };
  }

  // The sun and moon as seen from a place: height and direction, apparent diameter, and how far apart they are
  // (degrees). The moon is near enough that where you stand shifts it by up to a degree (parallax), which is
  // what decides where a solar eclipse is seen.
  // For lunar eclipses, `shadow` describes the earth's shadow at the moon's distance, which is the same for
  // everyone: the radii of its dark centre (umbra) and pale fringe (penumbra), how far the moon's centre is
  // from the middle of it, and both positions in the observer's sky.
  function sunAndMoon(ms, lat, lon) {
    const m = MoonPhase.position(new Date(ms)), sunKm = sunDistance(ms);
    // observer's position relative to the centre of the flattened earth, in km
    const u = Math.atan(0.99664719 * Math.tan(rad(lat))), lst = 280.46061837 + 360.98564736629 * days(ms) + lon;
    const obs = vector(lst, 0, EARTH * Math.cos(u));
    obs[2] = EARTH * 0.99664719 * Math.sin(u);
    const moonVec = vector(m.ra, m.dec, m.distance).map((v, i) => v - obs[i]), moonKm = Math.hypot(...moonVec);
    const moonRa = deg(Math.atan2(moonVec[1], moonVec[0])), moonDec = deg(Math.asin(moonVec[2] / moonKm));
    const sunVec = vector(m.sun.ra, m.sun.dec, sunKm);
    const anti = { ra: m.sun.ra + 180, dec: -m.sun.dec };
    const sunRadius = diameter(SUN_RADIUS, sunKm) / 2, sunParallax = deg(EARTH / sunKm);
    return {
      sun: horizontal(m.sun.ra, m.sun.dec, ms, lat, lon),
      moon: horizontal(moonRa, moonDec, ms, lat, lon),
      sunDiameter: 2 * sunRadius,
      moonDiameter: diameter(MOON_RADIUS, moonKm),
      separation: separation(sunVec, moonVec),
      shadow: {
        // the earth's atmosphere makes its shadow about 2% larger than geometry alone gives
        umbra: 1.02 * (0.99834 * m.parallax - sunRadius + sunParallax),
        penumbra: 1.02 * (0.99834 * m.parallax + sunRadius + sunParallax),
        separation: separation(vector(anti.ra, anti.dec, 1), vector(m.ra, m.dec, 1)),
        moon: horizontal(m.ra, m.dec, ms, lat, lon),
        centre: horizontal(anti.ra, anti.dec, ms, lat, lon),
      },
    };
  }

  // The fraction of the sun's disc hidden by the moon (radii and separation in the same units).
  function obscuration(sunR, moonR, apart) {
    if (apart >= sunR + moonR) return 0;
    if (apart <= Math.abs(sunR - moonR)) return Math.min(1, (moonR / sunR) ** 2);
    const part = (a, b) => { const t = Math.acos((apart * apart + a * a - b * b) / (2 * apart * a)); return a * a * (t - Math.sin(2 * t) / 2); };
    return (part(sunR, moonR) + part(moonR, sunR)) / (Math.PI * sunR * sunR);
  }

  // The next (step 1) or previous (step -1) eclipse of one type, 'solar' or 'lunar', that can be watched from a
  // place in the equator view: some of it happens with the body above the horizon and in front of the viewer.
  // Eclipses too slight to notice (and penumbral lunar ones) are passed over. Looks at new or full moons after or
  // before `from`, for up to 20 years. With `totalOnly`, the eclipse must be total while it can be watched, and
  // `start` and `end` bound the totality.
  // Returns { type, total, start, end (of the watchable part), syzygy } or null.
  function findEclipse(from, lat, lon, wanted, totalOnly = false, step = 1) {
    const beyond = u => (u - from) * step > 0;      // on the side of `from` being searched
    const DAY = 86400000, MONTH = MoonPhase.SYNODIC * DAY, STEP = 4 * 60000;
    const elongation = t => MoonPhase.elongation(new Date(t));
    const watchable = h => { const { x } = place(h, lat, 'equator'); return h.alt > 3 && x > 0.08 && x < 0.98; };
    for (let t = from - step * DAY; (t - from) * step < 20 * 365 * DAY;) {
      // the next (or previous) new or full moon, roughly
      t += ((step > 0 ? 180 : 0) - elongation(t) % 180) / 360 * MONTH;
      for (let i = 0; i < 4; i++) t -= (mod(elongation(t) + 90, 180) - 90) / 360 * MONTH;
      const type = Math.abs(mod(elongation(t), 360) - 180) < 90 ? 'lunar' : 'solar';
      const m = MoonPhase.position(new Date(t)), sunward = type === 'solar' ? m.sun : { ra: m.sun.ra + 180, dec: -m.sun.dec };
      if (type === wanted && separation(vector(sunward.ra, sunward.dec, 1), vector(m.ra, m.dec, 1)) < 1.7) {   // lined up
        let start = null, end = null;
        for (let u = t - 6 * 3600000; u <= t + 6 * 3600000; u += STEP) {
          const s = sunAndMoon(u, lat, lon), moonR = diameter(MOON_RADIUS, m.distance) / 2;
          const seen = type === 'solar'
            ? obscuration(s.sunDiameter / 2, s.moonDiameter / 2, s.separation) > 0.05 && watchable(s.sun)
            : s.shadow.umbra + moonR - s.shadow.separation > 0.1 * moonR && watchable(s.shadow.moon);
          if (seen && beyond(u)) { if (start === null) start = u; end = u; }
        }
        if (start !== null && totalOnly) {       // totality can be brief, so look again in finer steps
          const [first, last] = [start - STEP, end + STEP], moonR = diameter(MOON_RADIUS, m.distance) / 2;
          start = end = null;
          for (let u = first; u <= last; u += 10000) {
            const s = sunAndMoon(u, lat, lon);
            const total = type === 'solar'
              ? s.separation <= (s.moonDiameter - s.sunDiameter) / 2 && watchable(s.sun)
              : s.shadow.separation <= s.shadow.umbra - moonR && watchable(s.shadow.moon);
            if (total && beyond(u)) { if (start === null) start = u; end = u; }
          }
        }
        if (start !== null) return { type, total: totalOnly, start, end, syzygy: t };
      }
      t += step * DAY;
    }
    return null;
  }

  // Where to write the names of things in the sky, in stage units. Names are placed in order of importance (sun,
  // moon, planets, bright stars, constellations) beside their object, and left out when there is no clear room.
  //   bodies: the sun and moon as [{ text, x, y, r }]; night: a result of view(), or null when no stars show;
  //   reserved: other areas to keep clear, as [left, top, width, height];
  //   which: 'planets', 'stars' (not counting the sun) or 'all'.
  // Returns [{ text, kind: 'body' | 'planet' | 'star' | 'constellation', x (left), y (top), size, width }].
  const LETTER_SPACING = 0.7;               // extra room between the letters of a name, in stage units
  function labels(bodies, night, reserved = [], which = 'all', W = 400, H = 60) {
    const taken = [...reserved], out = [];
    for (const b of bodies) taken.push([b.x - b.r, b.y - b.r, 2 * b.r, 2 * b.r]);
    const free = ([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= W && y + h <= H && x > y + h /* the cut corner */
      && !taken.some(([a, b, c, d]) => x < a + c && a < x + w && y < b + d && b < y + h);
    function add(text, kind, size, x, y, r) {
      if (x < 0 || x > W || y - r > H || y + r < 0) return;          // the object itself is out of view
      const w = text.length * (size * (kind === 'constellation' ? 0.66 : 0.56) + LETTER_SPACING), h = size * 1.15, gap = r + 1.2;
      const spots = kind === 'constellation' ? [[x - w / 2, y - h / 2]]
        : [[x + gap, y - h / 2], [x - gap - w, y - h / 2], [x - w / 2, y - gap - h], [x - w / 2, y + gap]];
      // beside an object near the top or bottom edge, a name may slide along to stay on the display
      for (let [left, top] of spots) {
        if (Math.abs(top + h / 2 - y) < 0.01) top = Math.max(0, Math.min(H - h, top));
        if (!free([left, top, w, h])) continue;
        taken.push([left, top, w, h]);
        out.push({ text, kind, x: left, y: top, size, width: w });
        return;
      }
    }
    const all = which === 'all';
    if (all) for (const b of bodies) add(b.text, 'body', 9, b.x, b.y, b.r);
    if (night) {
      const planets = which === 'stars' ? [] : [...night.planets].sort((a, b) => a.mag - b.mag);
      for (const p of planets) add(p.name[0].toUpperCase() + p.name.slice(1), 'planet', 9, p.x * W, p.y * H, 1.7);
      for (const s of which === 'planets' ? [] : night.stars) {           // already brightest first
        if (SKY_STAR_NAMES[s.id]) add(SKY_STAR_NAMES[s.id], 'star', 8, s.x * W, s.y * H, s.mag < 1.5 ? 2.2 : 1);
      }
      for (const c of all ? night.constellations : []) add(c.name.toUpperCase(), 'constellation', 6.5, c.x * W, c.y * H, 0);
    }
    return out;
  }

  // Everything in view: { stars: [{x, y, mag, bv, id}], planets: [{x, y, mag, name}], constellations: [{x, y, name}] }
  function view(ms, lat, lon, mode = 'equator') {
    const out = { stars: [], planets: [], constellations: [] }, sunDec = sunDeclination(ms);
    SKY_STARS.forEach(([ra, dec, mag, bv], id) => {
      const at = mag <= faintest(mode) && project(horizontal(ra, dec, ms, lat, lon), lat, mode, sunDec);
      if (at) out.stars.push({ x: at.x, y: at.y, mag, bv, id });
    });
    for (const p of planets(ms)) {
      const at = project(horizontal(p.ra, p.dec, ms, lat, lon), lat, mode, sunDec);
      if (at) out.planets.push({ x: at.x, y: at.y, mag: p.mag, name: p.name });
    }
    for (const [name, ra, dec] of SKY_CONSTELLATIONS) {
      const at = project(horizontal(ra, dec, ms, lat, lon), lat, mode, sunDec);
      if (at) out.constellations.push({ x: at.x, y: at.y, name });
    }
    return out;
  }

  global.NightSky = { horizontal, place, project, planets, sunAndMoon, diameters, obscuration, findEclipse, sunDeclination, labels, LETTER_SPACING, view };
})(window);
