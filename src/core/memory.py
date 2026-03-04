from collections import defaultdict
from typing import List, Dict

from src.core.config import MEMORY_MAX_TURNS

class ConversationMemory:
    def __init__(self, max_turns: int = MEMORY_MAX_TURNS):
        self.max_turns = max_turns
        self._sessions: dict[str, List[Dict[str, str]]] = defaultdict(list)

    def add_turn(self, session_id: str, role: str, content: str) -> None:
        history = self._sessions[session_id]
        history.append({"role": role, "content": content})
        if len(history) > self.max_turns * 2:
            self._sessions[session_id] = history[-(self.max_turns * 2):]

    def get_context(self, session_id: str) -> List[Dict[str, str]]:
        return self._sessions.get(session_id, [])

    def clear(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]

    def get_turn_count(self, session_id: str) -> int:
        return len(self._sessions.get(session_id, []))

memory = ConversationMemory()
