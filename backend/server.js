const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

const PORT = 3000;


// =====================================================
// Middleware
// =====================================================

app.use(cors());

app.use(express.json());


// =====================================================
// Upload directory
// =====================================================

const uploadDirectory = path.join(__dirname, 'uploads');

  const framesDirectory = path.join(
    __dirname,
    'frames'
  );
  
  const audioDirectory = path.join(
    __dirname,
    'audio'
  );


// Create uploads folder if it doesn't exist

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}


// =====================================================
// Multer configuration
// =====================================================

const {
    extractFrames
} = require('./services/frameExtractor');

const {
    cleanupVideoFiles
} = require('./services/fileCleanup');

const {
    selectTopCandidates
} = require('./services/candidateSelector');

const {
    detectSceneChanges
} = require('./services/sceneDetector');
const {
    extractAudio,
    calculateAudioScores
} = require('./services/audioAnalyzer');

const {
    combineScores,
    groupHighlightEvents,
    removeOverlappingEvents
} = require('./services/highlightDetector');

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(null, uploadDirectory);

    },

    filename: function (req, file, cb) {

        const timestamp = Date.now();

        const extension = path.extname(file.originalname);

        const filename = `gameplay-${timestamp}${extension}`;

        cb(null, filename);

    }

});

const {
    detectVisualHighlights
} = require('./services/highlightDetector');

const {
    getVideoMetadata
} = require('./services/videoAnalyzer');

const clipsDirectory = path.join(
    __dirname,
    'clips'
);

if (!fs.existsSync(clipsDirectory)) {
    fs.mkdirSync(clipsDirectory, {
        recursive: true
    });
}


// =====================================================
// File filter
// =====================================================

const fileFilter = (req, file, cb) => {

    const allowedTypes = [
        'video/mp4',
        'video/webm',
        'video/quicktime'
    ];

    if (allowedTypes.includes(file.mimetype)) {

        cb(null, true);

    } else {

        cb(
            new Error(
                'Only MP4, WebM and MOV videos are allowed.'
            )
        );

    }

};


// =====================================================
// Multer
// =====================================================

const upload = multer({

    storage: storage,

    fileFilter: fileFilter,

    limits: {
        fileSize: 500 * 1024 * 1024
    }

});

const {
    generateClip
} = require('./services/videoProcessor');


// =====================================================
// Health check
// =====================================================

app.get('/api/health', (req, res) => {

    res.json({
        success: true,
        message: 'GameClip AI backend is running'
    });

});


// =====================================================
// Video upload
// =====================================================

app.post(
    '/api/videos/upload',
    upload.single('video'),
    (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: 'No video file uploaded'
                });

            }


            console.log('Video uploaded:');

            console.log({
                originalName: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype
            });


            res.status(201).json({

                success: true,

                message: 'Video uploaded successfully',

                video: {

                    originalName: req.file.originalname,

                    filename: req.file.filename,

                    size: req.file.size,

                    mimetype: req.file.mimetype

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message: 'Failed to upload video'

            });

        }

    }
);

app.post(
    '/api/videos/:filename/detect-scenes',
    async (req, res) => {
        try {
            const filename = req.params.filename;

            const inputPath = path.join(
                uploadDirectory,
                filename
            );

            if (!fs.existsSync(inputPath)) {
                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const scenes =
                await detectSceneChanges(inputPath);

            res.json({
                success: true,
                sceneCount: scenes.length,
                scenes
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: 'Scene detection failed',
                error: error.message
            });
        }
    }
);

app.get(
    '/api/videos/:filename/analyze',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const metadata =
                await getVideoMetadata(
                    inputPath
                );

            res.json({
                success: true,
                metadata
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    'Failed to analyze video'
            });
        }
    }
);

app.post(
    '/api/videos/:filename/analyze-highlights',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const videoId =
                path.parse(filename).name;

            console.log(
                'Starting highlight analysis...'
            );

            // -------------------------
            // 1. Extract frames
            // -------------------------

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            // -------------------------
            // 2. Visual analysis
            // -------------------------

            const visualScores =
                await detectVisualHighlights(
                    framePaths
                );

            // -------------------------
            // 3. Extract audio
            // -------------------------

            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            // -------------------------
            // 4. Audio analysis
            // -------------------------

            const audioScores =
                await calculateAudioScores(
                    audioPath
                );

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

            console.log(
                'Detected scenes:',
                sceneTimestamps
            );
            // -------------------------
            // 5. Combine
            // -------------------------

            const highlights =
                combineScores(
                    visualScores,
                    audioScores,
                    sceneTimestamps
                );

            const events =
                groupHighlightEvents(
                    highlights
                );

            const finalEvents =
                removeOverlappingEvents(
                    events
                );

            res.json({
                success: true,

                events:
                    finalEvents.slice(0, 5)
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    'Failed to analyze highlights',
                error:
                    error.message
            });
        }
    }
);

app.post(
    '/api/videos/:filename/extract-frames',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const videoId =
                path.parse(filename).name;

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            res.json({
                success: true,
                message:
                    'Frames extracted successfully',
                frameCount:
                    framePaths.length,
                frames:
                    framePaths
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    'Failed to extract frames',
                error:
                    error.message
            });
        }
    }
);

app.post(
    '/api/videos/:filename/generate-ai-shorts',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const videoId =
                path.parse(filename).name;

            console.log(
                'Analyzing video for highlights...'
            );

            // 1. Extract frames
            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            // 2. Visual analysis
            const visualScores =
                await detectVisualHighlights(
                    framePaths
                );

            // 3. Audio extraction
            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            // 4. Audio analysis
            const audioScores =
                await calculateAudioScores(
                    audioPath
                );

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

            console.log(
                'Detected scenes:',
                sceneTimestamps
            );
            // 5. Combine scores
            const highlights =
                combineScores(
                    visualScores,
                    audioScores,
                    sceneTimestamps
                );

            // 6. Group events
            const events =
                groupHighlightEvents(
                    highlights
                );

            const finalEvents =
                removeOverlappingEvents(events);

            const topEvents =
                selectTopCandidates(
                    finalEvents,
                    3
                );

            const generatedClips = [];

            for (
                let i = 0;
                i < topEvents.length;
                i++
            ) {

                const event =
                    topEvents[i];

                const duration =
                    Math.min(
                        event.end -
                        event.start,
                        30
                    );

                const outputFilename =
                    `${videoId}-short-${i + 1}.mp4`;

                await generateClip(
                    inputPath,
                    event.start,
                    duration,
                    outputFilename
                );

                generatedClips.push({
                    filename:
                        outputFilename,

                    url:
                        `http://localhost:3000/clips/${outputFilename}`,

                    start:
                        event.start,

                    end:
                        event.end,

                    peak:
                        event.peak,

                    score:
                        event.score
                });
            }

            // Cleanup temporary files after all Shorts
            // have been generated successfully.
            cleanupVideoFiles({
                inputPath,
                videoId,
                framesDirectory,
                audioDirectory
            });

            res.json({
                success: true,

                message:
                    'AI Shorts generated successfully',

                clips:
                    generatedClips
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,

                message:
                    'Failed to generate AI Shorts',

                error:
                    error.message
            });
        }
    }
);

app.post(
    '/api/videos/:filename/detect-highlights',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const videoId =
                path.parse(filename).name;

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            const highlights =
                await detectVisualHighlights(
                    framePaths
                );

            res.json({
                success: true,

                highlights:
                    highlights.slice(0, 10)
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    'Failed to detect highlights',
                error:
                    error.message
            });
        }
    }
);


app.post(
    '/api/videos/:filename/generate-clips',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;


            const inputPath = path.join(
                uploadDirectory,
                filename
            );


            // Check if video exists

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({

                    success: false,

                    message: 'Video not found'

                });

            }


            console.log(
                `Starting processing: ${filename}`
            );


            /*
             * Temporary test timestamps.
             *
             * Later AI will determine
             * these automatically.
             */

            const timestamps = [
                10,
                60,
                120
            ];


            const generatedClips = [];


            for (
                let i = 0;
                i < timestamps.length;
                i++
            ) {

                const timestamp =
                    timestamps[i];


                const outputFilename =
                    `${path.parse(filename).name}-short-${i + 1}.mp4`;


                const outputPath =
                    await generateClip(
                        inputPath,
                        timestamp,
                        outputFilename
                    );


                generatedClips.push({
                    filename: outputFilename,
                    url: `http://localhost:3000/clips/${outputFilename}`
                });

            }


            res.json({

                success: true,

                message:
                    'Clips generated successfully',

                clips: generatedClips

            });


        } catch (error) {

            console.error(error);


            res.status(500).json({

                success: false,

                message:
                    'Failed to generate clips',

                error:
                    error.message

            });

        }

    }
);

app.post(
    '/api/videos/:filename/analyze-audio',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (!fs.existsSync(inputPath)) {

                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            const videoId =
                path.parse(filename).name;

            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            const scores =
                await calculateAudioScores(
                    audioPath
                );

            scores.sort(
                (a, b) =>
                    b.audioScore -
                    a.audioScore
            );

            res.json({
                success: true,
                audioPeaks:
                    scores.slice(0, 10)
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    'Failed to analyze audio',
                error:
                    error.message
            });
        }
    }
);


// =====================================================
// Error handler
// =====================================================

app.use((error, req, res, next) => {

    console.error(error);


    if (error instanceof multer.MulterError) {

        if (error.code === 'LIMIT_FILE_SIZE') {

            return res.status(400).json({

                success: false,

                message: 'Video cannot exceed 500 MB.'

            });

        }

    }


    res.status(400).json({

        success: false,

        message: error.message || 'Something went wrong.'

    });

});

app.use(
    '/uploads',
    express.static(uploadDirectory)
);

app.use(
    '/clips',
    express.static(clipsDirectory)
);


// =====================================================
// Start server
// =====================================================

app.listen(PORT, () => {

    console.log(
        `🚀 GameClip AI backend running at http://localhost:${PORT}`
    );

});