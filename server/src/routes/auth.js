const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    {
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `
        INSERT INTO users (email, password, name)
        VALUES ($1, $2, $3)
        RETURNING id, email, name, created_at
      `,
      [String(email).toLowerCase().trim(), passwordHash, name || null]
    );

    const user = result.rows[0];
    const token = signToken(user);

    return res.status(201).json({
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query(
      `
        SELECT id, email, password, name, created_at
        FROM users
        WHERE email = $1
      `,
      [String(email).toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    return res.status(200).json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
        },
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', auth, async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT id, email, name, created_at
        FROM users
        WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const token = signToken(user);

    return res.status(200).json({
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
