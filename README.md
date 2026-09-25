
# 🎮 GameClip AI

**GameClip AI** is an AI-powered web application that automatically analyzes gameplay videos, identifies potentially interesting/high-intensity moments, ranks the best candidates using AI, and generates vertical clips optimized for platforms such as **YouTube Shorts** and **Instagram Reels**.

The application combines **visual activity analysis, audio intensity analysis, scene detection, speech transcription, algorithmic candidate selection, and Qwen3-based semantic ranking** into a single automated pipeline.

---

## ✨ Features

* 🎥 Upload gameplay videos
* 📊 Upload progress tracking
* 🖼️ Extract gameplay frames using FFmpeg
* 👀 Detect visual activity using frame differences
* 🔊 Analyze audio intensity using RMS amplitude
* 🎬 Detect scene changes
* 🧠 Calculate combined highlight scores
* 📌 Group nearby highlight events
* 🚫 Remove overlapping events
* 🏆 Select top highlight candidates
* 🗣️ Transcribe gameplay audio using **faster-whisper**
* 🤖 Rank highlight candidates using **Qwen3**
* ⚡ Send all candidates to Qwen in **one AI request**
* 🎯 AI ranking based on visual, audio, scene and transcript information
* ✂️ Automatically generate Shorts from AI-selected candidates
* 📱 Convert videos to **1080 × 1920 (9:16)**
* ▶️ Preview generated Shorts directly in the browser
* ⬇️ Download generated Shorts
* 🧹 Automatically clean temporary processing files

---

# 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │      Angular UI      │
                         │                      │
                         │ Upload Gameplay      │
                         │ Show Progress        │
                         │ Generate Shorts      │
                         │ Preview Shorts       │
                         │ Download Shorts      │
                         └──────────┬───────────┘
                                    │
                                    │ HTTP
                                    ▼
                         ┌──────────────────────┐
                         │   Node.js + Express  │
                         │                      │
                         │ Upload API           │
                         │ Analysis API         │
                         │ AI Shorts API        │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
              FFmpeg             Frame              Audio
                                 Analysis           Analysis
                 │                  │                  │
                 │                  ▼                  ▼
                 │             Visual Scores      Audio Scores
                 │                  │                  │
                 └──────────────────┼──────────────────┘
                                    ▼
                            Scene Detection
                                    │
                                    ▼
                          Highlight Score Fusion
                                    │
                                    ▼
                          Event Grouping
                                    │
                                    ▼
                         Candidate Selection
                                    │
                                    ▼
                       Candidate Feature Building
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
                 ▼                                     ▼
          faster-whisper                           Qwen3
          Speech Transcription                  AI Candidate Ranking
                 │                                     │
                 └──────────────────┬──────────────────┘
                                    │
                                    ▼
                          Top AI Candidates
                                    │
                                    ▼
                            Node.js Mapping
                                    │
                                    ▼
                               FFmpeg
                                    │
                                    ▼
                         1080 × 1920 Vertical
                                    │
                                    ▼
                           Generated Shorts
```

---

# 🧠 AI Processing Architecture

The current AI pipeline is designed so that **Node.js remains responsible for video boundaries and FFmpeg processing**, while Qwen3 is responsible for **semantic candidate ranking**.

```text
Gameplay Video
      │
      ├───────────────┐
      │               │
      ▼               ▼
   Frames           Audio
      │               │
      ▼               ▼
Visual Analysis   Audio Analysis
      │               │
      └───────┬───────┘
              │
              ▼
        Scene Detection
              │
              ▼
       Highlight Scoring
              │
              ▼
      Candidate Selection
              │
              ▼
    Candidate Feature Builder
              │
              ├───────────────┐
              │               │
              ▼               ▼
        faster-whisper      Candidate
        Transcription       Features
              │               │
              └───────┬───────┘
                      │
                      ▼
                 ONE QWEN3
                   REQUEST
                      │
                      ▼
              AI Candidate Ranking
                      │
                      ▼
                 Top 3 Candidates
                      │
                      ▼
                    FFmpeg
                      │
                      ▼
                Vertical Shorts
```

---

# 🤖 AI Candidate Ranking

The system does **not** ask Qwen3 to generate arbitrary timestamps.

Instead, Node.js first creates candidate segments with fixed boundaries.

For example:

```json
{
  "id": 2,
  "start": 21,
  "end": 36,
  "duration": 15,
  "algorithmicScore": 0.68
}
```

Qwen3 receives all candidate information and ranks the candidates.

The expected AI response is:

```json
{
  "results": [
    {
      "id": 2,
      "ai_score": 92,
      "category": "highlight",
      "reason": "Strong gameplay activity and audio intensity."
    },
    {
      "id": 0,
      "ai_score": 84,
      "category": "action",
      "reason": "High visual activity and multiple scene changes."
    },
    {
      "id": 1,
      "ai_score": 78,
      "category": "action",
      "reason": "Good sustained visual and audio activity."
    }
  ]
}
```

### Why candidate IDs are used

Qwen3 does **not** control the final FFmpeg timestamps.

Instead:

```text
Qwen
  │
  ▼
Candidate ID
  │
  ▼
Node.js finds original candidate
  │
  ▼
Original start/end timestamps
  │
  ▼
FFmpeg
```

This prevents invalid or hallucinated timestamps from being passed directly to the video-processing pipeline.

---

# 🗣️ Speech Transcription

Gameplay audio is extracted as:

```text
Mono
16 kHz
PCM WAV
```

The audio is then processed using **faster-whisper**.

The transcription provides contextual information such as:

```text
"You stay with her till they get here."

"Just save her. I'll get the rest."
```

This information can help the AI distinguish between ordinary gameplay and moments involving:

* dialogue
* important events
* reactions
* objectives
* story moments
* player interactions

---

# 🧠 Qwen3

Qwen3 is used for semantic candidate ranking.

The current architecture uses a locally running Qwen3 model through **Ollama**.

Example configuration:

```text
Ollama
   │
   ▼
Qwen3
   │
   ▼
Candidate Ranking
```

The application sends **one request containing all selected candidates**, rather than making a separate LLM request for every candidate.

This reduces unnecessary model calls and allows the model to compare candidates against each other.

---

# 📊 Candidate Features

Each candidate contains multiple signals.

### Candidate Metadata

```text
Start
End
Duration
Algorithmic Score
```

### Visual Features

```text
Average Activity
Peak Activity
Peak Timestamp
Per-second Visual Samples
```

### Audio Features

```text
Average Intensity
Peak Intensity
Peak Timestamp
Per-second Audio Samples
```

### Scene Features

```text
Scene Count
Scene Change Timestamps
```

### Transcript

The faster-whisper transcription provides additional spoken-context information to the AI analysis pipeline.

---

# 📈 Highlight Detection

Before AI ranking, GameClip AI performs algorithmic highlight detection.

The system combines three signals.

## Visual Activity

Frames are extracted approximately once per second.

Consecutive frames are compared to detect visual changes.

```text
Frame A
   ↓
Grayscale + Resize
   ↓
Frame B
   ↓
Pixel Difference
   ↓
Visual Activity Score
```

High visual activity can indicate:

* combat
* explosions
* camera movement
* rapid gameplay
* environmental changes

---

## Audio Intensity

The audio track is converted into WAV and analyzed using RMS amplitude.

Higher audio intensity can indicate:

* explosions
* combat
* gunfire
* loud effects
* character reactions
* major gameplay moments

---

## Scene Detection

Scene detection identifies significant visual transitions in the gameplay footage.

Scene changes provide another signal that can help identify meaningful gameplay events.

---

# 🧮 Combined Highlight Score

The initial algorithmic score combines:

```text
Visual Activity     50%
Audio Intensity     30%
Scene Changes       20%
```

Conceptually:

```text
Highlight Score =
      Visual × 0.50
    + Audio × 0.30
    + Scene × 0.20
```

These algorithmic scores are used to identify promising candidates before the AI ranking stage.

---

# 🔄 Complete AI Shorts Workflow

```text
1. Upload gameplay video
        ↓
2. Extract frames
        ↓
3. Analyze visual activity
        ↓
4. Extract audio
        ↓
5. Analyze audio intensity
        ↓
6. Detect scene changes
        ↓
7. Combine highlight signals
        ↓
8. Group highlight events
        ↓
9. Remove overlapping events
        ↓
10. Select top candidates
        ↓
11. Build candidate features
        ↓
12. Transcribe audio with faster-whisper
        ↓
13. Send ALL candidates to Qwen3
        │
        │ ONE REQUEST
        ▼
14. Qwen3 ranks candidates
        ↓
15. Node.js maps AI IDs
    back to original candidates
        ↓
16. Keep original timestamps
        ↓
17. Generate top 3 Shorts
        ↓
18. Convert to 9:16
        ↓
19. Return generated clips
        ↓
20. Angular displays Shorts
```

---

# 📁 Project Structure

```text
gameclip-ai/
│
├── frontend/
│   └── gameclip-ai/
│       ├── src/
│       │   └── app/
│       │       ├── core/
│       │       │   └── services/
│       │       │       └── video.service.ts
│       │       │
│       │       └── features/
│       │           └── upload/
│       │               ├── upload.component.ts
│       │               ├── upload.component.html
│       │               ├── upload.component.css
│       │               └── upload.component.spec.ts
│       │
│       └── package.json
│
├── backend/
│   ├── ai/
│   │   ├── app.py
│   │   ├── requirements.txt
│   │   └── ...
│   │
│   ├── services/
│   │   ├── videoProcessor.js
│   │   ├── videoAnalyzer.js
│   │   ├── frameExtractor.js
│   │   ├── audioAnalyzer.js
│   │   ├── highlightDetector.js
│   │   ├── sceneDetector.js
│   │   ├── candidateSelector.js
│   │   └── aiClipSelector.js
│   │
│   ├── uploads/
│   ├── frames/
│   ├── audio/
│   ├── clips/
│   │
│   ├── server.js
│   ├── package.json
│   └── ...
│
└── README.md
```

---

# 🛠️ Prerequisites

Before running the project, install:

* **Node.js 18+**
* **npm**
* **Angular CLI**
* **Python 3.10+**
* **FFmpeg**
* **Ollama**

Check the installations:

```bash
node --version
npm --version
python3 --version
ng version
ffmpeg -version
ollama --version
```

---

# 🤖 AI Dependencies

The AI pipeline requires:

### faster-whisper

Used for speech transcription.

Install through the Python requirements:

```bash
pip install -r requirements.txt
```

### Ollama

Ollama runs the local Qwen3 model.

Install Ollama and then pull the model:

```bash
ollama pull qwen3:4b
```

Verify:

```bash
ollama list
```

The model should appear as:

```text
qwen3:4b
```

---

# 📥 Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/gameclip-ai.git
```

Navigate into the project:

```bash
cd gameclip-ai
```

---

# 🎨 Frontend Setup

Navigate to the Angular project:

```bash
cd frontend/gameclip-ai
```

Install dependencies:

```bash
npm install
```

Start Angular:

```bash
ng serve
```

Frontend:

```text
http://localhost:4200
```

---

# ⚙️ Node.js Backend Setup

Open another terminal.

Navigate to:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Start the backend:

```bash
npm run dev
```

Or:

```bash
npm start
```

Backend:

```text
http://localhost:3000
```

---

# 🐍 AI Service Setup

Open another terminal.

Navigate to:

```bash
cd backend/ai
```

Create a virtual environment:

```bash
python3 -m venv venv
```

Activate it on macOS/Linux:

```bash
source venv/bin/activate
```

On Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn app:app --reload --port 8000
```

AI service:

```text
http://localhost:8000
```

Health check:

```bash
curl http://localhost:8000/health
```

---

# 🦙 Ollama Setup

Make sure Ollama is running.

Pull Qwen3:

```bash
ollama pull qwen3:4b
```

Check installed models:

```bash
ollama list
```

The expected model is:

```text
qwen3:4b
```

The application communicates with Ollama through:

```text
http://127.0.0.1:11434
```

---

# 🎬 FFmpeg Installation

FFmpeg is required for video processing.

## macOS

Using Homebrew:

```bash
brew install ffmpeg
```

Verify:

```bash
ffmpeg -version
```

## Windows

Install FFmpeg and make sure the `ffmpeg` command is available in your system PATH.

Verify:

```bash
ffmpeg -version
```

## Linux

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install ffmpeg
```

Verify:

```bash
ffmpeg -version
```

---

# 🔌 API Endpoints

## Health Check

```http
GET /api/health
```

Example:

```bash
curl http://localhost:3000/api/health
```

---

## Upload Video

```http
POST /api/videos/upload
```

Form field:

```text
video
```

Example:

```bash
curl -X POST \
  -F "video=@gameplay.mp4" \
  http://localhost:3000/api/videos/upload
```

---

## Detect Scenes

```http
POST /api/videos/:filename/detect-scenes
```

Example:

```text
POST /api/videos/gameplay-123.mp4/detect-scenes
```

---

## Analyze Highlights

```http
POST /api/videos/:filename/analyze-highlights
```

Pipeline:

```text
Video
 ↓
Frame Extraction
 ↓
Visual Analysis
 ↓
Audio Analysis
 ↓
Scene Detection
 ↓
Score Combination
 ↓
Event Grouping
 ↓
Overlap Removal
```

---

# 🤖 Generate AI Shorts

```http
POST /api/videos/:filename/generate-ai-shorts
```

This is the primary AI pipeline.

The endpoint performs:

```text
Video
 ↓
Frames
 ↓
Visual Analysis
 ↓
Audio Extraction
 ↓
Audio Analysis
 ↓
Scene Detection
 ↓
Algorithmic Highlight Scoring
 ↓
Candidate Selection
 ↓
Candidate Feature Building
 ↓
faster-whisper
 ↓
ONE Qwen3 Request
 ↓
AI Candidate Ranking
 ↓
Top 3 Candidates
 ↓
FFmpeg
 ↓
1080 × 1920 Shorts
```

---

# 🎯 Why Qwen3 Only Returns Candidate IDs

The system deliberately separates **AI ranking** from **video processing**.

Qwen3 returns:

```json
{
  "id": 2,
  "ai_score": 92,
  "category": "highlight",
  "reason": "Strong gameplay activity and audio intensity."
}
```

It does **not** generate:

```json
{
  "recommended_start": 21,
  "recommended_end": 36
}
```

Node.js already knows the candidate boundaries.

For example:

```text
Candidate 2

Start: 21
End:   36
```

If Qwen selects candidate `2`, Node.js retrieves:

```text
Candidate 2
     ↓
start = 21
end   = 36
```

and passes those original boundaries to FFmpeg.

This makes the video-processing pipeline deterministic.

---

# 📱 Short Video Format

Generated Shorts are converted to:

```text
Resolution: 1080 × 1920
Aspect Ratio: 9:16
Video Codec: H.264
Audio Codec: AAC
Pixel Format: yuv420p
```

The conversion uses FFmpeg scaling and cropping to produce vertical video.

> **Current limitation:** the implementation uses a fixed center crop. Subject-aware/dynamic reframing is planned for a future version.

---

# 🗂️ Temporary Files

During processing, the backend creates temporary data:

```text
backend/
├── uploads/
├── frames/
├── audio/
└── clips/
```

### `uploads/`

Original uploaded gameplay videos.

### `frames/`

Extracted frames used for visual analysis.

### `audio/`

Extracted WAV files used for audio analysis and transcription.

### `clips/`

Generated Shorts.

---

# 🧹 Cleanup

Temporary frames and audio files are automatically cleaned after AI Shorts generation.

They can also be manually removed during development:

```bash
rm -rf frames/*
rm -rf audio/*
```

Generated clips:

```bash
rm -rf clips/*
```

Be careful when deleting:

```text
uploads/
```

because it contains the original uploaded videos.

---

# ⚠️ Do Not Commit Generated Videos

Do **not** commit:

```text
uploads/
frames/
audio/
clips/
```

Add them to `.gitignore`:

```gitignore
# Dependencies
node_modules/

# Environment files
.env
.env.*

# GameClip AI generated files
backend/uploads/*
backend/frames/*
backend/audio/*
backend/clips/*

# Logs
*.log

# OS files
.DS_Store

# Angular
frontend/gameclip-ai/.angular/
frontend/gameclip-ai/dist/
```

If the directories need to exist after cloning, add:

```text
backend/uploads/.gitkeep
backend/frames/.gitkeep
backend/audio/.gitkeep
backend/clips/.gitkeep
```

---

# 🚀 Running the Complete Application

The current architecture uses **three services**.

## Terminal 1 — Node.js Backend

```bash
cd backend
npm install
npm run dev
```

Backend:

```text
http://localhost:3000
```

---

## Terminal 2 — Angular Frontend

```bash
cd frontend/gameclip-ai
npm install
ng serve
```

Frontend:

```text
http://localhost:4200
```

---

## Terminal 3 — AI Service

```bash
cd backend/ai
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

AI service:

```text
http://localhost:8000
```

---

## Ollama

Make sure Ollama is running and Qwen3 is installed:

```bash
ollama pull qwen3:4b
```

---

# 🔄 Complete Application Workflow

```text
┌───────────────────────────────┐
│        Angular Frontend       │
└───────────────┬───────────────┘
                │
                ▼
        Upload Gameplay
                │
                ▼
┌───────────────────────────────┐
│       Node.js + Express       │
└───────────────┬───────────────┘
                │
                ▼
          Extract Frames
                │
                ▼
        Visual Analysis
                │
                ▼
         Extract Audio
                │
                ▼
         Audio Analysis
                │
                ▼
        Scene Detection
                │
                ▼
       Combine Scores
                │
                ▼
      Group Highlight Events
                │
                ▼
      Remove Overlap
                │
                ▼
       Select Candidates
                │
                ▼
       Build Features
                │
          ┌─────┴─────┐
          │           │
          ▼           ▼
    faster-whisper   Candidate
    Transcription    Features
          │           │
          └─────┬─────┘
                │
                ▼
           Qwen3 / Ollama
                │
          ONE REQUEST
                │
                ▼
        Rank Candidates
                │
                ▼
           Top 3 IDs
                │
                ▼
       Map IDs → Candidates
                │
                ▼
       Original timestamps
                │
                ▼
             FFmpeg
                │
                ▼
          1080 × 1920
                │
                ▼
         Generated Shorts
                │
                ▼
        Angular Preview
                │
                ▼
             Download
```

---

# 🧪 Development

### Backend

```bash
cd backend
npm run dev
```

### Frontend

```bash
cd frontend/gameclip-ai
ng serve
```

### AI Service

```bash
cd backend/ai
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

### Ollama

```bash
ollama list
```

Make sure:

```text
qwen3:4b
```

is available.

---

# 🚧 Roadmap

## Completed

* [X] Video upload
* [X] Upload progress
* [X] FFmpeg integration
* [X] Frame extraction
* [X] Visual activity detection
* [X] Audio intensity detection
* [X] Scene detection
* [X] Algorithmic highlight scoring
* [X] Highlight event grouping
* [X] Overlap removal
* [X] Candidate selection
* [X] Candidate feature extraction
* [X] faster-whisper integration
* [X] Local Qwen3 integration
* [X] One-request AI candidate ranking
* [X] AI score/category/reason generation
* [X] AI candidate ID mapping
* [X] Automatic Short generation
* [X] 9:16 video conversion
* [X] Short preview
* [X] Short download
* [X] Temporary file cleanup

## Planned

* [ ] True frame-level vision model
* [ ] Semantic gameplay event detection
* [ ] More advanced AI highlight ranking
* [ ] Dynamic subject-aware cropping
* [ ] Automatic captions
* [ ] AI-generated titles
* [ ] AI-generated descriptions
* [ ] AI-generated hashtags
* [ ] Improved highlight timestamps
* [ ] Results dashboard
* [ ] Background processing/job queue
* [ ] Redis/BullMQ integration
* [ ] Cloud storage
* [ ] User accounts
* [ ] YouTube upload integration
* [ ] Instagram publishing integration

---

# 🔮 Future AI Architecture

The current architecture can later be extended from:

```text
Frames
   +
Audio
   +
Scenes
   +
Transcript
   ↓
Qwen3
```

to:

```text
Frames
   +
Audio
   +
Scenes
   +
Transcript
   +
Vision Model
   ↓
Multimodal AI Analysis
   ↓
Highlight Detection
   ↓
Clip Ranking
   ↓
Automatic Editing
```

This would allow GameClip AI to understand not only **how much visual/audio activity occurs**, but also **what is actually happening in the gameplay**.

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/your-feature
```

3. Commit your changes:

```bash
git add .
git commit -m "Add your feature"
```

4. Push the branch:

```bash
git push origin feature/your-feature
```

5. Open a Pull Request.

---

# 📄 License

Add your preferred license here.

For example:

```text
MIT License
```

---

# 👨‍💻 Author

**Jai Bala Srujan Melam**

Built with:

* Angular
* Node.js
* Express
* Python
* FastAPI
* faster-whisper
* Qwen3
* Ollama
* FFmpeg
* Sharp

---

## ⭐ If you find this project useful

Give the repository a ⭐ on GitHub.
