const widgetsConfig = [
  { id: "widget-speedrpm", name: "Speed + RPM (Stylish)" },
  { id: "widget-standings", name: "Standings" },
  { id: "widget-fuel", name: "Fuel" },
  { id: "widget-inputs", name: "Inputs" },
  { id: "widget-bestlap", name: "Best Lap" },
  { id: "widget-lastlap", name: "Last Lap" },
  { id: "widget-temps", name: "Temps" },
  { id: "widget-incidents", name: "Incidents" },
  { id: "widget-relative", name: "Relative (Ahead/Behind)" },

];

const container = document.getElementById("controls-list");
const editToggle = document.getElementById("editModeToggle");
const masterHideBtn = document.getElementById("masterHideBtn");

function build(state) {
  container.innerHTML = "";

  editToggle.checked = !!state.editMode;
  editToggle.onchange = (e) => window.settingsAPI.setEditMode(e.target.checked);
  if (masterHideBtn) {
  const canToggle = !state.editMode;
  masterHideBtn.disabled = !canToggle;
  masterHideBtn.innerText = state.masterHidden ? "Show overlays" : "Hide overlays";
  masterHideBtn.title = canToggle ? "" : "Stäng av Edit mode för att dölja overlays";
  masterHideBtn.onclick = () => window.settingsAPI.setMasterHidden(!state.masterHidden);
}

  for (const cfg of widgetsConfig) {
    const w = state.widgets?.[cfg.id] || { visible:false, scale:1.0 };

    const group = document.createElement("div");
    group.className = "control-group";
    group.innerHTML = `
      <div class="control-header">
        <label>${cfg.name}</label>
        <input type="checkbox" id="cb-${cfg.id}">
      </div>
      <div class="slider">
        <span>Scale:</span>
        <input type="range" id="sl-${cfg.id}" min="0.2" max="2.5" step="0.05">
        <span class="val" id="val-${cfg.id}"></span>
      </div>
    `;
    container.appendChild(group);

    const cb = group.querySelector(`#cb-${cfg.id}`);
    const sl = group.querySelector(`#sl-${cfg.id}`);
    const val = group.querySelector(`#val-${cfg.id}`);

    cb.checked = !!w.visible;
    sl.value = String(Number(w.scale) || 1.0);
    val.innerText = sl.value;

    cb.onchange = (ev) => {
      window.settingsAPI.sendSettingChange({ type:"visibility", id: cfg.id, value: ev.target.checked });
    };

    sl.oninput = (ev) => {
      val.innerText = ev.target.value;
      window.settingsAPI.sendSettingChange({ type:"scale", id: cfg.id, value: ev.target.value });
    };
  }
}

(async function init() {
  const st = await window.settingsAPI.getState();
  build(st);
  window.settingsAPI.onStateInit((s) => build(s));
})();
