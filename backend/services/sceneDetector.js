const { spawn } = require('child_process');

function detectSceneChanges(inputPath, threshold = 0.3) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      inputPath,
      '-vf',
      `select='gt(scene,${threshold})',showinfo`,
      '-an',
      '-f',
      'null',
      '-'
    ];

    const ffmpeg = spawn('ffmpeg', args);

    let output = '';

    ffmpeg.stderr.on('data', (data) => {
      output += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error('FFmpeg scene detection failed')
        );
      }

      const timestamps = [];

      const regex = /pts_time:([0-9.]+)/g;

      let match;

      while ((match = regex.exec(output)) !== null) {
        timestamps.push(
          Number(match[1])
        );
      }

      resolve(timestamps);
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  detectSceneChanges
};