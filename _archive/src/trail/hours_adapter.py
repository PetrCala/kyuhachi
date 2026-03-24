"""Adapter to split the combined business_hours blob from kyushu.dev.db.

The kyushu DB stores hours, closure days, parking info, and locker info
all in a single `business_hours` text column. This module splits the text
into components suitable for the usage_time and closed_days parsers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from src.trail.parsers.usage_time import parse_usage_time, UsageTimeParsed, normalize_text
from src.trail.parsers.closed_days import parse_closed_days, ClosedDaysParsed


@dataclass
class ParsedBusinessHours:
    usage_time: UsageTimeParsed
    closed_days: ClosedDaysParsed
    raw: str


# Patterns that indicate a closure-day line
_CLOSURE_PATTERNS = [
    r"休$",           # ends with 休
    r"休\(",          # 休(
    r"^\d+/\d+休",    # 1/1休
    r"毎月\d",        # 毎月5,15,25日休
    r"毎週",          # 毎週火曜休
    r"^第\d",         # 第3水曜休
    r"^無休",         # 無休
    r"^不定休",       # 不定休
    r"^年末",         # 年末年始
]

# Patterns that indicate an informational/non-time line
_INFO_PATTERNS = [
    r"駐車場",        # parking
    r"ロッカー",      # locker
    r"貴重品",        # valuables
    r"^※",           # note marker (but some notes are about hours)
    r"受付で",        # reception-related info
]


def _classify_line(line: str) -> str:
    """Classify a line as 'hours', 'closure', or 'info'."""
    stripped = line.strip()
    if not stripped:
        return "info"

    normalized = normalize_text(stripped) or stripped

    # Check for info patterns first (parking, lockers)
    for pat in _INFO_PATTERNS:
        if re.search(pat, normalized):
            # But some ※ lines contain time info
            if pat == r"^※" and re.search(r"\d{1,2}:\d{2}", normalized):
                return "hours"
            if pat == r"^※":
                return "info"
            return "info"

    # Check for closure patterns
    for pat in _CLOSURE_PATTERNS:
        if re.search(pat, normalized):
            # "無休" can appear in hours context too, handle it
            if "無休" in normalized:
                return "closure"
            return "closure"

    # Lines with time ranges are hours
    if re.search(r"\d{1,2}[：:]\d{2}\s*[～~\-〜]\s*\d{1,2}[：:]\d{2}", stripped):
        return "hours"

    # Lines with closure day keywords
    if any(k in normalized for k in ["曜休", "曜日休", "休業", "臨時休"]):
        return "closure"

    # Default: if it has digits and colons, probably hours
    if re.search(r"\d{1,2}[：:]\d{2}", stripped):
        return "hours"

    # Otherwise info
    return "info"


def parse_business_hours(raw_text: Optional[str]) -> ParsedBusinessHours:
    """Split and parse the combined business_hours text.

    Separates the blob into usage time lines and closed day lines,
    then parses each with the appropriate parser.
    """
    if not raw_text:
        return ParsedBusinessHours(
            usage_time=parse_usage_time(None),
            closed_days=parse_closed_days(None),
            raw=raw_text or "",
        )

    lines = raw_text.strip().split("\n")
    hours_lines: list[str] = []
    closure_lines: list[str] = []

    for line in lines:
        category = _classify_line(line)
        if category == "hours":
            hours_lines.append(line.strip())
        elif category == "closure":
            closure_lines.append(line.strip())
        # info lines are dropped

    hours_text = "\n".join(hours_lines) if hours_lines else None
    closure_text = "、".join(closure_lines) if closure_lines else None

    return ParsedBusinessHours(
        usage_time=parse_usage_time(hours_text),
        closed_days=parse_closed_days(closure_text),
        raw=raw_text,
    )
