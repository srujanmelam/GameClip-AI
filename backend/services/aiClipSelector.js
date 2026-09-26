const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL ||
    'http://127.0.0.1:8000';


// ============================================================
// CONFIGURATION
// ============================================================

const AI_REQUEST_TIMEOUT =
    Number(
        process.env.AI_REQUEST_TIMEOUT || 240000
    );


// ============================================================
// HELPERS
// ============================================================

function safeNumber(value, fallback = 0) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}


function normalizeCandidate(candidate, index) {

    const start =
        safeNumber(
            candidate.start,
            0
        );

    const end =
        safeNumber(
            candidate.end,
            start
        );

    return {

        id:
            safeNumber(
                candidate.id,
                index + 1
            ),

        start,

        end,

        duration:
            safeNumber(
                candidate.duration,
                Math.max(
                    0,
                    end - start
                )
            ),

        algorithmicScore:
            safeNumber(
                candidate.algorithmicScore ??
                candidate.score,
                0
            ),

        events:
            Array.isArray(
                candidate.events
            )
                ? candidate.events
                : [],

        visionEvents:
            Array.isArray(
                candidate.visionEvents
            )
                ? candidate.visionEvents
                : [],

        transcriptEvents:
            Array.isArray(
                candidate.transcriptEvents
            )
                ? candidate.transcriptEvents
                : [],

        supportingSignals:
            candidate.supportingSignals &&
            typeof candidate.supportingSignals === 'object'
                ? candidate.supportingSignals
                : {}

    };
}


// ============================================================
// FALLBACK RESULT
// ============================================================

function createFallbackResult(candidate) {

    /*
     * If Qwen fails to score a candidate, we still give it
     * an AI-style score based on the existing signals.
     *
     * This prevents one missing Qwen result from reducing
     * the final number of generated clips.
     */

    const algorithmicScore =
        Math.max(
            0,
            Math.min(
                1,
                safeNumber(
                    candidate.algorithmicScore,
                    0
                )
            )
        );

    const eventCount =
        Array.isArray(
            candidate.visionEvents
        )
            ? candidate.visionEvents.length
            : 0;

    const transcriptEventCount =
        Array.isArray(
            candidate.transcriptEvents
        )
            ? candidate.transcriptEvents.length
            : 0;

    const semanticBonus =
        Math.min(
            0.2,
            (
                eventCount +
                transcriptEventCount
            ) * 0.05
        );

    const score =
        Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    (
                        algorithmicScore +
                        semanticBonus
                    ) * 100
                )
            )
        );

    return {

        id:
            candidate.id,

        ai_score:
            score,

        category:
            'gameplay-highlight',

        reason:
            'Fallback score used because the AI ranking service did not return a score for this candidate.',

        transcript:
            '',

        fallback:
            true

    };
}


// ============================================================
// NORMALIZE AI RESULTS
// ============================================================

function normalizeAIResults(
    aiResults,
    candidates
) {

    const candidateMap =
        new Map(
            candidates.map(
                candidate => [
                    String(candidate.id),
                    candidate
                ]
            )
        );

    const resultMap =
        new Map();

    if (
        Array.isArray(
            aiResults
        )
    ) {

        for (
            const result of aiResults
        ) {

            if (
                !result ||
                result.id === undefined ||
                result.id === null
            ) {
                continue;
            }

            const id =
                String(
                    result.id
                );

            if (
                !candidateMap.has(id)
            ) {
                console.warn(
                    `Ignoring AI result for unknown candidate ID: ${id}`
                );

                continue;
            }

            const candidate =
                candidateMap.get(id);

            const aiScore =
                Math.max(
                    0,
                    Math.min(
                        100,
                        safeNumber(
                            result.ai_score ??
                            result.aiScore ??
                            result.score,
                            0
                        )
                    )
                );

            resultMap.set(
                id,
                {

                    id:
                        candidate.id,

                    ai_score:
                        aiScore,

                    category:
                        result.category ||
                        'gameplay-highlight',

                    reason:
                        result.reason ||
                        'Selected as a gameplay highlight.',

                    transcript:
                        result.transcript ||
                        '',

                    fallback:
                        false

                }
            );
        }
    }

    /*
     * VERY IMPORTANT:
     *
     * Guarantee exactly ONE result for every candidate.
     *
     * If Qwen accidentally returns only 1 or 2 results,
     * the missing candidates receive fallback scores.
     */

    const normalizedResults =
        candidates.map(
            candidate => {

                const existing =
                    resultMap.get(
                        String(candidate.id)
                    );

                if (existing) {
                    return existing;
                }

                console.warn(
                    `AI did not return candidate ${candidate.id}. Using fallback score.`
                );

                return createFallbackResult(
                    candidate
                );
            }
        );

    return normalizedResults;
}


// ============================================================
// LOG AI RESULTS
// ============================================================

function logAIResults(
    results
) {

    console.log(
        ''
    );

    console.log(
        '================================'
    );

    console.log(
        'AI CANDIDATE RESULTS'
    );

    console.log(
        '================================'
    );

    for (
        const result of results
    ) {

        console.log(
            `Candidate ${result.id} | ` +
            `AI Score: ${result.ai_score} | ` +
            `Category: ${result.category}` +
            (
                result.fallback
                    ? ' | FALLBACK'
                    : ''
            )
        );
    }

    console.log(
        '================================'
    );

    console.log(
        ''
    );
}


// ============================================================
// ANALYZE CANDIDATES
// ============================================================

async function analyzeCandidates(
    audioPath,
    candidates,
    transcript = []
) {

    console.log(
        ''
    );

    console.log(
        '================================'
    );

    console.log(
        'CALLING AI CANDIDATE RANKING SERVICE'
    );

    console.log(
        '================================'
    );

    console.log(
        'AI service URL:',
        AI_SERVICE_URL
    );

    console.log(
        'Candidate count:',
        candidates?.length || 0
    );

    console.log(
        'Transcript segments:',
        Array.isArray(transcript)
            ? transcript.length
            : 0
    );

    if (!audioPath) {

        throw new Error(
            'audioPath is required'
        );
    }

    if (
        !Array.isArray(
            candidates
        ) ||
        candidates.length === 0
    ) {

        throw new Error(
            'No candidates provided'
        );
    }

    /*
     * Normalize candidates before sending them.
     *
     * This makes sure the FastAPI service receives
     * predictable data.
     */

    const normalizedCandidates =
        candidates.map(
            normalizeCandidate
        );

    const payload = {

        audio_path:
            audioPath,

        /*
         * Whisper transcript is already available.
         *
         * We send it to the AI service so Qwen can use
         * the actual gameplay dialogue/context.
         */

        transcript:
            Array.isArray(
                transcript
            )
                ? transcript
                : [],

        /*
         * IMPORTANT:
         *
         * ALL candidates are sent in ONE request.
         *
         * Qwen should evaluate every candidate.
         */

        candidates:
            normalizedCandidates

    };

    console.log(
        'Sending ALL candidates in ONE AI request...'
    );

    console.log(
        'Candidates sent:',
        normalizedCandidates.length
    );

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {

                console.warn(
                    'AI request timeout reached. Aborting request...'
                );

                controller.abort();

            },
            AI_REQUEST_TIMEOUT
        );

    let response;

    try {

        response =
            await fetch(
                `${AI_SERVICE_URL}/analyze`,
                {

                    method:
                        'POST',

                    headers: {

                        'Content-Type':
                            'application/json'

                    },

                    body:
                        JSON.stringify(
                            payload
                        ),

                    signal:
                        controller.signal

                }
            );

    } catch (error) {

        if (
            error.name ===
            'AbortError'
        ) {

            /*
             * Do NOT immediately kill the whole pipeline.
             *
             * We return fallback results so the server can
             * still attempt to generate up to 3 clips.
             */

            console.warn(
                'AI candidate ranking timed out.'
            );

            const fallbackResults =
                normalizedCandidates.map(
                    createFallbackResult
                );

            logAIResults(
                fallbackResults
            );

            return {

                success:
                    false,

                timedOut:
                    true,

                candidates:
                    fallbackResults,

                results:
                    fallbackResults,

                error:
                    'AI candidate ranking timed out. Fallback scores were used.'

            };
        }

        console.warn(
            'Could not connect to AI service:',
            error.message
        );

        const fallbackResults =
            normalizedCandidates.map(
                createFallbackResult
            );

        logAIResults(
            fallbackResults
        );

        return {

            success:
                false,

            timedOut:
                false,

            candidates:
                fallbackResults,

            results:
                fallbackResults,

            error:
                `Could not connect to AI service: ${error.message}`

        };
    } finally {

        clearTimeout(
            timeout
        );
    }

    const responseText =
        await response.text();

    console.log(
        'AI service HTTP status:',
        response.status
    );

    /*
     * Handle HTTP errors with fallback rather than
     * destroying the complete clip-generation pipeline.
     */

    if (!response.ok) {

        console.warn(
            `AI service returned HTTP ${response.status}`
        );

        console.warn(
            responseText
        );

        const fallbackResults =
            normalizedCandidates.map(
                createFallbackResult
            );

        logAIResults(
            fallbackResults
        );

        return {

            success:
                false,

            timedOut:
                false,

            candidates:
                fallbackResults,

            results:
                fallbackResults,

            error:
                `AI service returned ${response.status}`

        };
    }

    let result;

    try {

        result =
            JSON.parse(
                responseText
            );

    } catch (error) {

        console.warn(
            'AI service returned invalid JSON.'
        );

        console.warn(
            responseText
        );

        const fallbackResults =
            normalizedCandidates.map(
                createFallbackResult
            );

        logAIResults(
            fallbackResults
        );

        return {

            success:
                false,

            timedOut:
                false,

            candidates:
                fallbackResults,

            results:
                fallbackResults,

            error:
                'AI service returned invalid JSON'

        };
    }

    /*
     * FastAPI may return the results under either:
     *
     * result.candidates
     *
     * or
     *
     * result.results
     *
     * Support both formats.
     */

    const aiResults =
        Array.isArray(
            result.candidates
        )
            ? result.candidates
            : Array.isArray(
                result.results
            )
                ? result.results
                : [];

    console.log(
        'AI results received:',
        aiResults.length
    );

    /*
     * This is the critical reliability step.
     *
     * Missing Qwen results are filled automatically.
     */

    const finalResults =
        normalizeAIResults(
            aiResults,
            normalizedCandidates
        );

    logAIResults(
        finalResults
    );

    /*
     * Verify that every candidate has exactly one result.
     */

    if (
        finalResults.length !==
        normalizedCandidates.length
    ) {

        console.warn(
            'WARNING: AI result count does not match candidate count.'
        );

        console.warn(
            'Candidates:',
            normalizedCandidates.length
        );

        console.warn(
            'Results:',
            finalResults.length
        );
    }

    return {

        success:
            true,

        timedOut:
            false,

        /*
         * Keep both properties for compatibility
         * with different server.js implementations.
         */

        candidates:
            finalResults,

        results:
            finalResults,

        /*
         * Preserve any additional metadata returned
         * by FastAPI.
         */

        transcript:
            result.transcript ||
            transcript,

        model:
            result.model ||
            null

    };
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    analyzeCandidates

};
