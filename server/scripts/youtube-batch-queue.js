require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { query } = require('../src/db');

const TARGETS = {
  durability10: {
    dir: path.resolve(__dirname, '../../durability10_clips'),
    prefix: 'Full Body Mobility Durability',
    count: 10,
    digits: 2,
  },
  miniband3: {
    dir: path.resolve(__dirname, '../../miniband3_clips'),
    prefix: 'Mini Band Knee Strength',
    count: 3,
    digits: 2,
  },
  finishers20: {
    dir: path.resolve(__dirname, '../../finishers20_clips'),
    prefix: 'Training Finisher',
    count: 20,
    digits: 2,
  },
  landmine24: {
    dir: path.resolve(__dirname, '../../landmine24_clips'),
    prefix: 'Landmine Best',
    count: 24,
    digits: 2,
  },
  mobility33: {
    dir: path.resolve(__dirname, '../../mobility33_clips'),
    prefix: 'Mobility Drill',
    count: 33,
    digits: 2,
  },
  volleywarmup20: {
    dir: path.resolve(__dirname, '../../volley_warmup20_clips'),
    prefix: 'Volleyball Warmup',
    count: 20,
    digits: 2,
  },
  landmine30: {
    dir: path.resolve(__dirname, '../../landmine30_clips'),
    prefix: 'Landmine Full Body',
    count: 30,
    digits: 2,
  },
  landmine40: {
    dir: path.resolve(__dirname, '../../landmine40_clips'),
    prefix: 'Landmine Variation',
    count: 40,
    digits: 2,
  },
  squat41: {
    dir: path.resolve(__dirname, '../../squat41_clips'),
    prefix: 'Squat Variation',
    count: 41,
    digits: 2,
  },
};

function getArg(name) {
  const key = `--${name}`;
  const hit = process.argv.find((arg) => arg.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : '';
}

function pad(n, digits) {
  return String(n).padStart(digits, '0');
}

function targetOrder() {
  const raw = getArg('targets') || process.env.YT_BATCH_TARGETS || Object.keys(TARGETS).join(',');
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((key) => TARGETS[key]);
}

async function run() {
  const result = await query('SELECT id, name, video_path FROM exercises');
  const byName = new Map(result.rows.map((row) => [String(row.name), row]));

  const queue = [];
  const skipped = [];

  for (const key of targetOrder()) {
    const target = TARGETS[key];
    if (!fs.existsSync(target.dir)) {
      skipped.push({ target: key, reason: `missing_dir:${target.dir}` });
      continue;
    }

    const files = fs
      .readdirSync(target.dir)
      .filter((name) => name.toLowerCase().endsWith('.mp4'))
      .sort((a, b) => a.localeCompare(b));

    const count = Math.min(target.count, files.length);
    for (let i = 0; i < count; i += 1) {
      const number = pad(i + 1, target.digits);
      const exerciseName = `${target.prefix} ${number}`;
      const row = byName.get(exerciseName);
      const clipFile = files[i];

      if (!row) {
        skipped.push({ target: key, file: clipFile, exerciseName, reason: 'missing_exercise' });
        continue;
      }

      const isYoutube = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(row.video_path || ''));
      queue.push({
        target: key,
        exerciseId: row.id,
        exerciseName,
        clipPath: path.join(target.dir, clipFile),
        currentVideoPath: row.video_path || null,
        currentSource: isYoutube ? 'youtube' : row.video_path ? 'local' : 'missing',
      });
    }
  }

  const outputPath = path.resolve(__dirname, '../secrets/youtube_batch_queue.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        total: queue.length,
        youtubeAlready: queue.filter((item) => item.currentSource === 'youtube').length,
        pendingUpload: queue.filter((item) => item.currentSource !== 'youtube').length,
        queue,
        skipped,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        queueFile: outputPath,
        total: queue.length,
        youtubeAlready: queue.filter((item) => item.currentSource === 'youtube').length,
        pendingUpload: queue.filter((item) => item.currentSource !== 'youtube').length,
        skipped: skipped.length,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
