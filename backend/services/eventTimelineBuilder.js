// ============================================================
// NORMALIZE EVENT
// ============================================================

function normalizeEvent(
    event
) {

    if (!event) {
        return null;
    }

    const start =
        Number(
            event.start ?? 0
        );

    const end =
        Number(
            event.end ?? start
        );

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end)
    ) {

        return null;
    }

    return {

        type:
            event.type ??
            event.event ??
            'unknown',

        start,

        end:
            Math.max(
                start,
                end
            ),

        confidence:
            Number(
                event.confidence ??
                event.score ??
                0
            ),

        description:
            event.description ??
            '',

        source:
            event.source ??
            'unknown'

    };
}


// ============================================================
// CONVERT VISION EVENTS
// ============================================================

function normalizeVisionEvents(
    visionEvents
) {

    if (
        !Array.isArray(
            visionEvents
        )
    ) {

        return [];
    }

    return visionEvents
        .map(event => {

            return normalizeEvent({

                type:
                    event.event,

                start:
                    event.start,

                end:
                    event.end,

                confidence:
                    event.confidence,

                description:
                    event.description,

                source:
                    'vision'

            });

        })
        .filter(Boolean);
}


// ============================================================
// CONVERT WHISPER EVENTS
// ============================================================

function normalizeTranscript(
    transcript
) {

    if (
        !Array.isArray(
            transcript
        )
    ) {

        return [];
    }

    return transcript
        .map(segment => {

            const text =
                String(
                    segment.text ??
                    ''
                ).trim();

            if (!text) {
                return null;
            }

            return {

                type:
                    'speech',

                start:
                    Number(
                        segment.start
                    ),

                end:
                    Number(
                        segment.end
                    ),

                confidence:
                    1,

                description:
                    text,

                text,

                source:
                    'whisper'

            };

        })
        .filter(Boolean);
}


// ============================================================
// AUDIO EVENTS
// ============================================================

function normalizeAudioEvents(
    audioScores
) {

    if (
        !Array.isArray(
            audioScores
        )
    ) {

        return [];
    }

    return audioScores
        .map(sample => {

            const timestamp =
                Number(
                    sample.timestamp
                );

            const score =
                Number(
                    sample.audioScore ??
                    sample.score ??
                    0
                );

            if (
                !Number.isFinite(
                    timestamp
                )
            ) {

                return null;
            }

            // Only keep meaningful peaks
            if (score < 0.65) {
                return null;
            }

            return {

                type:
                    'audio_peak',

                start:
                    Math.max(
                        0,
                        timestamp - 1
                    ),

                end:
                    timestamp + 1,

                confidence:
                    score,

                description:
                    'Strong audio activity',

                source:
                    'audio'

            };

        })
        .filter(Boolean);
}


// ============================================================
// SCENE EVENTS
// ============================================================

function normalizeSceneEvents(
    sceneTimestamps
) {

    if (
        !Array.isArray(
            sceneTimestamps
        )
    ) {

        return [];
    }

    return sceneTimestamps
        .map(scene => {

            let timestamp;

            if (
                typeof scene ===
                'number'
            ) {

                timestamp =
                    scene;

            } else {

                timestamp =
                    Number(
                        scene?.timestamp ??
                        scene?.start ??
                        scene?.time
                    );
            }

            if (
                !Number.isFinite(
                    timestamp
                )
            ) {

                return null;
            }

            return {

                type:
                    'scene_change',

                start:
                    timestamp,

                end:
                    timestamp + 1,

                confidence:
                    1,

                description:
                    'Scene change',

                source:
                    'scene'

            };

        })
        .filter(Boolean);
}


// ============================================================
// BUILD TIMELINE
// ============================================================

function buildEventTimeline({

    visionEvents = [],

    transcript = [],

    audioScores = [],

    sceneTimestamps = []

}) {

    const timeline = [

        ...normalizeVisionEvents(
            visionEvents
        ),

        ...normalizeTranscript(
            transcript
        ),

        ...normalizeAudioEvents(
            audioScores
        ),

        ...normalizeSceneEvents(
            sceneTimestamps
        )

    ];

    return timeline
        .sort(
            (a, b) =>
                a.start -
                b.start
        );
}


// ============================================================
// CLUSTER EVENTS
// ============================================================

function clusterEvents(
    timeline,
    gap = 4
) {

    if (
        !Array.isArray(
            timeline
        ) ||
        timeline.length === 0
    ) {

        return [];
    }

    const clusters = [];

    let current = null;

    for (
        const event of timeline
    ) {

        if (!current) {

            current = {

                start:
                    event.start,

                end:
                    event.end,

                events:
                    [event]

            };

            continue;
        }

        const distance =
            event.start -
            current.end;

        if (
            distance <= gap
        ) {

            current.end =
                Math.max(
                    current.end,
                    event.end
                );

            current.events.push(
                event
            );

        } else {

            clusters.push(
                current
            );

            current = {

                start:
                    event.start,

                end:
                    event.end,

                events:
                    [event]

            };
        }
    }

    if (current) {

        clusters.push(
            current
        );
    }

    return clusters;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    buildEventTimeline,

    clusterEvents

};