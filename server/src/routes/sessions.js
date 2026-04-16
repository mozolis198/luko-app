const express = require('express');
const auth = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conditions = ['s.user_id = $1'];
    const params = [req.user.id];

    if (from) {
      params.push(from);
      conditions.push(`s.started_at >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      conditions.push(`s.started_at <= $${params.length}`);
    }

    const result = await query(
      `
        SELECT s.id, s.user_id, s.plan_id, s.started_at, s.finished_at, s.notes,
               s.total_sets, s.total_reps, p.name AS plan_name
        FROM sessions s
        LEFT JOIN workout_plans p ON p.id = s.plan_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.started_at DESC
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
    const { plan_id: planId, started_at: startedAt, finished_at: finishedAt, notes, total_sets: totalSets, total_reps: totalReps } = req.body;

    if (!startedAt) {
      return res.status(400).json({ error: 'started_at is required' });
    }

    if (planId) {
      const planResult = await query(
        `
          SELECT id
          FROM workout_plans
          WHERE id = $1
            AND user_id = $2
        `,
        [planId, req.user.id]
      );

      if (planResult.rowCount === 0) {
        return res.status(400).json({ error: 'Invalid plan_id' });
      }
    }

    const result = await query(
      `
        INSERT INTO sessions (
          user_id, plan_id, started_at, finished_at, notes, total_sets, total_reps
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, plan_id, started_at, finished_at, notes, total_sets, total_reps
      `,
      [
        req.user.id,
        planId || null,
        startedAt,
        finishedAt || null,
        notes || null,
        Number.isFinite(Number(totalSets)) ? Number(totalSets) : null,
        Number.isFinite(Number(totalReps)) ? Number(totalReps) : null,
      ]
    );

    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
