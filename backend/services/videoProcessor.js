const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const clipsDirectory = path.join(
  __dirname,
  '..',
  'clips'
);

if (!fs.existsSync(clipsDirectory)) {
  fs.mkdirSync(clipsDirectory, {
    recursive: true
  });
}

function generateClip(
  inputPath,
  startTime,
  duration,
  outputFilename
) {

  return new Promise((resolve, reject) => {

    const outputPath = path.join(
      clipsDirectory,
      outputFilename
    );

    ffmpeg(inputPath)

      .setStartTime(startTime)

      .duration(duration)

      .videoCodec('libx264')

      .audioCodec('aac')

      .outputOptions([
        '-preset fast',
        '-crf 20',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])

      .videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920'
      ])

      .on('start', (command) => {

        console.log(
          'FFmpeg started:'
        );

        console.log(command);

      })

      .on('progress', (progress) => {

        console.log(
          `Processing: ${Math.round(
            progress.percent || 0
          )}%`
        );

      })

      .on('end', () => {

        console.log(
          `Clip created: ${outputPath}`
        );

        resolve(outputPath);

      })

      .on('error', (error) => {

        console.error(
          'FFmpeg error:',
          error
        );

        reject(error);

      })

      .save(outputPath);

  });
}

module.exports = {
  generateClip
};