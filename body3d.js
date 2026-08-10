import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ---------------------------------------------------------------------
 * Parametric 3D body — builds a lofted, anatomically-proportioned mesh
 * (elliptical, not circular, cross-sections — torsos and limbs are
 * visibly flatter front-to-back than side-to-side) directly from the
 * same tape measurements used elsewhere on the page. Rebuilt whenever
 * measurements change; everything else (camera, lights, controls) is
 * set up once.
 * ------------------------------------------------------------------- */
const CM = 0.01; // centimeters -> meters

// depth (front-to-back) as a fraction of width, per body region —
// people are not cylinders: torsos and limbs are flatter than they
// are wide. These are rough anatomical averages, not measured.
const DEPTH_RATIO = {
  neck: 0.85,
  shoulder: 0.55,
  chest: 0.62,
  waist: 0.70,
  hip: 0.62,
  bicep: 0.92,
  elbow: 0.88,
  wrist: 0.85,
  thigh: 0.85,
  knee: 0.78,
  calf: 0.82,
  ankle: 0.75,
};

// Circumference -> elliptical half-width/half-depth, assuming
// perimeter ≈ π(a+b) (Ramanujan's first-order approximation) and a
// fixed depth:width ratio for the region.
function ellipseFromCircumference(circumferenceCm, depthRatio) {
  const a = circumferenceCm / (Math.PI * (1 + depthRatio));
  const b = depthRatio * a;
  return { rx: a * CM, rz: b * CM };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleSeries(arr, u) {
  const n = arr.length;
  if (n === 1) return arr[0];
  const t = u * (n - 1);
  let i = Math.floor(t);
  i = Math.max(0, Math.min(n - 2, i));
  const localT = t - i;
  const p0 = arr[Math.max(0, i - 1)];
  const p1 = arr[i];
  const p2 = arr[Math.min(n - 1, i + 1)];
  const p3 = arr[Math.min(n - 1, i + 2)];
  return catmullRom(p0, p1, p2, p3, localT);
}

// Builds a smooth lofted tube mesh through a series of elliptical
// cross-section control points (each {y, cx, cz, rx, rz}).
function buildLoft(points, { radial = 20, stepsPerSpan = 10 } = {}) {
  const n = points.length;
  const spans = Math.max(1, n - 1);
  const totalSteps = spans * stepsPerSpan;
  const ys = points.map((p) => p.y);
  const cxs = points.map((p) => p.cx);
  const czs = points.map((p) => p.cz);
  const rxs = points.map((p) => p.rx);
  const rzs = points.map((p) => p.rz);

  const verts = [];
  for (let s = 0; s <= totalSteps; s++) {
    const u = n === 1 ? 0 : s / totalSteps;
    const y = sampleSeries(ys, u);
    const cx = sampleSeries(cxs, u);
    const cz = sampleSeries(czs, u);
    const rx = Math.max(0.0015, sampleSeries(rxs, u));
    const rz = Math.max(0.0015, sampleSeries(rzs, u));
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      verts.push(cx + rx * Math.cos(ang), y, cz + rz * Math.sin(ang));
    }
  }

  const indices = [];
  for (let s = 0; s < totalSteps; s++) {
    for (let j = 0; j < radial; j++) {
      const a = s * radial + j;
      const b = s * radial + ((j + 1) % radial);
      const c = (s + 1) * radial + j;
      const d = (s + 1) * radial + ((j + 1) % radial);
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------------------
 * Scene setup (once)
 * ------------------------------------------------------------------- */
let scene, camera, renderer, controls, group;
let latestData = null;
let needsRebuild = false;

const MATERIALS = {
  measured: new THREE.MeshStandardMaterial({ color: 0x6cc4ff, roughness: 0.55, metalness: 0.05 }),
  partial: new THREE.MeshStandardMaterial({ color: 0x6cc4ff, roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.72 }),
  estimated: new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.75, metalness: 0.0, transparent: true, opacity: 0.45 }),
};

function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1216);

  camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.05, 50);
  camera.position.set(0, 0.95, 3.4);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.3;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x14161a, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2.5, 3.5, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
  rim.position.set(-2.5, 1.5, -2);
  scene.add(rim);

  group = new THREE.Group();
  scene.add(group);

  const grid = new THREE.GridHelper(3, 12, 0x2a303a, 0x1c2027);
  grid.position.y = 0;
  scene.add(grid);

  new ResizeObserver(() => onResize(container)).observe(container);
  animate();
}

function onResize(container) {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  if (needsRebuild && latestData) {
    rebuildBody(latestData.measurements, latestData.states);
    needsRebuild = false;
  }
  controls.update();
  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------------
 * Mesh construction from measurements
 * ------------------------------------------------------------------- */
function clearGroup() {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
}

function addMesh(geo, material) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  group.add(mesh);
  return mesh;
}

function rebuildBody(m, states) {
  clearGroup();

  const H = m.height;
  const headH = 0.13 * H;
  const neckH = 0.03 * H;
  const torsoH = m.torso;
  const hipSegH = 0.07 * H;
  const legH = m.inseam;

  const yHip = legH * CM;
  const yWaist = (legH + hipSegH) * CM;
  const yChest = (legH + hipSegH + torsoH * 0.68) * CM;
  const yShoulder = (legH + hipSegH + torsoH) * CM;
  const yNeckTop = (legH + hipSegH + torsoH + neckH) * CM;
  const yHeadTop = (legH + hipSegH + torsoH + neckH + headH) * CM;

  const hipE = ellipseFromCircumference(m.hip, DEPTH_RATIO.hip);
  const waistE = ellipseFromCircumference(m.waist, DEPTH_RATIO.waist);
  const chestE = ellipseFromCircumference(m.chest, DEPTH_RATIO.chest);
  const neckE = ellipseFromCircumference(m.neck, DEPTH_RATIO.neck);
  const shoulderRx = (m.shoulder / 2) * CM;
  const shoulderRz = shoulderRx * DEPTH_RATIO.shoulder;

  const torsoMat = MATERIALS[states.torso];
  const torsoGeo = buildLoft([
    { y: yHip, cx: 0, cz: 0, rx: hipE.rx, rz: hipE.rz },
    { y: yWaist, cx: 0, cz: 0, rx: waistE.rx, rz: waistE.rz },
    { y: yChest, cx: 0, cz: 0, rx: chestE.rx, rz: chestE.rz },
    { y: yShoulder, cx: 0, cz: 0, rx: shoulderRx, rz: shoulderRz },
    { y: yNeckTop, cx: 0, cz: 0, rx: neckE.rx, rz: neckE.rz },
  ]);
  addMesh(torsoGeo, torsoMat);

  // head — a slightly squashed sphere sitting on top of the neck
  const headR = headH * CM * 0.52;
  const headGeo = new THREE.SphereGeometry(headR, 24, 16);
  const headMesh = new THREE.Mesh(headGeo, MATERIALS.partial);
  headMesh.position.set(0, yHeadTop - headR * 1.02, 0);
  headMesh.scale.set(0.92, 1.05, 0.96);
  group.add(headMesh);

  // arms
  const armMat = MATERIALS[states.arms];
  const armLen = m.sleeve * CM;
  const bicepE = ellipseFromCircumference(m.bicep, DEPTH_RATIO.bicep);
  const wristE = ellipseFromCircumference(m.wrist, DEPTH_RATIO.wrist);
  const elbowE = ellipseFromCircumference((m.bicep * 0.5 + m.wrist * 0.5) * 0.98, DEPTH_RATIO.elbow);
  [-1, 1].forEach((side) => {
    const attachX = side * shoulderRx;
    const elbowX = side * (shoulderRx + armLen * 0.06);
    const wristX = side * (shoulderRx + armLen * 0.12);
    const armGeo = buildLoft([
      { y: yShoulder, cx: attachX, cz: 0, rx: bicepE.rx * 1.05, rz: bicepE.rz * 1.05 },
      { y: yShoulder - armLen * 0.5, cx: elbowX, cz: 0, rx: elbowE.rx, rz: elbowE.rz },
      { y: yShoulder - armLen, cx: wristX, cz: 0, rx: wristE.rx, rz: wristE.rz },
    ], { radial: 16, stepsPerSpan: 8 });
    addMesh(armGeo, armMat);

    const handGeo = new THREE.SphereGeometry(wristE.rx * 1.3, 14, 10);
    const handMesh = new THREE.Mesh(handGeo, armMat);
    handMesh.position.set(wristX, yShoulder - armLen - H * CM * 0.035, 0);
    handMesh.scale.set(1, 1.4, 0.6);
    group.add(handMesh);
  });

  // legs
  const legMat = MATERIALS[states.legs];
  const legLen = m.inseam * CM;
  const thighE = ellipseFromCircumference(m.thigh, DEPTH_RATIO.thigh);
  const calfE = ellipseFromCircumference(m.calf, DEPTH_RATIO.calf);
  const ankleE = ellipseFromCircumference(m.ankle, DEPTH_RATIO.ankle);
  const kneeE = ellipseFromCircumference((m.thigh * 0.5 + m.calf * 0.5) * 0.9, DEPTH_RATIO.knee);
  [-1, 1].forEach((side) => {
    const legX = side * hipE.rx * 0.5;
    const legGeo = buildLoft([
      { y: yHip, cx: legX, cz: 0, rx: thighE.rx, rz: thighE.rz },
      { y: yHip - legLen * 0.45, cx: legX, cz: 0, rx: kneeE.rx, rz: kneeE.rz },
      { y: yHip - legLen * 0.62, cx: legX, cz: 0, rx: calfE.rx, rz: calfE.rz },
      { y: yHip - legLen * 0.97, cx: legX, cz: 0, rx: ankleE.rx, rz: ankleE.rz },
    ], { radial: 18, stepsPerSpan: 8 });
    addMesh(legGeo, legMat);

    const footLen = H * CM * 0.15;
    const footGeo = new THREE.BoxGeometry(ankleE.rx * 2.1, ankleE.rz * 1.3, footLen);
    const footMesh = new THREE.Mesh(footGeo, legMat);
    footMesh.position.set(legX, yHip - legLen * 0.99, footLen * 0.32);
    group.add(footMesh);
  });
}

/* ---------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------- */
function boot() {
  const container = document.getElementById("body3d-container");
  if (!container) return;

  try {
    initScene(container);
  } catch (e) {
    container.innerHTML = '<p class="webgl-fallback">3D view needs WebGL, which isn\'t available here.</p>';
    console.error(e);
    return;
  }

  window.addEventListener("measurements-changed", (e) => {
    latestData = e.detail;
    needsRebuild = true;
  });

  if (window.getCurrentMeasurements) {
    latestData = window.getCurrentMeasurements();
    needsRebuild = true;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
