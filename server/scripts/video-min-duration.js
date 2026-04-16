const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function probeDurationSeconds(filePath) {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath],
    { encoding: 'utf8' }
  ).trim();

  const parsed = Number(output);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse duration for: ${filePath}`);
  }

  return parsed;
}

function ensureMinDuration(filePath, minSeconds) {
  const sourceDuration = probeDurationSeconds(filePath);

  if (sourceDuration >= minSeconds) {
    return {
      filePath,
      sourceDuration,
      finalDuration: sourceDuration,
      looped: false,
      cleanup: () => {},
    };
  }

  const extension = path.extname(filePath) || '.mp4';
  const baseName = path.basename(filePath, extension);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luko-loop-'));
  const loopedPath = path.join(tempDir, `${baseName}_min${Math.ceil(minSeconds)}${extension}`);

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      filePath,
      '-t',
      String(minSeconds),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      loopedPath,
    ],
    { stdio: 'pipe' }
  );

  const finalDuration = probeDurationSeconds(loopedPath);

  return {
    filePath: loopedPath,
    sourceDuration,
    finalDuration,
    looped: true,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    },
  };
}

module.exports = {
  ensureMinDuration,
  probeDurationSeconds,
};
