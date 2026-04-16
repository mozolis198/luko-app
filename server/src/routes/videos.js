const fs = require('fs');
const path = require('path');
const express = require('express');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const { query } = require('../db');
const { isR2Configured, uploadLocalFileToR2 } = require('../lib/r2');

const router = express.Router();

const contentTypeMap = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

router.post('/upload', auth, upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    let publicPath = `/uploads/${req.file.filename}`;
    if (isR2Configured()) {
      const uploaded = await uploadLocalFileToR2({
        filePath: req.file.path,
        contentType: req.file.mimetype,
      });
      publicPath = uploaded.url;

      const keepLocal = String(process.env.R2_KEEP_LOCAL_UPLOADS || 'false').toLowerCase() === 'true';
      if (!keepLocal && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    const exerciseId = req.body.exercise_id;

    if (exerciseId) {
      const result = await query(
        `
          UPDATE exercises
          SET video_path = $1
          WHERE id = $2
            AND user_id = $3
          RETURNING id
        `,
        [publicPath, exerciseId, req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Exercise not found' });
      }
    }

    return res.status(201).json({
      data: {
        filename: req.file.filename,
        path: publicPath,
        size: req.file.size,
        mimetype: req.file.mimetype,
        exercise_id: exerciseId || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/stream/:filename', auth, async (req, res, next) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
    const filePath = path.join(uploadDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const extension = path.extname(safeFilename).toLowerCase();
    const contentType = contentTypeMap[extension] || 'application/octet-stream';
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      return res.status(416).json({ error: 'Invalid Range header' });
    }

    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : fileSize - 1;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
      return res.status(416).json({ error: 'Requested range not satisfiable' });
    }

    end = Math.min(end, fileSize - 1);
    start = Math.max(start, 0);

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Type': contentType,
    });

    stream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
