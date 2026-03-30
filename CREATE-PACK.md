# How to Create a WLED Buzzer Content Pack

This guide covers every feature available in the WLED Buzzer quiz system. A pack is a folder (or ZIP) that can contain any combination of questions, avatars, and videos.

---

## Folder Structure

```
my-pack/
├── pack.json                 (REQUIRED)
├── settings.json             (OPTIONAL — avatar display settings)
├── avatars/                  (OPTIONAL)
│   ├── PlayerName.png        (filename MUST match player name, case-sensitive)
│   └── ...
├── videos/                   (OPTIONAL — pack-level intro/reveal videos)
│   ├── PlayerName.mp4        (filename matches player name for auto-matching)
│   └── ...
└── questions/                (OPTIONAL)
    ├── questions.json        (REQUIRED if questions/ exists)
    ├── audio/                (OPTIONAL)
    │   ├── loop1.mp3
    │   ├── loop2.mp3
    │   └── ...
    └── images/               (OPTIONAL)
        ├── my-image.png
        └── ...
```

A pack can be **minimal** (just `pack.json`) or **complete** (all folders). Every subfolder is optional.

---

## pack.json

```json
{
  "name": "My Pack",
  "description": "A brief description of what this pack contains",
  "version": "1.0"
}
```

All three fields are required.

---

## settings.json (Avatar Settings)

Controls how avatars display across all views. Optional — defaults apply if missing.

```json
{
  "size": 128,
  "variant": "outlined",
  "imageStyle": "rounded"
}
```

| Field | Type | Values | Default |
|-------|------|--------|---------|
| `size` | number | 8–128 (pixels) | 28 |
| `variant` | string | `"outlined"`, `"filled"` | `"outlined"` |
| `imageStyle` | string | `"plain"`, `"rounded"`, `"circle"` | `"rounded"` |

---

## Avatar Images

- **Location:** `avatars/`
- **Format:** PNG (recommended), JPG also works
- **Naming:** `{ExactPlayerName}.png` — case-sensitive match
- **Auto-matching:** When a player is named "Blade", the system auto-assigns `Blade.png` as their avatar
- **Size:** Any resolution; displayed at the configured `size` in settings.json

Example: 9 players named Blade, Leon, Lorain, Fabio, Saida, Bastian, Andreas, Zoe, Johanna would need:
```
avatars/Blade.png
avatars/Leon.png
avatars/Lorain.png
avatars/Fabio.png
avatars/Saida.png
avatars/Bastian.png
avatars/Andreas.png
avatars/Zoe.png
avatars/Johanna.png
```

---

## Videos

### Pack-Level Videos (`videos/`)

Intro/reveal videos tied to players. Appear as buttons in the moderator's media dock.

- **Format:** MP4
- **Naming:** `{PlayerName}.mp4` — auto-matched by player name
- **Usage:** Moderator taps a button labeled with the filename (minus extension) to play fullscreen on the display

### Question Videos (`questions/videos/`)

Videos used within specific questions (video mode slides). Referenced by path in questions.json.

- **Format:** MP4
- **Naming:** Any descriptive filename

---

## Audio Loops

- **Location:** `questions/audio/`
- **Format:** MP3
- **Naming:** `loop{N}.mp3` where N is a positive integer (1, 2, 3, ...)
- **Referenced in questions.json** by number only: `"loop": 4` plays `loop4.mp3`
- **Purpose:** Background music during timer/itimer rounds, or ambient audio for any question

---

## Questions (questions.json)

A JSON array of question objects. Each has a `mode` field that determines the slide type.

### Available Modes

| Mode | Purpose | Interactive? |
|------|---------|:------------:|
| `config` | Set language, theme, scoreboard, teams (invisible slide) | No |
| `intro` | Title card / intro screen | No |
| `rules` | Rules display | No |
| `text` | Generic text display | No |
| `video` | Full-screen video playback | No |
| `standings` | Dedicated scoreboard display moment | No |
| `quiz` | Question with answers (multiple choice OR free text) | Yes |
| `hint` | Progressive hints with decreasing points | Yes |
| `timer` | Timed buzzer challenge (all players race) | Yes |
| `itimer` | Individual timed challenge with scoring variants | Yes |
| *...* | *Additional modes available via plugins* | — |

### Universal Fields

These optional fields can be added to **any** question mode:

| Field | Type | Description |
|-------|------|-------------|
| `chapter` | string | Chapter label — enables chapter jump menu in moderator navigation. Persists until the next `chapter` field. |
| `questionImage` | string | Image URL or path shown with the question |
| `questionImagePosition` | string | `"right"` (side-by-side), `"below"`, `"fullscreen"` (large), `"background"` (translucent overlay). Default: above. |
| `loop` | number | Audio loop number — plays `loop{N}.mp3` during this slide |

---

### Mode: `config`

Sets UI configuration when this slide is reached. Config slides are invisible — the system auto-skips to the next visible slide. Typically placed before each game section.

```json
{
  "mode": "config",
  "chapter": "Round 1: Buzzer Quiz",
  "lang": "en",
  "theme": "aurora",
  "scoreboardPos": "bottom"
}
```

All fields except `mode` are optional — only set what you want to change.

**Team management:**

```json
{
  "mode": "config",
  "chapter": "Round 3: Team Game",
  "teams": {
    "count": 4,
    "shuffle": true,
    "display": true
  }
}
```

When `shuffle: true`, all active players are randomly assigned into `count` teams (2–8). Team assignments persist until the next shuffle. The scoreboard automatically switches to team view, showing aggregated team scores. Individual scores are preserved — when teams are cleared, each player keeps their accumulated points.

**Scoreboard control:**

```json
{
  "mode": "config",
  "scoreboard": {
    "topN": 3,
    "showGaps": true
  }
}
```

- `topN`: show only the top N players (0 = show all, default)
- `showGaps`: display point differences between adjacent ranks

**Languages:** `"en"` (English), `"de"` (Deutsch)

**Themes:** `"default"`, `"jungle"`, `"rose"`, `"rose-light"`, `"crystal"`, `"aurora"`

**Scoreboard positions:** `"bottom"`, `"top"`, `"left"`, `"right"`, `"bar-bottom"`, `"bar-top"`

---

### Mode: `intro`

Full-screen title card. Supports newlines with `\n`.

```json
{
  "mode": "intro",
  "question": "XEON Game Night\n16 Players — 9 Games"
}
```

---

### Mode: `rules`

Rules or instruction screen. Supports newlines with `\n`.

```json
{
  "mode": "rules",
  "question": "Buzzer Rules\n\nFirst to press gets to answer.\nCorrect = +100 points\nWrong = -100 points"
}
```

---

### Mode: `text`

Generic text display.

```json
{
  "mode": "text",
  "question": "Fun fact: The Earth is approximately 4.5 billion years old."
}
```

---

### Mode: `video`

Plays a video fullscreen on the display.

```json
{
  "mode": "video",
  "question": "Watch this intro clip",
  "video": "intro.mp4"
}
```

---

### Mode: `standings`

A dedicated slide that triggers a prominent scoreboard display moment. Pair with a preceding `config` slide to control `topN` and `showGaps`.

```json
{ "mode": "standings", "question": "Halftime Standings — Top 3" }
```

---

### Mode: `quiz` — Multiple Choice

4 answer options, one correct (0-indexed).

```json
{
  "mode": "quiz",
  "question": "What is the capital of France?",
  "answers": ["Paris", "London", "Berlin", "Madrid"],
  "correct": 0
}
```

**With images on question and/or answers:**

```json
{
  "mode": "quiz",
  "question": "Which logo is this?",
  "questionImage": "images/logo-mystery.png",
  "questionImagePosition": "right",
  "answers": [
    { "text": "GitHub", "image": "images/github.png" },
    { "text": "GitLab", "image": "images/gitlab.png" },
    { "text": "Bitbucket" },
    "SourceForge"
  ],
  "correct": 0
}
```

- Answers can be plain strings OR objects with `text` and/or `image`
- You can mix both formats in the same array
- `correct` is the 0-based index of the correct answer

**Asymmetric scoring:** Override the default ±points with custom values:

```json
{
  "mode": "quiz",
  "question": "Solve: 7 × 8",
  "answer": "56",
  "scoring": 80,
  "penalty": -40
}
```

- `scoring`: points awarded for a correct answer (overrides the global ±Points setting)
- `penalty`: points applied on a wrong answer (use a negative number). Default: `-scoring` (symmetric)

### Mode: `quiz` — Free Text

Single open-ended answer. The moderator judges correct/wrong based on what the player says verbally.

```json
{
  "mode": "quiz",
  "question": "Who discovered Polonium and Radium?",
  "pretext": "Think about Nobel Prize winners...",
  "answer": "Marie Curie",
  "answerImage": "images/marie-curie.png"
}
```

- `pretext`: optional teaser shown before the question is revealed
- `answer`: the correct answer (shown on reveal)
- `answerImage`: optional image shown alongside the answer on reveal

**Answer validation (moderator helper):**

```json
{
  "mode": "quiz",
  "question": "Who discovered Polonium and Radium?",
  "answer": "Marie Curie",
  "acceptedAnswers": ["Marie Curie", "Curie", "Maria Sklodowska", "Sklodowska-Curie"],
  "fuzzyMatch": true
}
```

- `acceptedAnswers`: array of strings that should be accepted as correct. When present, the moderator's judge screen shows a live text input — as they type what the player said, a badge shows whether it matches (exact, substring, or fuzzy).
- `fuzzyMatch`: when `true`, tolerate minor typos (Levenshtein distance ≤ 2). "Curi" matches "Curie".
- The moderator always has final say — the validator is a helper, not an auto-judge.

**How to distinguish the two quiz variants:**
- Multiple choice: has `answers` array + `correct` index, NO `answer` field
- Free text: has `answer` string, NO `answers` array

---

### Mode: `hint` (Progressive Hints)

Players try to answer a question as hints are progressively revealed. Earlier correct answers earn more points. Wrong answers lock the player out for this question.

```json
{
  "mode": "hint",
  "question": "Name this chemical element",
  "hints": [
    "It was associated with the planet with an 88-day orbit in alchemy.",
    "It was formerly used in fever thermometers.",
    "It is the only metal that is liquid at room temperature.",
    "Its symbol Hg comes from the Latin 'Hydrargyrum'.",
    "In German it carries the name of a 'living silver'."
  ],
  "answer": "Mercury (Quecksilber)",
  "scoring": [80, 65, 50, 35, 20],
  "penalty": -20
}
```

- `hints`: array of progressive hint strings (revealed one at a time by the moderator)
- `answer`: the correct answer (shown on reveal)
- `scoring`: points array mapped 1:1 to hint index (hint 1 = `scoring[0]`, hint 2 = `scoring[1]`, etc.)
- `penalty`: optional points deducted on wrong answer (default: 0). Use a negative number.
- **Display:** Question + hints revealed so far + animated point badge showing current hint value
- **Moderator:** Sees all hints (revealed ones highlighted), "Next Hint" button, lockout chips
- **Lockout:** Wrong answer → player locked out for this question (LED flashes red, chip shown). Buzzers re-open for remaining players after 1.2s.

---

### Mode: `timer`

Timed buzzer challenge. All players race to buzz in. Optionally with a countdown duration.

```json
{
  "mode": "timer",
  "question": "Spaghetti Tower — build time!",
  "loop": 2,
  "duration": 600,
  "scoringType": "fastest"
}
```

- `loop`: integer referencing `loop{N}.mp3` in `questions/audio/`
- `duration`: optional countdown in seconds (e.g. `600` = 10 minutes). Shows a countdown timer with progress bar. Warning animation in the last 30 seconds. Auto-closes at zero. Omit for unlimited elapsed-time mode.
- `scoringType`: `"fastest"` (default) or `"longest"`

---

### Mode: `itimer` (Individual Timer)

Each player is timed individually in sequence. Three scoring variants.

```json
{
  "mode": "itimer",
  "question": "Fastest finger first!",
  "scoringType": "fastest",
  "loop": 4,
  "duration": 30
}
```

- `duration`: optional per-player countdown in seconds. Each player's turn auto-stops at zero. Warning animation in the last 10 seconds. Omit for unlimited.

| scoringType | Description |
|-------------|-------------|
| `"fastest"` | Shortest hold time wins |
| `"longest"` | Longest hold time wins |
| `"amount"` | Moderator enters a count per player; highest wins |

---

## Image Paths in questions.json

Image paths are **relative to the pack's `questions/` folder**:

```json
{
  "questionImage": "images/my-image.png",
  "questionImagePosition": "right",
  "answers": [
    { "text": "Option A", "image": "images/option-a.png" }
  ]
}
```

The backend resolves these to the correct absolute URL automatically.

**Image position options:**

| Value | Layout |
|-------|--------|
| *(default)* | Image above the question text |
| `"right"` | Image to the right, text to the left (side-by-side) |
| `"below"` | Image below the question text |
| `"fullscreen"` | Image displayed larger (60vh max) |
| `"background"` | Image as a translucent background overlay (15% opacity) |

**Remote zoom:** On the moderator view, clicking any question image sends it fullscreen to the display (projector). Click again to dismiss. The moderator controls what the audience sees.

---

## Complete Example: questions.json

A full game night with chapters, teams, multiple game modes, and scoring variants:

```json
[
  { "mode": "config", "chapter": "Intro", "lang": "de", "theme": "aurora", "scoreboardPos": "bottom" },
  { "mode": "intro", "question": "XEON Game Night\n16 Spieler — 9 Spiele" },
  { "mode": "rules", "question": "Regeln\n\n1. Erster Druck antwortet\n2. Richtig = Punkte\n3. Falsch = Abzug\n4. Moderator entscheidet!" },

  { "mode": "config", "chapter": "Spiel 1: Buzzer-Quiz" },
  {
    "mode": "hint",
    "question": "Gesucht: Ein chemisches Element",
    "hints": ["Alchemie: Planet mit 88 Tagen Umlaufzeit.", "Wurde in Fieberthermometern verwendet.", "Einziges Metall, flüssig bei Raumtemperatur."],
    "answer": "Quecksilber",
    "scoring": [80, 50, 20]
  },
  { "mode": "quiz", "question": "Hauptstadt von Frankreich?", "answers": ["Paris", "London", "Berlin", "Madrid"], "correct": 0 },
  { "mode": "quiz", "question": "Wer entdeckte Polonium?", "answer": "Marie Curie", "acceptedAnswers": ["Marie Curie", "Curie", "Sklodowska"], "fuzzyMatch": true, "scoring": 80, "penalty": -40 },

  { "mode": "config", "chapter": "Spiel 2: Spaghetti-Turm", "teams": { "count": 4, "shuffle": true, "display": true } },
  { "mode": "timer", "question": "Spaghetti-Turm — Bauzeit!", "duration": 600, "loop": 2 },

  { "mode": "config", "chapter": "Halbzeit", "scoreboard": { "topN": 3, "showGaps": true } },
  { "mode": "standings", "question": "Halbzeit — Top 3" },

  { "mode": "config", "chapter": "Endergebnis", "scoreboard": { "topN": 0, "showGaps": true } },
  { "mode": "standings", "question": "Endergebnis" },
  { "mode": "intro", "question": "Danke fürs Spielen!" }
]
```

---

## Importing a Pack

Three ways to import:

1. **Drag and drop** a `.zip` file anywhere on the app
2. **Pack Manager** (package icon in settings/setup) → Import button
3. **Place the folder** directly in `uploads/packs/` (or `custom-packs/` for gitignored personal packs)

The ZIP should contain the pack folder structure at its root (pack.json at the top level of the ZIP).

---

## Tips

- **Config slide first:** Place a `config` mode question as the first item to set the theme/language for the whole quiz
- **Chapters for navigation:** Add a `chapter` field to config slides to create a jump menu — essential for large packs (100+ slides). The moderator sees a list icon that opens a dropdown to jump to any chapter instantly.
- **Intro → Rules → Questions → Standings → Outro:** A natural flow structure
- **Mix modes freely:** You can alternate quiz, hint, timer, and plugin mode rounds throughout
- **Team games:** Place a `config` slide with `teams.shuffle` before any team game. Teams persist until the next shuffle or until cleared.
- **Scoreboard control:** Use `config` slides with `scoreboard.topN` before standings slides to control what's revealed (halftime = top 3, finale = all)
- **Loop variety:** Use different loop numbers for different energy levels (calm for intro, intense for timers)
- **Image positions:** Use `"right"` for diagrams next to text, `"background"` for atmosphere, `"fullscreen"` for detail shots
- **Answer validation:** Add `acceptedAnswers` + `fuzzyMatch` to free-text questions so the moderator gets instant feedback while judging
- **Avatar naming:** Double-check that avatar filenames match player names exactly (case-sensitive)
- **Test locally:** Drop your pack folder in `custom-packs/` and select it from the settings to preview before zipping
