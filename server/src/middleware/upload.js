const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const allowedExtensions = new Set(['.mp4', '.mov', '.webm']);

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${extension}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const isValidExtension = allowedExtensions.has(extension);
  const isVideoMime = typeof file.mimetype === 'string' && file.mimetype.startsWith('video/');

  if (!isValidExtension || !isVideoMime) {
    return cb(new Error('Only mp4, mov, and webm video files are allowed'));
  }

  return cb(null, true);
};

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 500);

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
});

module.exports = upload;
