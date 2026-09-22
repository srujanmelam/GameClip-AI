
# 🎮 GameClip AI

**GameClip AI** is a web application that automatically analyzes gameplay videos, detects interesting/high-intensity moments, and generates short vertical clips suitable for platforms such as **YouTube Shorts and Instagram Reels**.

The project is built using **Angular, Node.js, Express, FFmpeg and Sharp**.

> **Current version:** Highlight detection is algorithmic. AI/LLM-based semantic video analysis is planned for a future version.

---

## ✨ Features

* 🎥 Upload gameplay videos
* 📊 Upload progress tracking
* 🖼️ Extract video frames using FFmpeg
* 👀 Detect visual activity using frame differences
* 🔊 Analyze audio intensity
* 🎬 Detect scene changes
* 🧠 Calculate combined highlight scores
* 📌 Group nearby highlight events
* 🚫 Remove overlapping events
* 🏆 Select top highlight candidates
* ✂️ Automatically generate short clips
* 📱 Convert generated clips to **1080 × 1920 (9:16)**
* ▶️ Preview generated Shorts directly in the browser
* ⬇️ Download generated Shorts

---

# 🏗️ Architecture

```text
                    ┌──────────────────────┐
                    │      Angular UI      │
                    │                      │
                    │ Upload Gameplay      │
                    │ Show Progress        │
                    │ Preview Shorts       │
                    │ Download Shorts      │
                    └──────────┬───────────┘
                               │
                               │ HTTP
                               ▼
                    ┌──────────────────────┐
                    │    Node.js + Express │
                    │                      │
                    │ Upload API           │
                    │ Analysis API         │
                    │ Generate Shorts API  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
           FFmpeg           Sharp          Audio Analysis
              │                │                │
              ▼                ▼                ▼
        Video Processing   Frame Analysis   Audio Scores
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                     Highlight Detection
                               │
                               ▼
                       Candidate Selection
                               │
                               ▼
                         FFmpeg Encoding
                               │
                               ▼
                         1080 × 1920
                            9:16
                               │
                               ▼
                         Generated Shorts
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
│   ├── services/
│   │   ├── videoProcessor.js
│   │   ├── videoAnalyzer.js
│   │   ├── frameExtractor.js
│   │   ├── audioAnalyzer.js
│   │   ├── highlightDetector.js
│   │   ├── sceneDetector.js
│   │   └── candidateSelector.js
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

* **Node.js** 18+
* **npm**
* **Angular CLI**
* **FFmpeg**

Check your installations:

```bash
node --version
npm --version
ng version
ffmpeg -version
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

The frontend will normally be available at:

```text
http://localhost:4200
```

---

# ⚙️ Backend Setup

Open another terminal.

Navigate to the backend:

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

The backend will run on:

```text
http://localhost:3000
```

---

# 🎬 FFmpeg Installation

FFmpeg is required for video processing.

## macOS

If you use Homebrew:

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

Example using cURL:

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

This pipeline performs:

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

## Generate Shorts

```http
POST /api/videos/:filename/generate-ai-shorts
```

> The endpoint currently uses algorithmic highlight detection. Despite the endpoint name, the current implementation does not use an AI/LLM model yet.

The pipeline:

```text
Gameplay Video
      ↓
Frame Extraction
      ↓
Visual Activity
      ↓
Audio Intensity
      ↓
Scene Detection
      ↓
Combined Highlight Score
      ↓
Candidate Selection
      ↓
FFmpeg
      ↓
Generated Shorts
```

---

# 🧠 Highlight Detection

The current system does not use a machine-learning model.

Instead, it combines three signals.

### Visual Activity

Frames are extracted approximately once per second.

Consecutive frames are compared using image differences.

```text
Frame A
   ↓
Grayscale + Resize
   ↓
Frame B
   ↓
Pixel Difference
   ↓
Visual Score
```

---

### Audio Intensity

The audio track is converted to WAV and analyzed using RMS amplitude.

Higher audio intensity can indicate events such as:

* explosions
* combat
* loud effects
* major gameplay moments

---

### Scene Detection

FFmpeg's scene detection filter identifies significant visual transitions.

---

### Combined Score

The current highlight score is calculated using:

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

The conversion uses FFmpeg scaling and cropping to maintain the 9:16 aspect ratio.

> Note: The current implementation uses a fixed center crop. Subject-aware/dynamic reframing is planned for a future version.

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

Stores uploaded gameplay videos.

### `frames/`

Stores extracted JPG frames used for visual analysis.

### `audio/`

Stores extracted WAV audio used for audio analysis.

### `clips/`

Stores generated Shorts.

---

# 🧹 Cleanup

The `frames/` and `audio/` directories contain temporary processing files.

For development, they can be manually cleared:

```bash
rm -rf frames/*
rm -rf audio/*
```

Generated clips can be removed with:

```bash
rm -rf clips/*
```

Be careful when deleting `uploads/` because it contains the original uploaded videos.

---

# ⚠️ Important: Do Not Commit Generated Videos

Do **not** commit:

```text
uploads/
frames/
audio/
clips/
```

Add them to `.gitignore`.

Example:

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

If the directories need to exist after cloning, add `.gitkeep` files:

```text
backend/uploads/.gitkeep
backend/frames/.gitkeep
backend/audio/.gitkeep
backend/clips/.gitkeep
```

Then use:

```gitignore
backend/uploads/*
!backend/uploads/.gitkeep

backend/frames/*
!backend/frames/.gitkeep

backend/audio/*
!backend/audio/.gitkeep

backend/clips/*
!backend/clips/.gitkeep
```

---

# 🚀 Running the Complete Application

You need two terminals.

### Terminal 1 — Backend

```bash
cd backend
npm install
npm run dev
```

Backend:

```text
http://localhost:3000
```

### Terminal 2 — Frontend

```bash
cd frontend/gameclip-ai
npm install
ng serve
```

Frontend:

```text
http://localhost:4200
```

Then open:

```text
http://localhost:4200
```

---

# 🔄 Complete Workflow

```text
1. Open GameClip AI
        ↓
2. Upload gameplay video
        ↓
3. Click "Generate Shorts"
        ↓
4. Video uploaded to Node.js
        ↓
5. Frames extracted
        ↓
6. Audio analyzed
        ↓
7. Scene changes detected
        ↓
8. Highlight scores calculated
        ↓
9. Highlight events grouped
        ↓
10. Top candidates selected
        ↓
11. FFmpeg generates vertical Shorts
        ↓
12. Shorts displayed in Angular
        ↓
13. User previews/downloads Shorts
```

---

# 🧪 Development

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend/gameclip-ai
ng serve
```

---

# 🚧 Roadmap

### Current

* [X] Video upload
* [X] Upload progress
* [X] FFmpeg integration
* [X] Frame extraction
* [X] Visual activity detection
* [X] Audio intensity detection
* [X] Scene detection
* [X] Highlight scoring
* [X] Candidate selection
* [X] Automatic Short generation
* [X] 9:16 video conversion
* [X] Short preview
* [X] Short download

### Planned

* [ ] Real AI/LLM-based gameplay understanding
* [ ] Semantic event detection
* [ ] AI-powered highlight ranking
* [ ] Dynamic subject-aware cropping
* [ ] Automatic captions
* [ ] AI-generated titles
* [ ] AI-generated descriptions
* [ ] AI-generated hashtags
* [ ] Results dashboard
* [ ] Background processing/job queue
* [ ] Cloud storage
* [ ] User accounts
* [ ] YouTube upload integration
* [ ] Instagram publishing integration

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/your-feature
```

3. Commit your changes

```bash
git add .
git commit -m "Add your feature"
```

4. Push the branch

```bash
git push origin feature/your-feature
```

5. Open a Pull Request

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
* FFmpeg
* Sharp

---

## ⭐ If you find this project useful

Give the repository a ⭐ on GitHub.
