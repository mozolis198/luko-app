require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const ytdl = require('ytdl-core');
const { query } = require('../src/db');
const { isR2Configured, uploadLocalFileToR2, buildObjectKey } = require('../src/lib/r2');

const CHECKPOINT_PATH = path.resolve(__dirname, '../secrets/r2_migration_checkpoint.json');

function getArg(name) {
  const key = `--${name}`;
  const found = process.argv.find((arg) => arg.startsWith(`${key}=`));
  return found ? found.slice(key.length + 1) : '';
}

function normalizeUploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return { processedIds: [], failed: [], updated: 0, skipped: 0, missing: 0 };
  }

  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return { processedIds: [], failed: [], updated: 0, skipped: 0, missing: 0 };
  }
}

function saveCheckpoint(state) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function isR2Url(url) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return Boolean(base && String(url || '').startsWith(base));
}

async function downloadYouTubeToTemp(url, tempDir) {
  const id = ytdl.getVideoID(url);
  const outputPath = path.join(tempDir, `${id}.mp4`);
  const writeStream = fs.createWriteStream(outputPath);

  await pipeline(
    ytdl(url, {
      quality: 'highest',
      filter: 'audioandvideo',
      highWaterMark: 1 << 25,
    }),
    writeStream
  );

  return outputPath;
}

async function migrateOne(row, uploadDir) {
  const current = String(row.video_path || '').trim();
  if (!current) {
    return { status: 'missing' };
  }

  if (isR2Url(current)) {
    return { status: 'already_r2' };
  }

  let sourcePath = '';
  let cleanupTemp = null;

  try {
    if (current.startsWith('/uploads/')) {
      const fileName = path.basename(current);
      sourcePath = path.join(uploadDir, fileName);
      if (!fs.existsSync(sourcePath)) {
        return { status: 'failed', reason: `missing_local_file:${sourcePath}` };
      }
    } else if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(current)) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-mig-'));
      cleanupTemp = () => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      };
      sourcePath = await downloadYouTubeToTemp(current, tempDir);
    } else if (/^https?:\/\//i.test(current)) {
      return { status: 'failed', reason: `unsupported_http_source:${current}` };
    } else {
      return { status: 'failed', reason: `unsupported_video_path:${current}` };
    }

    const objectKey = buildObjectKey({
      exerciseId: row.id,
      sourcePath,
      prefix: 'migrated',
    });

    const uploaded = await uploadLocalFileToR2({
      filePath: sourcePath,
      objectKey,
    });

    await query('UPDATE exercises SET video_path = $1 WHERE id = $2', [uploaded.url, row.id]);

    return { status: 'updated', newUrl: uploaded.url };
  } catch (error) {
    return { status: 'failed', reason: error.message || String(error) };
  } finally {
    if (cleanupTemp) {
      cleanupTemp();
    }
  }
}

async function run() {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured in server/.env (R2_* vars).');
  }

  const limit = Number(getArg('limit') || process.env.R2_MIGRATION_LIMIT || 0);
  const uploadDir = normalizeUploadDir();
  const checkpoint = loadCheckpoint();
  const processedSet = new Set(checkpoint.processedIds || []);

  const rows = (await query('SELECT id, name, video_path FROM exercises ORDER BY created_at ASC')).rows;
  const pending = rows.filter((row) => !processedSet.has(String(row.id)));
  const slice = limit > 0 ? pending.slice(0, limit) : pending;

  const report = {
    startedAt: new Date().toISOString(),
    totalExercises: rows.length,
    pendingBeforeRun: pending.length,
    processedThisRun: 0,
    updatedThisRun: 0,
    skippedThisRun: 0,
    missingThisRun: 0,
    failedThisRun: [],
  };

  for (const row of slice) {
    const outcome = await migrateOne(row, uploadDir);
    report.processedThisRun += 1;
    processedSet.add(String(row.id));

    if (outcome.status === 'updated') {
      report.updatedThisRun += 1;
      checkpoint.updated = Number(checkpoint.updated || 0) + 1;
    } else if (outcome.status === 'missing') {
      report.missingThisRun += 1;
      checkpoint.missing = Number(checkpoint.missing || 0) + 1;
    } else if (outcome.status === 'already_r2') {
      report.skippedThisRun += 1;
      checkpoint.skipped = Number(checkpoint.skipped || 0) + 1;
    } else {
      report.failedThisRun.push({ id: row.id, name: row.name, reason: outcome.reason });
      checkpoint.failed = [...(checkpoint.failed || []), { id: row.id, name: row.name, reason: outcome.reason }];
    }

    checkpoint.processedIds = Array.from(processedSet);
    saveCheckpoint(checkpoint);
  }

  report.finishedAt = new Date().toISOString();
  report.remainingAfterRun = rows.length - (checkpoint.processedIds || []).length;

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
