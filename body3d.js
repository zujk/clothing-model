import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { edgeTable, triTable } from "./vendor/three/marchingCubesTables.js";

/* =====================================================================
 * Parametric anatomical body — single continuous surface.
 *
 * The body is defined as a signed distance field: a set of anatomical
 * primitives (swept-ellipse torso, tapered limb cones, glutes, deltoids,
 * neck, head, hands, feet) combined with a *smooth* minimum, so joints
 * blend into one another the way flesh does instead of reading as
 * separate tubes jammed together. That field is then polygonized with
 * marching cubes into one watertight mesh, which is why there are no
 * seams anywhere on the model.
 *
 * Every dimension is derived from the user's tape measurements.
 * ===================================================================== */

const CM = 0.01; // centimeters -> meters

/* ---------------------------------------------------------------------
 * SDF primitives (scalar, allocation-free — these run millions of times)
 * ------------------------------------------------------------------- */

// Polynomial smooth minimum. k is the blend radius in meters: bigger k
// means a softer, more gradual fillet where two body parts meet.
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Inigo Quilez's round-cone (tapered capsule): the workhorse for limbs,
// giving a limb that smoothly changes circumference along its length.
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;

  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;

  const xx = pax * l2 - bax * y;
  const xy = pay * l2 - bay * y;
  const xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;

  const k = (rr < 0 ? -1 : rr > 0 ? 1 : 0) * rr * rr * x2;
  if ((z < 0 ? -1 : z > 0 ? 1 : 0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if ((y < 0 ? -1 : y > 0 ? 1 : 0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k1 = Math.sqrt(ax * ax + ay * ay + az * az);
  return (k0 * (k0 - 1)) / k1;
}

/* ---------------------------------------------------------------------
 * Body definition built from measurements
 * ------------------------------------------------------------------- */

// Depth (front-to-back) as a fraction of width, per region. Humans are
// not cylinders — a torso is markedly flatter front-to-back than it is
// wide, and this is what makes the silhouette read as a body.
const DEPTH_RATIO = {
  hip: 0.68, waist: 0.74, chest: 0.68, shoulder: 0.62,
  neck: 0.88, bicep: 0.94, forearm: 0.9, wrist: 0.72,
  thigh: 0.9, knee: 0.85, calf: 0.88, ankle: 0.72,
};

// Circumference -> ellipse semi-axes, inverting Ramanujan's perimeter
// approximation P ≈ π(a+b) for a fixed depth:width ratio.
function axesFromCircumference(circCm, depthRatio) {
  const a = (circCm * CM) / (Math.PI * (1 + depthRatio));
  return { rx: a, rz: a * depthRatio };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const LUT_N = 160;

// Turns the measurement set into a complete solid description: landmark
// heights, a smooth torso profile lookup table, and limb joint positions.
function buildBodySpec(m) {
  const H = m.height * CM;

  const yCrotch = m.inseam * CM;
  const rise = m.rise * CM;
  const yWaist = yCrotch + rise;
  const ySeat = yCrotch + rise * 0.45;
  const torsoLen = m.torso * CM;
  const yShoulder = yWaist + torsoLen;
  const yChest = yWaist + torsoLen * 0.60;

  // Whatever height is left above the shoulder line has to cover neck +
  // head. Keep the neck short so the head gets a believable share of it.
  const neckLen = clamp((H - yShoulder) * 0.26, 0.025, 0.075);
  const yNeckTop = yShoulder + neckLen;
  const headH = clamp(H - yNeckTop, 0.085 * H, 0.20 * H);

  const hipA = axesFromCircumference(m.hip, DEPTH_RATIO.hip);
  const waistA = axesFromCircumference(m.waist, DEPTH_RATIO.waist);
  const chestA = axesFromCircumference(m.chest, DEPTH_RATIO.chest);
  const neckA = axesFromCircumference(m.neck, DEPTH_RATIO.neck);
  const shoulderHalf = (m.shoulder * CM) / 2;

  // Torso profile control points: (y, half-width, half-depth, z-offset).
  // The z-offsets are a gentle spinal S-curve — seat back, lumbar
  // forward, chest back — which reads far more human than a straight axis.
  const ctrl = [
    { y: yCrotch - 0.02, rx: hipA.rx * 0.80, rz: hipA.rz * 0.86, cz: -0.004 },
    { y: ySeat, rx: hipA.rx, rz: hipA.rz, cz: -0.010 },
    { y: yWaist, rx: waistA.rx, rz: waistA.rz, cz: 0.006 },
    { y: yChest, rx: chestA.rx, rz: chestA.rz, cz: -0.004 },
    { y: yShoulder, rx: shoulderHalf * 0.70, rz: chestA.rz * 0.92, cz: -0.010 },
  ];

  const yBase = ctrl[0].y;
  const yTop = ctrl[ctrl.length - 1].y;
  const rxLUT = new Float32Array(LUT_N);
  const rzLUT = new Float32Array(LUT_N);
  const czLUT = new Float32Array(LUT_N);
  const ys = ctrl.map((c) => c.y);

  // Resample the control points into a dense LUT so the per-voxel inner
  // loop is a cheap array lookup instead of a spline evaluation.
  for (let i = 0; i < LUT_N; i++) {
    const y = yBase + ((yTop - yBase) * i) / (LUT_N - 1);
    let seg = 0;
    while (seg < ctrl.length - 2 && y > ys[seg + 1]) seg++;
    const span = ys[seg + 1] - ys[seg];
    const t = span > 1e-6 ? clamp((y - ys[seg]) / span, 0, 1) : 0;
    const i0 = Math.max(0, seg - 1), i1 = seg, i2 = seg + 1, i3 = Math.min(ctrl.length - 1, seg + 2);
    rxLUT[i] = catmullRom(ctrl[i0].rx, ctrl[i1].rx, ctrl[i2].rx, ctrl[i3].rx, t);
    rzLUT[i] = catmullRom(ctrl[i0].rz, ctrl[i1].rz, ctrl[i2].rz, ctrl[i3].rz, t);
    czLUT[i] = catmullRom(ctrl[i0].cz, ctrl[i1].cz, ctrl[i2].cz, ctrl[i3].cz, t);
  }

  // ---- Arms: A-pose with a natural slight elbow bend --------------
  const bicepA = axesFromCircumference(m.bicep, DEPTH_RATIO.bicep);
  const wristA = axesFromCircumference(m.wrist, DEPTH_RATIO.wrist);
  const foreCirc = m.bicep * 0.52 + m.wrist * 0.48;
  const elbowA = axesFromCircumference(foreCirc * 0.98, DEPTH_RATIO.forearm);

  const armLen = m.sleeve * CM;
  const upperLen = armLen * 0.46;
  const foreLen = armLen * 0.54;
  const shoulderDrop = neckLen * 0.35;

  // Arm roots sit inboard of the measured shoulder point, so that once
  // the deltoid cap is blended on, the outer silhouette lands on the
  // shoulder width the user actually measured.
  const deltoidR = shoulderHalf * 0.28;
  const shX = shoulderHalf - deltoidR * 1.02;
  const shY = yShoulder - shoulderDrop;
  const upA = (10 * Math.PI) / 180; // arm out from vertical
  const elX = shX + Math.sin(upA) * upperLen;
  const elY = shY - Math.cos(upA) * upperLen;
  const foA = (14 * Math.PI) / 180;
  const wrX = elX + Math.sin(foA) * foreLen;
  const wrY = elY - Math.cos(foA) * foreLen;
  const wrZ = 0.022; // forearms carry slightly forward

  // ---- Legs -------------------------------------------------------
  const thighA = axesFromCircumference(m.thigh, DEPTH_RATIO.thigh);
  const calfA = axesFromCircumference(m.calf, DEPTH_RATIO.calf);
  const ankleA = axesFromCircumference(m.ankle, DEPTH_RATIO.ankle);
  const kneeA = axesFromCircumference(m.thigh * 0.42 + m.calf * 0.58, DEPTH_RATIO.knee);

  const legLen = yCrotch;
  const yKnee = legLen * 0.505;
  const yCalfMax = legLen * 0.72;
  const yAnkle = legLen * 0.055;
  // Legs converge only slightly from hip to ankle. Pulling the knees far
  // inboard (as a naive taper does) makes the two legs merge into one
  // column, which is what kills the silhouette.
  const hipX = hipA.rx * 0.48;
  const kneeX = hipX * 0.92;
  const ankleX = hipX * 0.80;

  const footLen = 0.152 * H;
  const footH = ankleA.rz * 0.95;

  const handLen = H * 0.052;
  const armPad = Math.max(bicepA.rx, wristA.rx) * 1.3 + 0.02;
  const armsBox = { // in folded (|x|) space
    x0: Math.min(shX, wrX) - armPad, x1: Math.max(shX, wrX) + armPad,
    y0: wrY - handLen * 1.9, y1: shY + armPad,
    z0: -armPad - 0.02, z1: wrZ + armPad + 0.02,
  };

  let maxRx = 0, maxRz = 0, minCz = 0, maxCz = 0;
  for (let i = 0; i < LUT_N; i++) {
    if (rxLUT[i] > maxRx) maxRx = rxLUT[i];
    if (rzLUT[i] > maxRz) maxRz = rzLUT[i];
    if (czLUT[i] < minCz) minCz = czLUT[i];
    if (czLUT[i] > maxCz) maxCz = czLUT[i];
  }
  const torsoPad = 0.03 + Math.max(shoulderHalf * 0.3, hipA.rz * 0.5);
  const torsoBox = {
    x0: -(maxRx + torsoPad), x1: maxRx + torsoPad,
    y0: yBase - torsoPad, y1: H + 0.02,
    z0: minCz - maxRz - torsoPad, z1: maxCz + maxRz + torsoPad,
  };

  const legPad = Math.max(thighA.rx, calfA.rx) * 1.25 + 0.02;
  const legsBox = {
    x0: -(hipX + legPad), x1: hipX + legPad,
    y0: -0.02, y1: yCrotch + hipA.rz * 0.5 + legPad,
    z0: -legPad - calfA.rz, z1: footLen * 0.8 + legPad,
  };

  return {
    H, yBase, yTop, rxLUT, rzLUT, czLUT,
    yCrotch, yWaist, ySeat, yChest, yShoulder, yNeckTop, headH, neckLen,
    hipA, waistA, chestA, neckA, shoulderHalf,
    bicepA, elbowA, wristA,
    shX, shY, elX, elY, wrX, wrY, wrZ, handLen, deltoidR,
    thighA, kneeA, calfA, ankleA,
    yKnee, yCalfMax, yAnkle, hipX, kneeX, ankleX, legLen,
    footLen, footH, armsBox, legsBox, torsoBox,
  };
}

/* ---------------------------------------------------------------------
 * The field itself
 * ------------------------------------------------------------------- */

// Swept-ellipse torso: an ellipse whose width, depth and centre glide
// along the spine, capped top and bottom.
function sdTorso(S, px, py, pz) {
  const span = S.yTop - S.yBase;
  const t = clamp((py - S.yBase) / span, 0, 1);
  const f = t * (LUT_N - 1);
  const i0 = f | 0;
  const i1 = i0 < LUT_N - 1 ? i0 + 1 : i0;
  const fr = f - i0;
  const rx = S.rxLUT[i0] + (S.rxLUT[i1] - S.rxLUT[i0]) * fr;
  const rz = S.rzLUT[i0] + (S.rzLUT[i1] - S.rzLUT[i0]) * fr;
  const cz = S.czLUT[i0] + (S.czLUT[i1] - S.czLUT[i0]) * fr;

  const nx = px / rx, nz = (pz - cz) / rz;
  const r = Math.sqrt(nx * nx + nz * nz);
  const radial = (r - 1) * Math.min(rx, rz);
  const dyOut = Math.max(S.yBase - py, py - S.yTop);

  const mx = Math.max(radial, 0), my = Math.max(dyOut, 0);
  return Math.min(Math.max(radial, dyOut), 0) + Math.sqrt(mx * mx + my * my);
}

// Torso group: trunk + seat + neck + head + shoulder caps.
function fieldTorso(S, x, y, z) {
  const db = distToBox(x, y, z, S.torsoBox);
  if (db > SKIP_DIST) return db;

  let d = sdTorso(S, x, y, z);

  // glutes — a real seat projects behind the spine axis
  const glute = sdEllipsoid(x, y, z,
    0, S.ySeat - S.hipA.rz * 0.15, -S.hipA.rz * 0.42,
    S.hipA.rx * 0.94, S.hipA.rz * 1.15, S.hipA.rz * 0.78);
  d = smin(d, glute, 0.055);

  // deltoid caps give the shoulders their rounded corner instead of a
  // flat lofted top
  // Kept deliberately low and flat: the top of the deltoid is the
  // shoulder point, so anything taller reads as an epaulette.
  const delR = S.deltoidR;
  const delY = S.shY - delR * 0.24;
  const dl = sdEllipsoid(x, y, z, -S.shX, delY, 0, delR * 1.0, delR * 0.78, delR * 1.12);
  const dr = sdEllipsoid(x, y, z, S.shX, delY, 0, delR * 1.0, delR * 0.78, delR * 1.12);
  d = smin(d, Math.min(dl, dr), 0.055);

  // neck, angled very slightly forward as a real neck sits
  const neck = sdRoundCone(x, y, z,
    0, S.yShoulder - S.neckLen * 0.7, -0.004,
    0, S.yNeckTop + S.neckLen * 0.1, 0.006,
    S.neckA.rx * 1.02, S.neckA.rx * 0.86);
  d = smin(d, neck, 0.038);

  // cranium + a slightly narrower jaw below it, so the head reads as a
  // head rather than a ball on a stick
  const headR = S.headH * 0.5;
  const skull = sdEllipsoid(x, y, z,
    0, S.yNeckTop + headR * 1.06, 0.004,
    headR * 0.80, headR * 0.94, headR * 0.90);
  const jaw = sdEllipsoid(x, y, z,
    0, S.yNeckTop + headR * 0.52, 0.010,
    headR * 0.63, headR * 0.46, headR * 0.72);
  d = smin(d, smin(skull, jaw, 0.03), 0.026);

  return d;
}

// Distance to an axis-aligned box (0 inside). Used as a cheap
// conservative lower bound so voxels far from a limb can skip that
// limb's primitives entirely. Safe because marching cubes only reads
// the field near the zero crossing, and the bound is only used well
// beyond the largest blend radius.
function distToBox(x, y, z, b) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const SKIP_DIST = 0.09; // > any blend radius used below

function fieldArms(S, x, y, z) {
  // Arms never cross the centreline, so folding to one side is exact
  // and costs half as much.
  const ax = Math.abs(x);
  const db = distToBox(ax, y, z, S.armsBox);
  if (db > SKIP_DIST) return db;

  const upper = sdRoundCone(ax, y, z,
    S.shX, S.shY, 0,
    S.elX, S.elY, 0.004,
    S.bicepA.rx, S.elbowA.rx);
  const fore = sdRoundCone(ax, y, z,
    S.elX, S.elY, 0.004,
    S.wrX, S.wrY, S.wrZ,
    S.elbowA.rx * 0.98, S.wristA.rx);
  let d = smin(upper, fore, 0.035);

  const handLen = S.handLen;
  const hand = sdEllipsoid(ax, y, z,
    S.wrX + handLen * 0.16, S.wrY - handLen * 0.82, S.wrZ + handLen * 0.1,
    S.wristA.rx * 1.15, handLen * 0.92, S.wristA.rx * 0.62);
  d = smin(d, hand, 0.022);
  return d;
}

// One leg, at signed x-offset `sx` (+1 right, -1 left). The legs are
// evaluated per side rather than mirror-folded because inner thighs
// actually meet at the centreline — folding would leave a hard crease
// there instead of the soft contact a real body has.
function fieldOneLeg(S, sx, x, y, z) {
  const thigh = sdRoundCone(x, y, z,
    sx * S.hipX, S.yCrotch + S.hipA.rz * 0.30, -0.004,
    sx * S.kneeX, S.yKnee, 0.004,
    S.thighA.rx, S.kneeA.rx);
  const shank = sdRoundCone(x, y, z,
    sx * S.kneeX, S.yKnee, 0.004,
    sx * S.ankleX, S.yAnkle, -0.006,
    S.kneeA.rx * 0.98, S.ankleA.rx);
  let d = smin(thigh, shank, 0.04);

  // calf belly sits high and to the back of the shank
  const calf = sdEllipsoid(x, y, z,
    sx * S.kneeX * 0.92, S.yCalfMax, -S.calfA.rz * 0.34,
    S.calfA.rx * 0.92, (S.yKnee - S.yAnkle) * 0.30, S.calfA.rz * 0.78);
  d = smin(d, calf, 0.045);

  // Foot: a taller, narrower heel merging into a wider, flatter
  // forefoot — both sitting exactly on the floor plane. A single box
  // here reads as a slab rather than a foot.
  const fx = sx * S.ankleX;
  const heel = sdEllipsoid(x, y, z,
    fx, S.footH * 0.95, -S.footLen * 0.20,
    S.ankleA.rx * 0.80, S.footH * 0.95, S.footLen * 0.23);
  const fore = sdEllipsoid(x, y, z,
    fx, S.footH * 0.78, S.footLen * 0.17,
    S.ankleA.rx * 1.04, S.footH * 0.78, S.footLen * 0.34);
  const foot = smin(heel, fore, 0.028);
  return smin(d, foot, 0.03);
}

function fieldLegs(S, x, y, z) {
  const db = distToBox(x, y, z, S.legsBox);
  if (db > SKIP_DIST) return db;
  // Tight blend between the two legs: they should touch at the top of
  // the thigh and separate cleanly below it, not weld together.
  return smin(fieldOneLeg(S, 1, x, y, z), fieldOneLeg(S, -1, x, y, z), 0.018);
}

const REGION_TORSO = 0, REGION_ARMS = 1, REGION_LEGS = 2;

// Which group a point belongs to, recorded as a side effect of the
// field evaluation so region colouring costs nothing extra.
let _region = REGION_TORSO;

function fieldAll(S, x, y, z) {
  const t = fieldTorso(S, x, y, z);
  const a = fieldArms(S, x, y, z);
  const l = fieldLegs(S, x, y, z);
  _region = a < t && a < l ? REGION_ARMS : l < t ? REGION_LEGS : REGION_TORSO;
  // The arm blend is kept tight so the armpit stays a defined notch
  // instead of webbing across to the ribcage.
  return smin(smin(t, a, 0.032), l, 0.055);
}

/* ---------------------------------------------------------------------
 * Marching cubes polygonizer
 * ------------------------------------------------------------------- */

const CORNER = [
  [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
  [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1],
];
const EDGE_ENDS = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function polygonize(S, bounds, voxel, palette) {
  const { x0, x1, y0, y1, z0, z1 } = bounds;

  let nx = Math.max(8, Math.ceil((x1 - x0) / voxel) + 1);
  if (nx % 2 === 0) nx++; // odd => a sample sits exactly on the x=0 mirror plane
  const ny = Math.max(8, Math.ceil((y1 - y0) / voxel) + 1);
  const nz = Math.max(8, Math.ceil((z1 - z0) / voxel) + 1);

  const dx = (x1 - x0) / (nx - 1);
  const dy = (y1 - y0) / (ny - 1);
  const dz = (z1 - z0) / (nz - 1);

  const field = new Float32Array(nx * ny * nz);
  const regions = new Uint8Array(nx * ny * nz);
  const mid = (nx - 1) >> 1;

  // Sample the field. The body is symmetric about x=0, so only half is
  // evaluated and the rest mirrored — halves the cost of the hot loop.
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * dz;
    const kOff = k * nx * ny;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * dy;
      const rowOff = kOff + j * nx;
      for (let i = mid; i < nx; i++) {
        const v = fieldAll(S, x0 + i * dx, y, z);
        const mirror = nx - 1 - i;
        field[rowOff + i] = v;
        field[rowOff + mirror] = v;
        regions[rowOff + i] = _region;
        regions[rowOff + mirror] = _region;
      }
    }
  }

  const positions = [];
  const normals = [];
  const colors = [];

  // A cell can only straddle the surface if it is within about one cell
  // diagonal of it. The field is distance-like, so this one comparison
  // discards the ~85% of the grid that is empty space.
  const nearBand = 3.0 * Math.max(dx, dy, dz);

  // Gradient of the sampled field via central differences — gives smooth
  // shading normals for free, without re-evaluating the SDF per vertex.
  const gradA = new Float32Array(3), gradB = new Float32Array(3);
  function gradAt(i, j, k, out) {
    const ip = Math.min(i + 1, nx - 1), im = Math.max(i - 1, 0);
    const jp = Math.min(j + 1, ny - 1), jm = Math.max(j - 1, 0);
    const kp = Math.min(k + 1, nz - 1), km = Math.max(k - 1, 0);
    const base = k * nx * ny + j * nx;
    out[0] = field[base + ip] - field[base + im];
    out[1] = field[k * nx * ny + jp * nx + i] - field[k * nx * ny + jm * nx + i];
    out[2] = field[kp * nx * ny + j * nx + i] - field[km * nx * ny + j * nx + i];
  }

  const cornerVal = new Float32Array(8);
  const ci = new Int32Array(8), cj = new Int32Array(8), ck = new Int32Array(8);
  const ex = new Float32Array(12), ey = new Float32Array(12), ez = new Float32Array(12);
  const enx = new Float32Array(12), eny = new Float32Array(12), enz = new Float32Array(12);
  const ecr = new Float32Array(12), ecg = new Float32Array(12), ecb = new Float32Array(12);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (Math.abs(field[k * nx * ny + j * nx + i]) > nearBand) continue;

        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const iC = i + CORNER[c][0], jC = j + CORNER[c][1], kC = k + CORNER[c][2];
          ci[c] = iC; cj[c] = jC; ck[c] = kC;
          const v = field[kC * nx * ny + jC * nx + iC];
          cornerVal[c] = v;
          if (v < 0) cubeIndex |= 1 << c;
        }
        const edges = edgeTable[cubeIndex];
        if (edges === 0) continue;

        for (let e = 0; e < 12; e++) {
          if ((edges & (1 << e)) === 0) continue;
          const a = EDGE_ENDS[e][0], b = EDGE_ENDS[e][1];
          const va = cornerVal[a], vb = cornerVal[b];
          const denom = vb - va;
          const t = Math.abs(denom) > 1e-9 ? clamp(-va / denom, 0, 1) : 0.5;

          const ax = x0 + ci[a] * dx, ay = y0 + cj[a] * dy, az = z0 + ck[a] * dz;
          const bx = x0 + ci[b] * dx, by = y0 + cj[b] * dy, bz = z0 + ck[b] * dz;
          ex[e] = ax + (bx - ax) * t;
          ey[e] = ay + (by - ay) * t;
          ez[e] = az + (bz - az) * t;

          gradAt(ci[a], cj[a], ck[a], gradA);
          gradAt(ci[b], cj[b], ck[b], gradB);
          const nxv = gradA[0] + (gradB[0] - gradA[0]) * t;
          const nyv = gradA[1] + (gradB[1] - gradA[1]) * t;
          const nzv = gradA[2] + (gradB[2] - gradA[2]) * t;
          const len = Math.hypot(nxv, nyv, nzv) || 1;
          enx[e] = nxv / len; eny[e] = nyv / len; enz[e] = nzv / len;
          // Region colour is interpolated along the edge with the same
          // factor as the position, so a torso/arm boundary fades across
          // a voxel instead of stair-stepping along the grid.
          const rA = regions[ck[a] * nx * ny + cj[a] * nx + ci[a]] * 3;
          const rB = regions[ck[b] * nx * ny + cj[b] * nx + ci[b]] * 3;
          ecr[e] = palette[rA] + (palette[rB] - palette[rA]) * t;
          ecg[e] = palette[rA + 1] + (palette[rB + 1] - palette[rA + 1]) * t;
          ecb[e] = palette[rA + 2] + (palette[rB + 2] - palette[rA + 2]) * t;
        }

        const row = cubeIndex * 16;
        for (let t = 0; t < 16 && triTable[row + t] !== -1; t += 3) {
          const e0 = triTable[row + t], e1 = triTable[row + t + 1], e2 = triTable[row + t + 2];
          // wound so that the SDF gradient (pointing outward) is the front face
          positions.push(ex[e0], ey[e0], ez[e0], ex[e2], ey[e2], ez[e2], ex[e1], ey[e1], ez[e1]);
          normals.push(enx[e0], eny[e0], enz[e0], enx[e2], eny[e2], enz[e2], enx[e1], eny[e1], enz[e1]);
          colors.push(ecr[e0], ecg[e0], ecb[e0], ecr[e2], ecg[e2], ecb[e2], ecr[e1], ecg[e1], ecb[e1]);
        }
      }
    }
  }

  return { positions, normals, colors, vertexCount: positions.length / 3 };
}

/* ---------------------------------------------------------------------
 * Scene
 * ------------------------------------------------------------------- */
let scene, camera, renderer, controls, bodyMesh, bodyMat;
let spec = null, states = null;
let pendingTimer = null;
let framed = false;
let voxelSize = 0.013; // adapts to measured build time
let lastBuildMs = 0;

const REGION_COLORS = {
  measured: new THREE.Color(0x7cc7ef),
  partial: new THREE.Color(0x5f93b4),
  estimated: new THREE.Color(0x5d646f),
};

function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111418);

  camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.05, 60);
  camera.position.set(1.35, 1.15, 3.0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.92, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.9;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // Studio-ish three-point lighting: soft ambient bounce, a key with a
  // shadow, a cool fill, and a rim to separate the body from the ground.
  // The ground half of the hemisphere has to stay reasonably bright:
  // every light here comes from above, so with a near-black ground
  // colour any downward-facing surface (undersides of the hands, toes,
  // the crotch) renders pure black and reads as a hole in the mesh.
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x39414d, 1.0));

  const key = new THREE.DirectionalLight(0xfff2e2, 2.1);
  key.position.set(2.2, 3.4, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 10;
  key.shadow.camera.left = -1.4;
  key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -0.2;
  key.shadow.bias = -0.0015;
  key.shadow.radius = 3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.75);
  fill.position.set(-2.6, 1.2, 1.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xcfe4ff, 1.1);
  rim.position.set(-1.2, 2.0, -2.8);
  scene.add(rim);

  // Floor bounce — stands in for the light a real floor would kick back
  // up onto the underside of the figure.
  const bounce = new THREE.DirectionalLight(0x93a6bd, 0.5);
  bounce.position.set(0.4, -1.6, 1.0);
  scene.add(bounce);

  bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.55,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0x9fd0ff),
  });

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 64).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.42 })
  );
  ground.receiveShadow = true;
  // Sit the ground just below the soles; exactly coplanar would z-fight
  // with the feet and self-shadow them into black slabs.
  ground.position.y = -0.006;
  scene.add(ground);

  const grid = new THREE.GridHelper(3.6, 18, 0x2f3742, 0x1d2229);
  grid.position.y = -0.005;
  scene.add(grid);

  new ResizeObserver(() => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }).observe(container);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

// Pull the camera back far enough that the whole figure fits with a
// margin, accounting for the viewport's aspect ratio (a narrow phone
// viewport needs more distance than a wide one).
function frameCamera(H) {
  const fitH = H * 1.16;
  const vFov = (camera.fov * Math.PI) / 180;
  let dist = fitH / 2 / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const needW = H * 0.55;
  dist = Math.max(dist, needW / 2 / Math.tan(hFov / 2));

  const dir = new THREE.Vector3(0.40, 0.18, 1).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.minDistance = dist * 0.28;
  controls.maxDistance = dist * 2.6;
  controls.update();
}

function rebuild() {
  if (!spec) return;
  const S = spec;
  const t0 = performance.now();

  const maxHalfW = Math.max(S.wrX + S.H * 0.06, S.shoulderHalf * 1.2, S.hipX + S.thighA.rx * 1.3) + 0.05;
  const maxDepth = Math.max(S.chestA.rz, S.hipA.rz, S.footLen * 0.5) + 0.09;
  const bounds = {
    x0: -maxHalfW, x1: maxHalfW,
    y0: -0.035, y1: S.H + 0.045,
    z0: -maxDepth, z1: maxDepth + S.footLen * 0.35,
  };

  // Palette indexed by region, so the measured / partially measured /
  // estimated distinction survives on a single fused mesh.
  const palette = new Float32Array(9);
  [states.torso, states.arms, states.legs].forEach((s, i) => {
    const c = REGION_COLORS[s] || REGION_COLORS.estimated;
    palette[i * 3] = c.r; palette[i * 3 + 1] = c.g; palette[i * 3 + 2] = c.b;
  });

  const { positions, normals, colors, vertexCount } = polygonize(S, bounds, voxelSize, palette);
  if (!vertexCount) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  if (bodyMesh) {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = geo;
  } else {
    bodyMesh = new THREE.Mesh(geo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = false;
    scene.add(bodyMesh);
  }

  controls.target.set(0, S.H * 0.52, 0);
  if (!framed) { frameCamera(S.H); framed = true; }

  lastBuildMs = performance.now() - t0;
  // Adapt resolution so slower devices stay responsive and fast ones
  // get a finer surface.
  if (lastBuildMs > 420 && voxelSize < 0.020) voxelSize = Math.min(0.020, voxelSize * 1.22);
  else if (lastBuildMs < 110 && voxelSize > 0.0095) voxelSize = Math.max(0.0095, voxelSize * 0.9);
}

function scheduleRebuild() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingTimer = null; rebuild(); }, 110);
}

function applyData(detail) {
  spec = buildBodySpec(detail.measurements);
  states = detail.states;
  scheduleRebuild();
}

function boot() {
  const container = document.getElementById("body3d-container");
  if (!container) return;

  try {
    initScene(container);
  } catch (e) {
    container.innerHTML = '<p class="webgl-fallback">3D view needs WebGL, which is not available in this browser.</p>';
    console.error(e);
    return;
  }

  window.addEventListener("measurements-changed", (e) => applyData(e.detail));
  if (window.getCurrentMeasurements) applyData(window.getCurrentMeasurements());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
