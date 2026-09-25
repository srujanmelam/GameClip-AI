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
// Directories
// =====================================================

const uploadDirectory = path.join(
    __dirname,
    'uploads'
);

const framesDirectory = path.join(
    __dirname,
    'frames'
);

const audioDirectory = path.join(
    __dirname,
    'audio'
);

const clipsDirectory = path.join(
    __dirname,
    'clips'
);

// Create required directories
if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

if (!fs.existsSync(clipsDirectory)) {
    fs.mkdirSync(clipsDirectory, {
        recursive: true
    });
}

// =====================================================
// Services
// =====================================================

const {
    analyzeCandidates
} = require('./services/aiClipSelector');

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
    removeOverlappingEvents,
    detectVisualHighlights
} = require('./services/highlightDetector');

const {
    getVideoMetadata
} = require('./services/videoAnalyzer');

const {
    generateClip
} = require('./services/videoProcessor');

// =====================================================
// Build candidate features
// =====================================================

function buildCandidateFeatures(
    candidate,
    visualScores,
    audioScores,
    sceneTimestamps
) {

    const candidateStart =
        Number(candidate?.start ?? 0);

    const candidateEnd =
        Number(
            candidate?.end ??
            candidateStart
        );

    // ============================================
    // SAFETY
    // ============================================

    const safeVisualScores =
        Array.isArray(visualScores)
            ? visualScores
            : [];

    const safeAudioScores =
        Array.isArray(audioScores)
            ? audioScores
            : [];

    const safeSceneTimestamps =
        Array.isArray(sceneTimestamps)
            ? sceneTimestamps
            : [];

    // ============================================
    // VISUAL DATA
    // ============================================

    const visualData =
        safeVisualScores
            .filter(item => {

                const timestamp =
                    Number(
                        item?.timestamp
                    );

                return (
                    Number.isFinite(timestamp) &&
                    timestamp >= candidateStart &&
                    timestamp <= candidateEnd
                );
            })
            .map(item => ({

                timestamp:
                    Number(
                        item.timestamp
                    ),

                score:
                    Number(
                        item.visualScore ?? 0
                    )
            }));

    // ============================================
    // AUDIO DATA
    // ============================================

    const audioData =
        safeAudioScores
            .filter(item => {

                const timestamp =
                    Number(
                        item?.timestamp
                    );

                return (
                    Number.isFinite(timestamp) &&
                    timestamp >= candidateStart &&
                    timestamp <= candidateEnd
                );
            })
            .map(item => ({

                timestamp:
                    Number(
                        item.timestamp
                    ),

                score:
                    Number(
                        item.audioScore ?? 0
                    )
            }));

    // ============================================
    // SCENE DATA
    // ============================================

    const sceneData =
        safeSceneTimestamps
            .map(scene => {

                /*
                 * Scene detector may return:
                 *
                 * 12.5
                 *
                 * OR
                 *
                 * { timestamp: 12.5 }
                 *
                 * OR
                 *
                 * { start: 12.5 }
                 */

                if (
                    typeof scene === 'number'
                ) {
                    return scene;
                }

                if (
                    typeof scene === 'object' &&
                    scene !== null
                ) {

                    return Number(
                        scene.timestamp ??
                        scene.start ??
                        scene.time
                    );
                }

                return NaN;
            })
            .filter(
                timestamp =>
                    Number.isFinite(timestamp) &&
                    timestamp >= candidateStart &&
                    timestamp <= candidateEnd
            );

    // ============================================
    // HELPERS
    // ============================================

    const average =
        values => {

            if (
                !Array.isArray(values) ||
                values.length === 0
            ) {
                return 0;
            }

            const validValues =
                values
                    .map(Number)
                    .filter(
                        Number.isFinite
                    );

            if (
                validValues.length === 0
            ) {
                return 0;
            }

            return (
                validValues.reduce(
                    (sum, value) =>
                        sum + value,
                    0
                ) /
                validValues.length
            );
        };

    const maximum =
        values => {

            if (
                !Array.isArray(values) ||
                values.length === 0
            ) {
                return 0;
            }

            const validValues =
                values
                    .map(Number)
                    .filter(
                        Number.isFinite
                    );

            if (
                validValues.length === 0
            ) {
                return 0;
            }

            return Math.max(
                ...validValues
            );
        };

    // ============================================
    // VISUAL PEAK
    // ============================================

    const visualPeak =
        visualData.reduce(
            (best, current) => {

                if (
                    !best ||
                    current.score >
                    best.score
                ) {
                    return current;
                }

                return best;
            },
            null
        );

    // ============================================
    // AUDIO PEAK
    // ============================================

    const audioPeak =
        audioData.reduce(
            (best, current) => {

                if (
                    !best ||
                    current.score >
                    best.score
                ) {
                    return current;
                }

                return best;
            },
            null
        );

    // ============================================
    // FINAL FEATURE OBJECT
    // ============================================

    return {

        start:
            candidateStart,

        end:
            candidateEnd,

        duration:
            Math.max(
                0,
                candidateEnd -
                candidateStart
            ),

        algorithmicScore:
            Number(
                candidate?.score ??
                candidate?.algorithmicScore ??
                0
            ),

        visual: {

            averageActivity:
                average(
                    visualData.map(
                        item => item.score
                    )
                ),

            peakActivity:
                maximum(
                    visualData.map(
                        item => item.score
                    )
                ),

            peakTimestamp:
                visualPeak
                    ? visualPeak.timestamp
                    : candidateStart,

            samples:
                visualData
        },

        audio: {

            averageIntensity:
                average(
                    audioData.map(
                        item => item.score
                    )
                ),

            peakIntensity:
                maximum(
                    audioData.map(
                        item => item.score
                    )
                ),

            peakTimestamp:
                audioPeak
                    ? audioPeak.timestamp
                    : candidateStart,

            samples:
                audioData
        },

        scenes: {

            count:
                sceneData.length,

            timestamps:
                sceneData
        }
    };
}

// =====================================================
// Multer configuration
// =====================================================

const storage =
    multer.diskStorage({

        destination:
            function (
                req,
                file,
                cb
            ) {

                cb(
                    null,
                    uploadDirectory
                );
            },

        filename:
            function (
                req,
                file,
                cb
            ) {

                const timestamp =
                    Date.now();

                const extension =
                    path.extname(
                        file.originalname
                    );

                const filename =
                    `gameplay-${timestamp}${extension}`;

                cb(
                    null,
                    filename
                );
            }
    });

// =====================================================
// File filter
// =====================================================

const fileFilter =
    (
        req,
        file,
        cb
    ) => {

        const allowedTypes = [

            'video/mp4',

            'video/webm',

            'video/quicktime'
        ];

        if (
            allowedTypes.includes(
                file.mimetype
            )
        ) {

            cb(
                null,
                true
            );

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

const upload =
    multer({

        storage,

        fileFilter,

        limits: {

            fileSize:
                500 * 1024 * 1024
        }
    });

// =====================================================
// Health check
// =====================================================

app.get(
    '/api/health',
    (req, res) => {

        res.json({

            success:
                true,

            message:
                'GameClip AI backend is running'
        });
    }
);

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

                    success:
                        false,

                    message:
                        'No video file uploaded'
                });
            }

            console.log(
                'Video uploaded:'
            );

            console.log({

                originalName:
                    req.file.originalname,

                filename:
                    req.file.filename,

                size:
                    req.file.size,

                mimetype:
                    req.file.mimetype
            });

            res.status(201).json({

                success:
                    true,

                message:
                    'Video uploaded successfully',

                video: {

                    originalName:
                        req.file.originalname,

                    filename:
                        req.file.filename,

                    size:
                        req.file.size,

                    mimetype:
                        req.file.mimetype
                }
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to upload video'
            });
        }
    }
);

// =====================================================
// Detect scenes
// =====================================================

app.post(
    '/api/videos/:filename/detect-scenes',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const scenes =
                await detectSceneChanges(
                    inputPath
                );

            res.json({

                success:
                    true,

                sceneCount:
                    scenes.length,

                scenes
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Scene detection failed',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Analyze video metadata
// =====================================================

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

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const metadata =
                await getVideoMetadata(
                    inputPath
                );

            res.json({

                success:
                    true,

                metadata
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to analyze video'
            });
        }
    }
);

// =====================================================
// Analyze highlights
// =====================================================

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

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const videoId =
                path.parse(
                    filename
                ).name;

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

            // -------------------------
            // 5. Scene detection
            // -------------------------

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

            console.log(
                'Detected scenes:',
                sceneTimestamps
            );

            // -------------------------
            // 6. Combine
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

                success:
                    true,

                events:
                    finalEvents.slice(
                        0,
                        5
                    )
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to analyze highlights',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Extract frames
// =====================================================

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

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const videoId =
                path.parse(
                    filename
                ).name;

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            res.json({

                success:
                    true,

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

                success:
                    false,

                message:
                    'Failed to extract frames',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// AI SHORTS GENERATION
// =====================================================

app.post(
    '/api/videos/:filename/generate-ai-shorts',
    async (req, res) => {

        let inputPath = null;
        let videoId = null;

        try {

            const filename =
                req.params.filename;

            inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            videoId =
                path.parse(
                    filename
                ).name;

            console.log('');
            console.log(
                '================================'
            );
            console.log(
                'Starting AI Shorts generation'
            );
            console.log(
                '================================'
            );
            console.log(
                'Video:',
                filename
            );
            console.log(
                'Video ID:',
                videoId
            );
            console.log('');

            // ============================================
            // 1. EXTRACT FRAMES
            // ============================================

            console.log(
                '1. Extracting frames...'
            );

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    1
                );

            console.log(
                `Extracted ${framePaths.length} frames`
            );

            // ============================================
            // 2. VISUAL ANALYSIS
            // ============================================

            console.log(
                '2. Running visual analysis...'
            );

            const visualScores =
                await detectVisualHighlights(
                    framePaths
                );

            console.log(
                `Visual analysis completed: ${visualScores.length} samples`
            );

            // ============================================
            // 3. EXTRACT AUDIO
            // ============================================

            console.log(
                '3. Extracting audio...'
            );

            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            console.log(
                'Audio extracted:',
                audioPath
            );

            // ============================================
            // 4. AUDIO ANALYSIS
            // ============================================

            console.log(
                '4. Running audio analysis...'
            );

            const audioScores =
                await calculateAudioScores(
                    audioPath
                );

            console.log(
                `Audio analysis completed: ${audioScores.length} samples`
            );

            // ============================================
            // 5. SCENE DETECTION
            // ============================================

            console.log(
                '5. Detecting scene changes...'
            );

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

            console.log(
                `Detected ${sceneTimestamps.length} scene changes`
            );

            // ============================================
            // 6. COMBINE SCORES
            // ============================================

            console.log(
                '6. Combining highlight scores...'
            );

            const highlights =
                combineScores(
                    visualScores,
                    audioScores,
                    sceneTimestamps
                );

            console.log(
                `Generated ${highlights.length} highlight samples`
            );

            // ============================================
            // 7. GROUP HIGHLIGHT EVENTS
            // ============================================

            console.log(
                '7. Grouping highlight events...'
            );

            const events =
                groupHighlightEvents(
                    highlights
                );

            console.log(
                `Grouped into ${events.length} events`
            );

            // ============================================
            // 8. REMOVE OVERLAPPING EVENTS
            // ============================================

            console.log(
                '8. Removing overlapping events...'
            );

            const finalEvents =
                removeOverlappingEvents(
                    events
                );

            console.log(
                `Remaining events: ${finalEvents.length}`
            );

            // ============================================
            // 9. SELECT CANDIDATES
            // ============================================

            console.log(
                '9. Selecting top candidates for AI...'
            );

            /*
             * We intentionally send more candidates
             * to Qwen.
             *
             * Qwen ranks the candidates.
             * Node chooses the top 3.
             */

            const candidates =
                selectTopCandidates(
                    finalEvents,
                    10
                );

            console.log(
                `Found ${candidates.length} candidates`
            );

            if (
                !candidates.length
            ) {

                console.warn(
                    'No candidates found.'
                );

                cleanupVideoFiles({

                    inputPath,

                    videoId,

                    framesDirectory,

                    audioDirectory
                });

                return res.json({

                    success:
                        true,

                    message:
                        'No highlight candidates found',

                    clips:
                        []
                });
            }

            // ============================================
            // 10. BUILD AI FEATURES
            // ============================================

            console.log(
                '10. Building candidate features...'
            );

            /*
             * IMPORTANT:
             *
             * Each candidate receives a stable ID.
             *
             * Qwen will return this ID.
             *
             * Node then maps that ID back to
             * the original candidate.
             */

            const enrichedCandidates =
                candidates.map(
                    (candidate, index) => {

                        const features =
                            buildCandidateFeatures(
                                candidate,
                                visualScores,
                                audioScores,
                                sceneTimestamps
                            );

                        return {

                            id:
                                index,

                            ...features
                        };
                    }
                );

            console.log(
                'Enriched candidates:'
            );

            console.log(
                JSON.stringify(
                    enrichedCandidates,
                    null,
                    2
                )
            );

            // ============================================
            // 11. AI ANALYSIS
            // ============================================

            console.log('');
            console.log(
                '11. Running faster-whisper + ONE Qwen3 request...'
            );
            console.log('');

            const aiResponse =
                await analyzeCandidates(
                    audioPath,
                    enrichedCandidates
                );

            console.log('');
            console.log(
                'FULL AI RESPONSE:'
            );

            console.log(
                JSON.stringify(
                    aiResponse,
                    null,
                    2
                )
            );

            // ============================================
            // 12. GET AI RESULTS
            // ============================================

            const aiCandidates =
                Array.isArray(
                    aiResponse?.results
                )
                    ? aiResponse.results
                    : [];

            console.log('');
            console.log(
                'AI CANDIDATES:'
            );

            console.log(
                JSON.stringify(
                    aiCandidates,
                    null,
                    2
                )
            );

            console.log(
                `AI analysis completed. Received ${aiCandidates.length} results.`
            );

            if (
                !aiCandidates.length
            ) {

                console.warn(
                    'AI returned no results.'
                );

                cleanupVideoFiles({

                    inputPath,

                    videoId,

                    framesDirectory,

                    audioDirectory
                });

                return res.json({

                    success:
                        true,

                    message:
                        'AI did not select any clips',

                    clips:
                        []
                });
            }

            // ============================================
            // 13. SORT BY AI SCORE
            // ============================================

            const topAIClips =
                aiCandidates

                    .filter(
                        clip =>
                            clip &&
                            Number.isFinite(
                                Number(
                                    clip.id
                                )
                            )
                    )

                    .sort(
                        (a, b) =>
                            Number(
                                b.ai_score ?? 0
                            ) -
                            Number(
                                a.ai_score ?? 0
                            )
                    )

                    .slice(
                        0,
                        3
                    );

            console.log('');
            console.log(
                'TOP AI CLIPS:'
            );

            console.log(
                JSON.stringify(
                    topAIClips,
                    null,
                    2
                )
            );

            // ============================================
            // 14. MAP AI RESULTS BACK TO CANDIDATES
            // ============================================

            const selectedCandidates =
                topAIClips

                    .map(
                        aiClip => {

                            const candidateId =
                                Number(
                                    aiClip.id
                                );

                            /*
                             * IMPORTANT:
                             *
                             * Find the candidate using
                             * the stable ID.
                             *
                             * We do NOT allow Qwen to
                             * control start/end.
                             */

                            const originalCandidate =
                                enrichedCandidates.find(
                                    candidate =>
                                        Number(
                                            candidate.id
                                        ) ===
                                        candidateId
                                );

                            if (
                                !originalCandidate
                            ) {

                                console.warn(
                                    `Could not find candidate with id ${candidateId}`
                                );

                                return null;
                            }

                            return {

                                ...originalCandidate,

                                aiScore:
                                    Number(
                                        aiClip.ai_score ??
                                        0
                                    ),

                                category:
                                    aiClip.category ??
                                    'highlight',

                                reason:
                                    aiClip.reason ??
                                    'AI-selected highlight',

                                transcript:
                                    aiClip.transcript ??
                                    null
                            };
                        }
                    )

                    .filter(
                        Boolean
                    );

            console.log('');
            console.log(
                'Selected candidates for FFmpeg:'
            );

            console.log(
                JSON.stringify(
                    selectedCandidates,
                    null,
                    2
                )
            );

            // ============================================
            // 15. GENERATE SHORTS
            // ============================================

            console.log('');
            console.log(
                '15. Generating Shorts...'
            );

            const generatedClips = [];

            for (
                let i = 0;
                i < selectedCandidates.length;
                i++
            ) {

                const clip =
                    selectedCandidates[i];

                // ----------------------------------------
                // Candidate boundaries
                // ----------------------------------------

                const safeStart =
                    Math.max(
                        0,
                        Number(
                            clip.start ?? 0
                        )
                    );

                const safeEnd =
                    Math.max(
                        safeStart,
                        Number(
                            clip.end ??
                            safeStart
                        )
                    );

                // ----------------------------------------
                // Maximum Short duration = 60 seconds
                // ----------------------------------------

                const duration =
                    Math.min(
                        safeEnd -
                        safeStart,
                        60
                    );

                console.log('');
                console.log(
                    `Clip ${i + 1}:`
                );

                console.log(
                    'Start:',
                    safeStart
                );

                console.log(
                    'End:',
                    safeEnd
                );

                console.log(
                    'Duration:',
                    duration
                );

                console.log(
                    'AI Score:',
                    clip.aiScore
                );

                console.log(
                    'Category:',
                    clip.category
                );

                console.log(
                    'Reason:',
                    clip.reason
                );

                // ----------------------------------------
                // Validate
                // ----------------------------------------

                if (
                    !Number.isFinite(
                        duration
                    ) ||
                    duration <= 0
                ) {

                    console.warn(
                        `Skipping invalid clip: ${safeStart} - ${safeEnd}`
                    );

                    continue;
                }

                // ========================================
                // OUTPUT FILENAME
                // ========================================

                const outputFilename =
                    `${videoId}-ai-short-${i + 1}.mp4`;

                console.log(
                    'Generating:',
                    outputFilename
                );

                // ========================================
                // FFmpeg
                // ========================================

                await generateClip(
                    inputPath,
                    safeStart,
                    duration,
                    outputFilename
                );

                // ========================================
                // RESPONSE DATA
                // ========================================

                generatedClips.push({

                    filename:
                        outputFilename,

                    url:
                        `http://localhost:3000/clips/${outputFilename}`,

                    start:
                        safeStart,

                    end:
                        safeStart + duration,

                    score:
                        Number(
                            clip.algorithmicScore ??
                            clip.score ??
                            0
                        ),

                    aiScore:
                        Number(
                            clip.aiScore ??
                            0
                        ),

                    category:
                        clip.category,

                    reason:
                        clip.reason,

                    transcript:
                        clip.transcript
                });
            }

            // ============================================
            // 16. CLEANUP
            // ============================================

            console.log('');
            console.log(
                '16. Cleaning temporary files...'
            );

            cleanupVideoFiles({

                inputPath,

                videoId,

                framesDirectory,

                audioDirectory
            });

            // ============================================
            // 17. RESPONSE
            // ============================================

            console.log('');
            console.log(
                '================================'
            );

            console.log(
                'AI Shorts generation completed'
            );

            console.log(
                `Generated ${generatedClips.length} clips`
            );

            console.log(
                '================================'
            );

            console.log('');

            res.json({

                success:
                    true,

                message:
                    'AI Shorts generated successfully',

                clips:
                    generatedClips
            });

        } catch (error) {

            console.error('');
            console.error(
                '================================'
            );

            console.error(
                'AI Shorts generation error'
            );

            console.error(
                '================================'
            );

            console.error(
                error
            );

            console.error(
                'Message:',
                error.message
            );

            console.error(
                'Stack:',
                error.stack
            );

            console.error(
                '================================'
            );

            /*
             * Make sure temporary files are cleaned
             * even if AI or FFmpeg fails.
             */

            try {

                if (
                    inputPath &&
                    videoId
                ) {

                    cleanupVideoFiles({

                        inputPath,

                        videoId,

                        framesDirectory,

                        audioDirectory
                    });
                }

            } catch (cleanupError) {

                console.error(
                    'Cleanup error:',
                    cleanupError
                );
            }

            if (
                !res.headersSent
            ) {

                res.status(500).json({

                    success:
                        false,

                    message:
                        'Failed to generate AI Shorts',

                    error:
                        error.message
                });
            }
        }
    }
);

// =====================================================
// Detect visual highlights
// =====================================================

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

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const videoId =
                path.parse(
                    filename
                ).name;

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

                success:
                    true,

                highlights:
                    highlights.slice(
                        0,
                        10
                    )
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to detect highlights',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Generate clips
// =====================================================

app.post(
    '/api/videos/:filename/generate-clips',
    async (req, res) => {

        try {

            const filename =
                req.params.filename;

            const inputPath =
                path.join(
                    uploadDirectory,
                    filename
                );

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
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

                    filename:
                        outputFilename,

                    url:
                        `http://localhost:3000/clips/${outputFilename}`
                });
            }

            res.json({

                success:
                    true,

                message:
                    'Clips generated successfully',

                clips:
                    generatedClips
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to generate clips',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Analyze audio
// =====================================================

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

            if (
                !fs.existsSync(
                    inputPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            const videoId =
                path.parse(
                    filename
                ).name;

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

                success:
                    true,

                audioPeaks:
                    scores.slice(
                        0,
                        10
                    )
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success:
                    false,

                message:
                    'Failed to analyze audio',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Static files
// =====================================================

app.use(
    '/uploads',
    express.static(
        uploadDirectory
    )
);

app.use(
    '/clips',
    express.static(
        clipsDirectory
    )
);

// =====================================================
// Error handler
// =====================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(error);

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        'Video cannot exceed 500 MB.'
                });
            }
        }

        res.status(400).json({

            success:
                false,

            message:
                error.message ||
                'Something went wrong.'
        });
    }
);

// =====================================================
// Start server
// =====================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 GameClip AI backend running at http://localhost:${PORT}`
        );
    }
);