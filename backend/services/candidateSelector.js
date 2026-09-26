// ============================================================
// EVENT IMPORTANCE
// ============================================================

const IMPORTANT_EVENTS = new Set([

    'boss_fight',
    'enemy_defeated',
    'explosion',
    'finisher',
    'combo',
    'clutch',
    'near_death',
    'victory',
    'defeat',
    'new_ability',
    'objective_completed',
    'unexpected_event',
    'funny_event',
    'glitch',
    'chase',
    'vehicle_action',
    'combat'

]);


// ============================================================
// BUILD CANDIDATE FROM EVENT CLUSTER
// ============================================================

function buildCandidate(
    cluster,
    index
) {

    const eventTypes =
        cluster.events.map(
            event =>
                event.type
        );

    const uniqueEventTypes =
        [
            ...new Set(
                eventTypes
            )
        ];

    const importantCount =
        uniqueEventTypes.filter(
            type =>
                IMPORTANT_EVENTS.has(
                    type
                )
        ).length;

    const visionEvents =
        cluster.events.filter(
            event =>
                event.source ===
                'vision'
        );

    const speechEvents =
        cluster.events.filter(
            event =>
                event.source ===
                'whisper'
        );

    const audioEvents =
        cluster.events.filter(
            event =>
                event.source ===
                'audio'
        );

    // --------------------------------------------------------
    // Context padding
    // --------------------------------------------------------

    const start =
        Math.max(
            0,
            cluster.start - 3
        );

    const end =
        cluster.end + 5;

    const duration =
        end - start;

    // --------------------------------------------------------
    // Algorithmic support score
    //
    // This is NOT the highlight decision.
    // It is only metadata for Qwen.
    // --------------------------------------------------------

    let supportScore = 0;

    supportScore +=
        importantCount * 0.20;

    supportScore +=
        Math.min(
            visionEvents.length * 0.10,
            0.30
        );

    supportScore +=
        Math.min(
            speechEvents.length * 0.05,
            0.15
        );

    supportScore +=
        Math.min(
            audioEvents.length * 0.05,
            0.15
        );

    supportScore =
        Math.min(
            1,
            supportScore
        );

    return {

        id:
            index,

        start,

        end,

        duration:

            Math.min(
                duration,
                60
            ),

        algorithmicScore:
            supportScore,

        events:
            uniqueEventTypes,

        visionEvents:
            visionEvents.map(
                event => ({

                    type:
                        event.type,

                    start:
                        event.start,

                    end:
                        event.end,

                    confidence:
                        event.confidence,

                    description:
                        event.description

                })
            ),

        transcriptEvents:
            speechEvents.map(
                event => ({

                    start:
                        event.start,

                    end:
                        event.end,

                    text:
                        event.text ??
                        event.description

                })
            ),

        supportingSignals: {

            audioPeaks:
                audioEvents.length,

            sceneChanges:
                cluster.events.filter(
                    event =>
                        event.source ===
                        'scene'
                ).length

        }

    };
}


// ============================================================
// BUILD AI CANDIDATES
// ============================================================

function buildCandidatesFromTimeline(
    clusters,
    limit = 15
) {

    if (
        !Array.isArray(
            clusters
        )
    ) {

        return [];
    }

    return clusters

        .map(
            (cluster, index) =>
                buildCandidate(
                    cluster,
                    index
                )
        )

        // Keep meaningful AI discoveries.
        .filter(
            candidate =>
                candidate.events.length >
                0
        )

        // Give Qwen a reasonably sized
        // candidate pool.
        .sort(
            (a, b) =>
                b.algorithmicScore -
                a.algorithmicScore
        )

        .slice(
            0,
            limit
        )

        // IDs must be stable after sorting.
        .map(
            (candidate, index) => ({

                ...candidate,

                id:
                    index

            })
        );
}


// ============================================================
// LEGACY FALLBACK
// ============================================================

function selectTopCandidates(
    highlights,
    limit = 10
) {

    return (highlights || [])

        .filter(
            item =>
                Number(
                    item.score ??
                    0
                ) >= 0.55
        )

        .sort(
            (a, b) =>
                Number(
                    b.score ?? 0
                ) -
                Number(
                    a.score ?? 0
                )
        )

        .slice(
            0,
            limit
        );
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    buildCandidatesFromTimeline,

    selectTopCandidates

};