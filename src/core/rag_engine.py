"""
Human Insight AI — RAG Engine
Extracts text from uploaded documents (PDF, DOCX, CSV) and chunks them for LLM context injection.
"""

import io
import logging
from typing import List

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file."""
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages.append(f"[صفحة {i+1}]\n{text.strip()}")
    return "\n\n".join(pages)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a Word DOCX file."""
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def extract_text_from_csv(file_bytes: bytes) -> str:
    """Extract text from a CSV file, returning a formatted summary."""
    import pandas as pd

    df = pd.read_csv(io.BytesIO(file_bytes))

    lines = []
    lines.append(f"عدد الأعمدة: {len(df.columns)} | عدد الصفوف: {len(df)}")
    lines.append(f"الأعمدة: {', '.join(df.columns.tolist())}")
    lines.append("")

    # Include first 30 rows as text
    sample = df.head(30)
    for idx, row in sample.iterrows():
        row_parts = [f"{col}: {val}" for col, val in row.items()]
        lines.append(f"صف {idx+1}: {' | '.join(row_parts)}")

    if len(df) > 30:
        lines.append(f"\n... ({len(df) - 30} صف إضافي غير معروض)")

    return "\n".join(lines)


SUPPORTED_EXTENSIONS = {
    ".pdf": extract_text_from_pdf,
    ".docx": extract_text_from_docx,
    ".csv": extract_text_from_csv,
}


def extract_text(file_bytes: bytes, filename: str) -> str:
    """
    Extract text from an uploaded file based on its extension.
    Returns the extracted text or raises ValueError for unsupported formats.
    """
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()

    extractor = SUPPORTED_EXTENSIONS.get(ext)
    if not extractor:
        supported = ", ".join(SUPPORTED_EXTENSIONS.keys())
        raise ValueError(f"نوع الملف '{ext}' غير مدعوم. الأنواع المدعومة: {supported}")

    try:
        text = extractor(file_bytes)
        if not text or not text.strip():
            raise ValueError("لم يتم العثور على نص في الملف.")
        return text.strip()
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Error extracting text from {filename}: {e}")
        raise ValueError(f"خطأ في قراءة الملف: {str(e)}")


def chunk_text(text: str, max_chars: int = 3000) -> List[str]:
    """
    Split a long text into chunks for LLM context window.
    Tries to split on paragraph boundaries.
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    paragraphs = text.split("\n\n")
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 > max_chars:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para
        else:
            current_chunk += "\n\n" + para if current_chunk else para

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks if chunks else [text[:max_chars]]
