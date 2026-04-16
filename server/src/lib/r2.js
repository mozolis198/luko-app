const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

let client;

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

function getR2Endpoint() {
  if (process.env.R2_ENDPOINT) {
    return String(process.env.R2_ENDPOINT).trim();
  }

  if (!process.env.R2_ACCOUNT_ID) {
    return '';
  }

  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function getR2Client() {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured. Set R2_* variables in server/.env.');
  }

  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: getR2Endpoint(),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false,
    });
  }

  return client;
}

function extensionFrom(filePath, fallback = '.mp4') {
  const ext = path.extname(filePath || '').toLowerCase();
  return ext || fallback;
}

function mimeTypeForExtension(ext) {
  const lookup = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return lookup[ext] || 'application/octet-stream';
}

function buildObjectKey({ exerciseId, sourcePath, prefix = 'exercise-videos' }) {
  const safeExerciseId = String(exerciseId || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
  const ext = extensionFrom(sourcePath);
  const id = uuidv4();
  return `${prefix}/${safeExerciseId}/${id}${ext}`;
}

function publicUrlForKey(objectKey) {
  const base = normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL);
  return `${base}/${String(objectKey || '').replace(/^\/+/, '')}`;
}

async function uploadLocalFileToR2({ filePath, objectKey, contentType }) {
  const fileStream = fs.createReadStream(filePath);
  const key = objectKey || buildObjectKey({ sourcePath: filePath });
  const extension = extensionFrom(filePath);

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: fileStream,
    ContentType: contentType || mimeTypeForExtension(extension),
  });

  await getR2Client().send(command);

  return {
    key,
    url: publicUrlForKey(key),
  };
}

module.exports = {
  isR2Configured,
  getR2Client,
  getR2Endpoint,
  publicUrlForKey,
  buildObjectKey,
  uploadLocalFileToR2,
  mimeTypeForExtension,
};
