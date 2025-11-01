# Lumina

**Lumina** is a self-hosted Python service that automatically generates and executes test cases for websites based on **video + audio recordings**. It extracts user interactions from the video/audio, generates structured test cases using AI, runs them in a real browser, captures failures, and produces a JSON report with screenshots.

Lumina is designed to integrate with **Lampshade**, providing “spotlight” testing for web projects.

---

## Features

- Extract audio from Loom-style video recordings
- Transcribe audio using **local Whisper**
- Analyze video frames for visual context
- Generate **structured test cases** with AI (Ollama + LangChain)
- Run test cases in **Playwright / Chrome**

  - Desktop default
  - Headless mode optional
  - Parallel execution of steps

- Capture **screenshots on failed steps**
- Save full **JSON report** with test results
- Self-hosted, minimal cloud dependency, cost-efficient

---

## Requirements

- **Python 3.11+**
- **Node.js** (for Playwright)
- **Tesseract OCR** (for text extraction)
- **GPU recommended** for faster Whisper transcription (optional)
- **Ollama** self-hosted LLM running on `http://localhost:11434`

---

## Installation

### 1️⃣ Clone repository

```bash
git clone https://github.com/yourorg/lumina.git
cd lumina
```

### 2️⃣ Python environment

```bash
python -m venv venv
source venv/bin/activate   # Linux/macOS
venv\Scripts\activate      # Windows
pip install --upgrade pip
pip install -r requirements.txt
```

### 3️⃣ Install Playwright browsers

```bash
python -m playwright install
```

### 4️⃣ Install Tesseract OCR

- **Ubuntu/Debian:**

  ```bash
  sudo apt install tesseract-ocr
  ```

- **Windows:** Download and install from [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

### 5️⃣ Run Ollama self-hosted LLM

```bash
ollama serve
ollama pull llama2
```

---

## Usage

### Basic command

```bash
python main.py --video recording.mp4 --url https://example.com
```

### Optional flags

```text
--headless         Run browser in headless mode
--report_dir DIR   Save screenshots + JSON report to custom directory (default: reports)
--max_workers N    Run test steps in parallel (default: 4)
```

### Example

```bash
python main.py \
    --video spotlight.mp4 \
    --url https://example.com \
    --headless \
    --report_dir spotlight_report \
    --max_workers 8
```

---

## Output

1. **Screenshots** for failed steps:
   `reports/step_<n>.png`

2. **JSON report** containing generated test cases and results:
   `reports/test_report.json`

```json
{
  "test_cases": [
    { "step": 1, "action": "click", "target": { "text": "Login" } },
    {
      "step": 2,
      "action": "fill",
      "target": { "placeholder": "Username" },
      "value": "testuser"
    }
  ],
  "results": [
    {
      "step": 1,
      "action": "click",
      "status": "success",
      "error": null,
      "screenshot": null
    },
    {
      "step": 2,
      "action": "fill",
      "status": "fail",
      "error": "input not found",
      "screenshot": "reports/step_2.png"
    }
  ]
}
```

---

## Architecture Overview

```text
[User Video + Audio] --> [Audio Extraction + Whisper] --> [AI Test Case Generator (Ollama + LangChain)]
                     --> [Playwright Runner] --> [Screenshots on Failure] --> [JSON Report]
```

- **Audio + Video Processor**: Handles Loom-style recordings, OCR, and frame extraction
- **AI Layer**: Uses Ollama + LangChain to generate structured test steps
- **Executor**: Runs test cases in real browser (Chrome), handles parallel execution
- **Reporting**: Captures screenshots, saves structured JSON results

---

## Customization

- Switch AI model (Ollama / LLaMA / MPT / Falcon) by updating `ai/llm_interface.py`
- Change browser type / device emulation in `executor/playwright_runner.py`
- Adjust parallelism via `--max_workers`
- Add more structured step types (scroll, hover, drag) in Playwright runner

---

## License

MIT License
