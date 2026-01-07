# Eveli’s iRacing Overlays

Eveli’s iRacing Overlays is a lightweight, customizable overlay suite for iRacing.  
It runs as a desktop app and reads live session data through a Python bridge, then renders clean on-screen widgets you can position anywhere.

## Features

### Live Standings / Results
- Position, car number, driver name
- **Practice / Qual / Warmup:** shows **lap time + gap to P1** on the same row
- **Race sessions:** shows gaps/intervals (when available)
- Highlights your own car

### Clean Overlay Widgets
- Designed to sit on top of iRacing while you drive
- Works with iRacing in **Windowed** or **Borderless** mode

### Per-widget Scaling & Placement
- Adjust widget size with a slider
- Place widgets where you want on screen

### Simple Launch
- One app starts both the overlay UI and the backend bridge  
  (no manual Python start needed in packaged builds)

## Project Status (Test Stage)

This project is currently in an **early test stage**. It already works as-is and can be used right now, but the codebase is still evolving and improvements may be frequent.

## Open Development (Please Contribute)

I want this project to be **community-driven**. You are encouraged to fork the repo, add features, and submit pull requests.

### Ideas for New Overlays / Features
Examples of things I would love to add over time:
- Relative / nearby cars overlay (ahead/behind with gaps)
- Fuel usage / fuel remaining and pit strategy panel
- Tires (compound, wear estimates, temps if available)
- Incident / penalty / event messages panel
- Lap delta / pace comparison widgets
- Driver rating / safety rating display (where applicable)
- Additional styling themes and layout presets
- Better multi-monitor handling and more widget controls

If you build something useful, please open a Pull Request so everyone can benefit.

## Requirements

- Windows 10/11
- iRacing running in **Windowed** or **Borderless** mode (recommended for overlays)

## Installation (End Users)

1. Go to the project’s **Releases** page on GitHub.
2. Download the latest installer (`.exe`).
3. Run the installer and complete setup.
4. Launch **Eveli’s iRacing Overlays** from the Start Menu or Desktop shortcut.
5. Start iRacing in **Borderless** or **Windowed** mode.
6. Move and scale the overlay widgets as desired.

### Recommended iRacing Display Settings
To ensure overlays appear on top reliably:
- Use **Borderless** (recommended) or **Windowed**
- If you use multiple monitors, place overlays on the same display as the iRacing window

## How to Use

1. Start the overlay app.
2. Start iRacing and join a session.
3. The overlay widgets will update automatically when session data is available.
4. Use the Settings window to adjust:
   - Widget scale (size)
   - Widget placement (position)

## Troubleshooting

### Overlays do not appear on top of iRacing
- Make sure iRacing is **Borderless** or **Windowed** (not exclusive fullscreen).
- Try restarting the overlay app after iRacing has fully loaded into the sim.
- If you have multiple displays, ensure the overlay and iRacing are on the same monitor.

### Text / scaling looks inconsistent
- Use the per-widget Scale slider to fine-tune size.
- If you recently changed widget content (standings format, etc.), restart the overlay app to refresh layout.

### The app starts but nothing updates
- Join an iRacing session (test session or online) and wait a few seconds.
- Restart the overlay app and try again.

## Development Setup

### Requirements
- Node.js (LTS recommended)
- Python 3.x

### Run in Development
```bash
npm install
pip install -r requirements.txt
npm start


![3](https://github.com/user-attachments/assets/95b927dd-d672-4cc2-b41b-80d56096319f)
![1](https://github.com/user-attachments/assets/78902e86-927e-4cef-99c0-d3606d3ed733)
![2](https://github.com/user-attachments/assets/2d1cf799-078e-4e97-bce8-e9cdba838f58)

