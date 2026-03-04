# 🧠 Human Insight AI

**Advanced Cognitive Language System** — Understands human intent, emotional nuance, ethical context, and semantic depth.

> Powered by **Qwen2.5:3B** running locally via **Ollama**.

---

## 🏗️ Architecture

```
Input → Preprocessing → [Intent Classification + Emotion Detection] → LLM Generation → Response
                              ↑                                           ↑
                         Analysis Layer                            Memory Context
```

| Module | Purpose |
|--------|---------|
| `llm_engine.py` | Local LLM inference via Ollama HTTP API |
| `memory.py` | Sliding-window conversation memory |
| `intent_classifier.py` | Classifies: Informational, Emotional, Analytical, Ethical, Persuasive, Ambiguous |
| `emotion_detector.py` | Detects polarity + emotional state + intensity |
| `preprocessing.py` | Arabic normalization, language detection |
| `server.py` | FastAPI REST API |
| `frontend/` | Premium dark glassmorphism web UI |

---

## ⚡ Quick Start

### 1. Install Ollama
Download from [ollama.com](https://ollama.com) and install it.

### 2. Pull the Model
```bash
ollama pull qwen2.5:3b
```

### 3. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run Server
```bash
python -m src.main --mode server
```
Open **http://localhost:8000** in your browser.

### 5. Or Run CLI
```bash
python -m src.main --mode cli
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/chat` | Chat with intent + emotion analysis |
| `POST` | `/api/analyze` | Analysis only (no response) |
| `DELETE` | `/api/memory/{id}` | Clear session memory |

### Example Request
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ما هو الذكاء الاصطناعي؟", "session_id": "test"}'
```

---

## 🌍 Supported Languages
- **Arabic** (with RTL support)
- **English**
- **French**

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Model name in Ollama |
| `LLM_CONTEXT_SIZE` | `2048` | Context window size |
| `LLM_TEMPERATURE` | `0.7` | Generation temperature |
| `LLM_TOP_P` | `0.9` | Top-p sampling |
| `LLM_MAX_TOKENS` | `512` | Max response tokens |
| `MEMORY_MAX_TURNS` | `10` | Memory window size |
| `API_PORT` | `8000` | Server port |

---

## 📋 System Requirements
- **CPU**: Intel i3 or better
- **RAM**: 8GB+ (12GB recommended)
- **Disk**: ~3GB for model (managed by Ollama)
- **OS**: Windows / Linux / macOS
- **Ollama**: Must be installed and running
