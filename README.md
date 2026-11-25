# Sun and moon

A header animation showing the sun and moon crossing the sky: a port of `beehive_header.swf` to the web, with an
optional simulation of the real sky where you are.

## Branches

The same animation is built two ways, one on each branch.

| Branch | Version | How it draws |
|---|---|---|
| `main` | CSS | An SVG animated with CSS. The original animation at the present time is pure CSS; a script drives the sped-up clock and the simulation. |
| `JavaScript` | JavaScript | A canvas, drawn from the vector artwork in `swf-data.js`. |

The sky calculations and data (`moon-phase.js`, `night-sky.js`, `sun-times.js`, `sky-data.js` and `sky-names.js`)
are kept on both branches, so a change to one of them needs applying to the other, for example with
`git cherry-pick`.

To have both versions checked out side by side:

```bash
git worktree add ../sun-and-moon-js JavaScript
```

## Running it

There is nothing to build: open `index.html` in a browser.

On the `main` branch, `index.html?day=90` plays a demo day lasting 90 seconds.

## Using it

It starts with the original animation at the present time. **M** switches to the simulation, which asks for your
location and then shows the real sun, moon, stars and planets, including eclipses. The location is only used in the
browser and is not sent anywhere. Times are shown in your computer's time zone, which should match your location.

Hover over the animation and click the **(i)** to see the shortcuts on screen. Each click turns the page, and a click
on the last page closes them. The animation pauses while they are open.

## Keyboard shortcuts

### Time

| Key | Action |
|---|---|
| <kbd>↑</kbd> | Speed up time |
| <kbd>↓</kbd> | Slow down time |
| <kbd>Space</kbd> | Pause or resume |
| <kbd>R</kbd> | Reset to the present date and time, at normal speed |
| <kbd>C</kbd> | Show or hide the date and time |

The speeds are 1×, then 10 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours, 1 day, 1 week, 1 month and
1 year per second. Above 1 day per second the time of day is held and only the date moves on, so that day and night
don't flash past. Slowing back to 1× keeps the date and time reached.

**>>** shows while time is sped up, and a blinking **||** while it is paused.

### Sky

| Key | Action | With <kbd>Shift</kbd> |
|---|---|---|
| <kbd>M</kbd> | Switch the simulation on or off | |
| <kbd>V</kbd> | Next viewing angle | Previous viewing angle |
| <kbd>N</kbd> | Next set of names: planets, stars, all, off | Previous set |
| <kbd>Y</kbd> | Show names in daytime too | |

<kbd>V</kbd>, <kbd>N</kbd> and <kbd>Y</kbd> take effect in the simulation, once your location is known.

| Viewing angle | Shows |
|---|---|
| Facing the equator | 180° along the horizon, up to the point overhead |
| Straight up | The sky overhead |
| Sun path | The sun's whole route for the day |
| Tilted to the midday sun | Centred on the height of the midday sun |
| Raised horizon | Facing the equator, with room for the sun's whole disc on the horizon |

### Eclipses

| Key | Jumps to the next | With <kbd>Shift</kbd> |
|---|---|---|
| <kbd>S</kbd> | Solar eclipse | Previous one |
| <kbd>L</kbd> | Lunar eclipse | Previous one |
| <kbd>D</kbd> | Total solar eclipse | Previous one |
| <kbd>K</kbd> | Total lunar eclipse | Previous one |

These switch to the simulation and choose eclipses you could watch from your location, looking towards the equator.
The search covers 20 years; if there is none, nothing happens, which is common for total solar eclipses.

## Saved settings

The browser remembers whether the simulation is on, the viewing angle, the names, daytime names and whether the date
and time show. If the simulation was left on, your location is requested when the page loads.

## Licence

Copyright (C) 2026 Matt Beale

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text of the
GNU General Public License.

The third party data and icon credited below keep their own licences.

## Credits

- Artwork and behaviour ported from `beehive_header.swf`.
- Star, star name and constellation data from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn
  (BSD 3-Clause; the notice is in `sky-data.js` and `sky-names.js`).
- Icon from [Tabler Icons](https://tabler.io/icons) (MIT).
