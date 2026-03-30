const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// ── Device-frame configs ─────────────────────────────────────────────────────
// Pre-fitted frame PNGs: each frame is pre-scaled so its transparent screen
// cutout exactly matches the video pixel dimensions (no crop, no ratio change).
// TV and laptop frames share the same height (1424) so their screens appear
// identical in size after scaling to TARGET_H.
//
// frameW/frameH  = pixel dimensions of the fitted frame PNG
// screenX/screenY = pixel offset where the video is placed behind the frame
const BG_COLOR = '0x111111';
const ASSETS   = path.join(__dirname, 'assets');

const FRAME_CONFIGS = [
  { // index 0 — display → TV  (fitted 2510×1424, screen 1920×1080 @ 308,172)
    file: path.join(ASSETS, 'tv-frame-fitted.png'),
    frameW: 2510, frameH: 1424,
    screenX: 308, screenY: 172,
  },
  { // index 1 — moderator → phone  (fitted 434×928, screen 360×800 @ 36,80)
    file: path.join(ASSETS, 'phone-frame-fitted.png'),
    frameW: 434, frameH: 928,
    screenX: 36, screenY: 80,
  },
  { // index 2 — scoreboard → laptop  (fitted 2412×1424, screen 1920×1080 @ 246,188)
    file: path.join(ASSETS, 'laptop-frame-fitted.png'),
    frameW: 2412, frameH: 1424,
    screenX: 246, screenY: 188,
  },
];

const TARGET_H = 1080;

/** Round to nearest even number (ffmpeg requires even dimensions). */
const even = n => 2 * Math.round(n / 2);

async function mergeVideos() {
  const pathsFile = process.argv[2] || 'videos/paths.txt';
  if (!fs.existsSync(pathsFile)) {
    console.log('No video paths found to merge.');
    return;
  }

  const lines = fs.readFileSync(pathsFile, 'utf8').trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.log('Not enough videos to merge.');
    return;
  }

  const videos = [];
  let audioFile = null;
  for (const line of lines) {
    if (!fs.existsSync(line)) continue;
    if (line.includes('audio')) {
      audioFile = line;
    } else {
      videos.push(line);
    }
  }

  if (videos.length < 2) {
    console.log('Not enough video files to merge.');
    return;
  }

  const baseName = path.basename(pathsFile, path.extname(pathsFile));
  const output = `videos/${baseName}.mp4`;

  // Resolve which frames exist and assign ffmpeg input indices
  const activeFrames = [];
  let nextInputIdx = videos.length;
  for (let i = 0; i < videos.length; i++) {
    const cfg = FRAME_CONFIGS[i];
    if (cfg && fs.existsSync(cfg.file)) {
      activeFrames.push({ videoIdx: i, config: cfg, inputIdx: nextInputIdx++ });
    }
  }
  const audioIdx = nextInputIdx;
  const frameMap = Object.fromEntries(activeFrames.map(f => [f.videoIdx, f]));

  // Build ffmpeg inputs
  let inputs = videos.map(v => `-i "${v}"`).join(' ');
  for (const f of activeFrames) inputs += ` -i "${f.config.file}"`;

  // ── Build filter graph ──
  // Each framed video: dark bg → overlay video at screen position → overlay frame on top → scale to TARGET_H
  const filters = [];
  const colLabels = [];

  for (let i = 0; i < videos.length; i++) {
    const f = frameMap[i];

    if (!f) {
      // No frame — plain scale to target height
      filters.push(`[${i}:v]scale=-2:${TARGET_H}[v${i}]`);
      colLabels.push(`[v${i}]`);
      continue;
    }

    const { frameW, frameH, screenX, screenY } = f.config;
    const colW = even(frameW * (TARGET_H / frameH));

    // 1. Dark background (infinite duration)
    filters.push(`color=c=${BG_COLOR}:s=${frameW}x${frameH}[bg${i}]`);

    // 2. Place video at screen position (shortest=1 → ends when video ends)
    filters.push(`[bg${i}][${i}:v]overlay=${screenX}:${screenY}:shortest=1[bgvid${i}]`);

    // 3. Overlay transparent frame on top (eof_action=repeat keeps the single PNG visible)
    filters.push(`[bgvid${i}][${f.inputIdx}:v]overlay=0:0:eof_action=repeat[col${i}]`);

    // 4. Scale column to target height
    filters.push(`[col${i}]scale=${colW}:${TARGET_H}[v${i}]`);
    colLabels.push(`[v${i}]`);
  }

  // hstack all columns
  filters.push(`${colLabels.join('')}hstack=inputs=${videos.length}[vid]`);
  const filterComplex = filters.join('; ');

  const frameCount = activeFrames.length;
  const label = frameCount > 0 ? ` (${frameCount} device frame${frameCount > 1 ? 's' : ''})` : '';

  let cmd;
  if (audioFile) {
    cmd = `"${ffmpeg}" ${inputs} -i "${audioFile}" -filter_complex "${filterComplex}" -map "[vid]" -map ${audioIdx}:a? -c:v libx264 -c:a aac -crf 23 -preset veryfast "${output}" -y`;
    console.log(`Merging ${videos.length} videos${label} with audio into ${output}...`);
  } else {
    cmd = `"${ffmpeg}" ${inputs} -filter_complex "${filterComplex}" -map "[vid]" -c:v libx264 -crf 23 -preset veryfast "${output}" -y`;
    console.log(`Merging ${videos.length} videos${label} into ${output}...`);
  }

  try {
    execSync(cmd);
    console.log(`Merged video created: ${output}`);
  } catch (err) {
    console.error(`Failed to merge videos: ${err.message}`);
  }
}

mergeVideos();
