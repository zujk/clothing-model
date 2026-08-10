"use strict";

/* ---------------------------------------------------------------------
 * Field registry
 * All values are stored canonically in centimeters. The UI converts
 * to/from inches for display only.
 * ------------------------------------------------------------------- */
const FIELDS = [
  { key: "height", id: "m-height", group: "overall" },
  { key: "neck", id: "m-neck", group: "upper" },
  { key: "shoulder", id: "m-shoulder", group: "upper" },
  { key: "chest", id: "m-chest", group: "upper" },
  { key: "waist", id: "m-waist", group: "upper" },
  { key: "torso", id: "m-torso", group: "upper" },
  { key: "sleeve", id: "m-sleeve", group: "upper" },
  { key: "bicep", id: "m-bicep", group: "upper" },
  { key: "wrist", id: "m-wrist", group: "upper" },
  { key: "hip", id: "m-hip", group: "lower" },
  { key: "rise", id: "m-rise", group: "lower" },
  { key: "inseam", id: "m-inseam", group: "lower" },
  { key: "thigh", id: "m-thigh", group: "lower" },
  { key: "calf", id: "m-calf", group: "lower" },
  { key: "ankle", id: "m-ankle", group: "lower" },
];

const GARMENT_FIELDS = [
  { key: "pit", id: "g-pit" },
  { key: "gshoulder", id: "g-shoulder" },
  { key: "length", id: "g-length" },
  { key: "gsleeve", id: "g-sleeve" },
  { key: "gwaist", id: "g-waist" },
  { key: "ghip", id: "g-hip" },
  { key: "grise", id: "g-rise" },
  { key: "ginseam", id: "g-inseam" },
];

const CM_PER_IN = 2.54;
const STORAGE_KEY = "body-model-v1";

/* ---------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------- */
let state = {
  units: "cm",
  measurements: {}, // canonical cm values, keyed by FIELDS[].key
  garment: {},
  fitType: "top",
  fitEase: "regular",
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn("Could not load saved measurements", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save measurements", e);
  }
}

/* ---------------------------------------------------------------------
 * Unit helpers
 * ------------------------------------------------------------------- */
function cmToDisplay(cm) {
  if (cm == null || isNaN(cm)) return "";
  const v = state.units === "in" ? cm / CM_PER_IN : cm;
  return Math.round(v * 10) / 10;
}
function displayToCm(v) {
  if (v === "" || v == null || isNaN(v)) return null;
  const n = parseFloat(v);
  return state.units === "in" ? n * CM_PER_IN : n;
}
function fmt(cm, decimals = 1) {
  if (cm == null || isNaN(cm)) return "—";
  const v = state.units === "in" ? cm / CM_PER_IN : cm;
  return `${v.toFixed(decimals)} ${state.units}`;
}
function fmtIn(cm) {
  return `${(cm / CM_PER_IN).toFixed(1)} in`;
}

/* ---------------------------------------------------------------------
 * Wire up inputs
 * ------------------------------------------------------------------- */
function refreshUnitLabels() {
  document.querySelectorAll(".unit-label").forEach((el) => {
    el.textContent = state.units;
  });
  document.getElementById("unit-cm").classList.toggle("active", state.units === "cm");
  document.getElementById("unit-in").classList.toggle("active", state.units === "in");
}

function populateInputs() {
  FIELDS.forEach(({ key, id }) => {
    const el = document.getElementById(id);
    const cm = state.measurements[key];
    el.value = cm != null ? cmToDisplay(cm) : "";
  });
  GARMENT_FIELDS.forEach(({ key, id }) => {
    const el = document.getElementById(id);
    const cm = state.garment[key];
    el.value = cm != null ? cmToDisplay(cm) : "";
  });
  document.getElementById("fit-type").value = state.fitType;
  document.getElementById("fit-ease").value = state.fitEase;
  updateFitFieldVisibility();
  updatePlaceholders();
}

function bindInputs() {
  FIELDS.forEach(({ key, id }) => {
    document.getElementById(id).addEventListener("input", (e) => {
      state.measurements[key] = displayToCm(e.target.value);
      saveState();
      renderAll();
    });
  });
  GARMENT_FIELDS.forEach(({ key, id }) => {
    document.getElementById(id).addEventListener("input", (e) => {
      state.garment[key] = displayToCm(e.target.value);
      saveState();
      renderFitChecker();
    });
  });

  document.getElementById("fit-type").addEventListener("change", (e) => {
    state.fitType = e.target.value;
    saveState();
    updateFitFieldVisibility();
    renderFitChecker();
  });
  document.getElementById("fit-ease").addEventListener("change", (e) => {
    state.fitEase = e.target.value;
    saveState();
    renderFitChecker();
  });

  document.getElementById("unit-cm").addEventListener("click", () => switchUnits("cm"));
  document.getElementById("unit-in").addEventListener("click", () => switchUnits("in"));

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Clear all entered measurements? This cannot be undone.")) return;
    state.measurements = {};
    state.garment = {};
    saveState();
    populateInputs();
    renderAll();
  });

  document.getElementById("btn-export").addEventListener("click", exportJSON);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-import").click();
  });
  document.getElementById("file-import").addEventListener("change", importJSON);
}

function switchUnits(unit) {
  if (state.units === unit) return;
  state.units = unit;
  saveState();
  refreshUnitLabels();
  populateInputs();
}

function updateFitFieldVisibility() {
  document.getElementById("fit-fields-top").hidden = state.fitType !== "top";
  document.getElementById("fit-fields-bottom").hidden = state.fitType !== "bottom";
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "body-measurements.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = { ...state, ...parsed };
      saveState();
      refreshUnitLabels();
      populateInputs();
      renderAll();
    } catch (err) {
      alert("Could not read that file — is it a valid export from this tool?");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

/* ---------------------------------------------------------------------
 * Fallback estimation (used only for drawing a complete figure when
 * fields are left blank). These are rough population-average ratios
 * relative to height — replaced instantly by real values once entered.
 * ------------------------------------------------------------------- */
const FALLBACK_RATIO = {
  neck: 0.205,
  shoulder: 0.225,
  chest: 0.52,
  waist: 0.45,
  torso: 0.30,
  sleeve: 0.33,
  bicep: 0.16,
  wrist: 0.095,
  hip: 0.53,
  rise: 0.13,
  inseam: 0.45,
  thigh: 0.29,
  calf: 0.20,
  ankle: 0.13,
};

function effectiveMeasurements() {
  const H = state.measurements.height || 170;
  const out = { height: H };
  FIELDS.forEach(({ key }) => {
    if (key === "height") return;
    out[key] = state.measurements[key] != null ? state.measurements[key] : FALLBACK_RATIO[key] * H;
  });
  return out;
}

// How much of a body region is backed by real input vs filled in from
// FALLBACK_RATIO — drives the measured/partial/estimated styling in the SVG.
function segmentState(keys) {
  const measured = keys.filter((k) => state.measurements[k] != null).length;
  if (measured === keys.length) return "measured";
  if (measured === 0) return "estimated";
  return "partial";
}

function updatePlaceholders() {
  const H = state.measurements.height || 170;
  const heightEl = document.getElementById("m-height");
  heightEl.placeholder = `avg ${cmToDisplay(170)}`;
  FIELDS.forEach(({ key, id }) => {
    if (key === "height") return;
    document.getElementById(id).placeholder = `≈ ${cmToDisplay(FALLBACK_RATIO[key] * H)}`;
  });
}

/* ---------------------------------------------------------------------
 * 3D body model handoff — geometry itself lives in body3d.js (a module
 * script, loaded separately); this just packages current measurements
 * and per-region measured/partial/estimated state and notifies it.
 * ------------------------------------------------------------------- */
function currentBodyStates() {
  return {
    torso: segmentState(["neck", "shoulder", "chest", "waist", "hip"]),
    arms: segmentState(["sleeve", "bicep", "wrist"]),
    legs: segmentState(["hip", "inseam", "thigh", "calf", "ankle"]),
  };
}

function getCurrentMeasurements() {
  return { measurements: effectiveMeasurements(), states: currentBodyStates() };
}
window.getCurrentMeasurements = getCurrentMeasurements;

function notifyBody3D() {
  window.dispatchEvent(new CustomEvent("measurements-changed", { detail: getCurrentMeasurements() }));

  const measuredCount = FIELDS.filter((f) => f.key !== "height" && state.measurements[f.key] != null).length;
  document.getElementById("scale-note").textContent =
    `${measuredCount}/${FIELDS.length - 1} measurements entered — the rest are filled with average-proportion estimates and update instantly as you add real numbers.`;
}

/* ---------------------------------------------------------------------
 * Ratios & shape analysis
 * ------------------------------------------------------------------- */
function card(title, value, detail, tone) {
  const div = document.createElement("div");
  div.className = "card" + (tone ? ` tone-${tone}` : "");
  div.innerHTML = `<div class="card-title">${title}</div><div class="card-value">${value}</div>` +
    (detail ? `<div class="card-detail">${detail}</div>` : "");
  return div;
}

function emptyNote(text) {
  const div = document.createElement("div");
  div.className = "empty-note";
  div.textContent = text;
  return div;
}

function classifyShape(chest, waist, hip) {
  if (!chest || !waist || !hip) return null;
  const waistVsChest = (chest - waist) / chest;
  const waistVsHip = (hip - waist) / hip;
  const chestHipDiffPct = Math.abs(chest - hip) / Math.max(chest, hip);

  if (waist >= chest * 0.93 && waist >= hip * 0.93) {
    return { label: "Apple / Round", note: "Waist is close to, or the widest, point of your torso. Look for tops with waist room and A-line or straight bottoms." };
  }
  if (chestHipDiffPct < 0.05 && waistVsChest >= 0.2 && waistVsHip >= 0.2) {
    return { label: "Hourglass", note: "Bust and hip are close in width with a clearly defined waist. Fitted/tailored cuts will show your waist; avoid boxy shapes that hide it." };
  }
  if (hip > chest * 1.05) {
    return { label: "Pear / Triangle", note: "Hips noticeably wider than chest/shoulders. Structured shoulders (jackets, boxy tops) balance the silhouette; bottoms should prioritize hip room over waist." };
  }
  if (chest > hip * 1.05) {
    return { label: "Inverted Triangle", note: "Chest/shoulders noticeably wider than hips. Relaxed tops and fuller-cut or patterned bottoms help balance proportions." };
  }
  return { label: "Rectangle / Athletic", note: "Chest, waist and hip are within a similar range. Belts, layering, and fitted waists can add shape if desired; most cuts will hang evenly." };
}

function renderRatios() {
  const m = state.measurements;
  const out = document.getElementById("ratios-out");
  out.innerHTML = "";

  const has = (...keys) => keys.every((k) => m[k] != null);

  if (has("waist", "hip")) {
    const whr = m.waist / m.hip;
    out.appendChild(card("Waist-to-Hip Ratio", whr.toFixed(2), "Descriptive only — not a health metric. Lower = more hip taper, higher = straighter torso."));
  } else {
    out.appendChild(emptyNote("Enter waist + hip for waist-to-hip ratio."));
  }

  if (has("chest", "waist")) {
    const drop = m.chest - m.waist;
    out.appendChild(card("Chest–Waist Drop", fmt(drop), "Used in jacket/suit sizing — standard drop is ~15cm (6in). Bigger drop = more waist taper expected in the cut."));
  }

  if (has("shoulder", "hip")) {
    out.appendChild(card("Shoulder-to-Hip Ratio", (m.shoulder * 2.6 / m.hip).toFixed(2), "Rough silhouette balance between shoulder line and hip width."));
  }

  const shape = classifyShape(m.chest, m.waist, m.hip);
  if (shape) {
    out.appendChild(card("Body Shape (heuristic)", shape.label, shape.note, "accent"));
  } else {
    out.appendChild(emptyNote("Enter chest, waist and hip for a shape estimate."));
  }

  if (has("inseam", "height")) {
    const ratio = m.inseam / m.height;
    const note = ratio > 0.47 ? "Longer-legged than average — inseams sized 'to height' on charts may run short." :
      ratio < 0.43 ? "Shorter-legged than average — you may need shorter inseams or hemming." :
        "Close to average leg-to-height proportion.";
    out.appendChild(card("Leg-to-Height Ratio", ratio.toFixed(2), note));
  }

  if (has("sleeve", "height")) {
    const ratio = m.sleeve / m.height;
    out.appendChild(card("Arm-to-Height Ratio", ratio.toFixed(2), "Compare against a brand's sleeve length spec rather than relying on your size label."));
  }

  if (has("torso", "inseam")) {
    const ratio = m.torso / m.inseam;
    out.appendChild(card("Torso-to-Leg Ratio", ratio.toFixed(2), "High = long torso relative to legs (watch rise on pants, hem length on tops); low = the opposite."));
  }
}

/* ---------------------------------------------------------------------
 * Size charts (generic, approximate — brands vary widely; use as a
 * starting point, not gospel)
 * ------------------------------------------------------------------- */
const WOMENS_CHART = [
  { label: "XXS", bust: [76, 79], waist: [58, 61], hip: [84, 86] },
  { label: "XS", bust: [81, 84], waist: [63, 66], hip: [89, 91] },
  { label: "S", bust: [86, 89], waist: [69, 71], hip: [94, 97] },
  { label: "M", bust: [91, 95], waist: [74, 77], hip: [99, 103] },
  { label: "L", bust: [99, 104], waist: [81, 86], hip: [107, 112] },
  { label: "XL", bust: [107, 112], waist: [89, 94], hip: [114, 119] },
  { label: "XXL", bust: [114, 119], waist: [97, 102], hip: [122, 127] },
];

const MENS_CHART = [
  { label: "XS", chest: [81, 86] },
  { label: "S", chest: [89, 94] },
  { label: "M", chest: [97, 102] },
  { label: "L", chest: [104, 109] },
  { label: "XL", chest: [112, 117] },
  { label: "XXL", chest: [119, 124] },
  { label: "XXXL", chest: [127, 132] },
];

function lookupByRange(value, chart, field) {
  if (value == null) return null;
  for (const row of chart) {
    const [lo, hi] = row[field];
    if (value >= lo && value <= hi) return { label: row.label, exact: true };
  }
  // nearest, with between-sizes note
  let closest = null, closestDist = Infinity;
  for (const row of chart) {
    const [lo, hi] = row[field];
    const dist = value < lo ? lo - value : value - hi;
    if (dist < closestDist) { closestDist = dist; closest = row; }
  }
  return closest ? { label: closest.label, exact: false } : null;
}

function renderSizes() {
  const m = state.measurements;
  const out = document.getElementById("sizes-out");
  out.innerHTML = "";

  if (m.chest != null) {
    const w = lookupByRange(m.chest, WOMENS_CHART, "bust");
    const men = lookupByRange(m.chest, MENS_CHART, "chest");
    out.appendChild(card("Top size — women's cut", w ? w.label + (w.exact ? "" : " (approx.)") : "—", `From bust/chest = ${fmt(m.chest)}`));
    out.appendChild(card("Top size — men's cut", men ? men.label + (men.exact ? "" : " (approx.)") : "—", `From chest = ${fmt(m.chest)}`));

    const jacketIn = Math.round(m.chest / CM_PER_IN / 2) * 2;
    let length = "Regular";
    if (m.height != null) {
      const hIn = m.height / CM_PER_IN;
      length = hIn < 67 ? "Short" : hIn > 73 ? "Long" : "Regular";
    }
    out.appendChild(card("Suit jacket / blazer", `${jacketIn}${length[0]}`, `Chest ${fmt(m.chest)} rounded to nearest even inch, length "${length}" estimated from height.`));
  } else {
    out.appendChild(emptyNote("Enter chest/bust for top sizing."));
  }

  if (m.neck != null) {
    const neckIn = Math.round((m.neck / CM_PER_IN) * 2) / 2;
    out.appendChild(card("Dress shirt collar", `${neckIn.toFixed(1)} in`, `From neck circumference = ${fmt(m.neck)}`));
  }

  if (m.waist != null || m.hip != null) {
    const women = m.waist != null ? lookupByRange(m.waist, WOMENS_CHART, "waist") : null;
    out.appendChild(card("Bottom size — women's cut", women ? women.label + (women.exact ? "" : " (approx.)") : "—", m.waist != null ? `From waist = ${fmt(m.waist)}` : "Enter waist"));
  }

  if (m.waist != null) {
    const waistIn = Math.round(m.waist / CM_PER_IN);
    const inseamIn = m.inseam != null ? Math.round(m.inseam / CM_PER_IN) : null;
    out.appendChild(card("Pants — waist × inseam", inseamIn ? `${waistIn} × ${inseamIn}` : `${waistIn} × ?`, "Standard US/EU pant tag convention, in inches."));
  }

  if (!m.chest && !m.waist && !m.hip && !m.neck) {
    out.appendChild(emptyNote("Enter chest, waist, hip and/or neck measurements to see size estimates."));
  }
}

/* ---------------------------------------------------------------------
 * Garment fit checker
 * ------------------------------------------------------------------- */
const EASE_RANGES = {
  fitted: [0, 5],
  regular: [5, 12],
  relaxed: [12, 20],
  oversized: [20, 40],
};

function fitVerdict(bodyCirc, garmentFlat, eastKey) {
  if (bodyCirc == null || garmentFlat == null) return null;
  const garmentCirc = garmentFlat * 2;
  const ease = garmentCirc - bodyCirc;
  const [lo, hi] = EASE_RANGES[eastKey];
  let tone, label;
  if (ease < lo - 2) { tone = "bad"; label = "Tight"; }
  else if (ease > hi + 5) { tone = "warn"; label = "Very loose"; }
  else if (ease >= lo && ease <= hi) { tone = "good"; label = "Good fit"; }
  else { tone = "warn"; label = ease < lo ? "Slightly tight" : "Slightly loose"; }
  return { ease, garmentCirc, tone, label };
}

function renderFitChecker() {
  const m = state.measurements;
  const g = state.garment;
  const out = document.getElementById("fit-out");
  out.innerHTML = "";

  if (state.fitType === "top") {
    if (m.chest == null) {
      out.appendChild(emptyNote("Enter your chest/bust measurement above to check fit."));
      return;
    }
    const v = fitVerdict(m.chest, g.pit, state.fitEase);
    if (v) {
      out.appendChild(card(
        "Chest fit",
        v.label,
        `Garment circumference ≈ ${fmtIn(v.garmentCirc)} (${(v.garmentCirc).toFixed(1)}cm) vs your ${fmt(m.chest)} → ${v.ease >= 0 ? "+" : ""}${fmt(v.ease)} ease`,
        v.tone
      ));
    } else {
      out.appendChild(emptyNote("Enter pit-to-pit measurement from the listing."));
    }

    if (m.shoulder != null && g.gshoulder != null) {
      const diff = g.gshoulder - m.shoulder;
      const tone = Math.abs(diff) <= 2 ? "good" : Math.abs(diff) <= 5 ? "warn" : "bad";
      out.appendChild(card("Shoulder fit", diff >= 0 ? `+${fmt(diff)} drop` : `${fmt(diff)} narrow`, "Positive = drop-shoulder/relaxed; near 0 = fitted seam at your natural shoulder.", tone));
    }

    if (m.sleeve != null && g.gsleeve != null) {
      const diff = g.gsleeve - m.sleeve;
      out.appendChild(card("Sleeve length vs your arm", `${diff >= 0 ? "+" : ""}${fmt(diff)}`, diff >= 0 ? "Sleeve runs long — fine to cuff/roll." : "Sleeve runs short relative to your arm."));
    }

    if (g.length != null) {
      out.appendChild(card("Garment length", fmt(g.length), "Compare to where you want the hem to fall (waist / hip / below hip)."));
    }
  } else {
    if (m.waist == null && m.hip == null) {
      out.appendChild(emptyNote("Enter your waist and/or hip measurement above to check fit."));
      return;
    }
    if (m.waist != null) {
      const v = fitVerdict(m.waist, g.gwaist, state.fitEase);
      if (v) {
        out.appendChild(card("Waist fit", v.label, `Garment ≈ ${fmt(v.garmentCirc)} vs your waist ${fmt(m.waist)} → ${v.ease >= 0 ? "+" : ""}${fmt(v.ease)} ease`, v.tone));
      }
    }
    if (m.hip != null) {
      const v = fitVerdict(m.hip, g.ghip, state.fitEase);
      if (v) {
        out.appendChild(card("Hip fit", v.label, `Garment ≈ ${fmt(v.garmentCirc)} vs your hip ${fmt(m.hip)} → ${v.ease >= 0 ? "+" : ""}${fmt(v.ease)} ease`, v.tone));
      }
    }
    if (m.rise != null && g.grise != null) {
      const diff = g.grise - m.rise;
      const tone = Math.abs(diff) <= 1.5 ? "good" : Math.abs(diff) <= 4 ? "warn" : "bad";
      out.appendChild(card("Rise fit", diff >= 0 ? `+${fmt(diff)} higher` : `${fmt(diff)} lower`, "Positive = sits higher than your natural rise (high-rise feel); negative = lower/low-rise feel.", tone));
    }
    if (m.inseam != null && g.ginseam != null) {
      const diff = g.ginseam - m.inseam;
      out.appendChild(card("Inseam vs your leg", `${diff >= 0 ? "+" : ""}${fmt(diff)}`, diff >= 0 ? "Will need hemming or a cuff." : "Will sit shorter than full length (crop, or too short)."));
    }
  }

  if (!out.children.length) {
    out.appendChild(emptyNote("Enter the garment's flat measurements from the listing to compare."));
  }
}

/* ---------------------------------------------------------------------
 * Main render
 * ------------------------------------------------------------------- */
function renderAll() {
  updatePlaceholders();
  notifyBody3D();
  renderRatios();
  renderSizes();
  renderFitChecker();
}

function init() {
  loadState();
  refreshUnitLabels();
  populateInputs();
  bindInputs();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
