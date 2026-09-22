const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const framesDirectory = path.join(
  __dirname,
  '..',
  'frames'
);

if (!fs.existsSync(framesDirectory)) {
  fs.mkdirSync(framesDirectory, {
    recursive: true
  });
}

function extractFrames(
  inputPath,
  videoId,
  interval = 1
) {
  return new Promise((resolve, reject) => {

    const outputDirectory = path.join(
      framesDirectory,
      videoId
    );

    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {
        recursive: true
      });
    }

    console.log(
      `Extracting frames every ${interval} second(s)...`
    );

    ffmpeg(inputPath)
      .outputOptions([
        `-vf fps=1/${interval}`,
        '-q:v 2'
      ])
      .output(
        path.join(
          outputDirectory,
          'frame-%05d.jpg'
        )
      )
      .on('start', (command) => {

        console.log(
          'Frame extraction started:'
        );

        console.log(command);
      })
      .on('progress', (progress) => {

        console.log(
          `Frame extraction: ${
            Math.round(progress.percent || 0)
          }%`
        );
      })
      .on('end', () => {

        console.log(
          'Frame extraction completed.'
        );

        const files = fs
          .readdirSync(outputDirectory)
          .filter(file =>
            file.endsWith('.jpg')
          )
          .sort();

        const framePaths = files.map(
          file =>
            path.join(
              outputDirectory,
              file
            )
        );

        resolve(framePaths);
      })
      .on('error', (error) => {

        console.error(
          'Frame extraction error:',
          error
        );

        reject(error);
      })
      .run();
  });
}

async function calculateFrameDifference(
    frame1,
    frame2
  ) {
  
    const image1 = await sharp(frame1)
      .resize(64, 36)
      .grayscale()
      .raw()
      .toBuffer();
  
    const image2 = await sharp(frame2)
      .resize(64, 36)
      .grayscale()
      .raw()
      .toBuffer();
  
    let totalDifference = 0;
  
    for (
      let i = 0;
      i < image1.length;
      i++
    ) {
  
      totalDifference += Math.abs(
        image1[i] - image2[i]
      );
    }
  
    const maxDifference =
      image1.length * 255;
  
    const score =
      totalDifference /
      maxDifference;
  
    return score;
  }

module.exports = {
  extractFrames,
  calculateFrameDifference
};