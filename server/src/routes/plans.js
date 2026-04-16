const express = require('express');
const auth = require('../middleware/auth');
const { pool, query } = require('../db');

const router = express.Router();

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const plansResult = await query(
      `
        SELECT id, user_id, name, date, notes, created_at
        FROM workout_plans
        WHERE user_id = $1
        ORDER BY date DESC, created_at DESC
      `,
      [req.user.id]
    );

    if (plansResult.rowCount === 0) {
      return res.status(200).json({ data: [] });
    }

    const planIds = plansResult.rows.map((plan) => plan.id);
    const itemsResult = await query(
      `
        SELECT pe.id, pe.plan_id, pe.exercise_id, pe.position, pe.sets, pe.reps,
               pe.weight_kg, pe.duration_sec, pe.rest_sec, e.name AS exercise_name
        FROM plan_exercises pe
        LEFT JOIN exercises e ON e.id = pe.exercise_id
        WHERE pe.plan_id = ANY($1::uuid[])
        ORDER BY pe.plan_id, pe.position ASC
      `,
      [planIds]
    );

    const itemsByPlanId = new Map();
    for (const item of itemsResult.rows) {
      if (!itemsByPlanId.has(item.plan_id)) {
        itemsByPlanId.set(item.plan_id, []);
      }
      itemsByPlanId.get(item.plan_id).push(item);
    }

    const data = plansResult.rows.map((plan) => ({
      ...plan,
      exercises: itemsByPlanId.get(plan.id) || [],
    }));

    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, date, notes, exercises = [] } = req.body;

    if (!name || !date) {
      return res.status(400).json({ error: 'Plan name and date are required' });
    }

    if (!Array.isArray(exercises)) {
      return res.status(400).json({ error: 'Exercises must be an array' });
    }

    await client.query('BEGIN');

    const planResult = await client.query(
      `
        INSERT INTO workout_plans (user_id, name, date, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, name, date, notes, created_at
      `,
      [req.user.id, String(name).trim(), date, notes || null]
    );

    const plan = planResult.rows[0];

    for (let i = 0; i < exercises.length; i += 1) {
      const item = exercises[i];
      if (!item.exercise_id) {
        throw new Error('Each plan item must include exercise_id');
      }

      const ownershipResult = await client.query(
        `
          SELECT id
          FROM exercises
          WHERE id = $1
            AND user_id = $2
        `,
        [item.exercise_id, req.user.id]
      );

      if (ownershipResult.rowCount === 0) {
        throw createHttpError(400, 'Plan contains invalid exercise_id');
      }

      await client.query(
        `
          INSERT INTO plan_exercises (
            plan_id, exercise_id, position, sets, reps, weight_kg, duration_sec, rest_sec
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          plan.id,
          item.exercise_id,
          i,
          item.sets ?? null,
          item.reps ?? null,
          item.weight_kg ?? null,
          item.duration_sec ?? null,
          item.rest_sec ?? null,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      data: {
        ...plan,
        exercises,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, date, notes, exercises } = req.body;

    if (
      !Object.prototype.hasOwnProperty.call(req.body, 'name') &&
      !Object.prototype.hasOwnProperty.call(req.body, 'date') &&
      !Object.prototype.hasOwnProperty.call(req.body, 'notes') &&
      !Object.prototype.hasOwnProperty.call(req.body, 'exercises')
    ) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'exercises') && !Array.isArray(exercises)) {
      return res.status(400).json({ error: 'Exercises must be an array' });
    }

    await client.query('BEGIN');

    const ownerCheck = await client.query(
      `
        SELECT id
        FROM workout_plans
        WHERE id = $1
          AND user_id = $2
      `,
      [req.params.id, req.user.id]
    );

    if (ownerCheck.rowCount === 0) {
      throw createHttpError(404, 'Plan not found');
    }

    const updateParts = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      values.push(name);
      updateParts.push(`name = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'date')) {
      values.push(date);
      updateParts.push(`date = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      values.push(notes);
      updateParts.push(`notes = $${values.length}`);
    }

    if (updateParts.length > 0) {
      values.push(req.params.id);
      values.push(req.user.id);

      await client.query(
        `
          UPDATE workout_plans
          SET ${updateParts.join(', ')}
          WHERE id = $${values.length - 1}
            AND user_id = $${values.length}
        `,
        values
      );
    }

    if (Array.isArray(exercises)) {
      for (const item of exercises) {
        if (!item.exercise_id) {
          throw createHttpError(400, 'Each plan item must include exercise_id');
        }

        const ownershipResult = await client.query(
          `
            SELECT id
            FROM exercises
            WHERE id = $1
              AND user_id = $2
          `,
          [item.exercise_id, req.user.id]
        );

        if (ownershipResult.rowCount === 0) {
          throw createHttpError(400, 'Plan contains invalid exercise_id');
        }
      }

      await client.query(
        `
          DELETE FROM plan_exercises
          WHERE plan_id = $1
        `,
        [req.params.id]
      );

      for (let i = 0; i < exercises.length; i += 1) {
        const item = exercises[i];
        await client.query(
          `
            INSERT INTO plan_exercises (
              plan_id, exercise_id, position, sets, reps, weight_kg, duration_sec, rest_sec
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            req.params.id,
            item.exercise_id,
            i,
            item.sets ?? null,
            item.reps ?? null,
            item.weight_kg ?? null,
            item.duration_sec ?? null,
            item.rest_sec ?? null,
          ]
        );
      }
    }

    const updatedPlanResult = await client.query(
      `
        SELECT id, user_id, name, date, notes, created_at
        FROM workout_plans
        WHERE id = $1
      `,
      [req.params.id]
    );

    const updatedItemsResult = await client.query(
      `
        SELECT id, plan_id, exercise_id, position, sets, reps, weight_kg, duration_sec, rest_sec
        FROM plan_exercises
        WHERE plan_id = $1
        ORDER BY position ASC
      `,
      [req.params.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      data: {
        ...updatedPlanResult.rows[0],
        exercises: updatedItemsResult.rows,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `
        DELETE FROM workout_plans
        WHERE id = $1
          AND user_id = $2
      `,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
