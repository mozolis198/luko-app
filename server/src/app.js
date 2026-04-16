require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const exercisesRoutes = require('./routes/exercises');
const videosRoutes = require('./routes/videos');
const plansRoutes = require('./routes/plans');
const sessionsRoutes = require('./routes/sessions');

const app = express();

app.use(cors());
app.use(express.json());

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/sessions', sessionsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large' });
  }

  if (err.message === 'Only mp4, mov, and webm video files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  return res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
