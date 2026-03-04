import json
import logging
import uuid
import asyncio
import io
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.core.config import PROJECT_ROOT, OLLAMA_MODEL, OLLAMA_BASE_URL
from src.core.llm_engine import engine
from src.core.persistent_memory import persistent_memory as memory
from src.core.agents import get_agent, get_all_agents
from src.core.rag_engine import extract_text, chunk_text
from src.analysis.preprocessing import preprocess
from src.analysis.intent_classifier import INTENT_LABELS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ─── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("  Human Insight AI — Ollama Backend (Enhanced)")
    logger.info("=" * 60)

    # Initialize persistent memory
    await memory.initialize()
    logger.info("✅ Persistent memory (SQLite) initialized.")

    is_ready = await engine.check_health()
    if not is_ready:
        logger.warning(f"⚠️ Ollama server ({OLLAMA_BASE_URL}) not answering or model '{OLLAMA_MODEL}' not found.")
        logger.warning("Make sure to run: ollama pull qwen2.5:3b")
    else:
        logger.info("✅ Ollama is ready. Model verified.")

    yield

    await engine.close()
    logger.info("Shutting down.")


# ─── App ───────────────────────────────────────────────────────
app = FastAPI(title="Human Insight AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

frontend_dir = PROJECT_ROOT / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


# ─── Request / Response Models ─────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = Field(default="default")
    document_context: Optional[str] = Field(default=None)

class ChatResponse(BaseModel):
    response: str
    intent: dict
    emotion: dict
    preprocessing: dict
    session_id: str

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    lang: str = Field(default="ar")


# ─── Helper: Build analysis metadata ──────────────────────────
def _build_analysis(parsed_response: dict) -> tuple[dict, dict]:
    """Build intent and emotion result dicts from parsed LLM response."""
    intent_key = parsed_response.get("intent", {}).get("category", "ambiguous").lower().strip()
    if intent_key not in INTENT_LABELS:
        intent_key = "ambiguous"
    label_info = INTENT_LABELS[intent_key]
    intent_result = {
        "intent": intent_key,
        "confidence": parsed_response.get("intent", {}).get("confidence", 0.0),
        "reasoning": parsed_response.get("intent", {}).get("reasoning", ""),
        "label_en": label_info["en"],
        "label_ar": label_info["ar"],
        "emoji": label_info["emoji"],
    }

    emo = parsed_response.get("emotion", {})
    polarity = emo.get("polarity", "neutral").lower()
    colors = {"positive": "#10b981", "neutral": "#94a3b8", "negative": "#ef4444"}

    state_label_en = emo.get("state", "neutral").capitalize()
    state_label_ar = "محيّد" if polarity == "neutral" else state_label_en

    emotion_result = {
        "polarity": polarity,
        "emotion": emo.get("state", "neutral").lower(),
        "intensity": emo.get("intensity", "low").lower(),
        "reasoning": emo.get("reasoning", ""),
        "label_en": state_label_en,
        "label_ar": state_label_ar,
        "emoji": "🧠",
        "color": "#6366f1",
        "polarity_color": colors.get(polarity, colors["neutral"]),
    }

    return intent_result, emotion_result


# ─── Routes ────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    index_path = frontend_dir / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return HTMLResponse("<h1>Human Insight AI</h1><p>Frontend not found.</p>")

@app.get("/api/health")
async def health_check():
    is_ready = await engine.check_health()
    return {"status": "ok", "model_loaded": is_ready, "backend": "ollama"}


# ─── AI Agents ─────────────────────────────────────────────────
@app.get("/api/agents")
async def list_agents():
    """Return all available AI agent personas."""
    return {"agents": get_all_agents()}


# ─── Document Upload (RAG) ─────────────────────────────────────
@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a document (PDF, DOCX, CSV) and extract its text content."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="اسم الملف مفقود.")

    max_size = 10 * 1024 * 1024  # 10MB
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="حجم الملف يتجاوز الحد المسموح (10MB).")

    try:
        text = extract_text(content, file.filename)
        chunks = chunk_text(text)
        return {
            "filename": file.filename,
            "text_length": len(text),
            "chunks_count": len(chunks),
            "preview": text[:500] + ("..." if len(text) > 500 else ""),
            "full_text": text,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload processing error: {e}")
        raise HTTPException(status_code=500, detail="خطأ في معالجة الملف.")


# ─── Speech TTS ────────────────────────────────────────────────
@app.post("/api/speech/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using edge-tts. Returns audio/mpeg stream."""
    try:
        import edge_tts

        # Select voice based on language
        voices = {
            "ar": "ar-SA-HamedNeural",
            "en": "en-US-GuyNeural",
            "fr": "fr-FR-HenriNeural",
        }
        voice = voices.get(request.lang, voices["ar"])

        communicate = edge_tts.Communicate(request.text, voice)
        audio_buffer = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])

        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"},
        )
    except ImportError:
        raise HTTPException(status_code=501, detail="مكتبة edge-tts غير مثبتة.")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"خطأ في تحويل النص إلى صوت: {str(e)}")


# ─── Streaming Chat (SSE) ──────────────────────────────────────
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream tokens via SSE. Sends analysis metadata first, then streams response tokens."""
    if not engine.is_loaded:
        is_ready = await engine.check_health()
        if not is_ready:
            raise HTTPException(status_code=503, detail="Ollama model not loaded.")

    prep = preprocess(request.message)
    mem_context = await memory.get_context(request.session_id)

    # Get agent system prompt
    agent = get_agent(request.agent_id)
    agent_system_prompt = agent.get("system_prompt")

    async def event_generator():
        import re
        full_text = ""
        last_yielded_len = 0
        try:
            async for token in engine.generate_cognitive_response_stream(
                user_message=request.message,
                memory_context=mem_context,
                system_prompt=agent_system_prompt,
                document_context=request.document_context,
            ):
                full_text += token
                
                match = re.search(r'"response"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', full_text)
                if match:
                    current_response_raw = match.group(1)
                    try:
                        current_response = json.loads(f'"{current_response_raw}"')
                    except json.JSONDecodeError:
                        current_response = current_response_raw.replace('\\n', '\n').replace('\\"', '"')

                    delta = current_response[last_yielded_len:]
                    if delta:
                        last_yielded_len = len(current_response)
                        yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"

            # After streaming completes, parse the full JSON response
            fallback = {
                "intent": {"category": "ambiguous", "confidence": 0.0},
                "emotion": {"polarity": "neutral", "state": "neutral", "intensity": "low"},
                "response": full_text,
            }
            parsed = engine._parse_json(full_text, fallback=fallback)

            if "response" not in parsed:
                parsed["response"] = full_text
            if "intent" not in parsed:
                parsed["intent"] = fallback["intent"]
            if "emotion" not in parsed:
                parsed["emotion"] = fallback["emotion"]

            response_text = parsed["response"]

            # Update persistent memory
            await memory.add_turn(request.session_id, "user", request.message, request.agent_id)
            await memory.add_turn(request.session_id, "assistant", response_text, request.agent_id)

            # Build analysis
            intent_result, emotion_result = _build_analysis(parsed)

            yield f"data: {json.dumps({'type': 'done', 'response': response_text, 'intent': intent_result, 'emotion': emotion_result, 'preprocessing': prep, 'session_id': request.session_id})}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Non-Streaming Chat (fallback) ─────────────────────────────
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not engine.is_loaded:
        is_ready = await engine.check_health()
        if not is_ready:
            raise HTTPException(status_code=503, detail="Ollama model not loaded. Run 'ollama pull qwen2.5:3b'")

    prep = preprocess(request.message)
    mem_context = await memory.get_context(request.session_id)

    agent = get_agent(request.agent_id)
    agent_system_prompt = agent.get("system_prompt")

    parsed_response = await engine.generate_cognitive_response(
        user_message=request.message,
        memory_context=mem_context,
        system_prompt=agent_system_prompt,
        document_context=request.document_context,
    )

    response_text = parsed_response["response"]

    await memory.add_turn(request.session_id, "user", request.message, request.agent_id)
    await memory.add_turn(request.session_id, "assistant", response_text, request.agent_id)

    intent_result, emotion_result = _build_analysis(parsed_response)

    return ChatResponse(
        response=response_text,
        intent=intent_result,
        emotion=emotion_result,
        preprocessing=prep,
        session_id=request.session_id,
    )


# ─── Memory & Sessions ────────────────────────────────────────
@app.get("/api/memory/sessions")
async def get_sessions():
    """Return a list of all past conversation sessions."""
    sessions = await memory.get_sessions()
    return {"sessions": sessions}

@app.get("/api/memory/history/{session_id}")
async def get_session_history(session_id: str):
    """Return full conversation history for a session."""
    history = await memory.get_session_history(session_id)
    return {"session_id": session_id, "history": history}

@app.delete("/api/memory/{session_id}")
async def clear_memory(session_id: str):
    await memory.clear(session_id)
    return {"status": "cleared", "session_id": session_id}
