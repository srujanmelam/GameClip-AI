const ffmpeg = require('fluent-ffmpeg');

function getVideoMetadata(
  inputPath
) {
  return new Promise(
    (resolve, reject) => {

      ffmpeg.ffprobe(
        inputPath,
        (error, metadata) => {

          if (error) {
            reject(error);
            return;
          }

          const videoStream =
            metadata.streams.find(
              stream =>
                stream.codec_type === 'video'
            );

          if (!videoStream) {
            reject(
              new Error(
                'No video stream found'
              )
            );

            return;
          }

          resolve({
            duration:
              metadata.format.duration,

            width:
              videoStream.width,

            height:
              videoStream.height,

            fps:
              eval(videoStream.r_frame_rate)
          });
        }
      );
    }
  );
}

module.exports = {
  getVideoMetadata
};