"""Normalize question / sentence text for duplicate detection (aligned with DataManagement.jsx)."""
import re


def normalize_question_bank_text(s) -> str:
    if not s or not isinstance(s, str):
        return ''
    t = s.strip()
    if not t:
        return ''
    t = t.replace('\ufeff', '')
    t = (
        t.replace('\u2019', "'")
        .replace('\u2018', "'")
        .replace('\u201c', '"')
        .replace('\u201d', '"')
    )
    t = re.sub(r'\s+', ' ', t).strip().lower()
    return t


def bank_text_key_from_doc(doc: dict) -> str:
    """Primary display text in question_bank rows varies by type."""
    if not doc:
        return ''
    raw = doc.get('question') or doc.get('sentence') or doc.get('paragraph') or ''
    return normalize_question_bank_text(raw)
