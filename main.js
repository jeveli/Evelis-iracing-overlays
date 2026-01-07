const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const dgram = require("dgram");
const { spawn } = require("child_process");

app.disableHardwareAcceleration();

let overlayWindow = null;
let settingsWindow = null;

const udpServer = dgram.createSocket("udp4");

let bridgeProc = null;

function getStatePath() {
  return path.join(app.getPath("userData"), "overlay-state.json");
}

const defaultState = {
  editMode: false,
  masterHidden: false,
  widgets: {

    // NY: default on
    "widget-speedrpm":  { visible: true,  scale: 1.0, x: 20,  y: 20,  w: 420, h: 92  },

    "widget-standings": { visible: true,  scale: 1.0, x: 20,  y: 130, w: 320, h: 360 },
    "widget-relative":  { visible: true,  scale: 1.0, x: 360, y: 130, w: 320, h: 150 },

    "widget-fuel":      { visible: true,  scale: 1.0, x: 20,  y: 520, w: 180, h: 120 },
    "widget-inputs":    { visible: true,  scale: 1.0, x: 220, y: 520, w: 200, h: 120 },
    "widget-bestlap":   { visible: true,  scale: 1.0, x: 440, y: 520, w: 200, h: 95  },
    "widget-lastlap":   { visible: true,  scale: 1.0, x: 660, y: 520, w: 200, h: 95  },
    "widget-temps":     { visible: true,  scale: 1.0, x: 880, y: 520, w: 200, h: 95  },
    "widget-incidents": { visible: true,  scale: 1.0, x: 1100,y: 520, w: 200, h: 95  },
  }
};

let state = loadState();

function loadState() {
  try {
    const p = getStatePath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      return {
        ...defaultState,
        ...parsed,
        widgets: { ...defaultState.widgets, ...(parsed.widgets || {}) }
      };
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(defaultState));
}

function saveState() {
  try { fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8"); } catch (_) {}
}

function broadcastState() {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send("state-init", state);
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send("state-init", state);
}

function applyEditMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  // Edit mode ON  => overlay ska ta mus (så du kan dra/resize)
  // Edit mode OFF => overlay ska vara click-through (så iRacing är klickbart)
  overlayWindow.setIgnoreMouseEvents(!state.editMode, { forward: true });

  overlayWindow.webContents.send("edit-mode", state.editMode);
  broadcastState();
}

function bringSettingsToFront() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.show();
  settingsWindow.focus();
  settingsWindow.moveTop();
}

// --- Python bridge auto start ---
function startPythonBridge() {
  // DEV: kör .py via python (som du gör idag)
  if (!app.isPackaged) {
    const script = path.join(__dirname, "iracing_udp_bridge.py");

    const cmd = (process.platform === "win32") ? "py" : "python3";
    const fallback = (process.platform === "win32") ? "python" : "python";

    const trySpawn = (command) => {
      bridgeProc = spawn(command, [script], { stdio: "ignore", windowsHide: true });
      bridgeProc.on("exit", () => { bridgeProc = null; });
      bridgeProc.on("error", () => { bridgeProc = null; });
      return bridgeProc;
    };

    const p = trySpawn(cmd);
    if (!p || !p.pid) trySpawn(fallback);
    return;
  }

  // PROD: kör packad exe som ligger i resources/backend/
  const exePath = path.join(process.resourcesPath, "backend", "iracing_udp_bridge.exe");
  bridgeProc = spawn(exePath, [], { stdio: "ignore", windowsHide: true });
  bridgeProc.on("exit", () => { bridgeProc = null; });
  bridgeProc.on("error", () => { bridgeProc = null; });
}


function killPythonBridge() {
  if (!bridgeProc || !bridgeProc.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(bridgeProc.pid), "/T", "/F"], { windowsHide: true });
  } else {
    try { bridgeProc.kill("SIGKILL"); } catch (_) {}
  }
  bridgeProc = null;
}

function createOverlayWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile("index.html");

  overlayWindow.webContents.on("did-finish-load", () => {
    broadcastState();
    applyEditMode();
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    app.quit();
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 780,
    title: "Overlay Editor",
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setAlwaysOnTop(true, "screen-saver");
  settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  settingsWindow.loadFile("settings.html");

  settingsWindow.webContents.on("did-finish-load", () => broadcastState());

  settingsWindow.on("close", () => app.quit());
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

function registerHotkeys() {
  globalShortcut.register("CommandOrControl+Shift+O", bringSettingsToFront);
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
}

// UDP listener
function startUdpListener() {
  udpServer.on("message", (msg) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
      const data = JSON.parse(msg.toString());
      overlayWindow.webContents.send("update-data", data);
    } catch (_) {}
  });
  udpServer.bind(12345);
}

// IPC
ipcMain.handle("get-state", () => state);

ipcMain.on("edit-mode", (_e, enabled) => {
  state.editMode = !!enabled;
  saveState();
  applyEditMode();
});
ipcMain.on("master-hidden", (_e, enabled) => {
  state.masterHidden = !!enabled;
  saveState();
  broadcastState();
});

ipcMain.on("setting-change", (_e, payload) => {
  const id = payload?.id;
  if (!id) return;

  const w = state.widgets[id] || (state.widgets[id] = { visible: true, scale: 1.0, x: 20, y: 20, w: 200, h: 120 });

  if (payload.type === "visibility") w.visible = !!payload.value;
  if (payload.type === "scale") w.scale = Number(payload.value) || 1.0;

  saveState();
  broadcastState();
});



ipcMain.on("layout-change", (_e, payload) => {
  const id = payload?.id;
  if (!id) return;

  const w = state.widgets[id] || (state.widgets[id] = { visible: true, scale: 1.0, x: 20, y: 20, w: 200, h: 120 });

  if (Number.isFinite(Number(payload.x))) w.x = Math.max(0, Math.round(payload.x));
  if (Number.isFinite(Number(payload.y))) w.y = Math.max(0, Math.round(payload.y));
  if (Number.isFinite(Number(payload.w))) w.w = Math.max(120, Math.round(payload.w));
  if (Number.isFinite(Number(payload.h))) w.h = Math.max(60,  Math.round(payload.h));

  saveState();
  broadcastState();
});

app.whenReady().then(() => {
  startPythonBridge();
  createOverlayWindow();
  createSettingsWindow();
  startUdpListener();
  registerHotkeys();
});

app.on("before-quit", () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { udpServer.close(); } catch (_) {}
  killPythonBridge();
});

app.on("window-all-closed", () => app.quit());
