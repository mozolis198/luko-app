require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const { query } = require('../src/db');
const { isR2Configured, uploadLocalFileToR2, buildObjectKey } = require('../src/lib/r2');

const ROOT = path.resolve(__dirname, '../..');

const MAPPINGS = [
  { name: 'Full Body Mobility Durability 01', file: 'durability10_clips/01_mobility_durability_01.mp4' },
  { name: 'Full Body Mobility Durability 02', file: 'durability10_clips/02_mobility_durability_02.mp4' },
  { name: 'Full Body Mobility Durability 03', file: 'durability10_clips/03_mobility_durability_03.mp4' },
  { name: 'Full Body Mobility Durability 04', file: 'durability10_clips/04_mobility_durability_04.mp4' },
  { name: 'Full Body Mobility Durability 05', file: 'durability10_clips/05_mobility_durability_05.mp4' },
  { name: 'Full Body Mobility Durability 06', file: 'durability10_clips/06_mobility_durability_06.mp4' },
  { name: 'Full Body Mobility Durability 07', file: 'durability10_clips/07_mobility_durability_07.mp4' },
  { name: 'Full Body Mobility Durability 08', file: 'durability10_clips/08_mobility_durability_08.mp4' },
  { name: 'Full Body Mobility Durability 09', file: 'durability10_clips/09_mobility_durability_09.mp4' },
  { name: 'Full Body Mobility Durability 10', file: 'durability10_clips/10_mobility_durability_10.mp4' },
  { name: 'Loaded T-Spine Opener on Foam Roller', file: 'back_love_clips/01_loaded_tspine_opener_foam_roller.mp4' },
  { name: 'Banded Prayer Stretch', file: 'back_love_clips/02_banded_prayer_stretch.mp4' },
  { name: 'Weighted T-Spine Opener', file: 'back_love_clips/03_weighted_tspine_opener.mp4' },
  { name: 'Rotating Row on GHD', file: 'back_love_clips/04_rotating_row_on_ghd.mp4' },
];

async function run() {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured.');
  }

  const rows = (await query('SELECT id, name, video_path FROM exercises')).rows;
  const byName = new Map(rows.map((r) => [String(r.name), r]));

  const updated = [];
  const missing = [];

  for (const item of MAPPINGS) {
    const exercise = byName.get(item.name);
    if (!exercise) {
      missing.push({ name: item.name, reason: 'missing_exercise' });
      continue;
    }

    const absoluteFile = path.resolve(ROOT, item.file);
    const objectKey = buildObjectKey({
      exerciseId: exercise.id,
      sourcePath: absoluteFile,
      prefix: 'migrated/manual-fallback',
    });

    const uploaded = await uploadLocalFileToR2({
      filePath: absoluteFile,
      objectKey,
    });

    await query('UPDATE exercises SET video_path = $1 WHERE id = $2', [uploaded.url, exercise.id]);
    updated.push({ name: item.name, id: exercise.id, url: uploaded.url });
  }

  console.log(JSON.stringify({ updated: updated.length, missing, items: updated }, null, 2));
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
