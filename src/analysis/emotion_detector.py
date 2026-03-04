"""
Human Insight AI — Emotion Detector
Detects emotional polarity, state, and intensity from user messages.
"""

from src.core.llm_engine import engine


# Readable labels for emotions
EMOTION_LABELS = {
    "joy":         {"en": "Joy",         "ar": "فرح",    "emoji": "😊", "color": "#4ade80"},
    "curiosity":   {"en": "Curiosity",   "ar": "فضول",   "emoji": "🤔", "color": "#60a5fa"},
    "hope":        {"en": "Hope",        "ar": "أمل",    "emoji": "🌟", "color": "#fbbf24"},
    "gratitude":   {"en": "Gratitude",   "ar": "امتنان",  "emoji": "🙏", "color": "#a78bfa"},
    "confusion":   {"en": "Confusion",   "ar": "حيرة",   "emoji": "😕", "color": "#fb923c"},
    "frustration": {"en": "Frustration", "ar": "إحباط",  "emoji": "😤", "color": "#f87171"},
    "sadness":     {"en": "Sadness",     "ar": "حزن",    "emoji": "😢", "color": "#94a3b8"},
    "anger":       {"en": "Anger",       "ar": "غضب",    "emoji": "😠", "color": "#ef4444"},
    "fear":        {"en": "Fear",        "ar": "خوف",    "emoji": "😨", "color": "#c084fc"},
    "doubt":       {"en": "Doubt",       "ar": "شك",     "emoji": "🤨", "color": "#e2e8f0"},
    "neutral":     {"en": "Neutral",     "ar": "محايد",   "emoji": "😐", "color": "#cbd5e1"},
}

POLARITY_COLORS = {
    "positive": "#4ade80",
    "neutral": "#94a3b8",
    "negative": "#f87171",
}


def detect_emotion(message: str) -> dict:
    """
    Detect the emotional content of a user message.
    Returns polarity, emotion, intensity, reasoning, and display metadata.
    """
    result = engine.detect_emotion(message)

    # Normalize keys
    emotion_key = result.get("emotion", "neutral").lower().strip()
    if emotion_key not in EMOTION_LABELS:
        emotion_key = "neutral"

    polarity = result.get("polarity", "neutral").lower().strip()
    if polarity not in POLARITY_COLORS:
        polarity = "neutral"

    intensity = result.get("intensity", "low").lower().strip()
    if intensity not in ("low", "medium", "high"):
        intensity = "low"

    label_info = EMOTION_LABELS[emotion_key]

    return {
        "polarity": polarity,
        "polarity_color": POLARITY_COLORS[polarity],
        "emotion": emotion_key,
        "intensity": intensity,
        "reasoning": result.get("reasoning", ""),
        "label_en": label_info["en"],
        "label_ar": label_info["ar"],
        "emoji": label_info["emoji"],
        "color": label_info["color"],
    }
