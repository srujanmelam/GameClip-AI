const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const WavDecoder = require('wav-decoder');

const audioDirectory = path.join(
  __dirname,
  '..',
  'audio'
);

// Create audio directory if it doesn't exist
if (!fs.existsSync(audioDirectory)) {
  fs.mkdirSync(audioDirectory, {
    recursive: true
  });
}


/**
 * Extract the complete audio track from a video.
 *
 * Output:
 * - WAV
 * - PCM signed 16-bit
 * - Mono
 * - 16 kHz
 *
 * @param {string} inputPath
 * @param {string} videoId
 * @returns {Promise<string>} path to generated WAV file
 */
function extractAudio(inputPath, videoId) {

  return new Promise((resolve, reject) => {

    const outputPath = path.join(
      audioDirectory,
      `${videoId}.wav`
    );

    console.log('================================');
    console.log('Extracting audio');
    console.log('================================');

    console.log('Input:', inputPath);
    console.log('Output:', outputPath);

    // Remove old audio file if it exists
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
        console.log('Removed existing audio file.');
      } catch (error) {
        console.error(
          'Could not remove existing audio file:',
          error
        );
      }
    }

    ffmpeg(inputPath)

      // Remove video stream
      .noVideo()

      // Convert audio to PCM 16-bit
      .audioCodec('pcm_s16le')

      // Convert to mono
      .audioChannels(1)

      // Convert to 16 kHz
      .audioFrequency(16000)

      // Output WAV format
      .format('wav')

      .on('start', (command) => {

        console.log('FFmpeg audio command:');
        console.log(command);

      })

      .on('codecData', (data) => {

        console.log(
          'Input audio codec:',
          data.audio
        );

      })

      .on('progress', (progress) => {

        if (
          progress &&
          typeof progress.percent === 'number'
        ) {

          console.log(
            `Audio extraction: ${progress.percent.toFixed(1)}%`
          );

        }

      })

      .on('end', async () => {

        console.log(
          'Audio extraction completed.'
        );

        try {

          // Make sure file exists
          if (!fs.existsSync(outputPath)) {

            throw new Error(
              `Audio file was not created: ${outputPath}`
            );

          }

          const stats =
            fs.statSync(outputPath);

          console.log(
            `WAV file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
          );


          // ----------------------------------------
          // Verify generated WAV
          // ----------------------------------------

          const buffer =
            fs.readFileSync(outputPath);

          const audioData =
            await WavDecoder.decode(buffer);

          if (
            !audioData.channelData ||
            audioData.channelData.length === 0
          ) {

            throw new Error(
              'WAV file contains no audio channels.'
            );

          }

          const channelData =
            audioData.channelData[0];

          const sampleRate =
            audioData.sampleRate;

          const duration =
            channelData.length /
            sampleRate;


          console.log(
            '--------------------------------'
          );

          console.log(
            `Extracted audio duration: ${duration.toFixed(2)} seconds`
          );

          console.log(
            `Sample rate: ${sampleRate} Hz`
          );

          console.log(
            `Channels: ${audioData.channelData.length}`
          );

          console.log(
            `Total samples: ${channelData.length}`
          );

          console.log(
            '--------------------------------'
          );


          // ----------------------------------------
          // Validate audio
          // ----------------------------------------

          if (sampleRate !== 16000) {

            console.warn(
              `WARNING: Expected 16000 Hz but got ${sampleRate} Hz`
            );

          }

          if (audioData.channelData.length !== 1) {

            console.warn(
              `WARNING: Expected mono audio but got ${audioData.channelData.length} channels`
            );

          }

          if (duration <= 0) {

            throw new Error(
              'Extracted audio has zero duration.'
            );

          }


          console.log(
            'Audio verification successful.'
          );

          resolve(outputPath);

        } catch (error) {

          console.error(
            'Could not verify extracted audio:',
            error
          );

          reject(error);

        }

      })

      .on('error', (error) => {

        console.error(
          'Audio extraction error:',
          error
        );

        reject(error);

      })

      // IMPORTANT:
      // Explicitly specify the output file.
      .output(outputPath)

      // Start FFmpeg
      .run();

  });

}


/**
 * Calculate audio intensity once per second.
 *
 * Uses RMS (Root Mean Square) amplitude.
 *
 * Example output:
 *
 * [
 *   {
 *     timestamp: 0,
 *     audioScore: 0.012
 *   },
 *   {
 *     timestamp: 1,
 *     audioScore: 0.035
 *   }
 * ]
 *
 * @param {string} audioPath
 * @returns {Promise<Array>}
 */
async function calculateAudioScores(audioPath) {

  console.log('================================');
  console.log('Calculating audio scores');
  console.log('================================');

  console.log(
    'Audio file:',
    audioPath
  );


  // ----------------------------------------
  // Validate file
  // ----------------------------------------

  if (!audioPath) {

    throw new Error(
      'audioPath is required.'
    );

  }

  if (!fs.existsSync(audioPath)) {

    throw new Error(
      `Audio file does not exist: ${audioPath}`
    );

  }


  // ----------------------------------------
  // Read WAV
  // ----------------------------------------

  const buffer =
    fs.readFileSync(audioPath);

  const audioData =
    await WavDecoder.decode(buffer);


  if (
    !audioData.channelData ||
    audioData.channelData.length === 0
  ) {

    throw new Error(
      'WAV file contains no audio data.'
    );

  }


  // ----------------------------------------
  // Audio information
  // ----------------------------------------

  const channelData =
    audioData.channelData[0];

  const sampleRate =
    audioData.sampleRate;

  console.log(
    `Sample rate: ${sampleRate} Hz`
  );

  console.log(
    `Channels: ${audioData.channelData.length}`
  );

  console.log(
    `Total samples: ${channelData.length}`
  );


  // ----------------------------------------
  // Calculate duration
  // ----------------------------------------

  const duration =
    channelData.length /
    sampleRate;

  console.log(
    `Audio duration: ${duration.toFixed(2)} seconds`
  );


  const scores = [];


  // Use ceil so the final partial second
  // is also analyzed.
  const durationInSeconds =
    Math.ceil(duration);


  // ----------------------------------------
  // Calculate RMS for every second
  // ----------------------------------------

  for (
    let second = 0;
    second < durationInSeconds;
    second++
  ) {

    const start =
      second * sampleRate;

    const end =
      Math.min(
        start + sampleRate,
        channelData.length
      );


    // Safety check
    if (
      start >= channelData.length
    ) {

      break;

    }


    let sumSquares = 0;


    for (
      let i = start;
      i < end;
      i++
    ) {

      const sample =
        channelData[i];

      sumSquares +=
        sample * sample;

    }


    const sampleCount =
      end - start;


    if (
      sampleCount <= 0
    ) {

      continue;

    }


    // RMS = sqrt(mean(square(samples)))
    const rms =
      Math.sqrt(
        sumSquares /
        sampleCount
      );


    scores.push({

      timestamp: second,

      audioScore: rms

    });

  }


  console.log(
    `Generated ${scores.length} audio score samples`
  );


  // ----------------------------------------
  // Print a small preview
  // ----------------------------------------

  if (scores.length > 0) {

    console.log(
      'First audio score:',
      scores[0]
    );

    console.log(
      'Last audio score:',
      scores[scores.length - 1]
    );

  }


  return scores;

}


module.exports = {
  extractAudio,
  calculateAudioScores
};