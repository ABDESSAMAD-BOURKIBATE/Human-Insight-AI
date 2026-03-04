import json
import logging
from typing import Optional, List, Dict, AsyncGenerator
import httpx

from src.core.config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    LLM_TEMPERATURE,
    LLM_TOP_P,
    LLM_MAX_TOKENS,
    OLLAMA_KEEP_ALIVE,
)
from src.core.prompts import (
    SYSTEM_PROMPT,
    UNIFIED_COGNITIVE_PROMPT,
)

logger = logging.getLogger(__name__)


class LLMEngine:
    """Core LLM engine for cognitive processing using Ollama."""

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.model_name = OLLAMA_MODEL
        self._available = False
        # Persistent HTTP client with connection pooling
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create a persistent httpx client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(120.0, connect=5.0),
            )
        return self._client

    async def close(self):
        """Close the persistent HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def check_health(self) -> bool:
        """Check if Ollama is running and the model is downloaded."""
        try:
            client = await self._get_client()
            res = await client.get("/api/tags", timeout=5.0)
            if res.status_code == 200:
                models = [m["name"] for m in res.json().get("models", [])]
                self._available = any(self.model_name in m for m in models)
                return self._available
        except Exception as e:
            logger.error(f"Cannot connect to Ollama at {self.base_url}: {e}")
        return False

    @property
    def is_loaded(self) -> bool:
        return self._available

    def _build_payload(
        self,
        user_message: str,
        memory_context: List[Dict[str, str]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        system_prompt: Optional[str] = None,
        document_context: Optional[str] = None,
    ) -> dict:
        """Build the request payload for Ollama."""
        if memory_context is None:
            memory_context = []

        # Use custom agent system prompt if provided, otherwise default
        active_system_prompt = system_prompt or SYSTEM_PROMPT
        messages = [{"role": "system", "content": active_system_prompt}]
        messages.extend(memory_context)

        # Build user message with optional RAG document context
        user_content = ""
        if document_context:
            user_content += f"سياق من مستند مرفق:\n---\n{document_context}\n---\n\n"
        user_content += UNIFIED_COGNITIVE_PROMPT.format(message=user_message)
        messages.append({"role": "user", "content": user_content})

        return {
            "model": self.model_name,
            "messages": messages,
            "stream": stream,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "options": {
                "temperature": temperature or LLM_TEMPERATURE,
                "top_p": LLM_TOP_P,
                "num_predict": max_tokens or LLM_MAX_TOKENS,
            },
        }

    async def generate_cognitive_response(
        self,
        user_message: str,
        memory_context: List[Dict[str, str]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        system_prompt: Optional[str] = None,
        document_context: Optional[str] = None,
    ) -> dict:
        """Generate a complete cognitive response (non-streaming, for CLI)."""
        if not self._available:
            raise RuntimeError("Ollama not available or model not pulled.")

        payload = self._build_payload(
            user_message, memory_context, temperature, max_tokens, stream=False,
            system_prompt=system_prompt, document_context=document_context,
        )

        client = await self._get_client()
        res = await client.post("/api/chat", json=payload)
        res.raise_for_status()
        response_text = res.json()["message"]["content"].strip()

        fallback = {
            "intent": {"category": "ambiguous", "confidence": 0.0, "reasoning": "Parse failed"},
            "emotion": {"polarity": "neutral", "state": "neutral", "intensity": "low", "reasoning": "Parse failed"},
            "response": response_text,
        }

        parsed = self._parse_json(response_text, fallback=fallback)

        if "response" not in parsed:
            parsed["response"] = response_text
        if "intent" not in parsed:
            parsed["intent"] = fallback["intent"]
        if "emotion" not in parsed:
            parsed["emotion"] = fallback["emotion"]

        return parsed

    async def generate_cognitive_response_stream(
        self,
        user_message: str,
        memory_context: List[Dict[str, str]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        system_prompt: Optional[str] = None,
        document_context: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from Ollama. Yields each token as it arrives."""
        if not self._available:
            raise RuntimeError("Ollama not available or model not pulled.")

        payload = self._build_payload(
            user_message, memory_context, temperature, max_tokens, stream=True,
            system_prompt=system_prompt, document_context=document_context,
        )

        client = await self._get_client()
        async with client.stream("POST", "/api/chat", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if chunk.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue

    @staticmethod
    def _parse_json(text: str, fallback: dict) -> dict:
        """Safely parse JSON from LLM output."""
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start != -1 and end != 0:
                return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            pass
        logger.warning(f"Failed to parse JSON from LLM output: {text[:200]}")
        return fallback


# Global singleton
engine = LLMEngine()
