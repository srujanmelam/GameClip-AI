import os
import json
import time
import requests

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from faster_whisper import WhisperModel


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_SIZE = os.getenv(
    "WHISPER_MODEL",
    "tiny"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen3:4b"
)

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://127.0.0.1:11434/api/generate"
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="GameClip AI Service"
)


# ============================================================
# LOAD WHISPER
# ============================================================

print(
    f"Loading Whisper model: {MODEL_SIZE}"
)

whisper_model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8"
)

print("Whisper model loaded")


# ============================================================
# PYDANTIC MODELS
# ============================================================

class Candidate(BaseModel):

    id: int

    start: float

    end: float

    duration: float

    algorithmicScore: float = 0.0

    visual: dict = {}

    audio: dict = {}

    scenes: dict = {}


class AnalyzeRequest(BaseModel):

    audio_path: str

    candidates: list[Candidate]


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "whisper_model": MODEL_SIZE,
        "ollama_model": OLLAMA_MODEL
    }


# ============================================================
# TRANSCRIPTION
# ============================================================

def transcribe_audio(audio_path):

    print(
        "=========================================="
    )

    print(
        "Transcribing audio..."
    )

    start_time = time.time()

    segments, info = whisper_model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True
    )

    transcript = []

    for segment in segments:

        transcript.append({

            "start": float(segment.start),

            "end": float(segment.end),

            "text": segment.text.strip()

        })

    elapsed = (
        time.time() - start_time
    )

    print(
        f"Transcription complete: "
        f"{len(transcript)} segments "
        f"in {elapsed:.2f}s"
    )

    return transcript


# ============================================================
# GET TRANSCRIPT FOR CANDIDATE
# ============================================================

def get_candidate_transcript(
    candidate,
    transcript
):

    candidate_start = float(
        candidate["start"]
    )

    candidate_end = float(
        candidate["end"]
    )

    relevant_segments = []

    for segment in transcript:

        segment_start = float(
            segment["start"]
        )

        segment_end = float(
            segment["end"]
        )

        # Check overlap
        if (
            segment_end >= candidate_start
            and
            segment_start <= candidate_end
        ):

            relevant_segments.append(
                segment
            )

    return relevant_segments


# ============================================================
# BUILD CANDIDATE CONTEXT
# ============================================================

def build_candidate_context(
    candidate,
    transcript
):

    candidate_transcript = (
        get_candidate_transcript(
            candidate,
            transcript
        )
    )

    transcript_text = " ".join(
        segment["text"]
        for segment in candidate_transcript
    )

    visual = (
        candidate.get("visual")
        or {}
    )

    audio = (
        candidate.get("audio")
        or {}
    )

    scenes = (
        candidate.get("scenes")
        or {}
    )

    context = {

        "id":
            int(candidate["id"]),

        "start":
            float(candidate["start"]),

        "end":
            float(candidate["end"]),

        "duration":
            float(candidate["duration"]),

        "algorithmicScore":
            float(
                candidate.get(
                    "algorithmicScore",
                    0
                )
            ),

        "visual": {

            "averageActivity":
                float(
                    visual.get(
                        "averageActivity",
                        0
                    )
                ),

            "peakActivity":
                float(
                    visual.get(
                        "peakActivity",
                        0
                    )
                ),

            "peakTimestamp":
                float(
                    visual.get(
                        "peakTimestamp",
                        candidate["start"]
                    )
                )

        },

        "audio": {

            "averageIntensity":
                float(
                    audio.get(
                        "averageIntensity",
                        0
                    )
                ),

            "peakIntensity":
                float(
                    audio.get(
                        "peakIntensity",
                        0
                    )
                ),

            "peakTimestamp":
                float(
                    audio.get(
                        "peakTimestamp",
                        candidate["start"]
                    )
                )

        },

        "scenes": {

            "count":
                int(
                    scenes.get(
                        "count",
                        0
                    )
                )

        },

        "transcript":
            transcript_text

    }

    return context


# ============================================================
# ASK QWEN
# ============================================================

def ask_qwen(candidates):

    print(
        "=========================================="
    )

    print(
        f"Sending {len(candidates)} candidates "
        "to Qwen in ONE request..."
    )

    # --------------------------------------------------------
    # Convert candidates to compact JSON
    # --------------------------------------------------------

    candidate_json = json.dumps(
        candidates,
        indent=2
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # We ask Qwen ONLY to rank candidate IDs.
    # It does NOT generate timestamps.
    # --------------------------------------------------------

    prompt = f"""
You are an AI gaming highlight selector.

You are given candidate gameplay moments extracted from a gaming video.

Your job is to rank the candidates based on how interesting they would be as a YouTube Short.

Consider:

1. Action intensity
2. Visual activity
3. Audio intensity
4. Scene changes
5. Spoken dialogue/transcript
6. Whether the moment appears exciting, surprising, emotional, funny, dramatic, or memorable
7. Potential viewer retention

IMPORTANT RULES:

- Every candidate already has a valid start and end timestamp.
- DO NOT create timestamps.
- DO NOT modify start or end.
- DO NOT create new candidate IDs.
- Return exactly one result for every candidate.
- Use the candidate ID exactly as provided.
- ai_score must be an integer from 0 to 100.
- Higher score means stronger YouTube Short potential.
- Return ONLY valid JSON.
- Do not use markdown.
- Do not add explanations outside the JSON.

Required output format:

{{
  "results": [
    {{
      "id": 0,
      "ai_score": 85,
      "category": "action",
      "reason": "Short explanation"
    }}
  ]
}}

Candidates:

{candidate_json}
"""

    payload = {

        "model": OLLAMA_MODEL,

        "prompt": prompt,

        "stream": False,

        "think": False,

        "format": "json",

        "options": {

            "temperature": 0.1,

            "num_predict": 500

        }

    }

    start_time = time.time()

    try:

        response = requests.post(
            OLLAMA_URL,
            json=payload,
            timeout=180
        )

    except Exception as error:

        print(
            "Ollama connection error:",
            error
        )

        raise

    elapsed = (
        time.time() - start_time
    )

    print(
        f"Qwen completed ALL candidates "
        f"in {elapsed:.2f}s"
    )

    if response.status_code != 200:

        print(
            "Ollama HTTP error:",
            response.status_code
        )

        print(
            response.text
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Ollama returned "
                f"{response.status_code}"
            )
        )

    try:

        ollama_response = (
            response.json()
        )

    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Invalid Ollama response"
        )

    qwen_text = (
        ollama_response.get(
            "response",
            ""
        )
    )

    print(
        "Qwen response received:"
    )

    print(
        qwen_text
    )

    # --------------------------------------------------------
    # Parse Qwen JSON
    # --------------------------------------------------------

    try:

        parsed = json.loads(
            qwen_text
        )

    except Exception as error:

        print(
            "Could not parse Qwen JSON:",
            error
        )

        print(
            "Raw response:",
            qwen_text
        )

        return {
            "results": []
        }

    print(
        "Parsed Qwen response:"
    )

    print(
        json.dumps(
            parsed,
            indent=2
        )
    )

    return parsed


# ============================================================
# VALIDATE QWEN RESULTS
# ============================================================

def validate_ai_results(
    qwen_response,
    candidates
):

    print(
        "=========================================="
    )

    print(
        "Validating AI results..."
    )

    if not isinstance(
        qwen_response,
        dict
    ):

        print(
            "Qwen response is not an object."
        )

        return []

    raw_results = (
        qwen_response.get(
            "results",
            []
        )
    )

    if not isinstance(
        raw_results,
        list
    ):

        print(
            "Qwen results is not a list."
        )

        return []

    candidate_map = {

        int(candidate["id"]):
            candidate

        for candidate in candidates

    }

    validated = []

    seen_ids = set()

    for item in raw_results:

        if not isinstance(
            item,
            dict
        ):

            continue

        # ----------------------------------------------------
        # ID
        # ----------------------------------------------------

        try:

            candidate_id = int(
                item.get("id")
            )

        except Exception:

            continue

        # ----------------------------------------------------
        # Candidate must exist
        # ----------------------------------------------------

        if candidate_id not in candidate_map:

            continue

        # Prevent duplicate IDs
        if candidate_id in seen_ids:

            continue

        # ----------------------------------------------------
        # AI score
        # ----------------------------------------------------

        try:

            ai_score = float(
                item.get(
                    "ai_score",
                    0
                )
            )

        except Exception:

            ai_score = 0

        ai_score = max(
            0,
            min(
                100,
                ai_score
            )
        )

        # ----------------------------------------------------
        # Category
        # ----------------------------------------------------

        category = str(
            item.get(
                "category",
                "highlight"
            )
        ).strip()

        if not category:

            category = "highlight"

        # ----------------------------------------------------
        # Reason
        # ----------------------------------------------------

        reason = str(
            item.get(
                "reason",
                ""
            )
        ).strip()

        if not reason:

            reason = (
                "Strong gameplay highlight."
            )

        validated.append({

            "id":
                candidate_id,

            "ai_score":
                ai_score,

            "category":
                category,

            "reason":
                reason

        })

        seen_ids.add(
            candidate_id
        )

    # --------------------------------------------------------
    # FALLBACK
    # --------------------------------------------------------
    #
    # If Qwen fails to return valid results,
    # preserve the algorithmic candidates rather
    # than killing the entire pipeline.
    #
    # --------------------------------------------------------

    if len(validated) == 0:

        print(
            "Qwen returned no valid results."
        )

        print(
            "Using algorithmic scores as fallback."
        )

        for candidate in candidates:

            candidate_id = int(
                candidate["id"]
            )

            algorithmic_score = float(
                candidate.get(
                    "algorithmicScore",
                    0
                )
            )

            fallback_score = (
                algorithmic_score * 100
            )

            validated.append({

                "id":
                    candidate_id,

                "ai_score":
                    round(
                        fallback_score,
                        2
                    ),

                "category":
                    "algorithmic-highlight",

                "reason":
                    "AI ranking unavailable; algorithmic highlight score used."

            })

    print(
        f"Validated {len(validated)} "
        f"AI results out of "
        f"{len(candidates)} candidates"
    )

    return validated


# ============================================================
# ANALYZE ALL CANDIDATES
# ============================================================

def analyze_all_candidates(
    audio_path,
    candidates
):

    # --------------------------------------------------------
    # Transcribe complete audio
    # --------------------------------------------------------

    transcript = transcribe_audio(
        audio_path
    )

    # --------------------------------------------------------
    # Build context for every candidate
    # --------------------------------------------------------

    prepared_candidates = []

    for candidate in candidates:

        candidate_dict = candidate

        context = build_candidate_context(
            candidate_dict,
            transcript
        )

        prepared_candidates.append(
            context
        )

    print(
        f"Prepared "
        f"{len(prepared_candidates)} "
        f"candidates for Qwen"
    )

    # --------------------------------------------------------
    # ONE QWEN REQUEST
    # --------------------------------------------------------

    qwen_response = ask_qwen(
        prepared_candidates
    )

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    validated_results = (
        validate_ai_results(
            qwen_response,
            prepared_candidates
        )
    )

    print(
        "Validated AI results:"
    )

    print(
        json.dumps(
            validated_results,
            indent=2
        )
    )

    return (
        transcript,
        validated_results
    )


# ============================================================
# ANALYZE ENDPOINT
# ============================================================

@app.post("/analyze")
def analyze(request: AnalyzeRequest):

    print(
        "=========================================="
    )

    print(
        "AI ANALYSIS REQUEST RECEIVED"
    )

    print(
        "=========================================="
    )

    candidates = [

        candidate.model_dump()

        for candidate in request.candidates

    ]

    print(
        f"Received {len(candidates)} candidates"
    )

    for candidate in candidates:

        print(
            f"Candidate {candidate['id']}: "
            f"{candidate['start']} - "
            f"{candidate['end']}"
        )

    # --------------------------------------------------------
    # Validate audio path
    # --------------------------------------------------------

    if not request.audio_path:

        raise HTTPException(
            status_code=400,
            detail="audio_path is required"
        )

    if not os.path.exists(
        request.audio_path
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Audio file does not exist: "
                f"{request.audio_path}"
            )
        )

    # --------------------------------------------------------
    # Validate candidates
    # --------------------------------------------------------

    if len(candidates) == 0:

        raise HTTPException(
            status_code=400,
            detail="No candidates provided"
        )

    # --------------------------------------------------------
    # Analyze
    # --------------------------------------------------------

    try:

        transcript, results = (
            analyze_all_candidates(
                request.audio_path,
                candidates
            )
        )

    except Exception as error:

        print(
            "AI analysis failed:"
        )

        print(
            repr(error)
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "transcript":
            transcript,

        "results":
            results

    }