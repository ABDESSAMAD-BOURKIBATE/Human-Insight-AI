import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

LLM_CONTEXT_SIZE = int(os.getenv("LLM_CONTEXT_SIZE", "1024"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
LLM_TOP_P = float(os.getenv("LLM_TOP_P", "0.9"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "512"))

OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "10m")

MEMORY_MAX_TURNS = int(os.getenv("MEMORY_MAX_TURNS", "10"))
API_PORT = int(os.getenv("API_PORT", "8000"))
