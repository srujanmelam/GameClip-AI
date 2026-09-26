const fs = require('fs');
const path = require('path');

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL ||
    'http://127.0.0.1:8000';


// ============================================================
// CONFIG
// ============================================================

const FRAMES_PER_BATCH = 8;


// ============================================================
// SPLIT FRAMES INTO BATCHES
// ============================================================

function createFrameBatches(
    timestampedFrames,
    batchSize = FRAMES_PER_BATCH
) {

    const batches = [];

    for (
        let i = 0;
        i < timestampedFrames.length;
        i += batchSize
    ) {

        batches.push(
            timestampedFrames.slice(
                i,
                i + batchSize
            )
        );
    }

    return batches;
}


// ============================================================
// SEND ONE FRAME BATCH TO FASTAPI
// ============================================================

async function analyzeFrameBatch(
    batch
) {

    if (!batch || batch.length === 0) {
        return [];
    }

    const formData =
        new FormData();

    const timestamps =
        batch.map(
            frame =>
                frame.timestamp
        );

    for (
        const frame of batch
    ) {

        const imageBuffer =
            fs.readFileSync(
                frame.path
            );

        const blob =
            new Blob(
                [imageBuffer],
                {
                    type: 'image/jpeg'
                }
            );

        formData.append(
            'frames',
            blob,
            path.basename(
                frame.path
            )
        );
    }

    formData.append(
        'start_time',
        String(
            batch[0].timestamp
        )
    );

    formData.append(
        'end_time',
        String(
            batch[
                batch.length - 1
            ].timestamp
        )
    );

    formData.append(
        'frame_times',
        JSON.stringify(
            timestamps
        )
    );

    console.log(
        `Vision batch: ${
            batch[0].timestamp
        }s -> ${
            batch[
                batch.length - 1
            ].timestamp
        }s`
    );

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            180000
        );

    try {

        const response =
            await fetch(
                `${AI_SERVICE_URL}/analyze-frames`,
                {
                    method: 'POST',

                    body: formData,

                    signal:
                        controller.signal
                }
            );

        const responseText =
            await response.text();

        if (!response.ok) {

            throw new Error(
                `Vision AI returned ${response.status}: ${responseText}`
            );
        }

        let result;

        try {

            result =
                JSON.parse(
                    responseText
                );

        } catch (error) {

            throw new Error(
                `Invalid Vision AI JSON: ${responseText}`
            );
        }

        return Array.isArray(
            result.events
        )
            ? result.events
            : [];

    } catch (error) {

        if (
            error.name ===
            'AbortError'
        ) {

            console.error(
                'Vision AI request timed out.'
            );

        } else {

            console.error(
                'Vision AI request failed:',
                error.message
            );
        }

        return [];

    } finally {

        clearTimeout(
            timeout
        );
    }
}


// ============================================================
// ANALYZE ALL FRAMES
// ============================================================

async function analyzeFrames(
    timestampedFrames
) {

    console.log(
        '================================'
    );

    console.log(
        'VISION EVENT DETECTION'
    );

    console.log(
        '================================'
    );

    if (
        !Array.isArray(
            timestampedFrames
        ) ||
        timestampedFrames.length === 0
    ) {

        return [];
    }

    const batches =
        createFrameBatches(
            timestampedFrames
        );

    console.log(
        `Total frames: ${
            timestampedFrames.length
        }`
    );

    console.log(
        `Vision batches: ${
            batches.length
        }`
    );

    const allEvents = [];

    for (
        let i = 0;
        i < batches.length;
        i++
    ) {

        console.log(
            `Vision batch ${
                i + 1
            }/${batches.length}`
        );

        const events =
            await analyzeFrameBatch(
                batches[i]
            );

        allEvents.push(
            ...events
        );
    }

    console.log(
        `Vision discovered ${
            allEvents.length
        } raw events`
    );

    return allEvents;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    analyzeFrames,

    createFrameBatches

};