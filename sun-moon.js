/*
 * Sun / moon header animation – a JavaScript port of beehive_header.swf.
 *
 * The vector artwork and sprite timelines come from swf-data.js (extracted from the SWF).
 * Everything below is a hand translation of the ActionScript found in the movie:
 *   - time()      -> currentTime()
 *   - rtlight()   -> skyColour()
 *   - frame 2     -> update()
 *   - star clips  -> Star
 * The improved mode sizes the sun and moon from their real distances, so they are to scale with each other.
 * Once the location is known, the improved mode puts the sun and moon in their real positions and replaces the
 * random stars with the real stars and planets. Solar and lunar eclipses then show as they would be seen there.
 */
(function () {
  'use strict';

  const W = 400, H = 60;           // stage size of the original movie
  const GRADNUM = 20;              // number of sky gradient bands
  const MOON_PERIOD = 29.530589;   // days
  const MOON_EPOCH = new Date(2001, 9, 16, 0, 0, 0, 0); // new moon used by the SWF (legacy mode)
  const STAR_FPS = 8;              // twinkle animation rate (the SWF runs at 1fps)

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const chars = SWF_DATA.chars, sprites = SWF_DATA.sprites;
  const placed = {};
  SWF_DATA.main.forEach(p => { if (p.name) placed[p.name] = p; });

  /* ---------------------------------------------------------------- *
   * Mini renderer for shapes, morphs and sprite timelines
   * ---------------------------------------------------------------- */
  const IDENT_CX = { mul: [100, 100, 100, 100], add: [0, 0, 0, 0] };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function concatCx(inner, outer) {      // inner is applied first, then outer
    if (!inner) return outer;
    if (!outer) return inner;
    const mul = [], add = [];
    for (let i = 0; i < 4; i++) {
      mul[i] = inner.mul[i] * outer.mul[i] / 100;
      add[i] = inner.add[i] * outer.mul[i] / 100 + outer.add[i];
    }
    return { mul, add };
  }

  function rgba(c, cx) {
    const r = clamp(Math.round(c[0] * cx.mul[0] / 100 + cx.add[0]), 0, 255);
    const g = clamp(Math.round(c[1] * cx.mul[1] / 100 + cx.add[1]), 0, 255);
    const b = clamp(Math.round(c[2] * cx.mul[2] / 100 + cx.add[2]), 0, 255);
    const a = clamp(c[3] * cx.mul[3] / 100 + cx.add[3], 0, 255) / 255;
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  function buildPath(d, d2, t, m) {
    const p = new Path2D();
    const pt = (x, y) => m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y];
    d.forEach((c, i) => {
      const o = d2 ? d2[i] : null;
      const n = k => o ? lerp(c[k], o[k], t) : c[k];
      let a, b;
      switch (c[0]) {
        case 'M': a = pt(n(1), n(2)); p.moveTo(a[0], a[1]); break;
        case 'L': a = pt(n(1), n(2)); p.lineTo(a[0], a[1]); break;
        case 'Q': a = pt(n(1), n(2)); b = pt(n(3), n(4)); p.quadraticCurveTo(a[0], a[1], b[0], b[1]); break;
        case 'Z': p.closePath(); break;
      }
    });
    return p;
  }

  function fillShape(def, t, cx) {
    const morph = def.t === 'morph';
    for (const f of def.fills) {
      const path = buildPath(f.d, morph ? f.d2 : null, t);
      const fs = f.fill;
      if (fs.type === 'solid') {
        ctx.fillStyle = rgba(morph ? fs.c.map((v, i) => lerp(v, fs.c2[i], t)) : fs.c, cx);
        ctx.fill(path, 'evenodd');
        continue;
      }
      // gradient fill: draw a big rectangle in gradient space, clipped to the path
      const m = morph ? fs.m.map((v, i) => lerp(v, fs.m2[i], t)) : fs.m;
      ctx.save();
      ctx.clip(path, 'evenodd');
      ctx.transform(m[0] / 20, m[1] / 20, m[2] / 20, m[3] / 20, m[4], m[5]);
      const g = fs.type === 'lin'
        ? ctx.createLinearGradient(-16384, 0, 16384, 0)
        : ctx.createRadialGradient(0, 0, 0, 0, 0, 16384);
      for (const s of fs.stops) {
        const pos = morph ? lerp(s[0], s[2], t) : s[0];
        const col = morph ? s[1].map((v, i) => lerp(v, s[3][i], t)) : s[1];
        g.addColorStop(clamp(pos / 255, 0, 1), rgba(col, cx));
      }
      ctx.fillStyle = g;
      ctx.fillRect(-1e6, -1e6, 2e6, 2e6);
      ctx.restore();
    }
  }

  function applyMatrix(m) { if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); }

  function drawChar(id, item, cx, ov) {
    const def = chars[id];
    if (def) {
      fillShape(def, def.t === 'morph' ? (item.ratio || 0) / 65535 : 0, cx);
    } else if (sprites[id]) {
      drawSprite(id, 1, cx, ov);
    }
  }

  // Draws one frame of a sprite. `ov` maps instance names to colour overrides
  // (the SWF uses Color.setTransform for these) and `frames` to child frame numbers.
  function drawSprite(id, frame, cx, ov) {
    const list = sprites[id][clamp(frame, 1, sprites[id].length) - 1];
    let clipEnd = -1, clipping = 0;
    for (const item of list) {
      while (clipping && item.depth > clipEnd) { ctx.restore(); clipping--; clipEnd = -1; }
      if (item.clip) {                       // mask for every depth up to item.clip
        const mask = new Path2D();
        for (const f of chars[item.id].fills) mask.addPath(buildPath(f.d, null, 0, item.m));
        ctx.save();
        ctx.clip(mask, 'evenodd');
        clipping++; clipEnd = item.clip;
        continue;
      }
      ctx.save();
      applyMatrix(item.m);
      const own = (ov && item.name && ov[item.name]) || item.cx;
      drawChar(item.id, item, concatCx(own, cx), ov);
      ctx.restore();
    }
    while (clipping--) ctx.restore();
  }

  /* ---------------------------------------------------------------- *
   * Time, sky colours and celestial positions (the ActionScript)
   * ---------------------------------------------------------------- */
  let fastHour = null;                   // arrow-key debug clock (_root.tm in the SWF); null = the present. Hours since fastMidnight,
  let fastMidnight = 0;                  // counting on past 24 so that the real moon carries on into the following days
  // Clock speeds as [multiple of real time, name shown]: the real rate, then amounts of time per second.
  const HOUR = 3600, DAY = 24 * HOUR;
  const SPEEDS = [[1, '1\u00d7'], [600, '10 min/s'], [1800, '30 min/s'], [HOUR, '1 hour/s'], [3 * HOUR, '3 hours/s'],
                  [6 * HOUR, '6 hours/s'], [12 * HOUR, '12 hours/s'], [DAY, '1 day/s'], [7 * DAY, '1 week/s'],
                  [30.4375 * DAY, '1 month/s'], [365.25 * DAY, '1 year/s']];
  let speedStep = 0;                     // index into SPEEDS; -1 = the eclipse speed after jumping to one
  const ECLIPSE_SPEED = 600, TOTALITY_SPEED = 60;        // after jumping to an eclipse: 10 minutes, then 1, per second
  let paused = false;                    // Space stops and restarts the clock
  let clockChoice = null;                // the C key: true shows the date and time, false hides them
  let menuOpen = false;                  // the shortcut pages are showing, which also holds the animation
  // N rotates through what is labelled in the sky (simulation with a known location)
  const NAME_SETS = { off: 'Names off', planets: 'Planet names', stars: 'Star names', all: 'All names' };
  let names = 'off';
  let dayNames = false;                      // Y names things in daylight too, marking them faintly
  const DAY_FAINTNESS = 45;                  // how strongly (percent) things are then marked
  const namingByDay = () => dayNames && names !== 'off';
  // By day only the things being named are marked.
  const namedOnly = view => ({ stars: names === 'planets' ? [] : view.stars, planets: names === 'stars' ? [] : view.planets,
                              constellations: view.constellations });
  let eclipse = null;                    // the eclipse last jumped to, while its clock is running

  function realTime() {                  // time(): hour + minutes rounded to 0.1h
    const d = new Date();
    return d.getHours() + Math.round(d.getMinutes() / 60 * 10) / 10;
  }
  function currentTime() {
    if (fastHour === null && state.legacy) return realTime();   // the SWF's 0.1 h steps
    const d = new Date(clockMs());         // exact time for continuous motion; read from the date to allow for summer time
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  // Colour stops through the day: [from hour, light, dark, span]; inc = hours left in the period.
  const PERIODS = [
    [0,    '000033', '00aaff', 12,  12],
    [12,   '00aaff', '0033ff', 3.5, 15.5],
    [15.5, '0033ff', '99CCFF', 1,   16.5],
    [16.5, '99CCFF', 'cc0000', 1,   17.5],
    [17.5, 'cc0000', '330099', 1,   18.5],
    [18.5, '330099', '000033', 5.5, 24],
  ];
  // The SWF keeps these in globals, so an out-of-range hour reuses the previous values.
  let sky = { light: '330099', dark: '000033', span: 5.5, inc: 0 };

  function skyColour(a, hours) {         // MovieClip.prototype.rtlight
    let h = hours;
    h += (h < 14 ? (a - H / GRADNUM) : (H / GRADNUM - a)) / 100;
    if (h < 0) h = 24 - h; else if (!(h < 24)) h -= 24;
    for (const [from, light, dark, span, end] of PERIODS) {
      const last = end === 24;
      if (h >= from && (last ? h <= end : h < end)) { sky = { light, dark, span, inc: end - h }; break; }
    }
    const ch = (s, i) => parseInt(s.substr(i, 2), 16);
    return [1, 3, 5].map(i => {
      const l = ch(sky.light, i - 1), dk = ch(sky.dark, i - 1);
      const step = Math.ceil((dk - l) / sky.span);
      return clamp(Math.round(dk - step * sky.inc), 0, 255);
    });
  }

  /* ---------------------------------------------------------------- *
   * Scene state
   * ---------------------------------------------------------------- */
  const state = {
    ct: null, sun: null, place: null, south: false, moonFixed: false, legacy: true,   // starts in legacy mode; the improved mode is switched on with the M arrow
    stripColours: [], moonbg: [0, 0, 0],
    sunFrame: 1, sunX: 0, sunY: 0,
    moonFrame: 1, moonX: 0, moonY: 0,
    starAlpha: 0, skyAlpha: 0,           // strength of the stars; skyAlpha also covers marks made in daylight
    sunScale: 1, moonScale: 1,           // size relative to the SWF artwork
    solar: null, lunar: null,            // eclipse in progress, in stage units (improved mode with a known location)
    night: null,                         // real stars and planets in view (improved mode with a known location)
    view: 'equator', note: '',           // which view of the real sky is shown (a key of VIEWS) and its name just after V
  };

  let lastMoonCheck = 0;
  // Real phase from the current date and time (replaces the SWF's fixed 2001 epoch + 29.53 day average).
  // Returns true when the artwork frame or hemisphere changed.
  function updateMoonPhase(force) {
    const t = state.legacy ? Date.now() : clockMs();     // the simulation's phase follows the clock being shown
    if (state.moonFixed || (!force && Math.abs(t - lastMoonCheck) < 60000)) return false;
    lastMoonCheck = t;
    const now = new Date(t);
    let frame;
    if (state.legacy) {                                          // the SWF: whole days since a 2001 new moon, 29.53 day average
      const days = Math.floor((now - MOON_EPOCH) / 86400000);
      frame = Math.round(days % MOON_PERIOD) * 2;
    } else {
      frame = Math.round(MoonPhase.age(now) * 2);              // two artwork frames per day, as in the SWF
    }
    const changed = frame !== state.moonFrame;
    state.moonFrame = frame;
    return changed;
  }

  // Timestamp for the clock the scene is showing (real time, or the fast clock running on from today).
  function clockMs() {
    if (fastHour === null) return Date.now();
    return fastMidnight + shownHour() * 3600000;
  }

  // The SWF moves the sun and moon by equal angles round an ellipse that is clipped at the top of the
  // stage, so on screen they speed up and slow down. evenAngle() re-times the visible half of the orbit so
  // equal time steps cover equal distances along the path (constant on-screen speed).
  // improved path: the top of a much larger circle through both bottom corners, peaking at the middle of the stage
  // (vertical middle at the horizontal centre); the sun/moon enter and leave off-screen, then travel round below
  const IMP_TOP = H / 2, IMP_S = H - IMP_TOP, IMP_R = ((W / 2) ** 2 + IMP_S ** 2) / (2 * IMP_S);
  const IMP_PHI = Math.asin((W / 2 + 22) / IMP_R), IMP_LOW = H + 60;
  function impArc(deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d >= 180) {
      const p = -IMP_PHI + 2 * IMP_PHI * (d - 180) / 180;
      return [W / 2 + IMP_R * Math.sin(p), IMP_TOP + IMP_R * (1 - Math.cos(p))];
    }
    const f = d / 180, ex = W / 2 + IMP_R * Math.sin(IMP_PHI), ey = IMP_TOP + IMP_R * (1 - Math.cos(IMP_PHI));
    if (f < 0.1) return [ex, ey + (IMP_LOW - ey) * f / 0.1];
    if (f < 0.9) return [ex - (2 * ex - W) * (f - 0.1) / 0.8, IMP_LOW];
    return [W - ex, IMP_LOW + (ey - IMP_LOW) * (f - 0.9) / 0.1];
  }
  function arcPoint(deg, imp) {
    const r = deg * Math.PI / 180;
    if (imp) return impArc(deg);
    return [(W / 2 - 65) * Math.cos(r) + W / 2 + 15, Math.max(30, (H / 2 + 100) * Math.sin(r) + H)];
  }
  const ARC = [false, true].map(imp => {   // cumulative path length over the visible half (180..360 degrees)
    const N = 1440, len = [0];
    let [px, py] = arcPoint(180, imp);
    for (let i = 1; i <= N; i++) {
      const [x, y] = arcPoint(180 + 180 * i / N, imp);
      len.push(len[i - 1] + Math.hypot(x - px, y - py)); px = x; py = y;
    }
    return len.map(v => v / len[N]);
  });
  function evenAngle(deg, imp) {
    const d = ((deg % 360) + 360) % 360;
    if (d < 180) return deg;             // below the horizon: not visible, left alone
    const A = ARC[imp ? 1 : 0], f = (d - 180) / 180;
    let lo = 0, hi = A.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= f) lo = m; else hi = m; }
    const t = A[hi] === A[lo] ? 0 : (f - A[lo]) / (A[hi] - A[lo]);
    return deg - d + 180 + 180 * (lo + t) / (A.length - 1);
  }

  // The sky views that V rotates through (see night-sky.js).
  const VIEWS = { equator: 'Facing the equator', zenith: 'Straight up', sunpath: 'Sun path',
                  noon: 'Tilted to the midday sun', raised: 'Raised horizon' };
  const tilted = () => state.view === 'zenith' || state.view === 'noon';
  const skyPlace = body => NightSky.place(body, state.place.latitude, state.view, NightSky.sunDeclination(clockMs()));

  // Stage position of the sun or moon from its height and direction. The discs are large compared with the sky, so
  // in the views along the horizon they sink faster once below it: out of sight by 6 degrees down.
  function realPos(body) {
    const at = skyPlace(body);
    if (tilted() || body.alt >= 0) return [at.x * W, at.y * H];
    const horizon = skyPlace({ az: body.az, alt: 0 }).y * H;
    return [at.x * W, horizon - body.alt / 6 * (H + 18 - horizon)];
  }

  // Disc radii of the artwork in stage units, and the radius given to a body of the sun's average apparent size.
  const SUN_ART = 15.2, MOON_ART = 15, DISC = 15.1, MEAN_SUN = 0.533;
  const UNITS = DISC / (MEAN_SUN / 2);   // stage units per degree at the scale the discs are drawn
  function sizeBodies(d) {
    state.sunScale = d ? DISC / SUN_ART * d.sun / MEAN_SUN : 1;
    state.moonScale = d ? DISC / MOON_ART * d.moon / MEAN_SUN : 1;
  }

  // Direction on screen from one sky position to another, as a unit vector (the equator view is stretched
  // sideways, so there it is worked out from the angles to keep the discs' true arrangement).
  function direction(from, to) {
    let dx, dy;
    if (tilted()) {
      const a = skyPlace(from), b = skyPlace(to);
      dx = (b.x - a.x) * W; dy = (b.y - a.y) * H;
    } else {
      dx = (((to.az - from.az + 540) % 360) - 180) * Math.cos(from.alt * Math.PI / 180);
      dy = from.alt - to.alt;
    }
    const n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  }

  // Real positions of the sun and moon. Their discs are drawn far larger than the sky around them, so when the two
  // are close the moon is placed relative to the sun at the discs' scale: they overlap exactly when they really do.
  // Further apart it eases back to its own place in the view.
  function placeBodies() {
    const real = NightSky.sunAndMoon(clockMs(), state.place.latitude, state.place.longitude);
    sizeBodies({ sun: real.sunDiameter, moon: real.moonDiameter });
    [state.sunX, state.sunY] = realPos(real.sun);
    [state.moonX, state.moonY] = realPos(real.moon);

    const apart = real.separation, contact = (real.sunDiameter + real.moonDiameter) / 2, EASE = 20;
    if (apart < contact + EASE) {
      const [ux, uy] = direction(real.sun, real.moon), d = Math.min(apart, contact) * UNITS;
      const t = clamp((apart - contact) / EASE, 0, 1), w = t * t * (3 - 2 * t);
      state.moonX = lerp(state.sunX + ux * d, state.moonX, w);
      state.moonY = lerp(state.sunY + uy * d, state.moonY, w);
    }
    const hidden = NightSky.obscuration(real.sunDiameter / 2, real.moonDiameter / 2, apart);
    state.solar = hidden > 0 ? { hidden, up: real.sun.alt > -0.8 } : null;

    const sh = real.shadow, moonR = real.moonDiameter / 2;
    state.lunar = null;
    if (sh.separation < sh.penumbra + moonR) {
      const [ux, uy] = direction(sh.moon, sh.centre), d = sh.separation * UNITS;
      state.lunar = { dx: ux * d, dy: uy * d, umbra: sh.umbra * UNITS, penumbra: sh.penumbra * UNITS };
    }
  }

  function update() {                    // frame 2 of the SWF, runs when the time changes
    updateSunTimes();                    // for the date being shown
    const ct = SunTimes.design(currentTime(), state.legacy ? null : state.sun);   // real clock -> the SWF's 07:00-19:00 schedule
    if (ct === state.ct && fastHour === null) { return updateMoonPhase(); }
    state.ct = ct;

    state.sunFrame = Math.round(ct - 1) * 2 + 1;
    // the SWF rounds the angle to whole degrees (fine at 1 fps); the fast clock and the improved mode keep it fractional so motion stays smooth
    const snap = fastHour === null && state.legacy ? Math.round : (v => v);
    const skyrot = 360 - snap((19 - ct) / 12 * 180);
    const rad = deg => deg * Math.PI / 180;
    const imp = !state.legacy;
    const pos = deg => arcPoint(evenAngle(deg, imp), imp);
    state.solar = state.lunar = null;
    if (imp && state.place) {            // where they really are in the chosen view of the sky
      placeBodies();
    } else {                             // the stylised arc, with the moon opposite the sun as in the SWF
      [state.sunX, state.sunY] = pos(skyrot);
      [state.moonX, state.moonY] = pos(skyrot - 180);
      sizeBodies(imp ? NightSky.diameters(clockMs()) : null);
    }

    // stars fade in at dusk and out at dawn
    if (ct <= 16 && !(ct < 8)) state.starAlpha = 0;
    else if (16 < ct && ct < 19) state.starAlpha = 100 - (19 - ct) / 3 * 100;
    else if (!(ct < 19)) state.starAlpha = 100;
    else if (6.5 < ct) state.starAlpha = (8 - ct) / 1.5 * 100;
    else state.starAlpha = 100;

    // the sky only darkens noticeably as a solar eclipse nears totality; then the stars come out
    const dim = state.solar && state.solar.up ? state.solar.hidden ** 4 : 0;
    state.starAlpha = Math.max(state.starAlpha, clamp((dim - 0.7) / 0.3, 0, 1) * 100);

    state.skyAlpha = Math.max(state.starAlpha, namingByDay() ? DAY_FAINTNESS : 0);
    state.night = imp && state.place && state.skyAlpha > 0
      ? NightSky.view(clockMs(), state.place.latitude, state.place.longitude, state.view) : null;
    if (state.night && state.starAlpha === 0) state.night = namedOnly(state.night);

    for (let i = 1; i <= GRADNUM; i++) state.stripColours[i] = skyColour(i, ct);
    state.moonbg = skyColour(Math.round(GRADNUM / 2 - 30), ct);
    if (dim) {
      const night = [10, 12, 40], darken = c => c.map((v, i) => Math.round(lerp(v, night[i], dim * 0.9)));
      state.stripColours = state.stripColours.map(darken);
      state.moonbg = darken(state.moonbg);
    }
    updateMoonPhase();
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Stars: 30 randomly placed twinkling clips (sprites 10 / 9)
   * ---------------------------------------------------------------- */
  const STAR_COUNT = 30;
  const stars = [];
  const randInt = n => Math.floor(Math.random() * n);
  for (let i = 0; i <= STAR_COUNT; i++) {          // index 0 is the original template clip at 0,0
    stars.push({
      x: i ? Math.ceil(Math.random() * (W - 20)) + 20 : 0,
      y: i ? Math.ceil(Math.random() * H) : 0,
      alpha: randInt(50) + 10,                     // random(50) + 10 percent
      arms: [{ frame: 1, playing: false }, { frame: 1, playing: false }],
    });
  }
  function tickStars() {
    for (const s of stars) for (const a of s.arms) {
      if (!a.playing && randInt(60 * STAR_FPS) === 0) { a.playing = true; a.frame = 2; }
      else if (a.playing) {
        a.frame++;
        if (a.frame > 10) { a.frame = 1; a.playing = false; }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Real stars and planets (see night-sky.js)
   * ---------------------------------------------------------------- */
  const PLANET_COLOURS = { mercury: [216, 200, 176], venus: [255, 250, 225], mars: [255, 128, 80],
                           jupiter: [255, 220, 170], saturn: [236, 208, 128] };
  function dot(x, y, radius, [r, g, b], alpha) {
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill();
  }
  function drawNight(night) {
    const fade = state.skyAlpha / 100;
    for (const s of night.stars) {
      const colour = s.bv < 0 ? [200, 216, 255] : s.bv > 1 ? [255, 214, 170] : [255, 255, 255];
      const x = s.x * W, y = s.y * H, twinkle = stars[s.id % stars.length];
      dot(x, y, clamp(1.15 - s.mag * 0.18, 0.45, 1.35), colour, clamp(1 - s.mag * 0.12, 0.5, 1) * fade);
      if (s.mag < 1.5) drawStar({ x, y, alpha: 60, arms: twinkle.arms }, state.skyAlpha);     // the brightest keep the SWF's twinkle
    }
    // planets shine steadily, a little larger than stars of the same brightness
    for (const p of night.planets) dot(p.x * W, p.y * H, clamp(1.3 - p.mag * 0.15, 0.7, 1.7), PLANET_COLOURS[p.name], fade);
  }

  /* ---------------------------------------------------------------- *
   * Eclipses
   * ---------------------------------------------------------------- */
  function disc(x, y, radius, style) {
    ctx.fillStyle = style;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill();
  }
  function ring(x, y, inner, outer, stops) {
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    disc(x, y, outer, g);
  }
  // The sun's corona, which only shows once the disc is completely covered.
  function drawCorona(strength) {
    const r = SUN_ART * state.sunScale;
    ring(state.sunX, state.sunY, r * 0.9, r * 2.6,
      [[0, `rgba(235,242,255,${0.9 * strength})`], [0.25, `rgba(205,220,255,${0.35 * strength})`], [1, 'rgba(180,200,255,0)']]);
  }
  // The new moon in front of the sun: a dark disc.
  function drawMoonSilhouette() { disc(state.moonX, state.moonY, MOON_ART * state.moonScale, 'rgb(14,16,32)'); }
  // The earth's shadow across the moon: a faint grey penumbra, and a coppery umbra lit by the earth's atmosphere.
  function drawShadow({ dx, dy, umbra, penumbra }) {
    const x = state.moonX + dx, y = state.moonY + dy, r = MOON_ART * state.moonScale;
    ctx.save();
    ctx.beginPath(); ctx.arc(state.moonX, state.moonY, r + 0.3, 0, 2 * Math.PI); ctx.clip();
    ring(x, y, umbra, penumbra, [[0, 'rgba(20,10,20,0.5)'], [1, 'rgba(20,10,20,0)']]);
    ring(x, y, 0, umbra + 2,
      [[0, 'rgba(70,16,10,0.9)'], [(umbra - 3) / (umbra + 2), 'rgba(135,45,20,0.84)'], [1, 'rgba(60,30,30,0)']]);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */
  function drawStar(s, strength = state.starAlpha) {
    const cx = { mul: [100, 100, 100, s.alpha * strength / 100], add: [0, 0, 0, 0] };
    const scale = 0.1;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(scale, scale);
    drawSprite9(s.arms[0].frame, null, cx);
    ctx.rotate(Math.PI / 2);
    drawSprite9(s.arms[1].frame, null, cx);
    ctx.restore();
  }
  function drawSprite9(frame, m, cx) {
    ctx.save(); applyMatrix(m);
    drawSprite(9, frame, cx, null);
    ctx.restore();
  }

  // How fast the sped-up clock runs, as a multiple of real time; after an eclipse jump it slows near totality.
  const rate = () => speedStep >= 0 ? SPEEDS[speedStep][0]
    : state.solar && state.solar.hidden > 0.99 ? TOTALITY_SPEED : ECLIPSE_SPEED;
  const speedLabel = () => speedStep >= 0 ? SPEEDS[speedStep][1] : rate() / 60 + ' min/s';
  // Faster than a day per second the time of day is held and only the date moves on. Otherwise day and night would
  // flash by several times a second; this way the seasons, the moon and the stars can be followed.
  const wholeDays = () => speedStep >= 0 && SPEEDS[speedStep][0] > DAY;
  let heldHour = 0;                      // fastHour when the speed was last set
  const shownHour = () => wholeDays() ? heldHour + Math.floor((fastHour - heldHour) / 24) * 24 : fastHour;
  const hoursToday = () => (Date.now() - new Date().setHours(0, 0, 0, 0)) / 3600000;

  const TEXT_OPACITY = 0.4;              // the date, messages and names let the sky show through
  const OUTLINE = 'rgba(0,0,0,0.3)';    // and are edged in a dark line, so that they show against light skies
  const textLayer = document.createElement ? document.createElement('canvas') : null;
  // Draws [{ text, x, y, font, colour, strength, align, width }] faintly, each with a dark line round the outside only
  // (the letters are cut out of the line before they are filled, or it would show through them).
  function outlinedText(items) {
    if (!textLayer) return;
    if (textLayer.width !== canvas.width) textLayer.width = canvas.width;
    if (textLayer.height !== canvas.height) textLayer.height = canvas.height;
    const t = textLayer.getContext('2d'), k = canvas.width / W;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, textLayer.width, textLayer.height);
    t.setTransform(k, 0, 0, k, 0, 0);
    t.textBaseline = 'top';
    t.lineJoin = 'round';
    t.lineWidth = 0.7;                     // half of it lies outside the letters
    for (const item of items) {
      // text, or a shape given as SVG path data
      const shape = item.path ? new Path2D(item.path) : null;
      const args = shape ? [shape] : [item.text, item.x, item.y, ...(item.width ? [item.width] : [])];
      const stroke = () => shape ? t.stroke(shape) : t.strokeText(...args);
      const fill = () => shape ? t.fill(shape) : t.fillText(...args);
      t.font = item.font;
      t.letterSpacing = `${item.spacing || 0}px`;
      t.textAlign = item.align || 'left';
      t.globalAlpha = item.strength;
      t.strokeStyle = OUTLINE;
      stroke();
      t.globalCompositeOperation = 'destination-out';
      t.globalAlpha = 1;
      t.fillStyle = '#000';
      fill();
      t.globalCompositeOperation = 'source-over';
      t.globalAlpha = item.strength * TEXT_OPACITY;
      t.fillStyle = item.colour;
      fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(textLayer, 0, 0);
    ctx.restore();
  }
  // The speed and the date and time being shown, in the top right corner while the clock is sped up (including
  // eclipses).
  const DATE_FORMAT = new Intl.DateTimeFormat('en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // The name of the view or another short message, top left, styled like the clock and the names.
  function drawNote() {
    outlinedText([{ text: state.note, x: 14, y: 3, font: '9px system-ui, sans-serif', spacing: NightSky.LETTER_SPACING,
                    colour: LABEL_COLOURS.body, strength: 1 }]);
  }
  // VCR-style symbols, 7 units high, from their top left corner: >> while sped up, || (blinking) when paused.
  const ICONS = {
    fast: { width: 11, path: (x, y) => `M${x} ${y}l5.5 3.5-5.5 3.5ZM${x + 5.5} ${y}l5.5 3.5-5.5 3.5Z` },
    pause: { width: 6, path: (x, y) => `M${x} ${y}h2v7h-2ZM${x + 4} ${y}h2v7h-2Z` },
  };
  // The date and time show while the clock has been changed, unless the C key has chosen otherwise.
  const clockShown = () => clockChoice ?? fastHour !== null;
  const clockText = () => (fastHour === null ? '' : speedLabel() + '  \u00b7  ') + DATE_FORMAT.format(clockMs());
  const clockIcon = () => fastHour === null ? null : paused ? ICONS.pause : rate() > 1 ? ICONS.fast : null;
  function drawClock() {
    const shown = clockShown(), text = clockText(), font = '9px system-ui, sans-serif';
    const items = shown ? [{ text, x: W - 4, y: 3, align: 'right', font, spacing: NightSky.LETTER_SPACING,
                             colour: LABEL_COLOURS.body, strength: 1 }] : [];
    // the pause symbol is on for half of each second, or all the time if less motion is preferred
    const blinkOn = Date.now() % 1000 < 500 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const icon = clockIcon();
    if (icon && (icon !== ICONS.pause || blinkOn)) {
      let right = W - 4;                   // the symbol's right edge: before the date and time, if they show
      if (shown) {
        ctx.save();
        ctx.font = font;
        ctx.letterSpacing = `${NightSky.LETTER_SPACING}px`;
        right -= ctx.measureText(text).width + 5;
        ctx.restore();
      }
      items.push({ path: icon.path(right - icon.width, 4.5), font, colour: LABEL_COLOURS.body, strength: 1 });
    }
    outlinedText(items);
  }

  // Names of the sun, moon, planets, bright stars and constellations.
  const LABEL_COLOURS = { body: '#fff', planet: '#ffe9a8', star: '#dce6ff', constellation: '#aac3ff' };
  function drawNames() {
    const bodies = [{ text: 'Sun', x: state.sunX, y: state.sunY, r: SUN_ART * state.sunScale }];
    if (!state.solar) bodies.push({ text: 'Moon', x: state.moonX, y: state.moonY, r: MOON_ART * state.moonScale });
    const reserved = [];
    if (clockShown()) reserved.push([W - 251, 0, 251, 14]);   // the clock
    else if (clockIcon()) reserved.push([W - 18, 0, 18, 14]);   // or just its symbol
    if (state.note) reserved.push([0, 0, 180, 14]);
    const night = state.starAlpha > 30 || namingByDay() ? state.night : null;
    outlinedText(NightSky.labels(bodies, night, reserved, names).map(l => ({
      text: l.text, x: l.x, y: l.y, width: l.width, font: `${l.size}px system-ui, sans-serif`, spacing: NightSky.LETTER_SPACING,
      colour: LABEL_COLOURS[l.kind], strength: l.kind === 'body' || namingByDay() ? 1 : state.starAlpha / 100,
    })));
  }

  function render() {
    const k = canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    // stage mask (depth 1, clips depths 2-24)
    const mask = new Path2D();
    for (const f of chars[4].fills) mask.addPath(buildPath(f.d, null, 0));
    ctx.clip(mask, 'evenodd');

    // sky: band i covers y 0 .. H-(i-1)*H/GRADNUM, higher bands are drawn on top
    for (let i = 1; i <= GRADNUM; i++) {
      const c = state.stripColours[i];
      if (!c) continue;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(0, 0, W, H - (i - 1) * H / GRADNUM);
    }

    if (state.night) drawNight(state.night);
    else if (state.starAlpha > 0) stars.forEach(s => drawStar(s));

    const idCx = IDENT_CX;
    const totality = state.solar ? clamp((state.solar.hidden - 0.98) / 0.02, 0, 1) : 0;
    if (totality) drawCorona(totality);
    ctx.save();
    ctx.globalAlpha = 1 - totality;        // the sun's glare goes out as the last of the disc is covered
    ctx.translate(state.sunX, state.sunY);
    ctx.scale(placed.sun.m[0] * state.sunScale, placed.sun.m[3] * state.sunScale);
    drawSprite(16, clamp(state.sunFrame, 1, 30), idCx, null);
    ctx.restore();

    const mb = state.moonbg;
    if (state.solar) drawMoonSilhouette();
    else {
      ctx.save();
      ctx.translate(state.moonX, state.moonY);
      ctx.scale((state.south && !state.legacy ? -1 : 1) * placed.moon.m[0] * state.moonScale,   // mirrored in the south
        placed.moon.m[3] * state.moonScale);
      drawSprite(72, clamp(state.moonFrame, 1, 57), idCx,
        { moonbg: { mul: [0, 0, 0, 100], add: [mb[0], mb[1], mb[2], 0] } });
      ctx.restore();
    }
    if (state.lunar) drawShadow(state.lunar);
    ctx.restore();

    // corner triangle (depth 26, outside the mask): the SWF paints it in the background colour; here it is cut out
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    drawSprite73();
    ctx.restore();
    if (names !== 'off' && !state.legacy && state.place) drawNames();
    if (clockShown() || clockIcon()) drawClock();
    if (state.note && !state.legacy && state.place) drawNote();
  }
  function drawSprite73() { fillShape(chars[73], 0, IDENT_CX); }

  /* ---------------------------------------------------------------- *
   * Canvas sizing, main loop and keyboard
   * ---------------------------------------------------------------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * H / W); }
  }
  new ResizeObserver(() => { resize(); render(); }).observe(canvas);

  let lastStar = 0, lastCheck = 0, lastFrame = 0;
  function frame(now) {
    let dirty = false;
    if (fastHour !== null) {              // debug clock, advanced smoothly every frame
      if (!paused && !menuOpen) fastHour += (now - lastFrame) / 1000 * rate() / 3600;
      dirty = update() || dirty;
    } else if (!menuOpen && now - lastCheck >= 1000) {
      lastCheck = now;
      dirty = update() || dirty;
    }
    lastFrame = now;
    if (!paused && !menuOpen && now - lastStar >= 1000 / STAR_FPS) { lastStar = now; tickStars(); dirty = true; }
    if (dirty) render();
    requestAnimationFrame(frame);
  }

  // small hook for testing from the console
  window.sunMoon = {
    state, render,
    setMoonDay(d) { state.moonFixed = true; state.moonFrame = Math.round(d % MOON_PERIOD) * 2; render(); },
    setSouth(v) { state.south = v; render(); },
    setPlace(lat, lon) { state.place = { latitude: lat, longitude: lon }; updateSunTimes(); state.ct = null; update(); render(); },
  };

  // hemisphere: a guess from the time zone straight away, refined by the browser's location if allowed
  function updateSunTimes() {            // sunrise / sunset for the visitor's location (if known)
    if (state.legacy || !state.place) return;
    state.sun = SunTimes.times(new Date(clockMs()), state.place.latitude, state.place.longitude);
  }
  // The location is only requested the first time the improved mode is asked for. The scene stays in legacy
  // mode until the lookup ends, so it changes once, straight to the final positions.
  let requested = false, located = false, wantImproved = false, wantEclipse = null;
  function requestLocation() {
    if (requested) return;
    requested = true;
    MoonPhase.locate((south, source, coords) => {
      located = true;
      state.south = south;
      if (coords) state.place = coords;
      if (wantImproved) setLegacy(false);
      if (wantEclipse) jumpToEclipse(...wantEclipse);
    });
  }
  setInterval(updateSunTimes, 60000);   // re-syncs sunrise and sunset every minute

  // M switches between the original SWF animation and the simulation (improved version)
  function setLegacy(legacy) {
    if (state.legacy === legacy) return;
    state.legacy = legacy;
    updateSunTimes(); state.ct = null; update(); updateMoonPhase(true); render();
  }
  function chooseMode(improved) {
    wantImproved = improved;               // switching back during the location lookup cancels it
    if (!improved) wantEclipse = null;
    if (improved && !located) requestLocation();
    else setLegacy(!improved);
  }

  // Up moves to the next speed, from 1x up to a year per second, where it stays. Down steps through them again, back
  // to 1x; the clock carries on from the date and time it has reached. From the speed of an eclipse jump, both move
  // to the nearest step in their direction. R returns to the current date and time at 1x.
  function faster() {
    if (speedStep < 0) setSpeed(SPEEDS.findIndex(([x]) => x > rate()));
    else if (speedStep < SPEEDS.length - 1) setSpeed(speedStep + 1);
  }
  function slower() {
    if (speedStep < 0) setSpeed(SPEEDS.findLastIndex(([x]) => x < rate()));
    else if (speedStep > 0) setSpeed(speedStep - 1);
  }
  function setSpeed(step) {
    const atPresent = fastHour === null;
    if (!atPresent) fastHour = shownHour();
    speedStep = step;
    eclipse = null;
    if (!atPresent) { heldHour = fastHour; return; }   // new speed, carrying on from the time shown
    fastHour = heldHour = hoursToday();
    fastMidnight = new Date().setHours(0, 0, 0, 0);
    state.ct = null; update(); updateMoonPhase(true); render();
  }
  // Pausing holds the clock where it is; on resuming it carries on from there.
  function togglePause() {
    paused = !paused;
    if (fastHour === null) {
      fastHour = hoursToday();
      fastMidnight = new Date().setHours(0, 0, 0, 0);
    }
    state.ct = null; update(); updateMoonPhase(true); render();
  }
  function resetClock() {
    fastHour = null;
    paused = false;
    speedStep = 0;
    eclipse = null;
    wantEclipse = null;
    state.ct = null; update(); updateMoonPhase(true); render();
  }

  // S and L jump to shortly before the next solar or lunar eclipse that can be seen from the visitor's location
  // (switching to the simulation and its equator view), and pressing again moves on to the one after. D and K do
  // the same for total solar and total lunar eclipses, arriving half an hour before totality. With Shift they go
  // back to earlier ones.
  const ECLIPSE_KEYS = { s: ['solar', false], l: ['lunar', false], d: ['solar', true], k: ['lunar', true] };
  function jumpToEclipse(type, totalOnly, step) {
    wantEclipse = located ? null : [type, totalOnly, step];
    if (wantEclipse) { chooseMode(true); return; }     // carries on once the location lookup ends
    if (!state.place) return;                          // eclipses need the location
    chooseMode(true);
    let from = clockMs();
    // move past the eclipse being shown, unless this asks for the totality of one reached as a partial eclipse
    if (eclipse && eclipse.type === type && (eclipse.total || !totalOnly)) from = eclipse.syzygy + step * 86400000;
    const found = NightSky.findEclipse(from, state.place.latitude, state.place.longitude, type, totalOnly, step);
    if (!found) return;
    eclipse = found;
    paused = false;
    speedStep = -1;
    fastMidnight = new Date(found.start).setHours(0, 0, 0, 0);
    fastHour = (found.start - fastMidnight) / 3600000 - (totalOnly ? 1 / 2 : 1 / 6);
    state.view = 'equator';
    state.ct = null; update(); updateMoonPhase(true); render();
  }

  // Shows a short message (top left) for a moment.
  let noteTimer = null;
  function announce(text) {
    state.note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { state.note = ''; render(); }, 2500);
    state.ct = null; update(); render();
  }
  // V moves on to the next view of the real sky, N to the next set of names; with Shift they go back (step -1)
  const cycle = (list, current, step) => list[(list.indexOf(current) + step + list.length) % list.length];
  function toggleView(step) {
    state.view = cycle(Object.keys(VIEWS), state.view, step);
    announce(VIEWS[state.view]);
  }
  function toggleDayNames() {
    dayNames = !dayNames;
    announce(dayNames ? (names === 'off' ? 'Daytime names on (press N)' : 'Daytime names on') : 'Daytime names off');
  }
  function toggleNames(step) {
    names = cycle(Object.keys(NAME_SETS), names, step);
    announce(NAME_SETS[names]);
  }

  // The (i) button, which appears while the mouse is over the display, opens the keyboard shortcuts at their first
  // page, turns to the next page with each further click, and closes them after the last.
  const info = document.querySelector('.info');
  let page = 0;
  info.addEventListener('click', () => {
    const display = info.parentNode, pages = display.querySelectorAll('.keys .page');
    page = menuOpen ? page + 1 : 0;
    menuOpen = page < pages.length;
    if (menuOpen) pages.forEach((p, i) => p.classList.toggle('current', i === page));
    display.classList.toggle('show-keys', menuOpen);
    info.setAttribute('aria-expanded', menuOpen);
  });

  // C shows or hides the date and time
  function toggleClock() {
    clockChoice = !clockShown();
    render();
  }

  /* ---------------------------------------------------------------- *
   * Settings kept in the browser: the simulation, the sky view, the names and whether the date and time show
   * ---------------------------------------------------------------- */
  const SETTINGS_KEY = 'sun-moon-settings', SETTING_KEYS = ['m', 'v', 'n', 'y', 'c'];
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(
        { simulation: wantImproved, view: state.view, names, dayNames, clock: clockChoice }));
    } catch { /* storage is unavailable or full: the settings last only as long as the page */ }
  }
  // Applies what was saved, ignoring anything missing or unrecognised. A saved simulation asks for the location.
  function restoreSettings() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch { return; }
    if (!saved) return;
    if (Object.hasOwn(VIEWS, saved.view)) state.view = saved.view;
    if (Object.hasOwn(NAME_SETS, saved.names)) names = saved.names;
    dayNames = saved.dayNames === true;
    if (typeof saved.clock === 'boolean') clockChoice = saved.clock;
    if (saved.simulation === true) chooseMode(true);
  }

  document.addEventListener('keydown', e => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const jump = ECLIPSE_KEYS[key];
    // leave browser shortcuts alone; Shift reverses the eclipse, view and name keys and means nothing with others
    if (e.altKey || e.ctrlKey || e.metaKey || (e.shiftKey && !jump && key !== 'v' && key !== 'n')) return;
    const step = e.shiftKey ? -1 : 1;
    if (key === 'ArrowUp') faster();
    else if (key === 'ArrowDown') slower();
    else if (key === 'm') chooseMode(!wantImproved);
    else if (key === 'v') toggleView(step);
    else if (key === 'n') toggleNames(step);
    else if (key === 'y') toggleDayNames();
    else if (key === 'r') resetClock();
    else if (key === 'c') toggleClock();
    else if (key === ' ') { if (!e.repeat) togglePause(); }
    else if (jump) jumpToEclipse(...jump, step);
    else return;
    if (SETTING_KEYS.includes(key)) saveSettings();
    e.preventDefault();
  });

  resize();
  update();
  restoreSettings();
  state.ct = null; update();
  render();
  requestAnimationFrame(frame);
})();
