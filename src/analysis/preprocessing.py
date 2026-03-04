"""
Human Insight AI — Text Preprocessing
Normalization and language detection for Arabic, English, and French.
"""

import re
import unicodedata


# Arabic Unicode ranges
_ARABIC_RANGE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")
# French-specific accented characters
_FRENCH_CHARS = re.compile(r"[éèêëàâäùûüôöîïçœæ]", re.IGNORECASE)


def normalize_text(text: str) -> str:
    """Normalize text: remove extra whitespace, normalize unicode."""
    # Unicode NFC normalization
    text = unicodedata.normalize("NFC", text)
    # Collapse multiple whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def remove_arabic_diacritics(text: str) -> str:
    """Remove Arabic tashkeel (diacritical marks) for cleaner processing."""
    # Arabic diacritics range: \u064B-\u065F, \u0670
    return re.sub(r"[\u064B-\u065F\u0670]", "", text)


def detect_language(text: str) -> str:
    """
    Simple heuristic language detection.
    Returns: 'ar' for Arabic, 'fr' for French, 'en' for English (default).
    """
    total_chars = len(text.replace(" ", ""))
    if total_chars == 0:
        return "en"

    arabic_chars = len(_ARABIC_RANGE.findall(text))
    arabic_ratio = arabic_chars / total_chars

    if arabic_ratio > 0.3:
        return "ar"

    french_chars = len(_FRENCH_CHARS.findall(text))
    french_ratio = french_chars / total_chars

    if french_ratio > 0.05:
        return "fr"

    return "en"


def preprocess(text: str) -> dict:
    """Full preprocessing pipeline. Returns normalized text + metadata."""
    normalized = normalize_text(text)
    language = detect_language(normalized)

    # Remove diacritics for Arabic to improve LLM understanding
    clean_text = normalized
    if language == "ar":
        clean_text = remove_arabic_diacritics(normalized)

    return {
        "original": text,
        "normalized": clean_text,
        "language": language,
        "char_count": len(clean_text),
        "word_count": len(clean_text.split()),
    }
