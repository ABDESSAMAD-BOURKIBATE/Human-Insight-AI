"""
Human Insight AI — Main Entry Point
Supports CLI interactive mode and server mode.
"""

import argparse
import logging
import asyncio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)


async def run_cli():
    """Interactive CLI chat mode."""
    from src.core.llm_engine import engine
    from src.core.memory import memory
    from src.analysis.preprocessing import preprocess

    print("=" * 60)
    print("  Human Insight AI — Cognitive Intelligence System")
    print("  Type 'exit' to quit | 'clear' to reset memory")
    print("=" * 60)

    is_ready = await engine.check_health()
    if not is_ready:
        print("❌ Ollama server not ready or model missing. Please run Ollama first.")
        return

    session_id = "cli-session"

    while True:
        try:
            user_input = input("\n🧠 You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nGoodbye.")
            break

        if not user_input:
            continue
        if user_input.lower() == "exit":
            print("Goodbye.")
            break
        if user_input.lower() == "clear":
            memory.clear(session_id)
            print("✓ Memory cleared.")
            continue

        # Preprocess
        prep = preprocess(user_input)
        print(f"  📝 Language: {prep['language']} | Words: {prep['word_count']}")

        # Generate response (and analysis)
        mem_context = memory.get_context(session_id)
        result = await engine.generate_cognitive_response(user_input, memory_context=mem_context)

        # Extract Intent
        intent_cat = result.get("intent", {}).get("category", "ambiguous")
        intent_conf = result.get("intent", {}).get("confidence", 0.0)
        print(f"  🎯 Intent: {intent_cat} ({intent_conf*100:.0f}%)")

        # Extract Emotion
        emo_state = result.get("emotion", {}).get("state", "neutral")
        emo_pol = result.get("emotion", {}).get("polarity", "neutral")
        emo_int = result.get("emotion", {}).get("intensity", "low")
        print(f"  💭 Emotion: {emo_state} | {emo_pol} | {emo_int}")

        response = result.get("response", "Could not generate response.")

        # Update memory
        memory.add_turn(session_id, "user", user_input)
        memory.add_turn(session_id, "assistant", response)

        print(f"\n💡 Insight AI:\n{response}")


def run_server():
    """Start the FastAPI server."""
    import uvicorn
    from src.core.config import API_PORT

    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=API_PORT,
        reload=False,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Human Insight AI — Cognitive Intelligence System"
    )
    parser.add_argument(
        "--mode",
        choices=["cli", "server"],
        default="server",
        help="Run mode: 'cli' for interactive terminal, 'server' for API (default: server)",
    )
    args = parser.parse_args()

    if args.mode == "cli":
        asyncio.run(run_cli())
    else:
        run_server()


if __name__ == "__main__":
    main()
