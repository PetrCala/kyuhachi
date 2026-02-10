"""Japanese closed days parser.

Vendored and adapted from onsendo/src/lib/parsers/closed_days.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
import re
from typing import Optional

from src.trail.parsers.usage_time import normalize_text, DOW_MAP, is_holiday


def _jp_num_to_int(token: str) -> Optional[int]:
    token = token.strip()
    if not token:
        return None
    if token.isdigit():
        return int(token)

    mapping = {
        "零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
        "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    }
    total = 0
    current = 0
    for ch in token:
        if ch == "十":
            current = max(1, current) * 10
            total += current
            current = 0
        elif ch in mapping and ch != "十":
            current += mapping[ch]
        else:
            return None
    total += current
    return total if total > 0 else None


class ClosedRule:
    def is_closed(self, dt: datetime) -> Optional[bool]:
        raise NotImplementedError


@dataclass
class WeeklyClosedRule(ClosedRule):
    weekdays: set[int]
    closes_on_holidays_too: bool = False
    shift_to_next_day_if_holiday: bool = False
    exclude_holidays: bool = False

    def is_closed(self, dt: datetime) -> Optional[bool]:
        if self.shift_to_next_day_if_holiday:
            yesterday = dt - timedelta(days=1)
            if yesterday.weekday() in self.weekdays and is_holiday(yesterday):
                return True

        if dt.weekday() in self.weekdays:
            if self.shift_to_next_day_if_holiday and is_holiday(dt):
                return False
            if self.exclude_holidays and is_holiday(dt):
                return False
            return True

        if self.closes_on_holidays_too and is_holiday(dt):
            return True

        return False


@dataclass
class MonthlySpecificDaysRule(ClosedRule):
    days: set[int]
    shift_to_next_day_if_holiday: bool = False

    def is_closed(self, dt: datetime) -> Optional[bool]:
        if self.shift_to_next_day_if_holiday:
            y = dt - timedelta(days=1)
            if y.day in self.days and is_holiday(y):
                return True

        if dt.day in self.days:
            if self.shift_to_next_day_if_holiday and is_holiday(dt):
                return False
            return True
        return False


@dataclass
class MonthlyOrdinalWeekdayRule(ClosedRule):
    ordinals: set[int]
    weekday: int
    shift_to_next_day_if_holiday: bool = False

    def _nth_weekday_date(self, year: int, month: int, n: int) -> Optional[date]:
        d = date(year, month, 1)
        first_wd = d.weekday()
        days_until = (self.weekday - first_wd) % 7
        day = 1 + days_until + (n - 1) * 7
        try:
            return date(year, month, day)
        except Exception:
            return None

    def _is_designated(self, d: date) -> bool:
        for n in self.ordinals:
            nd = self._nth_weekday_date(d.year, d.month, n)
            if nd and nd == d:
                return True
        return False

    def is_closed(self, dt: datetime) -> Optional[bool]:
        d = dt.date()
        if self.shift_to_next_day_if_holiday:
            y = d - timedelta(days=1)
            if self._is_designated(y) and is_holiday(datetime(y.year, y.month, y.day)):
                return True

        if self._is_designated(d):
            if self.shift_to_next_day_if_holiday and is_holiday(dt):
                return False
            return True
        return False


@dataclass
class AbsoluteDatesRule(ClosedRule):
    dates_mmdd: set[tuple[int, int]] = field(default_factory=set)
    ranges: list[tuple[int, int, int, int]] = field(default_factory=list)

    def _in_range(self, dt: date, s_m: int, s_d: int, e_m: int, e_d: int) -> bool:
        if (s_m, s_d) <= (e_m, e_d):
            start = date(dt.year, s_m, s_d)
            end = date(dt.year, e_m, e_d)
            return start <= dt <= end
        start_prev = date(dt.year - 1, s_m, s_d)
        end_curr = date(dt.year, e_m, e_d)
        if start_prev <= dt <= end_curr:
            return True
        start_this = date(dt.year, s_m, s_d)
        end_next = date(dt.year + 1, e_m, e_d)
        return start_this <= dt <= end_next

    def is_closed(self, dt: datetime) -> Optional[bool]:
        d = (dt.month, dt.day)
        if d in self.dates_mmdd:
            return True
        for s_m, s_d, e_m, e_d in self.ranges:
            if self._in_range(dt.date(), s_m, s_d, e_m, e_d):
                return True
        return False


@dataclass
class ClosedDaysParsed:
    raw: Optional[str]
    normalized: Optional[str]

    rules: list[ClosedRule] = field(default_factory=list)
    no_regular_closures: bool = False
    irregular_or_unknown: bool = False
    requires_inquiry: bool = False
    notes: list[str] = field(default_factory=list)

    def is_closed_on(self, dt: Optional[datetime] = None) -> Optional[bool]:
        if dt is None:
            dt = datetime.now()
        if self.no_regular_closures and not self.rules:
            return False
        any_known = False
        for rule in self.rules:
            r = rule.is_closed(dt)
            if r is True:
                return True
            if r is False:
                any_known = True
        if any_known:
            return False
        if self.irregular_or_unknown and not self.rules:
            return None
        return False


# -------------------------------
# Parser
# -------------------------------

_RE_PARENS_SHIFT_NEXT = re.compile(r"祝(?:祭)?日の場合は?翌日")
_RE_EXCLUDE_HOLIDAYS = re.compile(r"(祝(?:祭)?日除く|祝(?:祭)?日の場合は営業)")


def _extract_shift_flag(s: str) -> tuple[str, bool]:
    shift = False
    m = re.search(r"\(([^)]*)\)", s)
    while m:
        inside = m.group(1)
        if _RE_PARENS_SHIFT_NEXT.search(inside):
            shift = True
            s = s[: m.start()] + s[m.end() :]
            m = re.search(r"\(([^)]*)\)", s)
        else:
            break
    return s.strip(), shift


def _extract_exclude_holidays_flag(s: str) -> tuple[str, bool]:
    exclude = False
    if _RE_EXCLUDE_HOLIDAYS.search(s):
        exclude = True
        s = _RE_EXCLUDE_HOLIDAYS.sub("", s)
    m = re.search(r"\(([^)]*)\)", s)
    while m:
        inside = m.group(1)
        if _RE_EXCLUDE_HOLIDAYS.search(inside):
            exclude = True
            s = s[: m.start()] + s[m.end() :]
            m = re.search(r"\(([^)]*)\)", s)
        else:
            break
    return s.strip(), exclude


def _split_on_delimiters(s: str) -> list[str]:
    parts = re.split(r"[・,、／/]|\s+|※", s)
    return [p for p in (p.strip() for p in parts) if p]


def _parse_weekly_tokens(tokens: list[str]) -> set[int]:
    days: set[int] = set()
    for t in tokens:
        if t.startswith("毎月"):
            continue
        m = re.fullmatch(r"(月|火|水|木|金|土|日)(?:曜|曜日)?", t)
        if m:
            days.add(DOW_MAP[m.group(1)])
    return days


def _parse_monthly_day_tokens(s: str) -> Optional[set[int]]:
    m = re.match(r"毎月(?P<body>.+)", s)
    if not m:
        return None
    body = m.group("body")
    body = body.replace("日", "")
    body = body.replace(".", "・")
    nums = re.split(r"[・,、\s]+", body)
    out: set[int] = set()
    for n in nums:
        if not n:
            continue
        v = _jp_num_to_int(n)
        if v:
            out.add(v)
    return out if out else None


def _parse_ordinal_weekday(s: str) -> Optional[tuple[set[int], int]]:
    s2 = s
    if "曜" not in s2 or "第" not in s2:
        return None
    wd_m = re.search(r"(月|火|水|木|金|土|日)曜", s2)
    if not wd_m:
        return None
    weekday = DOW_MAP[wd_m.group(1)]
    head = s2[: wd_m.start()]
    head = head.replace("第", " ")
    nums = re.split(r"[・,、\s]+", head)
    ords: set[int] = set()
    for n in nums:
        v = _jp_num_to_int(n)
        if v:
            ords.add(v)
    return (ords, weekday) if ords else None


def _parse_absolute_dates(s: str) -> Optional[AbsoluteDatesRule]:
    text = s.replace(".", "・")
    dates: set[tuple[int, int]] = set()
    ranges: list[tuple[int, int, int, int]] = []

    for m_rng in re.finditer(
        r"(?P<m1>\d{1,2})/(?P<d1>\d{1,2})\s*[~〜～\-]\s*(?:(?P<m2>\d{1,2})/)?(?P<d2>\d{1,2})",
        text,
    ):
        m1 = int(m_rng.group("m1"))
        d1 = int(m_rng.group("d1"))
        m2 = int(m_rng.group("m2")) if m_rng.group("m2") else m1
        d2 = int(m_rng.group("d2"))
        ranges.append((m1, d1, m2, d2))

    for m_md_list in re.finditer(r"(?P<m>\d{1,2})/(?P<ds>[\d・]+)", text):
        m_val = int(m_md_list.group("m"))
        ds = m_md_list.group("ds")
        for d_tok in ds.split("・"):
            if d_tok.isdigit():
                dates.add((m_val, int(d_tok)))

    for m_md in re.finditer(r"(?P<m>\d{1,2})/(?P<d>\d{1,2})", text):
        dates.add((int(m_md.group("m")), int(m_md.group("d"))))

    if dates or ranges:
        return AbsoluteDatesRule(dates_mmdd=dates, ranges=ranges)
    return None


def parse_closed_days(value: Optional[str]) -> ClosedDaysParsed:
    """Parse a Japanese closed days string into structured ClosedDaysParsed."""
    raw = value
    norm = normalize_text(value)
    result = ClosedDaysParsed(raw=raw, normalized=norm)

    if norm is None or norm == "" or norm.lower() in {"none", "null"}:
        result.no_regular_closures = False
        return result

    if "なし" in norm:
        result.no_regular_closures = True
    if any(k in norm for k in ["不定", "不定休", "臨時", "不定期"]):
        result.irregular_or_unknown = True
        if any(k in norm for k in ["要問合せ", "要確認", "要予約"]):
            result.requires_inquiry = True
    if any(k in norm for k in ["要問合せ", "要確認", "要予約"]):
        result.requires_inquiry = True
    if any(k in norm for k in ["悪天候", "雨天"]):
        result.requires_inquiry = True
        result.notes.append("weather dependent")

    scope_note = None
    if "：" in norm:
        scope_note, norm = norm.split("：", 1)
        scope_note = scope_note.strip()
        result.notes.append(f"scope:{scope_note}")

    main_text = norm
    main_text, shift_flag = _extract_shift_flag(main_text)
    main_text, exclude_holidays_flag = _extract_exclude_holidays_flag(main_text)

    if re.search(r"土日祝", main_text):
        result.rules.append(
            WeeklyClosedRule(weekdays={5, 6}, closes_on_holidays_too=True)
        )

    weekly_tokens = _split_on_delimiters(main_text)
    weekdays = _parse_weekly_tokens(weekly_tokens)
    if weekdays or exclude_holidays_flag:
        result.rules.append(
            WeeklyClosedRule(
                weekdays=weekdays,
                shift_to_next_day_if_holiday=shift_flag,
                exclude_holidays=exclude_holidays_flag,
            )
        )

    if re.search(r"(^|[・,、\s])祝日($|[・,、\s])", main_text):
        result.rules.append(
            WeeklyClosedRule(weekdays=set(), closes_on_holidays_too=True)
        )

    ow = _parse_ordinal_weekday(main_text)
    if ow:
        ords, wd = ow
        result.rules.append(
            MonthlyOrdinalWeekdayRule(
                ordinals=ords, weekday=wd, shift_to_next_day_if_holiday=shift_flag
            )
        )

    mdays = _parse_monthly_day_tokens(main_text)
    if mdays:
        result.rules.append(
            MonthlySpecificDaysRule(days=mdays, shift_to_next_day_if_holiday=shift_flag)
        )

    abs_rule = _parse_absolute_dates(main_text)
    if abs_rule:
        result.rules.append(abs_rule)

    if "年末年始" in norm and not abs_rule:
        result.irregular_or_unknown = True
        result.notes.append("new-year unspecified")

    extra_parts = re.split(r"※", norm)
    if len(extra_parts) > 1:
        for part in extra_parts[1:]:
            ar = _parse_absolute_dates(part)
            if ar:
                result.rules.append(ar)
            if "営業" in part:
                result.notes.append(part.strip())

    return result


__all__ = [
    "ClosedRule",
    "WeeklyClosedRule",
    "MonthlySpecificDaysRule",
    "MonthlyOrdinalWeekdayRule",
    "AbsoluteDatesRule",
    "ClosedDaysParsed",
    "parse_closed_days",
]
