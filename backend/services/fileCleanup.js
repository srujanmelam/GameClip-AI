const fs = require('fs');
const path = require('path');

function deleteFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.unlinkSync(filePath);

  console.log(`Deleted file: ${filePath}`);
}

function deleteDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  fs.rmSync(directoryPath, {
    recursive: true,
    force: true
  });

  console.log(`Deleted directory: ${directoryPath}`);
}

function cleanupVideoFiles({
  inputPath,
  videoId,
  framesDirectory,
  audioDirectory
}) {
  try {

    // Delete original uploaded video
    deleteFile(inputPath);

    // Delete extracted frames
    const videoFramesDirectory = path.join(
      framesDirectory,
      videoId
    );

    deleteDirectory(
      videoFramesDirectory
    );

    // Delete extracted audio
    const videoAudioDirectory = path.join(
      audioDirectory,
      videoId
    );

    deleteDirectory(
      videoAudioDirectory
    );

    console.log(
      `Cleanup completed for video: ${videoId}`
    );

  } catch (error) {

    console.error(
      `Cleanup failed for video ${videoId}:`,
      error
    );

    // Don't throw here.
    // The Shorts have already been generated,
    // so cleanup failure should not make the API
    // return a generation failure.
  }
}

module.exports = {
  cleanupVideoFiles
};