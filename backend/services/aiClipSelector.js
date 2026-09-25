const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Send candidate clips to the Python AI service.
 *
 * Python service:
 * POST /analyze
 *
 * Expected response:
 * {
 *   transcript: [...],
 *   results: [...]
 * }
 */
async function analyzeCandidates(audioPath, candidates) {
    console.log('================================');
    console.log('Calling AI service');
    console.log('================================');

    console.log('AI service URL:', AI_SERVICE_URL);
    console.log('Audio path:', audioPath);
    console.log('Candidate count:', candidates?.length || 0);

    if (!audioPath) {
        throw new Error('audioPath is required');
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('No candidates provided for AI analysis');
    }

    const payload = {
        audio_path: audioPath,
        candidates: candidates.map(candidate => ({
            id: Number(candidate.id),

            start: Number(candidate.start),
            end: Number(candidate.end),

            duration: Number(
                candidate.duration ??
                (Number(candidate.end) - Number(candidate.start))
            ),

            algorithmicScore: Number(
                candidate.algorithmicScore ?? 0
            ),

            visual: {
                averageActivity: Number(
                    candidate.visual?.averageActivity ?? 0
                ),

                peakActivity: Number(
                    candidate.visual?.peakActivity ?? 0
                ),

                peakTimestamp: Number(
                    candidate.visual?.peakTimestamp ??
                    candidate.start ??
                    0
                ),

                samples: Array.isArray(
                    candidate.visual?.samples
                )
                    ? candidate.visual.samples.map(sample => ({
                        timestamp: Number(
                            sample.timestamp ?? 0
                        ),
                        score: Number(
                            sample.score ?? 0
                        )
                    }))
                    : []
            },

            audio: {
                averageIntensity: Number(
                    candidate.audio?.averageIntensity ?? 0
                ),

                peakIntensity: Number(
                    candidate.audio?.peakIntensity ?? 0
                ),

                peakTimestamp: Number(
                    candidate.audio?.peakTimestamp ??
                    candidate.start ??
                    0
                ),

                samples: Array.isArray(
                    candidate.audio?.samples
                )
                    ? candidate.audio.samples.map(sample => ({
                        timestamp: Number(
                            sample.timestamp ?? 0
                        ),
                        score: Number(
                            sample.score ?? 0
                        )
                    }))
                    : []
            },

            scenes: {
                count: Number(
                    candidate.scenes?.count ?? 0
                ),

                timestamps: Array.isArray(
                    candidate.scenes?.timestamps
                )
                    ? candidate.scenes.timestamps.map(
                        timestamp => Number(timestamp)
                    )
                    : []
            }
        }))
    };

    console.log(
        'Sending AI payload:',
        JSON.stringify(payload, null, 2)
    );

    let response;

    try {
        response = await fetch(
            `${AI_SERVICE_URL}/analyze`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(payload)
            }
        );
    } catch (error) {
        console.error(
            'Could not connect to AI service:',
            error
        );

        throw new Error(
            `Could not connect to AI service at ${AI_SERVICE_URL}: ${error.message}`
        );
    }

    /*
     * IMPORTANT:
     * Always read the response body when FastAPI returns an error.
     * This exposes the real Python/FastAPI error instead of just
     * "Internal Server Error".
     */
    const responseText = await response.text();

    console.log(
        'AI service HTTP status:',
        response.status
    );

    console.log(
        'AI service raw response:',
        responseText
    );

    if (!response.ok) {
        console.error(
            'AI service HTTP error:',
            response.status,
            responseText
        );

        throw new Error(
            `AI service returned ${response.status}: ${responseText}`
        );
    }

    let result;

    try {
        result = JSON.parse(responseText);
    } catch (error) {
        console.error(
            'Failed to parse AI service response:',
            error
        );

        throw new Error(
            `AI service returned invalid JSON: ${responseText}`
        );
    }

    console.log(
        'AI service parsed response:',
        JSON.stringify(result, null, 2)
    );

    return result;
}

module.exports = {
    analyzeCandidates
};