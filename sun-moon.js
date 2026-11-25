/*
 * Sun / moon header: the script behind the CSS version.
 *
 * Two ways of running:
 *   - the original animation at the real time is pure CSS: seed() only sets CSS variables from the clock;
 *   - while the clock is sped up, and in the simulation, the script owns the clock ("driven"). The CSS animations
 *     are paused and positioned through the same variables, so they still do the colouring, and the script places
 *     whatever CSS cannot: the real sun, moon, stars and planets, eclipses and the date.
 *
 * Keys: Up / Down speed the clock up and down, R returns it to the current date and time, Space pauses it, M switches between the
 * original SWF animation and the simulation (the first time, the browser is asked for the location), V rotates
 * through the sky views, N rotates through names (planets, stars, all), Y shows them by
 * day too, S / L jump to the next solar / lunar eclipse visible from the location,
 * D / K to the next total solar / lunar one, and with Shift to the previous one (Shift+V and Shift+N step back too). ?day=90 gives a demo day in the
 * original animation.
 */
(function () {
  'use strict';

  const W = 400, H = 60;
  const MOON_EPOCH = new Date(2001, 9, 16);  // new moon used by the SWF (original animation)
  // Clock speeds as [multiple of real time, name shown]: the real rate, then amounts of time per second.
  const HOUR = 3600, DAY = 24 * HOUR;
  const SPEEDS = [[1, '1\u00d7'], [600, '10 min/s'], [1800, '30 min/s'], [HOUR, '1 hour/s'], [3 * HOUR, '3 hours/s'],
                  [6 * HOUR, '6 hours/s'], [12 * HOUR, '12 hours/s'], [DAY, '1 day/s'], [7 * DAY, '1 week/s'],
                  [30.4375 * DAY, '1 month/s'], [365.25 * DAY, '1 year/s']];
  const ECLIPSE_SPEED = 600, TOTALITY_SPEED = 60;        // after jumping to an eclipse: 10 minutes, then 1, per second
  // Disc radii of the artwork in stage units, and the radius given to a body of the sun's average apparent size.
  const SUN_ART = 15.2, MOON_ART = 15, DISC = 15.1, MEAN_SUN = 0.533;
  const UNITS = DISC / (MEAN_SUN / 2);       // stage units per degree at the scale the discs are drawn

  const root = document.documentElement;
  const find = selector => document.querySelector(selector);
  const el = {
    sun: find('.sun'), sunSize: find('.sun .size'), moon: find('.moon'), moonSize: find('.moon .size'),
    stars: find('.stars'), night: find('.night'), dim: find('.dim'), corona: find('.corona'),
    silhouette: find('.silhouette'), shadow: find('.shadow'), clock: find('.clock'), state: find('.state-icon'), note: find('.note'), names: find('.names'),
  };
  const demo = /[?&]day=(\d+)/.exec(location.search);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const state = {
    legacy: true, south: false, place: null, view: 'equator',
    sunX: 0, sunY: 0, moonX: 0, moonY: 0, sunScale: 1, moonScale: 1, starAlpha: 0,
    solar: null, lunar: null, night: null,
  };
  let fastHour = null;                       // changed clock: hours since fastMidnight; null = the present
  let fastMidnight = 0;
  let speedStep = 0;                         // index into SPEEDS; -1 = the eclipse speed after jumping to one
  let paused = false;                        // Space stops and restarts the clock
  let clockChoice = null;                    // the C key: true shows the date and time, false hides them
  let menuOpen = false;                      // the shortcut pages are showing, which also holds the animation
  // N rotates through what is labelled in the sky (simulation with a known location)
  const NAME_SETS = { off: 'Names off', planets: 'Planet names', stars: 'Star names', all: 'All names' };
  let names = 'off';
  let dayNames = false;                      // Y names things in daylight too, marking them faintly
  const DAY_FAINTNESS = 45;                  // how strongly (percent) things are then marked
  const namingByDay = () => dayNames && names !== 'off';
  // By day only the things being named are marked.
  const namedOnly = view => ({ stars: names === 'planets' ? [] : view.stars, planets: names === 'stars' ? [] : view.planets,
                              constellations: view.constellations });
  let eclipse = null;                        // the eclipse last jumped to, while its clock is running
  let requested = false, located = false, wantImproved = false, wantEclipse = null;

  const driven = () => fastHour !== null || !state.legacy;
  const placed = () => !state.legacy && state.place !== null;
  const clockMs = () => fastHour === null ? Date.now() : fastMidnight + shownHour() * 3600000;
  function clockHour() {
    const d = new Date(clockMs());
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /* ---------------------------------------------------------------- *
   * CSS variables and animations
   * ---------------------------------------------------------------- */
  const setVar = (name, value) => root.style.setProperty(name, value);
  // Real phase, or the SWF's whole days since a 2001 new moon (which it always takes from today's date).
  function setPhase() {
    const age = state.legacy ? Math.round(Math.floor((new Date() - MOON_EPOCH) / 864e5) % MoonPhase.SYNODIC)
      : MoonPhase.age(new Date(clockMs()));
    setVar('--moon-idx', age / MoonPhase.SYNODIC * 59 + 0.5);
  }
  // The clock position, as the hour on the artwork's 07:00-19:00 schedule (with a known location the simulation
  // maps the real sunrise and sunset onto it).
  function designHour() {
    const t = clockHour();
    return SunTimes.design(t, placed() ? SunTimes.times(new Date(clockMs()), state.place.latitude, state.place.longitude) : null);
  }
  function setHour(hour) {
    setVar('--start-hour', hour);
    setVar('--moon-start', (hour + 12) % 24);   // opposite the sun; a real moon is placed by draw()
  }
  // Changing a delay on a running animation keeps its old start time, so every clock is put back to 0: its
  // position is then exactly what the variables say.
  function restartClocks() {
    if (!document.getAnimations) return;
    document.getAnimations().forEach(a => { if (a.animationName !== 'twinkle') a.currentTime = 0; });
  }
  // Applies a change of mode, speed or view: sets the classes and variables, then starts the clocks afresh.
  function refresh() {
    root.classList.toggle('improved', !state.legacy);
    root.classList.toggle('south', state.south && !state.legacy);
    root.classList.toggle('driven', driven());
    root.classList.toggle('located', placed());
    root.classList.toggle('paused', paused);
    setVar('--day', driven() ? '24s' : demo ? demo[1] + 's' : '86400s');
    if (driven()) draw();
    else { clearDrawing(); setHour(clockHour()); setPhase(); drawClock(); }
    show(el.note, noteShowing && placed());
    restartClocks();
  }

  /* ---------------------------------------------------------------- *
   * Drawing (driven mode)
   * ---------------------------------------------------------------- */
  const NS = 'http://www.w3.org/2000/svg';
  function make(tag, attributes, parent) {
    const node = document.createElementNS(NS, tag);
    for (const name in attributes) node.setAttribute(name, attributes[name]);
    if (parent) parent.appendChild(node);
    return node;
  }
  const show = (node, visible) => { node.style.display = visible ? 'inline' : 'none'; };
  const translate = (node, x, y) => { node.style.transform = `translate(${x}px,${y}px)`; };

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
  // Real positions of the sun and moon. When the two are close the moon is placed relative to the sun at the scale
  // of the discs, so they overlap exactly when they really do; further apart it eases back to its own place.
  function placeBodies() {
    const real = NightSky.sunAndMoon(clockMs(), state.place.latitude, state.place.longitude);
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

    const sh = real.shadow;
    if (sh.separation < sh.penumbra + real.moonDiameter / 2) {
      const [ux, uy] = direction(sh.moon, sh.centre), d = sh.separation * UNITS;
      state.lunar = { dx: ux * d, dy: uy * d, umbra: sh.umbra * UNITS, penumbra: sh.penumbra * UNITS };
    }
    return { sun: real.sunDiameter, moon: real.moonDiameter };
  }

  // Stars fade in at dusk and out at dawn (design hours).
  function starFade(ct) {
    if (ct >= 8 && ct <= 16) return 0;
    if (ct > 16 && ct < 19) return 100 - (19 - ct) / 3 * 100;
    if (ct > 6.5 && ct < 8) return (8 - ct) / 1.5 * 100;
    return 100;
  }

  /* real stars and planets: elements are made once and reused */
  const PLANET_COLOURS = { mercury: '#d8c8b0', venus: '#fffae1', mars: '#ff8050', jupiter: '#ffdcaa', saturn: '#ecd080' };
  const dots = [], twinklers = [];
  const dotGroup = make('g', {}, el.night), twinkleGroup = make('g', {}, el.night), planetGroup = make('g', {}, el.night);
  const planetDots = {};
  for (const name in PLANET_COLOURS) planetDots[name] = make('circle', { fill: PLANET_COLOURS[name] }, planetGroup);
  function twinkler(id) {                    // the brightest stars keep the SWF's four-point twinkle
    if (!twinklers[id]) {
      const g = make('g', { class: 'star', opacity: 0.6 }, twinkleGroup);
      g.style.setProperty('--tw', 11 + id * 7 % 23 + 's');
      g.style.setProperty('--td', -(id * 5 % 11));
      for (const d of ['M0-4 .75 0 0 4-.75 0Z', 'M-4 0 0-.75 4 0 0 .75Z']) make('path', { class: 'arm', d }, g);
      twinklers[id] = g;
    }
    return twinklers[id];
  }
  function drawNight(night) {
    twinklers.forEach(g => show(g, false));
    night.stars.forEach((s, i) => {
      const dot = dots[i] || (dots[i] = make('circle', {}, dotGroup));
      const x = s.x * W, y = s.y * H;
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('r', clamp(1.15 - s.mag * 0.18, 0.45, 1.35));
      dot.setAttribute('fill', s.bv < 0 ? '#c8d8ff' : s.bv > 1 ? '#ffd6aa' : '#fff');
      dot.setAttribute('opacity', clamp(1 - s.mag * 0.12, 0.5, 1));
      show(dot, true);
      if (s.mag < 1.5) { const g = twinkler(s.id); translate(g, x, y); show(g, true); }
    });
    for (let i = night.stars.length; i < dots.length; i++) show(dots[i], false);
    for (const name in planetDots) show(planetDots[name], false);
    // planets shine steadily, a little larger than stars of the same brightness
    for (const p of night.planets) {
      const dot = planetDots[p.name];
      dot.setAttribute('cx', p.x * W); dot.setAttribute('cy', p.y * H);
      dot.setAttribute('r', clamp(1.3 - p.mag * 0.15, 0.7, 1.7));
      show(dot, true);
    }
  }

  // The earth's shadow across the moon: a faint grey penumbra, and a coppery umbra lit by the earth's atmosphere.
  function drawShadow({ dx, dy, umbra, penumbra }) {
    const part = name => el.shadow.querySelector('.' + name), x = state.moonX + dx, y = state.moonY + dy;
    const circle = (node, cx, cy, r) => { node.setAttribute('cx', cx); node.setAttribute('cy', cy); node.setAttribute('r', r); };
    circle(find('#moonclip circle'), state.moonX, state.moonY, MOON_ART * state.moonScale + 0.3);
    circle(part('penumbra'), x, y, penumbra);
    circle(part('umbra'), x, y, umbra + 2);
    find('#penumbra-fill stop').setAttribute('offset', umbra / penumbra);
    find('#umbra-fill .rim').setAttribute('offset', (umbra - 3) / (umbra + 2));
  }

  const DATE_FORMAT = new Intl.DateTimeFormat('en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

  // Names of the sun, moon, planets, bright stars and constellations (text elements are made once and reused).
  const nameTexts = [];
  function drawNames() {
    const bodies = [{ text: 'Sun', x: state.sunX, y: state.sunY, r: SUN_ART * state.sunScale }];
    if (!state.solar) bodies.push({ text: 'Moon', x: state.moonX, y: state.moonY, r: MOON_ART * state.moonScale });
    const reserved = [];
    if (clockShown()) reserved.push([W - 251, 0, 251, 14]);   // the clock
    else if (clockIcon()) reserved.push([W - 18, 0, 18, 14]);   // or just its symbol
    if (noteShowing) reserved.push([0, 0, 180, 14]);
    const labels = NightSky.labels(bodies, state.starAlpha > 30 || namingByDay() ? state.night : null, reserved, names);
    labels.forEach((l, i) => {
      const text = nameTexts[i] || (nameTexts[i] = make('text', {}, el.names));
      text.textContent = l.text;
      text.setAttribute('class', l.kind);
      text.setAttribute('x', l.x); text.setAttribute('y', l.y);
      text.style.fontSize = l.size + 'px';
      text.style.opacity = l.kind === 'body' || namingByDay() ? 1 : state.starAlpha / 100;
      show(text, true);
    });
    for (let i = labels.length; i < nameTexts.length; i++) show(nameTexts[i], false);
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
    const shown = clockShown(), icon = clockIcon();
    show(el.clock, shown);
    if (shown) el.clock.textContent = clockText();
    show(el.state, icon !== null);
    el.state.classList.toggle('blink', icon === ICONS.pause);
    // the symbol goes before the date and time, or against the right edge when they are hidden
    if (icon) el.state.setAttribute('d', icon.path((shown ? el.clock.getBBox().x - 5 : W - 4) - icon.width, 4.5));
  }

  function draw() {
    const ct = designHour();
    setHour(ct);
    setPhase();
    state.solar = state.lunar = null;
    state.night = null;

    let size = null;
    if (placed()) size = placeBodies();
    else if (!state.legacy) size = NightSky.diameters(clockMs());
    state.sunScale = size ? DISC / SUN_ART * size.sun / MEAN_SUN : 1;
    state.moonScale = size ? DISC / MOON_ART * size.moon / MEAN_SUN : 1;
    el.sunSize.style.transform = `scale(${state.sunScale})`;
    el.moonSize.style.transform = `scale(${state.moonScale})`;
    if (placed()) {
      translate(el.sun, state.sunX, state.sunY);
      translate(el.moon, state.moonX, state.moonY);
    } else el.sun.style.transform = el.moon.style.transform = '';

    // the sky only darkens noticeably as a solar eclipse nears totality; then the stars come out
    const dim = state.solar && state.solar.up ? state.solar.hidden ** 4 : 0;
    state.starAlpha = Math.max(starFade(ct), clamp((dim - 0.7) / 0.3, 0, 1) * 100);
    el.dim.style.opacity = dim * 0.9;
    const skyAlpha = Math.max(state.starAlpha, namingByDay() ? DAY_FAINTNESS : 0);
    if (placed() && skyAlpha > 0) {
      state.night = NightSky.view(clockMs(), state.place.latitude, state.place.longitude, state.view);
      if (state.starAlpha === 0) state.night = namedOnly(state.night);
      drawNight(state.night);
    }
    show(el.night, state.night !== null);
    el.night.style.opacity = skyAlpha / 100;

    const totality = state.solar ? clamp((state.solar.hidden - 0.98) / 0.02, 0, 1) : 0;
    show(el.corona, totality > 0);
    el.corona.style.opacity = totality;
    el.corona.setAttribute('cx', state.sunX); el.corona.setAttribute('cy', state.sunY);
    el.corona.setAttribute('r', SUN_ART * state.sunScale * 2.6);
    el.sun.style.opacity = 1 - totality;        // the sun's glare goes out as the last of the disc is covered
    show(el.silhouette, state.solar !== null);  // the new moon in front of the sun: a dark disc
    el.silhouette.setAttribute('cx', state.moonX); el.silhouette.setAttribute('cy', state.moonY);
    el.silhouette.setAttribute('r', MOON_ART * state.moonScale);
    el.moon.style.visibility = state.solar ? 'hidden' : '';
    show(el.shadow, state.lunar !== null);
    if (state.lunar) drawShadow(state.lunar);

    show(el.names, names !== 'off' && placed());
    if (names !== 'off' && placed()) drawNames();

    drawClock();
  }

  // Removes everything draw() added, leaving the pure CSS animation.
  function clearDrawing() {
    for (const node of [el.night, el.corona, el.silhouette, el.shadow, el.clock, el.state, el.note, el.names]) show(node, false);
    for (const node of [el.sun, el.moon, el.sunSize, el.moonSize]) node.style.transform = '';
    el.sun.style.opacity = el.moon.style.visibility = '';
    el.dim.style.opacity = 0;
    state.solar = state.lunar = state.night = null;
  }

  /* ---------------------------------------------------------------- *
   * Controls
   * ---------------------------------------------------------------- */
  function setLegacy(legacy) {
    if (state.legacy === legacy) return;
    state.legacy = legacy;
    refresh();
  }
  // The location is only requested the first time the simulation is asked for. The scene stays in the original
  // animation until the lookup ends, so it changes once, straight to the final positions.
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
  function chooseMode(improved) {
    wantImproved = improved;                 // switching back during the location lookup cancels it
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
    if (!atPresent) { heldHour = fastHour; draw(); return; }   // new speed, carrying on from the time shown
    fastHour = heldHour = hoursToday();
    fastMidnight = new Date().setHours(0, 0, 0, 0);
    refresh();
  }
  // Pausing holds the clock where it is; on resuming it carries on from there.
  function togglePause() {
    paused = !paused;
    if (fastHour === null) {
      fastHour = hoursToday();
      fastMidnight = new Date().setHours(0, 0, 0, 0);
    }
    refresh();
  }
  function resetClock() {
    fastHour = null;
    paused = false;
    speedStep = 0;
    eclipse = null;
    wantEclipse = null;
    refresh();
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
    refresh();
  }

  // Shows a short message (top left) for a moment.
  let noteTimer = null, noteShowing = false;
  function announce(message) {
    el.note.textContent = message;
    noteShowing = true;
    refresh();
    show(el.note, placed());
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { noteShowing = false; show(el.note, false); if (driven()) draw(); }, 2500);
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
    if (!menuOpen && !driven()) refresh();   // the pure CSS animation catches up with the real time
  });

  // C shows or hides the date and time
  function toggleClock() {
    clockChoice = !clockShown();
    if (driven()) draw(); else drawClock();
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

  /* ---------------------------------------------------------------- *
   * Clocks
   * ---------------------------------------------------------------- */
  let lastFrame = null, lastDraw = 0;
  function frame(now) {
    const elapsed = lastFrame === null ? 0 : (now - lastFrame) / 1000;
    lastFrame = now;
    if (fastHour !== null) {
      // the open menu pauses the animation, as does a preference for reduced motion
      if (!paused && !menuOpen && !reducedMotion.matches) {
        fastHour += elapsed * rate() / 3600;
        draw();
      }
    } else if (!menuOpen && now - lastDraw >= 1000) {
      lastDraw = now;
      if (state.legacy) drawClock(); else draw();
    }
    requestAnimationFrame(frame);
  }
  // the sun runs at a slightly different speed by day and night, so the pure CSS animation re-syncs every minute
  setInterval(() => { if (!driven() && !menuOpen) refresh(); }, 60000);

  window.sunMoon = { state };              // small hook for testing from the console
  restoreSettings();
  refresh();
  requestAnimationFrame(frame);
})();
