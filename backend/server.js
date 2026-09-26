const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();

const PORT = 3000;

// =====================================================
// Configuration
// =====================================================

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL ||
    'http://127.0.0.1:8000';

const VISION_WINDOW_SIZE =
    Number(
        process.env.VISION_WINDOW_SIZE || 12
    );

const VISION_FRAME_INTERVAL =
    Number(
        process.env.VISION_FRAME_INTERVAL || 1
    );

const MAX_AI_CANDIDATES =
    Number(
        process.env.MAX_AI_CANDIDATES || 10
    );

const MAX_FINAL_CLIPS =
    Number(
        process.env.MAX_FINAL_CLIPS || 3
    );

const MAX_SHORT_DURATION =
    Number(
        process.env.MAX_SHORT_DURATION || 60
    );

// =====================================================
// Middleware
// =====================================================

app.use(cors());
app.use(express.json());

// =====================================================
// Directories
// =====================================================

const uploadDirectory =
    path.join(
        __dirname,
        'uploads'
    );

const framesDirectory =
    path.join(
        __dirname,
        'frames'
    );

const audioDirectory =
    path.join(
        __dirname,
        'audio'
    );

const clipsDirectory =
    path.join(
        __dirname,
        'clips'
    );

// =====================================================
// Create directories
// =====================================================

[
    uploadDirectory,
    framesDirectory,
    audioDirectory,
    clipsDirectory
].forEach(directory => {

    if (!fs.existsSync(directory)) {

        fs.mkdirSync(
            directory,
            {
                recursive: true
            }
        );
    }
});

// =====================================================
// Services
// =====================================================

const {
    analyzeCandidates
} = require(
    './services/aiClipSelector'
);

const {
    extractFrames
} = require(
    './services/frameExtractor'
);

const {
    cleanupVideoFiles
} = require(
    './services/fileCleanup'
);

const {
    selectTopCandidates
} = require(
    './services/candidateSelector'
);

const {
    detectSceneChanges
} = require(
    './services/sceneDetector'
);

const {
    extractAudio,
    calculateAudioScores
} = require(
    './services/audioAnalyzer'
);

const {
    combineScores,
    groupHighlightEvents,
    removeOverlappingEvents,
    detectVisualHighlights
} = require(
    './services/highlightDetector'
);

const {
    getVideoMetadata
} = require(
    './services/videoAnalyzer'
);

const {
    generateClip
} = require(
    './services/videoProcessor'
);

// =====================================================
// Generic helpers
// =====================================================

function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function clamp(
    value,
    min,
    max
) {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );
}

// =====================================================
// File existence
// =====================================================

function videoExists(
    filename
) {

    if (!filename) {
        return false;
    }

    const inputPath =
        path.join(
            uploadDirectory,
            filename
        );

    return fs.existsSync(
        inputPath
    );
}

// =====================================================
// Build candidate features
// =====================================================

function buildCandidateFeatures(
    candidate,
    visualScores,
    audioScores,
    sceneTimestamps,
    semanticEvents = []
) {

    const candidateStart =
        safeNumber(
            candidate?.start,
            0
        );

    const candidateEnd =
        safeNumber(
            candidate?.end,
            candidateStart
        );

    const safeVisualScores =
        Array.isArray(
            visualScores
        )
            ? visualScores
            : [];

    const safeAudioScores =
        Array.isArray(
            audioScores
        )
            ? audioScores
            : [];

    const safeSceneTimestamps =
        Array.isArray(
            sceneTimestamps
        )
            ? sceneTimestamps
            : [];

    const safeSemanticEvents =
        Array.isArray(
            semanticEvents
        )
            ? semanticEvents
            : [];

    // =================================================
    // Visual data
    // =================================================

    const visualData =
        safeVisualScores
            .filter(item => {

                const timestamp =
                    safeNumber(
                        item?.timestamp,
                        NaN
                    );

                return (
                    Number.isFinite(
                        timestamp
                    ) &&
                    timestamp >=
                    candidateStart &&
                    timestamp <=
                    candidateEnd
                );
            })
            .map(item => ({

                timestamp:
                    safeNumber(
                        item.timestamp
                    ),

                score:
                    safeNumber(
                        item.visualScore,
                        0
                    )
            }));

    // =================================================
    // Audio data
    // =================================================

    const audioData =
        safeAudioScores
            .filter(item => {

                const timestamp =
                    safeNumber(
                        item?.timestamp,
                        NaN
                    );

                return (
                    Number.isFinite(
                        timestamp
                    ) &&
                    timestamp >=
                    candidateStart &&
                    timestamp <=
                    candidateEnd
                );
            })
            .map(item => ({

                timestamp:
                    safeNumber(
                        item.timestamp
                    ),

                score:
                    safeNumber(
                        item.audioScore,
                        0
                    )
            }));

    // =================================================
    // Scene data
    // =================================================

    const sceneData =
        safeSceneTimestamps
            .map(scene => {

                if (
                    typeof scene ===
                    'number'
                ) {

                    return scene;
                }

                if (
                    typeof scene ===
                    'object' &&
                    scene !== null
                ) {

                    return safeNumber(
                        scene.timestamp ??
                        scene.start ??
                        scene.time,
                        NaN
                    );
                }

                return NaN;
            })
            .filter(timestamp => {

                return (
                    Number.isFinite(
                        timestamp
                    ) &&
                    timestamp >=
                    candidateStart &&
                    timestamp <=
                    candidateEnd
                );
            });

    // =================================================
    // Semantic AI events
    // =================================================

    const candidateEvents =
        safeSemanticEvents
            .filter(event => {

                const eventStart =
                    safeNumber(
                        event?.start,
                        NaN
                    );

                const eventEnd =
                    safeNumber(
                        event?.end,
                        eventStart
                    );

                if (
                    !Number.isFinite(
                        eventStart
                    ) ||
                    !Number.isFinite(
                        eventEnd
                    )
                ) {

                    return false;
                }

                return (
                    eventEnd >=
                    candidateStart &&
                    eventStart <=
                    candidateEnd
                );
            })
            .map(event => ({

                event:
                    event.event ??
                    event.type ??
                    'unknown',

                start:
                    safeNumber(
                        event.start
                    ),

                end:
                    safeNumber(
                        event.end,
                        event.start
                    ),

                confidence:
                    clamp(
                        safeNumber(
                            event.confidence,
                            0
                        ),
                        0,
                        1
                    ),

                description:
                    event.description ??
                    ''
            }));

    // =================================================
    // Helpers
    // =================================================

    const average =
        values => {

            if (
                !Array.isArray(
                    values
                ) ||
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
                    (
                        sum,
                        value
                    ) =>
                        sum + value,
                    0
                ) /
                validValues.length
            );
        };

    const maximum =
        values => {

            if (
                !Array.isArray(
                    values
                ) ||
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

    // =================================================
    // Peaks
    // =================================================

    const visualPeak =
        visualData.reduce(
            (
                best,
                current
            ) => {

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

    const audioPeak =
        audioData.reduce(
            (
                best,
                current
            ) => {

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

    // =================================================
    // Semantic confidence
    // =================================================

    const semanticConfidence =
        candidateEvents.length > 0
            ? Math.max(
                ...candidateEvents.map(
                    event =>
                        safeNumber(
                            event.confidence
                        )
                )
            )
            : 0;

    // =================================================
    // Final object
    // =================================================

    return {

        start:
            candidateStart,

        end:
            Math.max(
                candidateStart,
                candidateEnd
            ),

        duration:
            Math.max(
                0,
                candidateEnd -
                candidateStart
            ),

        algorithmicScore:
            safeNumber(
                candidate?.score ??
                candidate?.algorithmicScore,
                0
            ),

        semanticEvents:
            candidateEvents,

        semanticConfidence,

        visual: {

            averageActivity:
                average(
                    visualData.map(
                        item =>
                            item.score
                    )
                ),

            peakActivity:
                maximum(
                    visualData.map(
                        item =>
                            item.score
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
                        item =>
                            item.score
                    )
                ),

            peakIntensity:
                maximum(
                    audioData.map(
                        item =>
                            item.score
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
// Get frame timestamp
// =====================================================

function getFrameTimestamp(
    framePath,
    index
) {

    const filename =
        path.basename(
            framePath
        );

    /*
     * Expected formats:
     *
     * frame-000001.jpg
     * frame-1.jpg
     * ai-frame-000001.jpg
     */

    const match =
        filename.match(
            /(\d+)(?=\.[^.]+$)/
        );

    if (match) {

        const frameNumber =
            Number(
                match[1]
            );

        if (
            Number.isFinite(
                frameNumber
            )
        ) {

            /*
             * FFmpeg frame numbering
             * normally starts at 1.
             */

            return Math.max(
                0,
                frameNumber - 1
            );
        }
    }

    return index;
}

// =====================================================
// Extract AI vision events
// =====================================================

async function analyzeVisionFrames(
    framePaths,
    videoDuration
) {

    if (
        !Array.isArray(
            framePaths
        ) ||
        framePaths.length === 0
    ) {

        return [];
    }

    console.log('');
    console.log(
        'Starting Vision AI event discovery...'
    );

    const allEvents = [];

    /*
     * We process frames in small windows.
     *
     * This is important for an M1 Mac
     * with limited unified memory.
     */

    for (
        let startIndex = 0;
        startIndex < framePaths.length;
        startIndex +=
        VISION_WINDOW_SIZE
    ) {

        const windowPaths =
            framePaths.slice(
                startIndex,
                startIndex +
                VISION_WINDOW_SIZE
            );

        if (
            windowPaths.length === 0
        ) {

            continue;
        }

        const frameTimes =
            windowPaths.map(
                (
                    framePath,
                    localIndex
                ) => {

                    const globalIndex =
                        startIndex +
                        localIndex;

                    const timestamp =
                        getFrameTimestamp(
                            framePath,
                            globalIndex
                        );

                    return clamp(
                        timestamp,
                        0,
                        videoDuration
                    );
                }
            );

        const windowStart =
            frameTimes[0] ?? 0;

        const windowEnd =
            frameTimes[
            frameTimes.length - 1
            ] ?? windowStart;

        console.log(
            `Vision window ${Math.floor(
                startIndex /
                VISION_WINDOW_SIZE
            ) + 1}: ` +
            `${windowStart.toFixed(1)}s - ` +
            `${windowEnd.toFixed(1)}s`
        );

        const form =
            new FormData();

        const validFrameTimes =
            JSON.stringify(
                frameTimes
            );

        for (
            let i = 0;
            i < windowPaths.length;
            i++
        ) {

            const framePath =
                windowPaths[i];

            if (
                !fs.existsSync(
                    framePath
                )
            ) {

                continue;
            }

            const imageBuffer =
                fs.readFileSync(
                    framePath
                );

            form.append(
                'frames',
                imageBuffer,
                {
                    filename:
                        `frame-${i}.jpg`,

                    contentType:
                        'image/jpeg'
                }
            );
        }

        form.append(
            'start_time',
            String(
                windowStart
            )
        );

        form.append(
            'end_time',
            String(
                windowEnd
            )
        );

        form.append(
            'frame_times',
            validFrameTimes
        );

        try {

            const response =
                await fetch(
                    `${AI_SERVICE_URL}/analyze-frames`,
                    {
                        method:
                            'POST',

                        body:
                            form,

                        headers:
                            form.getHeaders()
                    }
                );

            if (
                !response.ok
            ) {

                const errorText =
                    await response.text();

                console.error(
                    'Vision AI request failed:',
                    response.status,
                    errorText
                );

                continue;
            }

            const data =
                await response.json();

            const events =
                Array.isArray(
                    data?.events
                )
                    ? data.events
                    : [];

            /*
             * Add window events to
             * global event timeline.
             */

            events.forEach(
                event => {

                    if (!event) {
                        return;
                    }

                    const eventStart =
                        safeNumber(
                            event.start,
                            NaN
                        );

                    const eventEnd =
                        safeNumber(
                            event.end,
                            eventStart
                        );

                    if (
                        !Number.isFinite(
                            eventStart
                        )
                    ) {

                        return;
                    }

                    allEvents.push({

                        event:
                            event.event ??
                            'unknown',

                        start:
                            clamp(
                                eventStart,
                                0,
                                videoDuration
                            ),

                        end:
                            clamp(
                                Math.max(
                                    eventStart,
                                    eventEnd
                                ),
                                0,
                                videoDuration
                            ),

                        start_frame:
                            event.start_frame,

                        end_frame:
                            event.end_frame,

                        confidence:
                            clamp(
                                safeNumber(
                                    event.confidence,
                                    0
                                ),
                                0,
                                1
                            ),

                        description:
                            event.description ??
                            ''
                    });
                }
            );

        } catch (error) {

            console.error(
                'Vision AI window error:',
                error.message
            );
        }
    }

    // =================================================
    // Deduplicate semantic events
    // =================================================

    const deduplicated =
        deduplicateSemanticEvents(
            allEvents
        );

    console.log(
        `Vision AI discovered ${deduplicated.length} semantic events`
    );

    return deduplicated;
}

// =====================================================
// Deduplicate semantic events
// =====================================================

function deduplicateSemanticEvents(
    events
) {

    if (
        !Array.isArray(
            events
        )
    ) {

        return [];
    }

    const sorted =
        [...events].sort(
            (
                a,
                b
            ) =>
                safeNumber(
                    a.start
                ) -
                safeNumber(
                    b.start
                )
        );

    const result = [];

    for (
        const event of sorted
    ) {

        const existingIndex =
            result.findIndex(
                existing => {

                    const sameType =
                        existing.event ===
                        event.event;

                    const overlap =
                        safeNumber(
                            event.start
                        ) <=
                        safeNumber(
                            existing.end
                        ) &&
                        safeNumber(
                            event.end
                        ) >=
                        safeNumber(
                            existing.start
                        );

                    return (
                        sameType &&
                        overlap
                    );
                }
            );

        if (
            existingIndex === -1
        ) {

            result.push(
                event
            );

        } else {

            const existing =
                result[
                existingIndex
                ];

            /*
             * Keep the stronger event
             * while expanding the range.
             */

            result[
                existingIndex
            ] = {

                ...existing,

                start:
                    Math.min(
                        safeNumber(
                            existing.start
                        ),
                        safeNumber(
                            event.start
                        )
                    ),

                end:
                    Math.max(
                        safeNumber(
                            existing.end
                        ),
                        safeNumber(
                            event.end
                        )
                    ),

                confidence:
                    Math.max(
                        safeNumber(
                            existing.confidence
                        ),
                        safeNumber(
                            event.confidence
                        )
                    ),

                description:
                    existing.description ||
                    event.description
            };
        }
    }

    return result;
}

// =====================================================
// Build AI candidates from semantic events
// =====================================================

function buildSemanticCandidates(
    semanticEvents,
    transcript,
    videoDuration
) {
    if (
        !Array.isArray(semanticEvents) ||
        semanticEvents.length === 0
    ) {
        return [];
    }

    const candidates = [];

    /*
     * Three possible context windows around
     * every semantic event.
     *
     * Qwen will decide which one is best.
     */

    const WINDOWS = [

        {
            before: 4,
            after: 5
        },

        {
            before: 7,
            after: 8
        },

        {
            before: 10,
            after: 12
        }
    ];

    semanticEvents.forEach(
        (
            event,
            eventIndex
        ) => {

            const eventStart =
                safeNumber(
                    event.start,
                    NaN
                );

            const eventEnd =
                safeNumber(
                    event.end,
                    eventStart
                );

            if (
                !Number.isFinite(
                    eventStart
                ) ||
                !Number.isFinite(
                    eventEnd
                )
            ) {
                return;
            }

            WINDOWS.forEach(
                (
                    window,
                    windowIndex
                ) => {

                    const start =
                        Math.max(
                            0,
                            eventStart -
                            window.before
                        );

                    const end =
                        Math.min(
                            videoDuration,
                            eventEnd +
                            window.after
                        );

                    if (
                        end <= start
                    ) {
                        return;
                    }

                    candidates.push({

                        temporaryId:
                            `${eventIndex}-${windowIndex}`,

                        start,

                        end,

                        duration:
                            end - start,

                        score:
                            safeNumber(
                                event.confidence,
                                0
                            ),

                        semanticEvents: [
                            event
                        ],

                        candidateSource:
                            'vision'
                    });
                }
            );
        }
    );

    /*
     * Remove only nearly identical windows.
     *
     * DO NOT remove all overlapping windows.
     */

    const unique = [];

    for (
        const candidate of candidates
    ) {

        const duplicate =
            unique.some(
                existing => {

                    const startDiff =
                        Math.abs(
                            existing.start -
                            candidate.start
                        );

                    const endDiff =
                        Math.abs(
                            existing.end -
                            candidate.end
                        );

                    return (
                        startDiff < 2 &&
                        endDiff < 2
                    );
                }
            );

        if (
            !duplicate
        ) {
            unique.push(
                candidate
            );
        }
    }

    /*
     * Sort semantic events by confidence.
     */

    return unique
        .sort(
            (a, b) =>
                safeNumber(
                    b.score
                ) -
                safeNumber(
                    a.score
                )
        )
        .slice(
            0,
            Math.max(
                20,
                MAX_AI_CANDIDATES * 2
            )
        );
}

// =====================================================
// Add transcript snippets to candidates
// =====================================================

function addTranscriptToCandidates(
    candidates,
    transcript
) {

    if (
        !Array.isArray(
            candidates
        )
    ) {

        return [];
    }

    if (
        !Array.isArray(
            transcript
        )
    ) {

        return candidates;
    }

    return candidates.map(
        candidate => {

            const start =
                safeNumber(
                    candidate.start
                );

            const end =
                safeNumber(
                    candidate.end,
                    start
                );

            const segments =
                transcript.filter(
                    segment => {

                        const segmentStart =
                            safeNumber(
                                segment?.start,
                                NaN
                            );

                        const segmentEnd =
                            safeNumber(
                                segment?.end,
                                segmentStart
                            );

                        return (
                            Number.isFinite(
                                segmentStart
                            ) &&
                            segmentEnd >=
                            start &&
                            segmentStart <=
                            end
                        );
                    }
                );

            return {

                ...candidate,

                transcript:
                    segments
                        .map(
                            segment =>
                                segment.text
                        )
                        .filter(
                            Boolean
                        )
                        .join(' ')
            };
        }
    );
}

// =====================================================
// Fallback candidate generation
// =====================================================

function buildFallbackCandidates(
    finalEvents,
    visualScores,
    audioScores,
    sceneTimestamps
) {

    const algorithmicCandidates =
        selectTopCandidates(
            finalEvents,
            MAX_AI_CANDIDATES
        );

    return algorithmicCandidates.map(
        candidate => {

            return buildCandidateFeatures(
                candidate,
                visualScores,
                audioScores,
                sceneTimestamps
            );
        }
    );
}

// =====================================================
// Build final candidate set
// =====================================================

function buildFinalCandidates(
    semanticCandidates,
    fallbackCandidates,
    visualScores,
    audioScores,
    sceneTimestamps,
    videoDuration
) {

    const candidates = [];

    /*
     * Vision candidates first.
     */

    for (
        const candidate of
        semanticCandidates
    ) {

        const features =
            buildCandidateFeatures(
                candidate,
                visualScores,
                audioScores,
                sceneTimestamps,
                candidate.semanticEvents
            );

        candidates.push({

            ...features,

            semanticEvents:
                candidate.semanticEvents ||
                [],

            transcript:
                candidate.transcript ||
                ''
        });
    }

    /*
     * Add algorithmic candidates only
     * if we don't have enough AI-discovered
     * candidates.
     */

    if (
        candidates.length <
        MAX_AI_CANDIDATES
    ) {

        for (
            const candidate of
            fallbackCandidates
        ) {

            if (
                candidates.length >=
                MAX_AI_CANDIDATES
            ) {

                break;
            }

            const tooClose =
                candidates.some(
                    existing =>
                        candidate.start <=
                        existing.end &&
                        candidate.end >=
                        existing.start
                );

            if (
                !tooClose
            ) {

                candidates.push(
                    candidate
                );
            }
        }
    }

    /*
     * Safety validation.
     */

    return candidates
        .filter(
            candidate => {

                const start =
                    safeNumber(
                        candidate.start,
                        NaN
                    );

                const end =
                    safeNumber(
                        candidate.end,
                        NaN
                    );

                return (
                    Number.isFinite(
                        start
                    ) &&
                    Number.isFinite(
                        end
                    ) &&
                    end > start &&
                    start <
                    videoDuration
                );
            }
        )
        .slice(
            0,
            MAX_AI_CANDIDATES
        );
}

// =====================================================
// Ensure diversity in final clips
// =====================================================

function selectDiverseTopClips(
    aiResults,
    enrichedCandidates,
    maxClips = 3
) {
    if (
        !Array.isArray(aiResults) ||
        aiResults.length === 0
    ) {
        return [];
    }

    const candidateMap =
        new Map(
            enrichedCandidates.map(
                candidate => [
                    Number(candidate.id),
                    candidate
                ]
            )
        );

    /*
     * Attach the original candidate timing
     * to every AI result.
     */

    const ranked =
        aiResults
            .map(result => {

                const candidate =
                    candidateMap.get(
                        Number(result.id)
                    );

                if (!candidate) {
                    return null;
                }

                return {

                    ...result,

                    id:
                        Number(
                            result.id
                        ),

                    ai_score:
                        safeNumber(
                            result.ai_score,
                            0
                        ),

                    start:
                        safeNumber(
                            candidate.start,
                            0
                        ),

                    end:
                        safeNumber(
                            candidate.end,
                            0
                        )
                };
            })
            .filter(Boolean)
            .sort(
                (a, b) =>
                    b.ai_score -
                    a.ai_score
            );

    const selected = [];

    /*
     * Minimum distance between the centers
     * of two selected clips.
     *
     * This prevents three candidate windows
     * around the same event from being selected.
     */
    const MIN_CENTER_DISTANCE = 15;

    for (
        const result of ranked
    ) {

        if (
            selected.length >=
            maxClips
        ) {
            break;
        }

        const candidateCenter =
            (
                result.start +
                result.end
            ) / 2;

        /*
         * Check against already selected clips.
         */

        const tooClose =
            selected.some(
                selectedResult => {

                    const selectedCenter =
                        (
                            selectedResult.start +
                            selectedResult.end
                        ) / 2;

                    const centerDistance =
                        Math.abs(
                            candidateCenter -
                            selectedCenter
                        );

                    /*
                     * Direct overlap.
                     */

                    const overlaps =
                        result.start <
                        selectedResult.end &&
                        result.end >
                        selectedResult.start;

                    return (
                        overlaps ||
                        centerDistance <
                        MIN_CENTER_DISTANCE
                    );
                }
            );

        if (
            tooClose
        ) {
            continue;
        }

        selected.push(
            result
        );
    }

    /*
     * If we couldn't find three sufficiently
     * separated clips, make a second pass with
     * a relaxed distance rule.
     *
     * This is important for shorter gameplay
     * videos.
     */

    if (
        selected.length <
        maxClips
    ) {

        for (
            const result of ranked
        ) {

            if (
                selected.length >=
                maxClips
            ) {
                break;
            }

            const alreadySelected =
                selected.some(
                    item =>
                        Number(item.id) ===
                        Number(result.id)
                );

            if (
                alreadySelected
            ) {
                continue;
            }

            /*
             * Still don't allow direct overlap.
             */

            const overlaps =
                selected.some(
                    selectedResult =>
                        result.start <
                        selectedResult.end &&
                        result.end >
                        selectedResult.start
                );

            if (
                overlaps
            ) {
                continue;
            }

            selected.push(
                result
            );
        }
    }

    /*
     * Remove helper timing properties before
     * returning the AI results.
     */

    return selected.map(
        result => {

            const {
                start,
                end,
                ...cleanResult
            } = result;

            return cleanResult;
        }
    );
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
                500 *
                1024 *
                1024
        }
    });

// =====================================================
// Health check
// =====================================================

app.get(
    '/api/health',
    async (
        req,
        res
    ) => {

        let aiService =
            false;

        try {

            const response =
                await fetch(
                    `${AI_SERVICE_URL}/health`
                );

            aiService =
                response.ok;

        } catch {

            aiService =
                false;
        }

        res.json({

            success:
                true,

            message:
                'GameClip AI backend is running',

            aiService: {

                url:
                    AI_SERVICE_URL,

                available:
                    aiService
            }
        });
    }
);

// =====================================================
// Upload video
// =====================================================

app.post(
    '/api/videos/upload',
    upload.single('video'),
    (
        req,
        res
    ) => {

        try {

            if (
                !req.file
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        'No video file uploaded'
                });
            }

            console.log(
                'Video uploaded:',
                req.file.filename
            );

            res.status(
                201
            ).json({

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
// Analyze metadata
// =====================================================

app.get(
    '/api/videos/:filename/analyze',
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    'Failed to analyze video',

                error:
                    error.message
            });
        }
    }
);

// =====================================================
// Analyze highlights
// =====================================================

app.post(
    '/api/videos/:filename/analyze-highlights',
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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

            const visualScores =
                await detectVisualHighlights(
                    framePaths
                );

            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            const audioScores =
                await calculateAudioScores(
                    audioPath
                );

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
    async (
        req,
        res
    ) => {

        let inputPath =
            null;

        let videoId =
            null;

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

                return res.status(
                    404
                ).json({

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
                '=========================================='
            );
            console.log(
                '     GAMECLIP AI - AI SHORTS PIPELINE'
            );
            console.log(
                '=========================================='
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

            // =================================================
            // 1. VIDEO METADATA
            // =================================================

            console.log(
                '1. Reading video metadata...'
            );

            const metadata =
                await getVideoMetadata(
                    inputPath
                );

            const videoDuration =
                safeNumber(
                    metadata?.duration ??
                    metadata?.format?.duration,
                    0
                );

            console.log(
                'Video duration:',
                videoDuration,
                'seconds'
            );

            // =================================================
            // 2. EXTRACT FRAMES
            // =================================================

            console.log('');
            console.log(
                '2. Extracting sampled frames...'
            );

            const framePaths =
                await extractFrames(
                    inputPath,
                    videoId,
                    VISION_FRAME_INTERVAL
                );

            console.log(
                `Extracted ${framePaths.length} frames`
            );

            // =================================================
            // 3. VISION AI EVENT DISCOVERY
            // =================================================

            console.log('');
            console.log(
                '3. Running Vision AI event discovery...'
            );

            const semanticEvents =
                await analyzeVisionFrames(
                    framePaths,
                    videoDuration
                );

            console.log('');
            console.log(
                'Semantic events:'
            );

            console.log(
                JSON.stringify(
                    semanticEvents,
                    null,
                    2
                )
            );

            // =================================================
            // 4. EXTRACT AUDIO
            // =================================================

            console.log('');
            console.log(
                '4. Extracting audio...'
            );

            const audioPath =
                await extractAudio(
                    inputPath,
                    videoId
                );

            console.log(
                'Audio:',
                audioPath
            );

            // =================================================
            // 5. AUDIO ANALYSIS
            // =================================================

            console.log('');
            console.log(
                '5. Running audio analysis...'
            );

            const audioScores =
                await calculateAudioScores(
                    audioPath
                );

            console.log(
                `Audio samples: ${audioScores.length}`
            );

            // =================================================
            // 6. SCENE DETECTION
            // =================================================

            console.log('');
            console.log(
                '6. Detecting scene changes...'
            );

            const sceneTimestamps =
                await detectSceneChanges(
                    inputPath
                );

            console.log(
                `Scene changes: ${sceneTimestamps.length}`
            );

            // =================================================
            // 7. LEGACY VISUAL SIGNAL
            // =================================================

            console.log('');
            console.log(
                '7. Calculating visual activity signals...'
            );

            const visualScores =
                await detectVisualHighlights(
                    framePaths
                );

            console.log(
                `Visual samples: ${visualScores.length}`
            );

            // =================================================
            // 8. ALGORITHMIC FALLBACK
            // =================================================

            console.log('');
            console.log(
                '8. Building algorithmic fallback candidates...'
            );

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

            const fallbackCandidates =
                buildFallbackCandidates(
                    finalEvents,
                    visualScores,
                    audioScores,
                    sceneTimestamps
                );

            console.log(
                `Fallback candidates: ${fallbackCandidates.length}`
            );

            // =================================================
            // 9. BUILD AI CANDIDATES FROM VISION EVENTS
            // =================================================

            console.log('');
            console.log(
                '9. Building candidates from semantic AI events...'
            );

            let semanticCandidates =
                buildSemanticCandidates(
                    semanticEvents,
                    [],
                    videoDuration
                );

            console.log(
                `Vision candidates: ${semanticCandidates.length}`
            );

            // =================================================
            // 10. WHISPER TRANSCRIPTION
            // =================================================

            console.log('');
            console.log(
                '10. Running faster-whisper transcription...'
            );

            /*
             * aiClipSelector calls the FastAPI
             * transcription + Qwen pipeline.
             *
             * We first build candidate contexts.
             */

            // =================================================
            // 11. COMBINE AI + FALLBACK CANDIDATES
            // =================================================

            console.log('');
            console.log(
                '11. Combining semantic and fallback candidates...'
            );

            let candidates =
                buildFinalCandidates(
                    semanticCandidates,
                    fallbackCandidates,
                    visualScores,
                    audioScores,
                    sceneTimestamps,
                    videoDuration
                );

            /*
             * If Vision AI did not discover anything,
             * retain the original algorithmic pipeline.
             */

            if (
                candidates.length === 0
            ) {

                console.warn(
                    'Vision AI produced no candidates. Using algorithmic fallback.'
                );

                candidates =
                    fallbackCandidates;
            }

            console.log(
                `Final candidate count: ${candidates.length}`
            );

            if (
                candidates.length === 0
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

            // =================================================
            // 12. ASSIGN STABLE IDS
            // =================================================

            console.log('');
            console.log(
                '12. Assigning stable candidate IDs...'
            );

            const enrichedCandidates =
                candidates.map(
                    (
                        candidate,
                        index
                    ) => {

                        return {

                            id:
                                index,

                            ...candidate,

                            semanticEvents:
                                Array.isArray(
                                    candidate.semanticEvents
                                )
                                    ? candidate.semanticEvents
                                    : []
                        };
                    }
                );

            console.log(
                JSON.stringify(
                    enrichedCandidates,
                    null,
                    2
                )
            );

            // =================================================
            // 13. ONE AI ANALYSIS REQUEST
            // =================================================

            console.log('');
            console.log(
                '13. Running faster-whisper + ONE Qwen3 ranking request...'
            );

            /*
             * analyzeCandidates:
             *
             * 1. Transcribes the entire audio once.
             * 2. Builds transcript snippets for candidates.
             * 3. Sends ALL candidates to Qwen3 in ONE request.
             * 4. Returns semantic AI scores.
             */

            const aiResponse =
                await analyzeCandidates(
                    audioPath,
                    enrichedCandidates
                );

            console.log('');
            console.log(
                'AI ranking response:'
            );

            console.log(
                JSON.stringify(
                    aiResponse,
                    null,
                    2
                )
            );

            // =================================================
            // 14. GET AI RESULTS
            // =================================================

            const aiCandidates =
                Array.isArray(
                    aiResponse?.results
                )
                    ? aiResponse.results
                    : Array.isArray(
                        aiResponse?.candidates
                    )
                        ? aiResponse.candidates
                        : [];

            if (
                aiCandidates.length === 0
            ) {

                console.warn(
                    'Qwen returned no ranking results.'
                );

                /*
                 * Fallback to algorithmic ordering
                 * rather than returning nothing.
                 */

                const fallbackAIResults =
                    enrichedCandidates.map(
                        candidate => ({

                            id:
                                candidate.id,

                            ai_score:
                                Math.round(
                                    safeNumber(
                                        candidate.algorithmicScore
                                    ) *
                                    100
                                ),

                            category:
                                candidate
                                    .semanticEvents?.[0]
                                    ?.event ??
                                'highlight',

                            reason:
                                'Algorithmic fallback selection'
                        })
                    );

                aiCandidates.push(
                    ...fallbackAIResults
                );
            }

            // =================================================
            // 15. SELECT TOP 3 DIVERSE CLIPS
            // =================================================

            console.log('');
            console.log(
                '15. Selecting top diverse AI clips...'
            );

            const topAIClips =
                selectDiverseTopClips(
                    aiCandidates,
                    enrichedCandidates,
                    MAX_FINAL_CLIPS
                );

            console.log(
                JSON.stringify(
                    topAIClips,
                    null,
                    2
                )
            );

            // =================================================
            // 16. MAP RESULTS TO ORIGINAL CANDIDATES
            // =================================================

            console.log('');
            console.log(
                '16. Mapping AI results to original candidates...'
            );

            const selectedCandidates =
                topAIClips
                    .map(
                        aiClip => {

                            const candidateId =
                                Number(
                                    aiClip.id
                                );

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
                                    `Candidate ${candidateId} not found`
                                );

                                return null;
                            }

                            return {

                                ...originalCandidate,

                                aiScore:
                                    safeNumber(
                                        aiClip.ai_score
                                    ),

                                category:
                                    aiClip.category ??
                                    'highlight',

                                reason:
                                    aiClip.reason ??
                                    'AI-selected highlight',

                                transcript:
                                    aiClip.transcript ??
                                    originalCandidate.transcript ??
                                    null
                            };
                        }
                    )
                    .filter(
                        Boolean
                    );

            // =================================================
            // 17. GENERATE SHORTS
            // =================================================

            console.log('');
            console.log(
                '17. Generating 1080x1920 Shorts with FFmpeg...'
            );

            const generatedClips =
                [];

            for (
                let i = 0;
                i <
                selectedCandidates.length;
                i++
            ) {

                const clip =
                    selectedCandidates[i];

                let safeStart =
                    Math.max(
                        0,
                        safeNumber(
                            clip.start
                        )
                    );

                let safeEnd =
                    Math.max(
                        safeStart,
                        safeNumber(
                            clip.end,
                            safeStart
                        )
                    );

                /*
                 * Never exceed source duration.
                 */

                if (
                    videoDuration > 0
                ) {

                    safeStart =
                        Math.min(
                            safeStart,
                            videoDuration
                        );

                    safeEnd =
                        Math.min(
                            safeEnd,
                            videoDuration
                        );
                }

                /*
                 * Maximum 60 seconds.
                 */

                let duration =
                    Math.min(
                        safeEnd -
                        safeStart,
                        MAX_SHORT_DURATION
                    );

                /*
                 * If candidate is too short,
                 * give it a minimum useful context
                 * around the event.
                 */

                if (
                    duration < 3
                ) {

                    const center =
                        (
                            safeStart +
                            safeEnd
                        ) / 2;

                    safeStart =
                        Math.max(
                            0,
                            center - 4
                        );

                    safeEnd =
                        Math.min(
                            videoDuration ||
                            center + 4,
                            center + 4
                        );

                    duration =
                        Math.min(
                            safeEnd -
                            safeStart,
                            MAX_SHORT_DURATION
                        );
                }

                if (
                    !Number.isFinite(
                        duration
                    ) ||
                    duration <= 0
                ) {

                    console.warn(
                        'Skipping invalid candidate'
                    );

                    continue;
                }

                const outputFilename =
                    `${videoId}-ai-short-${i + 1}.mp4`;

                console.log('');
                console.log(
                    `Generating clip ${i + 1}/${selectedCandidates.length}`
                );

                console.log(
                    'Start:',
                    safeStart
                );

                console.log(
                    'Duration:',
                    duration
                );

                console.log(
                    'AI score:',
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

                await generateClip(
                    inputPath,
                    safeStart,
                    duration,
                    outputFilename
                );

                generatedClips.push({

                    filename:
                        outputFilename,

                    url:
                        `http://localhost:${PORT}/clips/${outputFilename}`,

                    start:
                        safeStart,

                    end:
                        safeStart +
                        duration,

                    duration,

                    score:
                        safeNumber(
                            clip.algorithmicScore ??
                            clip.score
                        ),

                    aiScore:
                        safeNumber(
                            clip.aiScore
                        ),

                    category:
                        clip.category,

                    reason:
                        clip.reason,

                    transcript:
                        clip.transcript ??
                        null,

                    semanticEvents:
                        clip.semanticEvents ??
                        []
                });
            }

            // =================================================
            // 18. CLEANUP TEMPORARY FILES
            // =================================================

            console.log('');
            console.log(
                '18. Cleaning temporary files...'
            );

            cleanupVideoFiles({

                inputPath,

                videoId,

                framesDirectory,

                audioDirectory
            });

            // =================================================
            // 19. RESPONSE
            // =================================================

            console.log('');
            console.log(
                '=========================================='
            );

            console.log(
                'AI Shorts generation completed'
            );

            console.log(
                `Generated ${generatedClips.length} clips`
            );

            console.log(
                '=========================================='
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
                '=========================================='
            );

            console.error(
                'AI SHORTS GENERATION ERROR'
            );

            console.error(
                '=========================================='
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
                '=========================================='
            );

            // =================================================
            // Cleanup after failure
            // =================================================

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

            } catch (
            cleanupError
            ) {

                console.error(
                    'Cleanup error:',
                    cleanupError
                );
            }

            if (
                !res.headersSent
            ) {

                res.status(
                    500
                ).json({

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
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        'Video not found'
                });
            }

            console.log(
                `Starting processing: ${filename}`
            );

            const timestamps = [

                10,

                60,

                120
            ];

            const generatedClips =
                [];

            for (
                let i = 0;
                i <
                timestamps.length;
                i++
            ) {

                const timestamp =
                    timestamps[i];

                const outputFilename =
                    `${path.parse(
                        filename
                    ).name}-short-${i + 1}.mp4`;

                await generateClip(
                    inputPath,
                    timestamp,
                    outputFilename
                );

                generatedClips.push({

                    filename:
                        outputFilename,

                    url:
                        `http://localhost:${PORT}/clips/${outputFilename}`
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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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
    async (
        req,
        res
    ) => {

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

                return res.status(
                    404
                ).json({

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
                (
                    a,
                    b
                ) =>
                    safeNumber(
                        b.audioScore
                    ) -
                    safeNumber(
                        a.audioScore
                    )
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

            console.error(
                error
            );

            res.status(
                500
            ).json({

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

        console.error(
            error
        );

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        'Video cannot exceed 500 MB.'
                });
            }
        }

        res.status(
            400
        ).json({

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

        console.log('');
        console.log(
            '=========================================='
        );
        console.log(
            '🚀 GameClip AI Backend'
        );
        console.log(
            '=========================================='
        );
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log(
            `AI Service: ${AI_SERVICE_URL}`
        );
        console.log(
            'Vision model: qwen3-vl:2b'
        );
        console.log(
            'Text model: qwen3:4b'
        );
        console.log(
            '=========================================='
        );
        console.log('');
    }
);