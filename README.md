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
- **Live 3D body model** — a rotatable anatomical figure rebuilt from your
  measurements as you type, filling any blank field with an
  average-proportion estimate so the figure is always complete. Regions
  are coloured by how much real data backs them (measured / partially
  measured / estimated).
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
- `app.js` — state, unit conversion, ratio/shape analysis, size lookup
  tables, fit checker
- `body3d.js` — the 3D body: signed-distance field, marching cubes
  polygonizer, scene and camera
- `vendor/three/` — three.js, OrbitControls and the marching cubes lookup
  tables, vendored locally (MIT) so the page has no external runtime
  dependency

## How the 3D model works

The body is a signed distance field rather than a set of separate meshes.
Anatomical primitives — a swept-ellipse torso whose width, depth and centre
glide along a curved spine, tapered cones for limbs, plus glutes, deltoids,
calves, neck, head, hands and feet — are combined with a *smooth* minimum,
so joints fillet into one another instead of reading as tubes jammed
together. That field is then polygonized with marching cubes into a single
continuous surface, which is why there are no seams anywhere on the model.

Cross-sections are elliptical, not circular: a real torso is markedly
flatter front-to-back than it is wide, and the per-region depth:width
ratios are what make the silhouette read as a body. Circumference
measurements are converted to ellipse axes by inverting Ramanujan's
perimeter approximation.

Rebuilds are debounced and the voxel resolution adapts to how long the last
build took, so slower devices stay responsive rather than dropping frames.

## Notes on accuracy

The figure is a proportion visualizer, not a medically accurate model. It
reproduces the circumferences and lengths you enter, but the depth:width
ratio of each cross-section, the spinal curve, and the shape of the head,
hands and feet come from population averages — a tape measure cannot
capture those, and they vary from person to person. Anything the model
shows that you did not measure is an inference, which is what the
measured / estimated colouring is there to make obvious.

The size charts are generic references, not any specific brand's chart;
brand sizing varies significantly, which is exactly why the garment fit
checker (comparing actual flat measurements) is the more reliable tool for
a specific purchase decision.
