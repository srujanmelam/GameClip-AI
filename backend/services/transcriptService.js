const fs = require('fs');

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL ||
    'http://127.0.0.1:8000';


// ============================================================
// TRANSCRIBE AUDIO
// ============================================================

async function transcribeAudio(
    audioPath
) {

    if (!audioPath) {
        throw new Error(
            'audioPath is required'
        );
    }

    if (!fs.existsSync(audioPath)) {

        throw new Error(
            `Audio file does not exist: ${audioPath}`
        );
    }

    console.log(
        'Calling Whisper transcription service...'
    );

    const response =
        await fetch(
            `${AI_SERVICE_URL}/transcribe`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify({
                    audio_path:
                        audioPath
                })
            }
        );

    const responseText =
        await response.text();

    if (!response.ok) {

        throw new Error(
            `Transcription service returned ${
                response.status
            }: ${responseText}`
        );
    }

    const result =
        JSON.parse(
            responseText
        );

    return Array.isArray(
        result.transcript
    )
        ? result.transcript
        : [];
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    transcribeAudio

};a