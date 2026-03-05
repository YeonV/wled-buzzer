# WLED Buzzer

## ![version](https://img.shields.io/github/v/release/YeonV/wled-buzzer?label=VERSION&logo=git&logoColor=white) [![creator](https://img.shields.io/badge/CREATOR-Yeon-blue.svg?logo=github&logoColor=white)](https://github.com/YeonV) [![creator](https://img.shields.io/badge/A.K.A-Blade-darkred.svg?logo=github&logoColor=white)](https://github.com/YeonV)

A self-contained wireless quiz buzzer system for game shows and events. Physical WLED-powered buzzers connect over Wi-Fi to a Node.js server that runs the game logic, hosts the MQTT broker, and serves a React scoreboard — all from a single `.exe` that runs offline with no internet required.

---

|           | Link |
|-----------|------|
| Download  | [![download](https://img.shields.io/github/v/release/YeonV/wled-buzzer?label=Latest+Release&logo=github&logoColor=white&color=blue)](https://github.com/YeonV/wled-buzzer/releases/latest) [![downloads](https://img.shields.io/github/downloads/YeonV/wled-buzzer/total?label=Total+Downloads&color=blue&logo=data:image/svg+xml;base64,PHN2ZyByb2xlPSJpbWciIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMTEuMiAwYS44LjggMCAwIDAtLjguOHYxMS40TDcuMjYgOS40NGEuODAzLjgwMyAwIDAgMC0xLjEzLjA3NGwtMS4wNSAxLjJhLjguOCAwIDAgMCAuMDczIDEuMTNsNi4zMyA1LjU0YS43OTUuNzk1IDAgMCAwIDEuMDUgMGw2LjMyLTUuNTRhLjguOCAwIDAgMCAuMDc0LTEuMTNsLTEuMDUtMS4yYS44MDQuODA0IDAgMCAwLTEuMTMtLjA3NGwtMy4xNCAyLjc2Vi44YS44LjggMCAwIDAtLjgtLjh6bS04IDIwLjhhLjguOCAwIDAgMC0uOC44djEuNmEuOC44IDAgMCAwIC44LjhoMTcuNmEuOC44IDAgMCAwIC44LS44di0xLjZhLjguOCAwIDAgMC0uOC0uOHoiPjwvcGF0aD48L3N2Zz4=)](https://github.com/YeonV/wled-buzzer/releases) |
| Workflow  | [![release](https://img.shields.io/github/actions/workflow/status/YeonV/wled-buzzer/release.yml?label=Release+Build&logo=githubactions&logoColor=white)](https://github.com/YeonV/wled-buzzer/actions) |

### Tech Stack

[![Node.js](https://img.shields.io/badge/-Node.js-blue?logo=node.js&logoColor=white&label=)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/-Express-blue?logo=express&logoColor=white&label=)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/-Socket.IO-blue?logo=socket.io&logoColor=white&label=)](https://socket.io/)
[![React](https://img.shields.io/badge/-React-blue?logo=react&logoColor=white&label=)](https://react.dev/)
[![Vite](https://img.shields.io/badge/-Vite-blue?logo=vite&logoColor=white&label=)](https://vitejs.dev/)
[![MQTT](https://img.shields.io/badge/-MQTT-blue?logo=mqtt&logoColor=white&label=)](https://mqtt.org/)
[![WLED](https://img.shields.io/badge/-WLED-blue?logo=esphome&logoColor=white&label=)](https://kno.wled.ge/)

---

## How it works

```
[WLED Buzzer]  ──MQTT──►  [Node.js Server]  ──Socket.IO──►  [Browser / Scoreboard]
  ESP8266/32               Aedes broker           React + Vite
  WS2812B LEDs             Game logic             Audio + animations
  Physical button          HTTP → WLED API        Score tracking
```

1. A player presses their physical buzzer
2. WLED fires a button macro → publishes `ps=1` over MQTT
3. The server locks the game, identifies the winner, notifies the UI
4. The host judges correct / wrong → server updates scores and changes all LED colors
5. After a short delay the game resets, LEDs return to idle breathing blue

---

## Features

- **Quiz mode** — first-to-buzz locks out all others; host judges correct/wrong; configurable point stake; auto-wrong after a configurable timeout
- **Reflex mode** — 3-2-1 countdown with random color distractors; GO signal; scores ranked by reaction time with 3×/2×/1× multipliers; false-start penalty
- **Live scoreboard** — real-time scores sorted by rank, persisted across rounds
- **Setup screen** — Wi-Fi scan discovers all WLED devices on the subnet; one-click MQTT config push + reboot; physical button auto-identifies each buzzer; name them before starting
- **Master controls** — set all buzzers to Idle / On / Off / Press flash from the toolbar
- **Audio engine** — buzzer sound, correct/wrong stings, three background loop tracks
- **Portable build** — single Windows `.exe` that opens the browser automatically; no Node.js required

---

## Hardware

| Part | Notes |
|---|---|
| ESP8266 or ESP32 | Wemos D1 Mini works great |
| WS2812B LED strip | Wired to D4 (GPIO 2) |
| Tactile push button | Wired between GND and D3 (GPIO 0) |
| 5V USB power bank | Powers both the ESP and LEDs |
| WLED firmware | Standard binary — no custom code |

**WLED button config:**  
Settings → LED → Button 0 → Type: `Pushbutton` → Action: `Preset 1`

Preset 1 is the *PRESS* preset (white burst) — the server uses `ps=1` as the buzz trigger. All other game presets (Winner green, Loser red, Idle breathing blue) are pushed automatically when you start the game.

---

> [!WARNING]
> **This application will OVERWRITE your WLED presets and MQTT settings.**
> WLED used as Buzzers will looser their presets and mqtt settings!

## Quick start

**Requirements:** Node.js 18+, npm

```bat
:: Backend
cd backend && npm install && node server.js

:: Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`

---

## Production build

```bat
build.bat
```

1. `vite build` in `frontend/`
2. `npm install` in `backend/`
3. Packages `server.js` → `dist/wled-buzzer.exe` via [pkg](https://github.com/vercel/pkg)
4. Copies `frontend/dist/` → `dist/public/`

```
dist/
  wled-buzzer.exe   ← double-click; opens browser automatically
  public/           ← must stay next to the exe
```

> Triggered automatically on push via GitHub Actions when commit starts with `Release ` — attaches a zip to a new GitHub Release.

---

## Production network setup

For maximum reliability use a **dedicated offline router**:

1. Laptop → router via **Ethernet**
2. WLED buzzers → router **Wi-Fi**
3. Assign **static IPs** to each WLED (WLED → Config → Wi-Fi → Static IP)
4. Open Setup Screen → scan → push MQTT config → name buzzers → **Start Game**

| Port | Protocol | Purpose |
|---|---|---|
| 3001 | HTTP / WebSocket | Frontend + Socket.IO |
| 1883 | TCP | MQTT broker (Aedes) |

---

<details>
<summary>Project structure</summary>

```
wled-buzzer/
├── .github/workflows/
│   └── release.yml        # Auto-build + GitHub Release on "Release x.x.x" commits
├── backend/
│   ├── server.js          # MQTT broker, game logic, WLED HTTP API, static file serving
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main game UI — quiz, reflex, scoreboard, settings
│   │   ├── App.css
│   │   ├── SetupScreen.jsx    # Pre-game device discovery and roster setup
│   │   └── WledDiscovery.jsx  # Subnet scanner
│   └── public/
│       ├── buzzer.mp3
│       ├── correct.mp3
│       ├── wrong.mp3
│       ├── tick.mp3
│       └── loop1-3.mp3
├── build.bat              # One-click Windows build → dist/wled-buzzer.exe
├── .gitignore
└── README.md
```

</details>

---

## Credits

[![wled](https://img.shields.io/badge/Github-WLED-blue.svg?logo=github&logoColor=white)](https://github.com/Aircoookie/WLED)