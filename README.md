# Body Measurement Model

A parametric body model driven by your own tape measurements. Runs entirely
client-side (no server, no accounts) — open `index.html` in a browser, or
serve the folder with any static file server.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## What it does

- **Measurement input** — height, neck, shoulders, chest/bust, waist, hip,
  torso length, arm/sleeve length, bicep, wrist, rise, inseam, thigh, calf,
  ankle. Values persist in `localStorage`; nothing leaves the browser.
- **Live proportion figure** — a schematic front-view SVG figure that
  redraws as you type, filling any blank field with an average-proportion
  estimate so the figure is always complete.
- **Ratios & shape** — waist-to-hip ratio, chest–waist drop, shoulder-to-hip
  ratio, leg-to-height ratio, arm-to-height ratio, torso-to-leg ratio, and a
  heuristic body-shape label (hourglass / pear / apple / rectangle /
  inverted triangle).
- **Size estimate** — generic alpha sizes (women's and men's cuts), dress
  shirt collar size, suit jacket size + length, and waist×inseam pant size.
  These are approximations — always check a brand's own chart when one is
  available.
- **Garment fit checker** — the most useful part for thrifting: enter a
  listing's *flat* measurements (garment laid flat, edge to edge) and your
  desired ease, and it tells you whether the chest/waist/hip, shoulder,
  sleeve, rise and inseam will run tight, good, or loose against your body
  — the reliable way to buy secondhand items with no size tag guarantee.
- Unit toggle (cm/in), JSON export/import for backup, reset.

## Files

- `index.html` — structure
- `style.css` — styling (dark theme)
- `app.js` — all logic: state, unit conversion, SVG rendering, ratio/shape
  analysis, size lookup tables, fit checker

## Notes on accuracy

The figure is a schematic proportion visualizer, not an anatomical model —
circumferences are converted to front-view widths with a fixed factor, which
is a simplification of real (elliptical, individual-varying) body
cross-sections. The size charts are generic references, not any specific
brand's chart; brand sizing varies significantly, which is exactly why the
garment fit checker (comparing actual flat measurements) is the more
reliable tool for a specific purchase decision.
