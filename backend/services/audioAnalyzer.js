const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const WavDecoder = require('wav-decoder');

const audioDirectory = path.join(
  __dirname,
  '..',
  'audio'
);

if (!fs.existsSync(audioDirectory)) {
  fs.mkdirSync(audioDirectory, {
    recursive: true
  });
}

function extractAudio(inputPath, videoId) {

  return new Promise((resolve, reject) => {

    const outputPath = path.join(
      audioDirectory,
      `${videoId}.wav`
    );

    console.log('Extracting audio...');

    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .output(outputPath)

      .on('start', (command) => {
        console.log(
          'Audio extraction started:'
        );

        console.log(command);
      })

      .on('end', () => {

        console.log(
          'Audio extraction completed.'
        );

        resolve(outputPath);
      })

      .on('error', (error) => {

        console.error(
          'Audio extraction error:',
          error
        );

        reject(error);
      })

      .run();
  });
}

async function calculateAudioScores(
    audioPath
  ) {
  
    const buffer =
      fs.readFileSync(audioPath);
  
    const audioData =
      await WavDecoder.decode(buffer);
  
    const channelData =
      audioData.channelData[0];
  
    const sampleRate =
      audioData.sampleRate;
  
    const samplesPerSecond =
      sampleRate;
  
    const scores = [];
  
    const duration =
      Math.floor(
        channelData.length /
        samplesPerSecond
      );
  
    for (
      let second = 0;
      second < duration;
      second++
    ) {
  
      const start =
        second * samplesPerSecond;
  
      const end =
        Math.min(
          start + samplesPerSecond,
          channelData.length
        );
  
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
  
    return scores;
  }

module.exports = {
  extractAudio,
  calculateAudioScores
};