const els = {
  // SpeedRPM overlay
  srLights: document.getElementById("sr-lights"),
  srPos: document.getElementById("sr-pos"),
  srGear: document.getElementById("sr-gear"),
  srSpeed: document.getElementById("sr-speed"),
  srRpm: document.getElementById("sr-rpm"),
  srPillA: document.getElementById("sr-pill-a"),
  srPillT: document.getElementById("sr-pill-t"),
  srPillTime: document.getElementById("sr-pill-time"),
  // Relative (Ahead/Behind)
  relAheadNum: document.getElementById("rel-ahead-num"),
  relAheadName: document.getElementById("rel-ahead-name"),
  relAheadGap: document.getElementById("rel-ahead-gap"),
  relBehindNum: document.getElementById("rel-behind-num"),
  relBehindName: document.getElementById("rel-behind-name"),
  relBehindGap: document.getElementById("rel-behind-gap"),

  // Common
  standingsRows: document.getElementById("standings-rows"),
  lapCurrent: document.getElementById("lap-current"),
  lapTotal: document.getElementById("lap-total"),
  fuelVal: document.getElementById("fuel-val"),
  fuelBar: document.getElementById("fuel-bar"),
  throttleBar: document.getElementById("throttle-bar"),
  brakeBar: document.getElementById("brake-bar"),
  tempOil: document.getElementById("temp-oil"),
  tempWater: document.getElementById("temp-water"),
  bestLap: document.getElementById("best-lap-val"),
  lastLap: document.getElementById("last-lap-val"),
  incidents: document.getElementById("incidents-val"),
    // Relative (Ahead/Behind)
  relAheadNum: document.getElementById("rel-ahead-num"),
  relAheadName: document.getElementById("rel-ahead-name"),
  relAheadGap: document.getElementById("rel-ahead-gap"),
  relBehindNum: document.getElementById("rel-behind-num"),
  relBehindName: document.getElementById("rel-behind-name"),
  relBehindGap: document.getElementById("rel-behind-gap"),

};

let editMode = false;
let lastStandingsHTML = "";
let autoHidden = false;
let masterHidden = false;

function setMasterHidden(hidden) {
  masterHidden = !!hidden;
  // I edit-mode ska overlays alltid vara synliga
  const effective = masterHidden && !editMode;
  document.body.classList.toggle("master-hidden", effective);
}

function setAutoHidden(hidden) {
  // I edit-mode ska overlays alltid vara synliga
  if (editMode) hidden = false;

  const h = !!hidden;
  if (h === autoHidden) return;
  autoHidden = h;
  document.body.classList.toggle("auto-hidden", autoHidden);
}

// ---------- helpers ----------
function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function formatTime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0 || s > 3600) return "--:--.---";
  const minutes = Math.floor(s / 60);
  const secs = (s % 60).toFixed(3);
  return `${minutes}:${secs.padStart(6, "0")}`;
}

// ---------- Shift lights ----------
function initShiftLights() {
  if (!els.srLights) return;
  els.srLights.innerHTML = "";

  const total = 16;
  for (let i = 0; i < total; i++) {
    const d = document.createElement("div");
    d.className = "sr-light";
    els.srLights.appendChild(d);
  }
}

function updateShiftLights(rpm, rpmMax = 9000) {
  if (!els.srLights) return;
  const dots = els.srLights.querySelectorAll(".sr-light");
  if (!dots.length) return;

  const pct = clamp((Number(rpm) || 0) / rpmMax, 0, 1);
  const onCount = Math.round(pct * dots.length);

  dots.forEach((dot, idx) => {
    dot.classList.remove("on", "g", "y", "r");
    if (idx < onCount) {
      dot.classList.add("on");
      const zone = idx / dots.length;
      if (zone < 0.6) dot.classList.add("g");
      else if (zone < 0.85) dot.classList.add("y");
      else dot.classList.add("r");
    }
  });
}

// ---------- state apply ----------
function ensureHandles(widget) {
  const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  for (const d of dirs) {
    if (widget.querySelector(`.resize-handle.${d}`)) continue;
    const h = document.createElement("div");
    h.className = `resize-handle ${d}`;
    h.dataset.dir = d;
    widget.appendChild(h);
  }
}

function applyWidgetState(id, w) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.toggle("hidden", !w.visible);

  el.style.left = `${Math.max(0, Math.round(w.x ?? 0))}px`;
  el.style.top = `${Math.max(0, Math.round(w.y ?? 0))}px`;
  el.style.width = `${Math.max(120, Math.round(w.w ?? 200))}px`;
  el.style.height = `${Math.max(60, Math.round(w.h ?? 120))}px`;

  const sc = Number(w.scale);
  el.style.setProperty("--userScale", Number.isFinite(sc) ? String(sc) : "1");
  if (window.__recomputeAllAutoScale) window.__recomputeAllAutoScale();

  ensureHandles(el);
}

function setEditMode(enabled) {
  editMode = !!enabled;
  document.body.classList.toggle("edit-mode", editMode);

  // Edit mode ska alltid visa overlays
  if (editMode) setAutoHidden(false);
}

function isHandle(target) {
  return target?.classList?.contains("resize-handle");
}

// ---------- auto-scale content on resize ----------
function initAutoScale() {
  function recompute(widget) {
    const inner = widget.querySelector(".widget-inner");
    if (!inner) return;
  // Standings/Results: ändra aldrig fontstorlek via auto-scale
  if (widget.id === "widget-standings") {
    widget.style.setProperty("--autoScale", "1");
    return;
  }

    const availW = widget.clientWidth;
    const availH = widget.clientHeight;

    const userScaleRaw = getComputedStyle(widget).getPropertyValue("--userScale");
    const userScale = Number(userScaleRaw) || 1;

    const prevTransform = inner.style.transform;
    inner.style.transform = "none";

    const rect = inner.getBoundingClientRect();
    const naturalW = Math.max(1, rect.width);
    const naturalH = Math.max(1, rect.height);

    inner.style.transform = prevTransform;

    const fit = Math.min(availW / naturalW, availH / naturalH);
    const auto = Math.max(0.25, Math.min(1.0, fit / userScale));

    widget.style.setProperty("--autoScale", String(auto));
  }

  const ro = new ResizeObserver((entries) => {
    requestAnimationFrame(() => {
      for (const entry of entries) recompute(entry.target);
    });
  });

  document.querySelectorAll(".widget").forEach((w) => {
    ro.observe(w);
    recompute(w);
  });

  window.__recomputeAllAutoScale = () => {
    document.querySelectorAll(".widget").forEach(recompute);
  };
}

// ---------- drag + resize ----------
function bindMoveResize() {
  document.querySelectorAll(".widget").forEach((widget) => {
    // Drag
    widget.addEventListener("pointerdown", (e) => {
      if (!editMode) return;
      if (isHandle(e.target)) return;
      if (e.button !== 0) return;

      e.preventDefault();
      widget.setPointerCapture(e.pointerId);
      widget.classList.add("dragging");

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseInt(widget.style.left || "0", 10);
      const startTop = parseInt(widget.style.top || "0", 10);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        widget.style.left = `${Math.max(0, startLeft + dx)}px`;
        widget.style.top = `${Math.max(0, startTop + dy)}px`;
      };

      const onUp = () => {
        widget.classList.remove("dragging");
        widget.removeEventListener("pointermove", onMove);
        widget.removeEventListener("pointerup", onUp);
        widget.removeEventListener("pointercancel", onUp);

        window.electronAPI.sendLayoutChange({
          id: widget.id,
          x: parseInt(widget.style.left || "0", 10),
          y: parseInt(widget.style.top || "0", 10),
          w: parseInt(widget.style.width || "0", 10),
          h: parseInt(widget.style.height || "0", 10),
        });
      };

      widget.addEventListener("pointermove", onMove);
      widget.addEventListener("pointerup", onUp);
      widget.addEventListener("pointercancel", onUp);
    });

    // Resize
    widget.addEventListener("pointerdown", (e) => {
      if (!editMode) return;
      if (!isHandle(e.target)) return;
      if (e.button !== 0) return;

      e.preventDefault();
      const dir = e.target.dataset.dir;
      widget.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;

      const startLeft = parseInt(widget.style.left || "0", 10);
      const startTop = parseInt(widget.style.top || "0", 10);

      const rect = widget.getBoundingClientRect();
      const startW = rect.width;
      const startH = rect.height;

      const minW = 120;
      const minH = 60;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newLeft = startLeft;
        let newTop = startTop;
        let newW = startW;
        let newH = startH;

        if (dir.includes("e")) newW = startW + dx;
        if (dir.includes("s")) newH = startH + dy;
        if (dir.includes("w")) {
          newW = startW - dx;
          newLeft = startLeft + dx;
        }
        if (dir.includes("n")) {
          newH = startH - dy;
          newTop = startTop + dy;
        }

        newW = Math.max(minW, Math.round(newW));
        newH = Math.max(minH, Math.round(newH));

        widget.style.width = `${newW}px`;
        widget.style.height = `${newH}px`;
        widget.style.left = `${Math.max(0, Math.round(newLeft))}px`;
        widget.style.top = `${Math.max(0, Math.round(newTop))}px`;
      };

      const onUp = () => {
        widget.removeEventListener("pointermove", onMove);
        widget.removeEventListener("pointerup", onUp);
        widget.removeEventListener("pointercancel", onUp);

        window.electronAPI.sendLayoutChange({
          id: widget.id,
          x: parseInt(widget.style.left || "0", 10),
          y: parseInt(widget.style.top || "0", 10),
          w: parseInt(widget.style.width || "0", 10),
          h: parseInt(widget.style.height || "0", 10),
        });
      };

      widget.addEventListener("pointermove", onMove);
      widget.addEventListener("pointerup", onUp);
      widget.addEventListener("pointercancel", onUp);
    });
  });
}

// ---------- incoming: state & edit mode ----------
window.electronAPI.onStateInit((st) => {
  if (!st) return;
  setEditMode(!!st.editMode);
  setMasterHidden(!!st.masterHidden);

  const widgets = st.widgets || {};
  Object.keys(widgets).forEach((id) => applyWidgetState(id, widgets[id]));
});

window.electronAPI.onEditMode((enabled) => setEditMode(enabled));

// ---------- telemetry ----------
window.electronAPI.onUpdateData((data) => {
  if (!data) return;

  // Göm overlays i garage/ur bil OM datan innehåller flaggor.
  // Om flaggorna inte finns -> visa (så du inte tappar overlays helt)
  const hasFlags = (data.in_car !== undefined) || (data.in_garage !== undefined);
  if (hasFlags) {
    const inCar = !!data.in_car;
    const inGarage = !!data.in_garage;
    setAutoHidden((!inCar) || inGarage);
    if (autoHidden) return;
  } else {
    setAutoHidden(false);
  }
// Manual "hide all" (från Settings)
if (masterHidden && !editMode) return;

  // SPEED+RPM overlay
  const speed = Number(data.speed_kmh) || 0;
  const rpm = Number(data.rpm) || 0;
  const gear = (data.gear === -1) ? "R" : (data.gear === 0 ? "N" : String(data.gear));

  if (els.srSpeed) els.srSpeed.innerText = String(speed);
  if (els.srRpm) els.srRpm.innerText = String(rpm);
  if (els.srGear) els.srGear.innerText = gear;

  if (els.srPos) els.srPos.innerText = "P--";
  updateShiftLights(rpm, 9000);

  // Lap
  if (els.lapCurrent) els.lapCurrent.innerText = data.lap_current ?? 0;
  if (els.lapTotal) els.lapTotal.innerText = (Number(data.lap_total) > 999) ? "∞" : (data.lap_total ?? "-");

  // Bottom pills
  if (els.srPillA) els.srPillA.innerText = "A 27°C";
  if (els.srPillT) els.srPillT.innerText = "T 22°C";
  if (els.srPillTime) els.srPillTime.innerText = `⏱ ${formatTime(data.last_lap || 0)}`;

  // Standings
  if (Array.isArray(data.standings) && els.standingsRows) {
    let html = "";
    for (const d of data.standings) {
      const pos = Number(d?.pos) || 0;
      const rowClass = (pos <= 3) ? "f1-row top-3" : "f1-row";
      const gap = (d?.gap === undefined || d?.gap === null) ? "" : String(d.gap);

      html += `
        <div class="${rowClass}">
          <span class="pos-col">${pos}</span>
          <span class="driver-col"><span class="driver-num">${d?.num ?? ""}</span> ${d?.name ?? ""}</span>
          <span class="gap-col">${gap}</span>
        </div>`;
    }
    if (html !== lastStandingsHTML) {
      els.standingsRows.innerHTML = html;
      lastStandingsHTML = html;
    }
  }




  // Relative (Ahead/Behind)
  const rel = data.relative || {};
  const ahead = rel.ahead || null;
  const behind = rel.behind || null;

  function applyRel(prefix, obj) {
    const numEl = els[prefix + "Num"];
    const nameEl = els[prefix + "Name"];
    const gapEl = els[prefix + "Gap"];
    if (!numEl || !nameEl || !gapEl) return;

    if (!obj) {
      numEl.innerText = "";
      nameEl.innerText = "--";
      gapEl.innerText = "--";
      return;
    }

    numEl.innerText = obj.num ?? "";
    nameEl.innerText = obj.name ?? "--";
    gapEl.innerText = obj.gap ?? "--";
  }

  applyRel("relAhead", ahead);
  applyRel("relBehind", behind);







  // Fuel
  if (els.fuelVal) els.fuelVal.innerText = (Number(data.fuel_level) || 0).toFixed(1) + " L";
  if (els.fuelBar) els.fuelBar.style.width = clamp(Number(data.fuel_pct) || 0, 0, 100) + "%";

  // Inputs
  if (els.throttleBar) els.throttleBar.style.width = clamp((data.inputs?.t ?? 0) * 100, 0, 100) + "%";
  if (els.brakeBar) els.brakeBar.style.width = clamp((data.inputs?.b ?? 0) * 100, 0, 100) + "%";

  // Times / incidents / temps
  if (els.bestLap) els.bestLap.innerText = formatTime(data.best_lap);
  if (els.lastLap) els.lastLap.innerText = formatTime(data.last_lap);
  if (els.incidents) els.incidents.innerText = (Number(data.incidents) || 0) + "x";
  if (els.tempOil) els.tempOil.innerText = Math.round(Number(data.temps?.oil) || 0);
  if (els.tempWater) els.tempWater.innerText = Math.round(Number(data.temps?.water) || 0);
});

// init
initShiftLights();
initAutoScale();
bindMoveResize();
