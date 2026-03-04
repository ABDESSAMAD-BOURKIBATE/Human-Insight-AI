"""
Human Insight AI — Intent Classifier
Classifies user message intent using the LLM engine.
"""

from src.core.llm_engine import engine


# Readable labels for the frontend
INTENT_LABELS = {
    "informational": {"en": "Informational", "ar": "استعلامي", "emoji": "📚"},
    "emotional": {"en": "Emotional", "ar": "عاطفي", "emoji": "💭"},
    "analytical": {"en": "Analytical", "ar": "تحليلي", "emoji": "🔬"},
    "ethical": {"en": "Ethical", "ar": "أخلاقي", "emoji": "⚖️"},
    "persuasive": {"en": "Persuasive", "ar": "إقناعي", "emoji": "🎯"},
    "ambiguous": {"en": "Ambiguous", "ar": "غامض", "emoji": "❓"},
}


def classify_intent(message: str) -> dict:
    """
    Classify the intent of a user message.
    Returns a dict with intent, confidence, reasoning, and display label.
    """
    result = engine.classify_intent(message)

    # Normalize the intent key
    intent_key = result.get("intent", "ambiguous").lower().strip()
    if intent_key not in INTENT_LABELS:
        intent_key = "ambiguous"

    label_info = INTENT_LABELS[intent_key]

    return {
        "intent": intent_key,
        "confidence": result.get("confidence", 0.0),
        "reasoning": result.get("reasoning", ""),
        "label_en": label_info["en"],
        "label_ar": label_info["ar"],
        "emoji": label_info["emoji"],
    }
