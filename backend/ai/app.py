import os
import json
import time
import base64
import requests

from typing import List

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form
)

from pydantic import BaseModel, Field

from faster_whisper import WhisperModel


# ============================================================
# CONFIGURATION
# ============================================================

# ------------------------------------------------------------
# Whisper
# ------------------------------------------------------------

MODEL_SIZE = os.getenv(
    "WHISPER_MODEL",
    "tiny"
)


# ------------------------------------------------------------
# Qwen text model
#
# Used AFTER candidate discovery.
# It ranks the candidates discovered by the pipeline.
# ------------------------------------------------------------

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen3:4b"
)


# ------------------------------------------------------------
# Qwen vision model
#
# Used BEFORE candidate generation.
# It discovers gameplay events directly from frames.
#
# 2B is intentionally selected for an M1 Mac with 8 GB RAM.
# ------------------------------------------------------------

VISION_MODEL = os.getenv(
    "VISION_MODEL",
    "qwen3-vl:2b"
)


# ------------------------------------------------------------
# Ollama endpoints
# ------------------------------------------------------------

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://127.0.0.1:11434/api/generate"
)

OLLAMA_CHAT_URL = os.getenv(
    "OLLAMA_CHAT_URL",
    "http://127.0.0.1:11434/api/chat"
)


# ------------------------------------------------------------
# Timeouts
# ------------------------------------------------------------

TEXT_MODEL_TIMEOUT = int(
    os.getenv(
        "TEXT_MODEL_TIMEOUT",
        "180"
    )
)

VISION_MODEL_TIMEOUT = int(
    os.getenv(
        "VISION_MODEL_TIMEOUT",
        "180"
    )
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="GameClip AI Service",
    version="2.0.0"
)


# ============================================================
# LOAD WHISPER
# ============================================================

print(
    "=========================================="
)

print(
    f"Loading Whisper model: {MODEL_SIZE}"
)

whisper_model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8"
)

print(
    "Whisper model loaded"
)

print(
    "=========================================="
)


# ============================================================
# PYDANTIC MODELS
# ============================================================

class Candidate(BaseModel):

    id: int

    start: float

    end: float

    duration: float

    algorithmicScore: float = 0.0

    visual: dict = Field(
        default_factory=dict
    )

    audio: dict = Field(
        default_factory=dict
    )

    scenes: dict = Field(
        default_factory=dict
    )

    # --------------------------------------------------------
    # New AI-discovered event information
    # --------------------------------------------------------

    events: list = Field(
        default_factory=list
    )

    transcript: str = ""


class AnalyzeRequest(BaseModel):

    audio_path: str

    candidates: List[Candidate]


class TranscribeRequest(BaseModel):

    audio_path: str


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {

        "status":
            "ok",

        "whisper_model":
            MODEL_SIZE,

        "ollama_model":
            OLLAMA_MODEL,

        "vision_model":
            VISION_MODEL

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

        text = (
            segment.text
            .strip()
        )

        # Ignore completely empty segments

        if not text:

            continue

        transcript.append({

            "start":
                float(
                    segment.start
                ),

            "end":
                float(
                    segment.end
                ),

            "text":
                text

        })

    elapsed = (
        time.time()
        -
        start_time
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

        # ----------------------------------------------------
        # Check timestamp overlap
        # ----------------------------------------------------

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

        for segment
        in candidate_transcript

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

    events = (
        candidate.get("events")
        or []
    )

    # --------------------------------------------------------
    # Keep event data compact
    # --------------------------------------------------------

    compact_events = []

    for event in events:

        if not isinstance(
            event,
            dict
        ):

            continue

        compact_events.append({

            "event":
                event.get(
                    "event",
                    "unknown"
                ),

            "start":
                float(
                    event.get(
                        "start",
                        candidate["start"]
                    )
                ),

            "end":
                float(
                    event.get(
                        "end",
                        candidate["end"]
                    )
                ),

            "confidence":
                float(
                    event.get(
                        "confidence",
                        0
                    )
                ),

            "description":
                str(
                    event.get(
                        "description",
                        ""
                    )
                )

        })

    # --------------------------------------------------------
    # Context sent to Qwen
    # --------------------------------------------------------

    context = {

        "id":
            int(
                candidate["id"]
            ),

        "start":
            float(
                candidate["start"]
            ),

        "end":
            float(
                candidate["end"]
            ),

        "duration":
            float(
                candidate["duration"]
            ),

        "algorithmicScore":
            float(
                candidate.get(
                    "algorithmicScore",
                    0
                )
            ),

        # ----------------------------------------------------
        # Existing visual analysis
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Existing audio analysis
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Existing scene analysis
        # ----------------------------------------------------

        "scenes": {

            "count":
                int(
                    scenes.get(
                        "count",
                        0
                    )
                )

        },

        # ----------------------------------------------------
        # NEW:
        # AI-discovered semantic events
        # ----------------------------------------------------

        "events":
            compact_events,

        # ----------------------------------------------------
        # Whisper transcript
        # ----------------------------------------------------

        "transcript":
            transcript_text

    }

    return context


# ============================================================
# ASK QWEN TEXT MODEL
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
    # Compact JSON
    # --------------------------------------------------------

    candidate_json = json.dumps(

        candidates,

        indent=2

    )

    # --------------------------------------------------------
    # Qwen ranking prompt
    # --------------------------------------------------------

    prompt = f"""
You are the final AI gaming highlight selector.

You are given gameplay candidates that were
already discovered by an AI event-detection
pipeline.

Your job is to rank how suitable each candidate
would be as a YouTube Short.

The candidates contain:

- AI-discovered gameplay events
- Visual activity
- Audio intensity
- Scene changes
- Player speech
- Transcript
- Existing algorithmic signals

Evaluate the ACTUAL semantic meaning of the
candidate, not just numerical activity.

Consider:

1. Combat intensity
2. Boss fights
3. Enemy defeats
4. Multiple enemies
5. Explosions
6. Finishers
7. Combos
8. Clutch moments
9. Near death situations
10. Victories
11. Defeats
12. Important objectives
13. Surprising moments
14. Funny moments
15. Unexpected events
16. Player reactions
17. Emotional or dramatic moments
18. Memorable gameplay
19. Viewer retention potential

IMPORTANT RULES:

- Every candidate already has a valid timestamp.
- DO NOT create timestamps.
- DO NOT modify timestamps.
- DO NOT create new candidate IDs.
- Use the candidate ID exactly as provided.
- Return exactly one result for every candidate.
- ai_score must be between 0 and 100.
- Higher ai_score means stronger highlight potential.
- Prefer semantically meaningful gameplay over
  simple camera movement.
- Do not automatically give a high score to a
  candidate just because visual activity is high.
- Transcript can support a highlight but should
  not override obvious visual evidence.
- Return ONLY valid JSON.
- Do not use markdown.
- Do not add explanations outside the JSON.

Category should be one of:

action
boss_fight
combat
clutch
victory
defeat
finisher
explosion
funny
surprise
story
objective
reaction
glitch
chase
vehicle
exploration
other

Required output:

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

        "model":
            OLLAMA_MODEL,

        "prompt":
            prompt,

        "stream":
            False,

        "think":
            False,

        "format":
            "json",

        "options": {

            "temperature":
                0.1,

            "num_predict":
                700

        }

    }

    start_time = time.time()

    try:

        response = requests.post(

            OLLAMA_URL,

            json=payload,

            timeout=TEXT_MODEL_TIMEOUT

        )

    except requests.exceptions.Timeout:

        print(
            "Qwen text model timed out."
        )

        return {
            "results": []
        }

    except Exception as error:

        print(
            "Ollama connection error:",
            repr(error)
        )

        return {
            "results": []
        }

    elapsed = (
        time.time()
        -
        start_time
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

        return {
            "results": []
        }

    try:

        ollama_response = (
            response.json()
        )

    except Exception as error:

        print(
            "Invalid Ollama response:",
            repr(error)
        )

        return {
            "results": []
        }

    qwen_text = (
        ollama_response.get(
            "response",
            ""
        )
    )

    print(
        "Qwen response:"
    )

    print(
        qwen_text
    )

    if not qwen_text:

        return {
            "results": []
        }

    try:

        parsed = json.loads(
            qwen_text
        )

    except Exception as error:

        print(
            "Could not parse Qwen JSON:",
            repr(error)
        )

        return {
            "results": []
        }

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
        # Candidate ID
        # ----------------------------------------------------

        try:

            candidate_id = int(
                item.get("id")
            )

        except Exception:

            continue

        if candidate_id not in candidate_map:

            continue

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
                "other"
            )
        ).strip().lower()

        if not category:

            category = "other"

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
                "AI-detected gameplay moment."
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
    # STEP 1:
    # Full audio transcription
    # --------------------------------------------------------

    transcript = transcribe_audio(
        audio_path
    )

    # --------------------------------------------------------
    # STEP 2:
    # Build candidate contexts
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
    # STEP 3:
    # ONE QWEN REQUEST
    # --------------------------------------------------------

    qwen_response = ask_qwen(
        prepared_candidates
    )

    # --------------------------------------------------------
    # STEP 4:
    # Validate results
    # --------------------------------------------------------

    validated_results = (
        validate_ai_results(

            qwen_response,

            prepared_candidates

        )
    )

    print(
        "Final AI ranking:"
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
# TRANSCRIBE ENDPOINT
# ============================================================

@app.post("/transcribe")
def transcribe(
    request: TranscribeRequest
):

    print(
        "=========================================="
    )

    print(
        "TRANSCRIPTION REQUEST"
    )

    print(
        "=========================================="
    )

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

    try:

        transcript = transcribe_audio(
            request.audio_path
        )

        return {

            "transcript":
                transcript

        }

    except Exception as error:

        print(
            "Transcription failed:",
            repr(error)
        )

        raise HTTPException(

            status_code=500,

            detail=str(error)

        )


# ============================================================
# ANALYZE CANDIDATES ENDPOINT
# ============================================================

@app.post("/analyze")
def analyze(
    request: AnalyzeRequest
):

    print(
        "=========================================="
    )

    print(
        "AI CANDIDATE RANKING REQUEST"
    )

    print(
        "=========================================="
    )

    candidates = [

        candidate.model_dump()

        for candidate
        in request.candidates

    ]

    print(
        f"Received {len(candidates)} candidates"
    )

    # --------------------------------------------------------
    # Validate audio
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
            "AI analysis failed:",
            repr(error)
        )

        raise HTTPException(

            status_code=500,

            detail=str(error)

        )

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {

        "transcript":
            transcript,

        "results":
            results

    }


# ============================================================
# VISION AI HELPERS
# ============================================================

def encode_image(
    image_bytes
):

    """
    Convert image bytes to base64.

    Ollama vision models accept images
    as base64 encoded strings.
    """

    return base64.b64encode(
        image_bytes
    ).decode("utf-8")


def normalize_frame_times(
    frame_count,
    frame_times_json,
    start_time,
    end_time
):

    """
    Determine the timestamp represented by
    every uploaded frame.

    Preferred:

        frame_times = [120, 121, 122, 123]

    If frame_times are missing, timestamps
    are evenly distributed between start_time
    and end_time.
    """

    # --------------------------------------------------------
    # First choice:
    # Explicit timestamps supplied by Node
    # --------------------------------------------------------

    if frame_times_json:

        try:

            parsed_times = json.loads(
                frame_times_json
            )

            if (
                isinstance(
                    parsed_times,
                    list
                )
                and
                len(parsed_times)
                == frame_count
            ):

                return [

                    float(value)

                    for value
                    in parsed_times

                ]

        except Exception as error:

            print(
                "Could not parse frame_times:",
                repr(error)
            )

    # --------------------------------------------------------
    # Fallback:
    # evenly distribute timestamps
    # --------------------------------------------------------

    start = float(
        start_time or 0
    )

    end = float(
        end_time or start
    )

    if frame_count <= 1:

        return [start]

    interval = (
        end - start
    ) / (
        frame_count - 1
    )

    return [

        start + (
            interval * index
        )

        for index
        in range(frame_count)

    ]


# ============================================================
# VISION AI
# ============================================================

def analyze_frames_with_vision(
    image_data,
    frame_times
):

    """
    Send sampled gameplay frames to Qwen3-VL.

    PURPOSE:

        Discover semantic gameplay events.

    NOT responsible for:

        - final clip selection
        - clip rendering
        - timestamp invention
        - YouTube ranking

    The model receives frame timestamps supplied
    by the application and returns frame indexes.
    """

    print(
        "=========================================="
    )

    print(
        f"Vision AI analyzing "
        f"{len(image_data)} frames..."
    )

    if len(image_data) == 0:

        return {
            "events": []
        }

    # --------------------------------------------------------
    # Encode images
    # --------------------------------------------------------

    images = []

    for item in image_data:

        try:

            encoded = encode_image(
                item["bytes"]
            )

            images.append(
                encoded
            )

        except Exception as error:

            print(
                "Could not encode image:",
                repr(error)
            )

    if len(images) == 0:

        return {
            "events": []
        }

    # --------------------------------------------------------
    # Frame metadata
    # --------------------------------------------------------

    frame_information = []

    for index, timestamp in enumerate(
        frame_times
    ):

        frame_information.append({

            "frame_index":
                index,

            "timestamp":
                round(
                    float(timestamp),
                    3
                )

        })

    frame_information_json = json.dumps(

        frame_information,

        indent=2

    )

    # --------------------------------------------------------
    # Vision prompt
    # --------------------------------------------------------

    prompt = f"""
You are the visual event detector for an
AI gaming highlight generator.

You are looking at sampled frames from gameplay.

Your task is to DISCOVER meaningful gameplay
events visible in these frames.

You are NOT the final YouTube Short selector.

Do NOT rank the entire video.

Do NOT invent timestamps.

Do NOT invent events that are not visually
supported.

Possible events include:

combat
boss_fight
enemy_defeated
multiple_enemies
explosion
finisher
combo
clutch
near_death
victory
defeat
new_ability
objective_completed
important_story
cutscene
unexpected_event
funny_event
glitch
chase
vehicle_action
exploration
normal_gameplay
menu
loading

IMPORTANT RULES:

1. Only report events supported by the frames.
2. Ignore normal gameplay whenever possible.
3. Focus on potentially meaningful gameplay moments.
4. Multiple consecutive frames may belong to one event.
5. Group related frames into one event.
6. Use ONLY the supplied frame indexes.
7. start_frame must be a valid supplied frame index.
8. end_frame must be a valid supplied frame index.
9. Do not create timestamps.
10. Do not create frame indexes outside the supplied range.
11. confidence must be between 0 and 1.
12. Return ONLY valid JSON.
13. Do not use markdown.
14. Do not add explanations outside JSON.

FRAME TIMESTAMPS:

{frame_information_json}

Return EXACTLY:

{{
  "events": [
    {{
      "event": "boss_fight",
      "start_frame": 3,
      "end_frame": 6,
      "confidence": 0.92,
      "description": "Player is fighting a large boss."
    }}
  ]
}}

If there are no meaningful events:

{{
  "events": []
}}
"""

    # --------------------------------------------------------
    # Ollama vision request
    # --------------------------------------------------------

    payload = {

        "model":
            VISION_MODEL,

        "messages": [

            {

                "role":
                    "user",

                "content":
                    prompt,

                "images":
                    images

            }

        ],

        "stream":
            False,

        "format":
            "json",

        "options": {

            "temperature":
                0.1,

            "num_predict":
                700

        }

    }

    start_time = time.time()

    try:

        response = requests.post(

            OLLAMA_CHAT_URL,

            json=payload,

            timeout=VISION_MODEL_TIMEOUT

        )

    except requests.exceptions.Timeout:

        print(
            "Vision model request timed out."
        )

        return {
            "events": []
        }

    except Exception as error:

        print(
            "Vision model connection error:",
            repr(error)
        )

        return {
            "events": []
        }

    elapsed = (
        time.time()
        -
        start_time
    )

    print(
        f"Vision AI completed in "
        f"{elapsed:.2f}s"
    )

    # --------------------------------------------------------
    # HTTP validation
    # --------------------------------------------------------

    if response.status_code != 200:

        print(
            "Vision Ollama HTTP error:",
            response.status_code
        )

        print(
            response.text
        )

        return {
            "events": []
        }

    # --------------------------------------------------------
    # Parse Ollama response
    # --------------------------------------------------------

    try:

        ollama_response = (
            response.json()
        )

    except Exception as error:

        print(
            "Could not parse Ollama response:",
            repr(error)
        )

        return {
            "events": []
        }

    message = (
        ollama_response.get(
            "message",
            {}
        )
    )

    vision_text = (
        message.get(
            "content",
            ""
        )
    )

    print(
        "Vision AI response:"
    )

    print(
        vision_text
    )

    if not vision_text:

        return {
            "events": []
        }

    # --------------------------------------------------------
    # Parse JSON generated by Qwen3-VL
    # --------------------------------------------------------

    try:

        parsed = json.loads(
            vision_text
        )

    except Exception as error:

        print(
            "Could not parse Vision AI JSON:",
            repr(error)
        )

        return {
            "events": []
        }

    return parsed


# ============================================================
# VALIDATE VISION EVENTS
# ============================================================

def validate_vision_events(
    vision_response,
    frame_times
):

    """
    Convert Qwen3-VL frame indexes into
    actual video timestamps.

    Example:

        Qwen:

            start_frame = 2
            end_frame = 5

        Application:

            start = frame_times[2]
            end = frame_times[5]

    This keeps timestamp ownership inside
    the application.
    """

    if not isinstance(
        vision_response,
        dict
    ):

        return []

    raw_events = (
        vision_response.get(
            "events",
            []
        )
    )

    if not isinstance(
        raw_events,
        list
    ):

        return []

    frame_count = len(
        frame_times
    )

    if frame_count == 0:

        return []

    validated = []

    for event in raw_events:

        if not isinstance(
            event,
            dict
        ):

            continue

        # ----------------------------------------------------
        # Frame indexes
        # ----------------------------------------------------

        try:

            start_frame = int(
                event.get(
                    "start_frame"
                )
            )

            end_frame = int(
                event.get(
                    "end_frame"
                )
            )

        except Exception:

            continue

        # ----------------------------------------------------
        # Clamp indexes
        # ----------------------------------------------------

        start_frame = max(

            0,

            min(
                frame_count - 1,
                start_frame
            )

        )

        end_frame = max(

            0,

            min(
                frame_count - 1,
                end_frame
            )

        )

        # ----------------------------------------------------
        # Correct reversed ranges
        # ----------------------------------------------------

        if end_frame < start_frame:

            start_frame, end_frame = (

                end_frame,

                start_frame

            )

        # ----------------------------------------------------
        # Event type
        # ----------------------------------------------------

        event_name = str(

            event.get(
                "event",
                "unknown"
            )

        ).strip().lower()

        if not event_name:

            event_name = "unknown"

        # ----------------------------------------------------
        # Confidence
        # ----------------------------------------------------

        try:

            confidence = float(

                event.get(
                    "confidence",
                    0
                )

            )

        except Exception:

            confidence = 0

        confidence = max(

            0,

            min(
                1,
                confidence
            )

        )

        # ----------------------------------------------------
        # Description
        # ----------------------------------------------------

        description = str(

            event.get(
                "description",
                ""
            )

        ).strip()

        # ----------------------------------------------------
        # Actual timestamps
        # ----------------------------------------------------

        start_timestamp = float(

            frame_times[
                start_frame
            ]

        )

        end_timestamp = float(

            frame_times[
                end_frame
            ]

        )

        # ----------------------------------------------------
        # Event
        # ----------------------------------------------------

        validated.append({

            "event":
                event_name,

            "start":
                round(
                    start_timestamp,
                    3
                ),

            "end":
                round(
                    end_timestamp,
                    3
                ),

            "start_frame":
                start_frame,

            "end_frame":
                end_frame,

            "confidence":
                confidence,

            "description":
                description

        })

    # --------------------------------------------------------
    # Sort chronologically
    # --------------------------------------------------------

    validated.sort(

        key=lambda event:
            event["start"]

    )

    return validated


# ============================================================
# VISION FRAME ENDPOINT
# ============================================================

@app.post("/analyze-frames")
async def analyze_frames(

    frames: List[UploadFile] = File(...),

    start_time: float = Form(0.0),

    end_time: float = Form(0.0),

    frame_times: str = Form("")

):

    """
    Analyze sampled gameplay frames.

    Node.js sends temporal windows of frames.

    Example:

        frame-001.jpg
        frame-002.jpg
        frame-003.jpg

    plus:

        frame_times=[120,121,122]

    Response:

        {
          "model": "qwen3-vl:2b",
          "frame_count": 3,
          "events": [...]
        }

    """

    print(
        "=========================================="
    )

    print(
        "VISION ANALYSIS REQUEST"
    )

    print(
        f"Received {len(frames)} frames"
    )

    if len(frames) == 0:

        raise HTTPException(

            status_code=400,

            detail="No frames provided"

        )

    # --------------------------------------------------------
    # Read uploaded frames
    # --------------------------------------------------------

    image_data = []

    for index, frame in enumerate(
        frames
    ):

        try:

            content = await frame.read()

        except Exception as error:

            print(

                f"Could not read frame {index}:",

                repr(error)

            )

            continue

        if not content:

            continue

        image_data.append({

            "filename":
                frame.filename,

            "content_type":
                frame.content_type,

            "bytes":
                content

        })

    if len(image_data) == 0:

        raise HTTPException(

            status_code=400,

            detail="All uploaded frames were empty"

        )

    # --------------------------------------------------------
    # Determine timestamps
    # --------------------------------------------------------

    timestamps = normalize_frame_times(

        len(image_data),

        frame_times,

        start_time,

        end_time

    )

    print(
        "Frame timestamps:"
    )

    print(
        timestamps
    )

    # --------------------------------------------------------
    # Run vision AI
    # --------------------------------------------------------

    try:

        vision_response = (
            analyze_frames_with_vision(

                image_data,

                timestamps

            )
        )

    except Exception as error:

        print(

            "Vision analysis failed:",

            repr(error)

        )

        return {

            "model":
                VISION_MODEL,

            "frame_count":
                len(image_data),

            "events":
                [],

            "error":
                str(error)

        }

    # --------------------------------------------------------
    # Convert frame references
    # to real timestamps
    # --------------------------------------------------------

    events = validate_vision_events(

        vision_response,

        timestamps

    )

    print(

        f"Vision AI discovered "
        f"{len(events)} events"

    )

    print(

        json.dumps(
            events,
            indent=2
        )

    )

    return {

        "model":
            VISION_MODEL,

        "frame_count":
            len(image_data),

        "events":
            events

    }