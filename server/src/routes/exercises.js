const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { type, difficulty, muscle_group: muscleGroup, equipment, bench_focus: benchFocus } = req.query;
    const conditions = ['user_id = $1'];
    const params = [req.user.id];

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    if (difficulty) {
      params.push(difficulty);
      conditions.push(`difficulty = $${params.length}`);
    }

    if (muscleGroup) {
      params.push(muscleGroup);
      conditions.push(`muscle_group = $${params.length}`);
    }

    if (equipment) {
      params.push(equipment);
      conditions.push(`equipment = $${params.length}`);
    }

    if (typeof benchFocus !== 'undefined') {
      const normalized = String(benchFocus).toLowerCase();
      if (normalized === 'true' || normalized === 'false') {
        params.push(normalized === 'true');
        conditions.push(`bench_focus = $${params.length}`);
      }
    }

    const result = await query(
      `
        SELECT id, user_id, name, description, type, difficulty, muscle_group, equipment,
               bench_focus, video_path, thumbnail, duration_sec, created_at
        FROM exercises
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
      `,
      params
    );

    return res.status(200).json({ data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      description,
      type,
      difficulty,
      muscle_group: muscleGroup,
      equipment,
      bench_focus: benchFocus,
      video_path: videoPath,
      thumbnail,
      duration_sec: durationSec,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Exercise name is required' });
    }

    const result = await query(
      `
        INSERT INTO exercises (
          user_id, name, description, type, difficulty, muscle_group, equipment,
          bench_focus, video_path, thumbnail, duration_sec
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, user_id, name, description, type, difficulty, muscle_group, equipment,
                  bench_focus, video_path, thumbnail, duration_sec, created_at
      `,
      [
        req.user.id,
        String(name).trim(),
        description || null,
        type || null,
        difficulty || null,
        muscleGroup || null,
        equipment || null,
        Boolean(benchFocus),
        videoPath || null,
        thumbnail || null,
        Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
      ]
    );

    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const allowedFields = {
      name: 'name',
      description: 'description',
      type: 'type',
      difficulty: 'difficulty',
      muscle_group: 'muscle_group',
      equipment: 'equipment',
      bench_focus: 'bench_focus',
      video_path: 'video_path',
      thumbnail: 'thumbnail',
      duration_sec: 'duration_sec',
    };

    const setParts = [];
    const values = [];

    for (const [bodyKey, dbKey] of Object.entries(allowedFields)) {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
        values.push(req.body[bodyKey]);
        setParts.push(`${dbKey} = $${values.length}`);
      }
    }

    if (setParts.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    values.push(req.params.id);
    values.push(req.user.id);

    const result = await query(
      `
        UPDATE exercises
        SET ${setParts.join(', ')}
        WHERE id = $${values.length - 1}
          AND user_id = $${values.length}
        RETURNING id, user_id, name, description, type, difficulty, muscle_group, equipment,
                  bench_focus, video_path, thumbnail, duration_sec, created_at
      `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    return res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `
        DELETE FROM exercises
        WHERE id = $1
          AND user_id = $2
      `,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    return res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
