"""Normalize question / sentence text for duplicate detection (aligned with DataManagement.jsx)."""
import re


def normalize_question_bank_text(s) -> str:
    if s is None:
        return ''
    if not isinstance(s, str):
        s = str(s)
    t = s.strip()
    if not t or t.lower() == 'nan':
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


def _mcq_option_values(doc: dict):
    """Resolve A–D options from optionA..D or options list."""
    if not doc:
        return '', '', '', ''
    options = doc.get('options')
    if isinstance(options, (list, tuple)) and len(options) >= 4:
        return (
            normalize_question_bank_text(options[0]),
            normalize_question_bank_text(options[1]),
            normalize_question_bank_text(options[2]),
            normalize_question_bank_text(options[3]),
        )
    if isinstance(options, dict):
        return (
            normalize_question_bank_text(options.get('A') or options.get('a') or ''),
            normalize_question_bank_text(options.get('B') or options.get('b') or ''),
            normalize_question_bank_text(options.get('C') or options.get('c') or ''),
            normalize_question_bank_text(options.get('D') or options.get('d') or ''),
        )
    return (
        normalize_question_bank_text(doc.get('optionA') or ''),
        normalize_question_bank_text(doc.get('optionB') or ''),
        normalize_question_bank_text(doc.get('optionC') or ''),
        normalize_question_bank_text(doc.get('optionD') or ''),
    )


def bank_mcq_fingerprint(doc: dict) -> str:
    """
    Full MCQ identity: question + options A–D + answer.
    Two rows are duplicates only when this fingerprint matches.
    """
    if not doc:
        return ''
    q = normalize_question_bank_text(doc.get('question') or '')
    if not q:
        return ''
    a, b, c, d = _mcq_option_values(doc)
    ans = normalize_question_bank_text(doc.get('answer') or '').upper()
    return f'{q}|A:{a}|B:{b}|C:{c}|D:{d}|ANS:{ans}'


def bank_duplicate_key_from_doc(doc: dict) -> str:
    """
    Duplicate key for question bank rows.
    MCQ (has options/answer): full question + options + answer.
    Sentence/paragraph/other: primary text only.
    """
    if not doc:
        return ''
    has_mcq_fields = any(
        doc.get(k)
        for k in ('optionA', 'optionB', 'optionC', 'optionD', 'answer', 'options')
    )
    if has_mcq_fields:
        return bank_mcq_fingerprint(doc)
    return bank_text_key_from_doc(doc)
