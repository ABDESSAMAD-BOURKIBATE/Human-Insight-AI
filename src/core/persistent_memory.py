"""
Human Insight AI — Persistent Memory (SQLite)
Long-term conversation memory that persists across server restarts.
"""

import aiosqlite
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from src.core.config import PROJECT_ROOT, MEMORY_MAX_TURNS

logger = logging.getLogger(__name__)

DB_PATH = PROJECT_ROOT / "data" / "memory.db"


class PersistentMemory:
    """SQLite-backed conversation memory with cross-session persistence."""

    def __init__(self, db_path: Path = DB_PATH, max_turns: int = MEMORY_MAX_TURNS):
        self.db_path = db_path
        self.max_turns = max_turns
        self._initialized = False

    async def initialize(self):
        """Create database and tables if they don't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    agent_id TEXT DEFAULT 'default',
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    title TEXT,
                    agent_id TEXT DEFAULT 'default',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_conv_session 
                ON conversations(session_id)
            """)
            await db.commit()

        self._initialized = True
        logger.info(f"✅ Persistent memory initialized at {self.db_path}")

    async def _ensure_init(self):
        if not self._initialized:
            await self.initialize()

    async def add_turn(self, session_id: str, role: str, content: str, agent_id: str = "default") -> None:
        """Add a conversation turn to persistent storage."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            # Insert the turn
            await db.execute(
                "INSERT INTO conversations (session_id, role, content, agent_id) VALUES (?, ?, ?, ?)",
                (session_id, role, content, agent_id),
            )

            # Create or update the session record
            title = content[:80] + "..." if len(content) > 80 else content
            await db.execute("""
                INSERT INTO sessions (session_id, title, agent_id, created_at, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET 
                    updated_at = CURRENT_TIMESTAMP,
                    title = CASE WHEN sessions.title IS NULL THEN ? ELSE sessions.title END
            """, (session_id, title if role == "user" else None, agent_id, title if role == "user" else None))

            await db.commit()

    async def get_context(self, session_id: str) -> List[Dict[str, str]]:
        """Get the recent conversation context for a session (for LLM context window)."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            cursor = await db.execute(
                """SELECT role, content FROM conversations 
                   WHERE session_id = ? 
                   ORDER BY id DESC LIMIT ?""",
                (session_id, self.max_turns * 2),
            )
            rows = await cursor.fetchall()

        # Reverse to get chronological order
        rows.reverse()
        return [{"role": row[0], "content": row[1]} for row in rows]

    async def clear(self, session_id: str) -> None:
        """Clear all conversation history for a session."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute("DELETE FROM conversations WHERE session_id = ?", (session_id,))
            await db.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            await db.commit()

    async def get_turn_count(self, session_id: str) -> int:
        """Get the number of turns in a session."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            cursor = await db.execute(
                "SELECT COUNT(*) FROM conversations WHERE session_id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def get_sessions(self, limit: int = 50) -> List[dict]:
        """Get a list of recent sessions for the sessions panel."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            cursor = await db.execute("""
                SELECT s.session_id, s.title, s.agent_id, s.created_at, s.updated_at,
                       COUNT(c.id) as turn_count
                FROM sessions s
                LEFT JOIN conversations c ON c.session_id = s.session_id
                GROUP BY s.session_id
                ORDER BY s.updated_at DESC
                LIMIT ?
            """, (limit,))
            rows = await cursor.fetchall()

        return [
            {
                "session_id": row[0],
                "title": row[1] or "محادثة جديدة",
                "agent_id": row[2] or "default",
                "created_at": row[3],
                "updated_at": row[4],
                "turn_count": row[5],
            }
            for row in rows
        ]

    async def get_session_history(self, session_id: str) -> List[Dict]:
        """Get full conversation history for a session."""
        await self._ensure_init()

        async with aiosqlite.connect(str(self.db_path)) as db:
            cursor = await db.execute(
                """SELECT role, content, agent_id, timestamp 
                   FROM conversations 
                   WHERE session_id = ? 
                   ORDER BY id ASC""",
                (session_id,),
            )
            rows = await cursor.fetchall()

        return [
            {
                "role": row[0],
                "content": row[1],
                "agent_id": row[2],
                "timestamp": row[3],
            }
            for row in rows
        ]


# Global singleton
persistent_memory = PersistentMemory()
