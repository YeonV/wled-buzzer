# WLED Buzzer

## ![version](https://img.shields.io/github/v/release/YeonV/wled-buzzer?label=VERSION&logo=git&logoColor=white) [![creator](https://img.shields.io/badge/CREATOR-Yeon-blue.svg?logo=github&logoColor=white)](https://github.com/YeonV) [![creator](https://img.shields.io/badge/A.K.A-Blade-darkred.svg?logo=github&logoColor=white)](https://github.com/YeonV)

A self-contained wireless quiz buzzer system for game shows and events. Physical WLED-powered buzzers connect over Wi-Fi to a Node.js server that runs the game logic, hosts the MQTT broker, and serves a React frontend — all from a single `.exe` that runs offline with no internet required.

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
[WLED Buzzer]  ──MQTT──►  [Node.js Server]  ──Socket.IO──►  [Browser Views]
  ESP8266/32               built-in broker        React + Vite
  WS2812B LEDs             Game logic             Multi-view system
  Physical button          HTTP → WLED API        Audio + particle effects
```

1. A player presses their physical buzzer
2. WLED fires a button macro, publishes `ps=1` over MQTT
3. The server locks the game, identifies the winner, notifies all connected clients
4. The host judges correct / wrong — server updates scores and changes all LED colors
5. After verdict the game resets, LEDs return to player's idle color

---

## Features

### Game modes

| Mode | Description |
|------|-------------|
| **Quiz** | First-to-buzz locks out all others; host judges correct/wrong; configurable point stake; auto-wrong timer with on-screen countdown |
| **Reflex** | 3-2-1 countdown with random color distractors; GO signal; ranked by reaction time with multipliers; false-start penalty |
| **Precision Timer** | Players try to stop exactly at a target time; scored by closeness |
| **Sport Timer** | Open stopwatch; players buzz ranked by speed or slowest (configurable) |
| **I-Timer** | Each player timed individually in sequence; supports fastest / longest / amount scoring |
| **Elimination** | Players accumulate buzzes; highest count eliminated each round |
| **Bomb Defusal** | Countdown bomb; last player to buzz before it explodes wins |
| **Survivor** | Reflex-style last-player-standing; slowest each round is knocked out |
| **Hint** | Progressive hints with decreasing points; wrong answers lock out the player |
| *...* | *Extensible via the plugin system — add custom game modes without modifying core code* |

### Multi-view system

Open the same URL with different `?view=` parameters for dedicated roles:

| URL | Role | Description |
|-----|------|-------------|
| `http://server:1303/` | **Display** | Projector / TV — questions, answers, animations, audio playback |
| `?view=master` | **Master** | Full game-master desktop — all controls, mode selector |
| `?view=moderator` | **Moderator** | Phone-optimised — sticky top bar, fixed bottom media dock, essential controls |
| `?view=scoreboard` | **Scoreboard** | Dedicated points display — always-on, no audio, independent styling |

All views are synchronized in real-time via Socket.IO with full state replay on connect/reconnect.

### Content pack system

All content (questions, avatars, videos) is organized into **packs** — portable ZIP bundles that can be imported, exported, and mixed:

- **Unified pack format** — a pack can contain any combination of avatars, questions, and videos
- **Selective activation** — use avatars from one pack and questions from another
- **Pack Manager** — dedicated modal to browse, import, export, and delete packs; accessible from settings and setup screen via the package icon
- **Selective import/export** — choose which content types to include when importing or exporting a pack (avatars, questions, videos)
- **Global drag-and-drop** — drop a `.zip` anywhere on the app to import a pack; local drop zones (images, audio) still work independently
- **Avatar auto-matching** — when a player's name matches an avatar filename (case-insensitive), the avatar is automatically assigned (e.g. player "Blade" auto-picks `Blade.png`)
- **Pack-level videos** — avatar packs can ship intro/reveal videos that appear in the media dock alongside question-specific videos

### Quiz question system

- **Question Sets** — each pack can contain a question set; switch active question pack from settings
- **Built-in Question Editor** — create, edit, reorder, delete questions in the browser
- **Question modes** — `intro`, `rules`, `text`, `video`, `config`, `standings`, `quiz`, `hint`, `timer`, `itimer` (extensible via plugins)
- **Video mode** — plays a video fullscreen on display; upload videos per pack with drag-and-drop
- **Config mode** — auto-applies language, theme, scoreboard position, and team assignments when reached
- **Team management** — shuffle players into N teams via config slides; team scoreboard with aggregated scores; individual scores preserved
- **Scoreboard modes** — `topN` (show only top N), `showGaps` (point differences), `standings` slide type for halftime/final reveals
- **Multiple choice** — 4 options with images; radio-select correct answer
- **Free text** — open-ended answer with optional answer image
- **Pretext** — show a teaser before revealing the full question
- **Question images** — drag-and-drop upload or paste URL; inline preview in editor
- **Loop audio** — per-question music loop selection from uploaded MP3s; named loops
- **Import/Export** — full pack as ZIP (questions + audio + images + videos + avatars) with content selection dialog
- **Moderator controls** — reveal questions step-by-step: show pretext → show question → show options → reveal correct answer
- **Navigation** — synced across all views; host can jump to any question

### Scoreboard & statistics

- **Live scoreboard** — real-time scores sorted by rank, with player avatars and aura effects
- **Configurable position** — bottom, top, left, right, bar-bottom, bar-top
- **Winner-only mode** — main display hides the scoreboard until someone buzzes, then spotlights just that player
- **Scoreboard variants** — dedicated `?view=scoreboard` view with selectable styles:
  - **Default** — centered table with large rows
  - **Blade** — card-based layout with 3D perspective buzzers, large avatars, and particle aura effects
- **Buzz animation** — winner row scales up 220% with golden glow; other players dim to 18%
- **Round history** — every round logged with mode, timing, scores, and verdicts
- **Save/load** — export results to JSON; browse past games
- **Final screen** — gold/silver/bronze podium with champion fanfare

### Player customization

- **18-color palette** — each player gets a unique color from a carefully selected palette (avoids red/green to not clash with correct/wrong LED feedback)
- **Individual colors** — toggle per-player custom color with color picker
- **Custom avatars** — upload player images via avatar packs; auto-matched by name (e.g. `Blade.png` auto-assigns to player "Blade"); supports outlined/filled icon styles and plain/rounded/circle image shapes
- **Configurable avatar size** — 8px to 128px, synced across all views
- **Player aura** — animated particle canvas effect (300 back particles + 20 front sparks); moderator can toggle persistent aura per player via long-press; scales proportionally to avatar size

### WLED integration

- **Auto-discovery** — subnet scan finds all WLED devices on the network
- **One-click MQTT push** ("Hijack") — overwrites MQTT settings on a device and reboots it
- **Physical identification** — press a button to auto-select and highlight the buzzer
- **Staggered parallel preset push** — all devices are synced concurrently with 50ms stagger between each; each device respects 350ms flash-write delay internally (~1.8s total for 9 buzzers instead of ~22s sequential)
- **Per-player LED presets** — 4 presets pushed to each device on game start:
  - **PRESS** — rainbow flash (default) or scan effect in player color (when individual color is set)
  - **WINNER** — solid green
  - **LOSER** — solid red
  - **IDLE** — breathing blue (default) or solid player color (when individual color is set)
- **Manual idle color push** — paintbrush button in setup to push player color to device before game start
- **Alias system** — map multiple buzzers to one player (e.g. team buzzer)
- **LedFX add-on** — assign LedFX virtual devices per player for extra lighting effects; auto-matched by name

### Media system

- **Loop audio buttons** — up to N named music loops; toggle from the moderator's media dock; synced across all clients; only display plays audio
- **Video buttons** — videos from active avatar pack + active question pack merged in the dock; one-shot playback triggered from moderator; fullscreen on display; auto-dismisses on end
- **Shared media dock** — loop and video buttons in a single fixed-bottom bar on moderator view
- **Audio engine** — buzzer sound, correct/wrong stings, tick, time-up, champion fanfare; all audio disabled on control and scoreboard views

### Settings & configuration

- **Language** — English / Deutsch, switchable live, synced to all clients
- **Themes** — Default, Jungle, Rose, Rose Light, Crystal, Aurora
- **Buzzer lock** — open/close all buzzers between rounds
- **Answer time limit** — configurable auto-wrong timer (1-60 seconds)
- **Score reset** — reset all scores to zero
- **Undo last verdict** — long-press (800ms) to reverse the last judgeCall; reverts score delta and unlocks buzzers
- **End game** — return to setup screen from settings; clears all state and deletes checkpoint
- **Pack selectors** — switch active question pack and avatar pack independently from settings or setup screen
- **Compact mode** — toggle to show only active players on the scoreboard
- **Crash recovery** — game state (scores, roster, round history, settings) auto-saved to `game-state.json` after every score change; automatically restored on server restart

---

## Hardware

| Part | Notes |
|------|-------|
| ESP8266 or ESP32 | Wemos D1 Mini works great |
| WS2812B LED strip | Wired to D4 (GPIO 2) |
| Tactile push button | Wired between GND and D3 (GPIO 0) |
| 5V USB power bank | Powers both the ESP and LEDs |
| WLED firmware | Standard binary — no custom code |

**WLED button config:**
Settings → LED → Button 0 → Type: `Pushbutton` → Action: `Preset 1`

Preset 1 is the *PRESS* preset — the server uses `ps=1` as the buzz trigger. All other game presets (Winner, Loser, Idle) are pushed automatically when you start the game. When individual player colors are set, PRESS uses scan effect and IDLE uses solid color in the player's color.

---

> [!WARNING]
> **This application will OVERWRITE your WLED presets and MQTT settings.**
> WLED devices used as buzzers will lose their existing presets and MQTT settings!

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
    uploads/
      packs/        ← content packs (avatars, questions, videos)
```

> Triggered automatically on push via GitHub Actions when commit starts with `Release ` — attaches a zip to a new GitHub Release.

---

## Production network setup

For maximum reliability use a **dedicated offline router**:

1. Laptop → router via **Ethernet**
2. WLED buzzers → router **Wi-Fi**
3. Assign **static IPs** to each WLED (WLED → Config → Wi-Fi → Static IP)
4. Open Setup Screen → scan → push MQTT config → name buzzers → **Start Game**
5. Open the display URL on the TV/projector (no `?view` param)
6. Open `?view=moderator` on your phone for on-the-go control
7. Open `?view=scoreboard` on a second screen for dedicated points display

| Port | Protocol | Purpose |
|------|----------|---------|
| 1303 | HTTP / WebSocket | Frontend + Socket.IO |
| 1883 | TCP | MQTT broker |

---

<details>
<summary>Project structure</summary>

```
wled-buzzer/
├── .github/workflows/
│   └── release.yml              # Auto-build + GitHub Release on "Release x.x.x" commits
├── backend/
│   ├── server.js                # Entry point — orchestrator, core controls, theme/UI, MQTT
│   ├── constants.js             # Shared constants (ports, preset IDs, timings)
│   ├── config.json              # Runtime config (ports, LedFX URL, preset definitions)
│   ├── package.json
│   └── lib/
│       ├── state.js             # Shared mutable game state + checkpoint persistence
│       ├── quiz.js              # Question sync, answer judging, undo, results
│       ├── setup-sync.js        # Setup screen relay, roster, staggered WLED preset push
│       ├── winner.js            # Winner detection, blade-lock penalties, game reset
│       ├── wled.js              # WLED HTTP API (presets, scan, MQTT push, idle color)
│       ├── ledfx.js             # LedFX add-on integration (optional)
│       ├── lights.js            # Unified light helpers (WLED + LedFX)
│       ├── mqtt-broker.js       # Built-in MQTT broker setup
│       ├── routes.js            # Express REST API (packs, question sets, videos, avatars, results)
│       ├── utils.js             # sleep(), misc helpers
│       └── game/
│           ├── reflex.js        # Reflex + Survivor mode
│           ├── precision.js     # Precision Timer mode
│           ├── elimination.js   # Elimination mode
│           ├── bomb.js          # Bomb Defusal mode
│           ├── timer.js         # Sport Timer mode
│           └── iter.js          # Iterative Timer (I-Timer) mode
├── frontend/
│   ├── src/
│   │   ├── App.jsx / App.css    # Main app — routing, idle screen, game mode screens
│   │   ├── components/
│   │   │   ├── Scoreboard.jsx       # Default scoreboard (all views)
│   │   │   ├── ScoreboardBlade.jsx  # Blade variant (card layout with 3D buzzers)
│   │   │   ├── SuitAvatar.jsx       # Avatar renderer (icons, images, aura)
│   │   │   ├── AuraCanvases.jsx     # Canvas-only particle aura effect
│   │   │   ├── AnimatedAuraAvatar.* # Legacy aura wrapper (kept for compatibility)
│   │   │   ├── BuzzerCard.jsx       # Setup screen buzzer card
│   │   │   ├── Buzzer.jsx           # 3D perspective buzzer SVG
│   │   │   ├── MediaDock.jsx        # Shared loop + video buttons dock
│   │   │   ├── LoopButtons.jsx      # Audio loop toggle buttons
│   │   │   ├── VideoButtons.jsx     # One-shot video trigger buttons
│   │   │   ├── VideoOverlay.jsx     # Fullscreen video overlay (display only)
│   │   │   ├── PackManager.jsx     # Pack management modal (list, import, export, delete)
│   │   │   ├── GlobalFileDrop.jsx  # Global .zip drag-and-drop provider
│   │   │   ├── TopBar.jsx           # Sticky top toolbar (moderator/master)
│   │   │   └── screens/
│   │   │       ├── modes/           # Game mode screens + QuestionCard + DisplayCard
│   │   │       └── system/          # Setup, Settings, QuestionsEditor, FinalScreen
│   │   ├── store/
│   │   │   ├── gameStore.js         # Game state (winner, scores, phases, aura)
│   │   │   ├── sessionStore.js      # Session state (roster, names, settings)
│   │   │   ├── quizStore.js         # Quiz state (questions, navigation, reveal)
│   │   │   ├── setupStore.js        # Setup state (devices, colors, aliases)
│   │   │   └── audioStore.js        # Audio playback state
│   │   ├── services/
│   │   │   ├── socket.js            # Socket.IO client instance
│   │   │   ├── socketBridge.js      # Event listeners → store dispatchers
│   │   │   ├── socketActions.js     # Outgoing socket event helpers
│   │   │   └── api.js               # REST API fetch helpers (packs, questions, avatars, videos)
│   │   ├── utils/
│   │   │   ├── viewMode.js          # View type detection (master/moderator/scoreboard)
│   │   │   ├── config.js            # Supported languages, themes, scoreboard positions
│   │   │   ├── setupHelpers.js      # 18-color palette, roster helpers
│   │   │   ├── questions.js         # Display-only modes, answer helpers
│   │   │   └── storage.js           # sessionStorage persistence
│   │   ├── locales/
│   │   │   ├── en.js                # English translations
│   │   │   └── de.js                # German translations
│   │   └── hooks/
│   │       ├── useAppInit.js        # Startup side-effects (audio, data, sockets)
│   │       ├── useBuzzCountdown.js  # RAF-driven buzz countdown timer
│   │       └── useElapsed.js        # RAF-driven elapsed time for sport/iter timers
│   └── public/
│       ├── sounds/              # Audio files (buzzer, correct, wrong, tick, etc.)
│       └── uploads/
│           └── packs/          # Content packs (each: pack.json + avatars/ + videos/ + questions/)
├── build.bat                    # One-click Windows build → dist/wled-buzzer.exe
├── .gitignore
└── README.md
```

</details>

---

## Credits

[![wled](https://img.shields.io/badge/Github-WLED-blue.svg?logo=github&logoColor=white)](https://github.com/Aircoookie/WLED)
