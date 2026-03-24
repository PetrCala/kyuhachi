"""Japanese business hours parser.

Vendored and adapted from onsendo/src/lib/parsers/usage_time.py.
External dependencies (CONST, PATHS) replaced with local defaults.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, time, date
import json
import os
import re
from typing import Optional

from src.paths import PATHS

# Holiday service URL and cache path (inlined from onsendo's CONST/PATHS)
_HOLIDAY_SERVICE_URL = "https://holidays-jp.github.io/api/v1"
_HOLIDAYS_CACHE_DIR = os.path.join(PATHS.DATA_DIR, "cache")
_HOLIDAYS_CACHE_FILE = os.path.join(_HOLIDAYS_CACHE_DIR, "japan_holidays.json")


# -------------------------------
# Holiday Service
# -------------------------------


class HolidayService(ABC):
    @abstractmethod
    def get_holidays(self, year: int) -> set[date]:
        pass


class CachedJapanHolidayService(HolidayService):
    """Fetches Japanese holidays with local file caching."""

    def __init__(
        self,
        base_url: str = _HOLIDAY_SERVICE_URL,
        cache_file: str = _HOLIDAYS_CACHE_FILE,
    ):
        self.base_url = base_url
        self.cache_file = cache_file
        self._memory_cache: dict[int, set[date]] = {}

    def _load_cache(self) -> dict:
        if not os.path.exists(self.cache_file):
            return {"years": {}, "metadata": {}}
        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"years": {}, "metadata": {}}

    def _save_cache(self, cache_data: dict) -> None:
        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def get_holidays(self, year: int) -> set[date]:
        if year in self._memory_cache:
            return self._memory_cache[year]

        cache_data = self._load_cache()
        year_str = str(year)

        if year_str in cache_data.get("years", {}):
            holidays = set()
            for date_str in cache_data["years"][year_str].keys():
                try:
                    holidays.add(datetime.strptime(date_str, "%Y-%m-%d").date())
                except ValueError:
                    continue
            self._memory_cache[year] = holidays
            return holidays

        try:
            import requests

            url = f"{self.base_url}/{year}/date.json"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            holidays_data = response.json()
            holidays = set()
            for holiday_date_str in holidays_data.keys():
                holidays.add(datetime.strptime(holiday_date_str, "%Y-%m-%d").date())

            if "years" not in cache_data:
                cache_data["years"] = {}
            if "metadata" not in cache_data:
                cache_data["metadata"] = {}
            cache_data["years"][year_str] = holidays_data
            cache_data["metadata"][year_str] = {
                "fetched_at": datetime.now().isoformat()
            }
            self._save_cache(cache_data)
            self._memory_cache[year] = holidays
            return holidays
        except Exception:
            return set()


# Global holiday service instance
_holiday_service: Optional[HolidayService] = None


def get_holiday_service() -> HolidayService:
    global _holiday_service
    if _holiday_service is None:
        _holiday_service = CachedJapanHolidayService()
    return _holiday_service


def set_holiday_service(service: HolidayService) -> None:
    global _holiday_service
    _holiday_service = service


def is_holiday(dt: datetime) -> bool:
    holiday_service = get_holiday_service()
    holidays = holiday_service.get_holidays(dt.year)
    return dt.date() in holidays


# -------------------------------
# Dataclasses
# -------------------------------


@dataclass
class MonthRange:
    start_month: int
    end_month: int

    def includes(self, month: int) -> bool:
        if self.start_month <= self.end_month:
            return self.start_month <= month <= self.end_month
        return month >= self.start_month or month <= self.end_month


@dataclass
class TimeWindow:
    """A single daily time window, optionally scoped by days-of-week and seasons."""

    start_time: time
    end_time: Optional[time]
    end_next_day: bool = False
    days_of_week: Optional[set[int]] = None  # 0=Mon .. 6=Sun
    month_ranges: list[MonthRange] = field(default_factory=list)
    last_admission_time: Optional[time] = None
    includes_holidays: bool = False
    notes: Optional[str] = None

    def applies_on(self, dt: datetime) -> bool:
        is_holiday_date = is_holiday(dt)
        day_applies = self.days_of_week is None or dt.weekday() in self.days_of_week

        if self.days_of_week is None:
            if self.includes_holidays:
                if not is_holiday_date:
                    return False
            if self.month_ranges:
                if not any(r.includes(dt.month) for r in self.month_ranges):
                    return False
            return True

        if is_holiday_date:
            if not self.includes_holidays:
                return False
            day_applies = True

        if not day_applies:
            return False

        if self.month_ranges:
            if not any(r.includes(dt.month) for r in self.month_ranges):
                return False
        return True

    def contains_time(self, dt: datetime) -> Optional[bool]:
        if not self.applies_on(dt):
            return False

        minute_of_day = dt.hour * 60 + dt.minute
        start_min = self.start_time.hour * 60 + self.start_time.minute
        if self.end_time is None:
            return None
        end_min = self.end_time.hour * 60 + self.end_time.minute

        if self.end_next_day or end_min < start_min:
            return minute_of_day >= start_min or minute_of_day < end_min
        return start_min <= minute_of_day < end_min


@dataclass
class UsageTimeParsed:
    raw: Optional[str]
    normalized: Optional[str]

    windows: list[TimeWindow] = field(default_factory=list)

    is_closed: bool = False
    requires_inquiry: bool = False
    requires_reservation: bool = False
    unknown_or_non_time: bool = False

    check_in_time: Optional[time] = None
    check_out_time: Optional[time] = None

    notes: list[str] = field(default_factory=list)

    def is_open(
        self, dt: Optional[datetime] = None, assume_unknown_closed: bool = True
    ) -> bool:
        if self.is_closed:
            return False
        if dt is None:
            dt = datetime.now()
        if not self.windows:
            return False

        any_unknown = False
        for window in self.windows:
            result = window.contains_time(dt)
            if result is True:
                return True
            if result is None:
                any_unknown = True
        if any_unknown and not assume_unknown_closed:
            return True
        return False

    def earliest_opening(self) -> Optional[time]:
        """Return the earliest opening time across all windows."""
        times = [w.start_time for w in self.windows]
        return min(times) if times else None


# -------------------------------
# Parsing helpers
# -------------------------------

FULLWIDTH_TO_ASCII = str.maketrans(
    {
        "：": ":",
        "〜": "～",
        "－": "-",
        "ー": "-",
        "　": " ",
        "／": "/",
        "，": ",",
        "（": "(",
        "）": ")",
    }
)

JAPANESE_DIGITS = {
    "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
    "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
}

DOW_MAP = {"月": 0, "火": 1, "水": 2, "木": 3, "金": 4, "土": 5, "日": 6}
WEEKDAY_SET = {0, 1, 2, 3, 4}
WEEKEND_SET = {5, 6}

TIME_RE = re.compile(r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?")


def normalize_text(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    out = text
    for k, v in JAPANESE_DIGITS.items():
        out = out.replace(k, v)
    out = out.translate(FULLWIDTH_TO_ASCII)
    out = out.replace("~", "～")
    out = re.sub(r"\s*([,/])\s*", r"\1", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def parse_hhmm(token: str) -> Optional[time]:
    m = TIME_RE.fullmatch(token)
    if not m:
        return None
    hour = int(m.group("hour"))
    minute = int(m.group("minute") or 0)
    hour = max(0, min(hour, 23))
    minute = max(0, min(minute, 59))
    return time(hour=hour, minute=minute)


def parse_time_token(raw: str, is_end: bool = False) -> tuple[Optional[time], bool]:
    s = raw.strip()
    end_next_day = False
    if s.startswith("翌"):
        end_next_day = True
        s = s[1:]
    if s.startswith("深夜"):
        end_next_day = True or end_next_day
        s = s.replace("深夜", "")
    t = parse_hhmm(s)
    if is_end and t and (raw.startswith("深夜") or raw.startswith("翌")):
        end_next_day = True
    return t, end_next_day


def extract_dow_set(segment: str) -> tuple[Optional[set[int]], bool]:
    includes_holidays = False
    days: Optional[set[int]] = None

    m = re.search(
        r"(月|火|水|木|金|土|日)\s*[～~\-〜]\s*(月|火|水|木|金|土|日)", segment
    )
    if m:
        start = DOW_MAP[m.group(1)]
        end = DOW_MAP[m.group(2)]
        if start <= end:
            days = set(range(start, end + 1))
        else:
            days = set(list(range(start, 7)) + list(range(0, end + 1)))

    tokens = re.findall(r"(月|火|水|木|金|土|日)曜", segment)
    if tokens:
        token_set = {DOW_MAP[t] for t in tokens}
        days = token_set if days is None else days.intersection(token_set)

    if "平日" in segment:
        days = WEEKDAY_SET if days is None else days.intersection(WEEKDAY_SET)
    if "土日" in segment or re.search(r"土[・・,、]?日", segment):
        weekend = WEEKEND_SET
        days = weekend if days is None else days.intersection(weekend)
    if "祝日" in segment or "祝" in segment:
        includes_holidays = True
        if re.search(r"日\s*[・,、/]\s*祝", segment):
            day = {DOW_MAP["日"]}
            days = day if days is None else days.intersection(day)

    return (set(days) if days is not None else None, includes_holidays)


def extract_month_ranges(segment: str) -> list[MonthRange]:
    ranges: list[MonthRange] = []
    for m in re.finditer(
        r"\(?(?P<s>\d{1,2})\s*[～~\-〜]\s*(?P<e>\d{1,2})月\)?", segment
    ):
        s = int(m.group("s"))
        e = int(m.group("e"))
        ranges.append(MonthRange(start_month=s, end_month=e))
    return ranges


def _split_statements(text: str) -> list[str]:
    parts = re.split(r"(?:(?<=\))|(?<=\d))\s*[、,]\s*", text)
    return [p.strip() for p in parts if p.strip()]


def _split_windows(segment: str) -> list[str]:
    parts = re.split(r"\s*[／/，,]\s*", segment)
    if len(parts) == 1 and "～" in segment:
        time_patterns = re.findall(
            r"[^\s]*\d{1,2}:\d{2}[～~\-〜]\d{1,2}:\d{2}[^\s]*", segment
        )
        if len(time_patterns) > 1:
            parts = re.split(r"\s+(?=[^\s]*\d{1,2}:\d{2})", segment)
    return [p.strip() for p in parts if p.strip()]


def extract_last_admission(segment: str) -> Optional[time]:
    m = re.search(r"最終?受付\s*(深夜)?(翌)?\s*(\d{1,2}[:：]?\d{0,2})", segment)
    if m:
        token = m.group(3).replace("：", ":")
        if ":" not in token:
            token = f"{int(token)}:00"
        t, _ = parse_time_token(("深夜" if m.group(1) else "") + token, is_end=True)
        return t
    m2 = re.search(r"受付\s*(深夜)?(翌)?\s*(\d{1,2}[:：]?\d{0,2})", segment)
    if m2:
        token = m2.group(3).replace("：", ":")
        if ":" not in token:
            token = f"{int(token)}:00"
        t, _ = parse_time_token(("深夜" if m2.group(1) else "") + token, is_end=True)
        return t
    return None


def parse_usage_time(value: Optional[str]) -> UsageTimeParsed:
    """Parse a Japanese usage time string into structured UsageTimeParsed."""
    raw = value
    normalized = normalize_text(value)
    result = UsageTimeParsed(raw=raw, normalized=normalized)

    if normalized is None or normalized == "" or normalized.lower() in {"none", "null"}:
        result.unknown_or_non_time = True
        return result

    if "休業中" in normalized:
        result.is_closed = True
        return result
    if "滞在中" in normalized:
        result.windows.append(
            TimeWindow(start_time=time(0, 0), end_time=time(0, 0), end_next_day=True)
        )
        return result
    if "24時間" in normalized or "24 時間" in normalized:
        result.windows.append(
            TimeWindow(start_time=time(0, 0), end_time=time(0, 0), end_next_day=True)
        )
        return result

    if "要問合せ" in normalized or "要確認" in normalized:
        result.requires_inquiry = True
    if "要予約" in normalized or "完全予約" in normalized:
        result.requires_reservation = True

    m_hotel = re.search(
        r"IN\s*(\d{1,2}:\d{2})\s*OUT\s*(\d{1,2}:\d{2})", normalized, re.I
    )
    if not m_hotel:
        m_hotel = re.search(
            r"IN\s*(\d{1,2}:\d{2})\s*.*?OUT\s*(\d{1,2}:\d{2})", normalized, re.I
        )
    if m_hotel:
        result.check_in_time = parse_hhmm(m_hotel.group(1))
        result.check_out_time = parse_hhmm(m_hotel.group(2))

    statements = _split_statements(normalized)
    if not statements:
        statements = [normalized]

    for statement in statements:
        month_ranges = extract_month_ranges(statement)
        for part in _split_windows(statement):
            part_days_set, part_includes_holidays = extract_dow_set(part)
            last_adm = extract_last_admission(part)

            part_norm = part
            part_norm = re.sub(
                r"受付\s*(深夜)?(翌)?\s*(\d{1,2}[:：]?\d{0,2})",
                lambda m: (
                    ("深夜" if m.group(1) else "")
                    + (
                        m.group(3).replace("：", ":")
                        if ":" in m.group(3)
                        else f"{int(m.group(3))}:00"
                    )
                ),
                part_norm,
            )

            if re.search(r"\d+\s*円", part_norm):
                result.notes.append(part)
                continue

            if "日没" in part_norm:
                start_m = re.search(r"(\d{1,2}:\d{2})\s*[～~\-〜]", part_norm)
                if start_m:
                    st, _ = parse_time_token(start_m.group(1))
                    prefix = part_norm[: start_m.start()]
                    local_days_set, local_includes_holidays = extract_dow_set(prefix)
                    result.windows.append(
                        TimeWindow(
                            start_time=st or time(0, 0),
                            end_time=None,
                            end_next_day=False,
                            days_of_week=(
                                set(local_days_set)
                                if local_days_set is not None
                                else (set(part_days_set) if part_days_set else None)
                            ),
                            month_ranges=list(month_ranges),
                            last_admission_time=last_adm,
                            includes_holidays=local_includes_holidays
                            or part_includes_holidays,
                            notes="ends at sunset",
                        )
                    )
                continue

            matched_any = False
            for m in re.finditer(
                r"(\d{1,2}:\d{2})\s*[～~\-〜]\s*(翌)?(深夜)?(\d{1,2}:\d{2})",
                part_norm,
            ):
                start_raw = m.group(1)
                end_prefix_yoku = bool(m.group(2))
                end_prefix_shinya = bool(m.group(3))
                end_raw = m.group(4)

                st, _ = parse_time_token(start_raw)
                et, end_next_day = parse_time_token(
                    ("翌" if end_prefix_yoku else "")
                    + ("深夜" if end_prefix_shinya else "")
                    + end_raw,
                    is_end=True,
                )
                if st is None or et is None:
                    continue

                if not end_next_day and et <= st:
                    end_next_day = True

                prefix = part_norm[: m.start()]
                local_days_set, local_includes_holidays = extract_dow_set(prefix)

                result.windows.append(
                    TimeWindow(
                        start_time=st,
                        end_time=et,
                        end_next_day=end_next_day,
                        days_of_week=(
                            set(local_days_set)
                            if local_days_set is not None
                            else (set(part_days_set) if part_days_set else None)
                        ),
                        month_ranges=list(month_ranges),
                        last_admission_time=last_adm,
                        includes_holidays=local_includes_holidays
                        or part_includes_holidays,
                    )
                )
                matched_any = True

            if matched_any:
                continue

            m2 = re.findall(
                r"\d{1,2}:\d{2}\s*[～~\-〜]\s*(?:翌|深夜)?\d{1,2}:\d{2}", part_norm
            )
            if m2:
                for rng in m2:
                    a, b = re.split(r"[～~\-〜]", rng)
                    b = b.strip()
                    st, _ = parse_time_token(a)
                    et, end_next_day = parse_time_token(b, is_end=True)
                    if st and et:
                        if not end_next_day and et <= st:
                            end_next_day = True
                        result.windows.append(
                            TimeWindow(
                                start_time=st,
                                end_time=et,
                                end_next_day=end_next_day,
                                days_of_week=(
                                    set(part_days_set) if part_days_set else None
                                ),
                                month_ranges=list(month_ranges),
                                last_admission_time=last_adm,
                                includes_holidays=part_includes_holidays,
                            )
                        )
                continue

            if part.strip():
                result.notes.append(part.strip())

    if not result.windows and not result.is_closed:
        result.unknown_or_non_time = True

    return result


__all__ = [
    "MonthRange",
    "TimeWindow",
    "UsageTimeParsed",
    "parse_usage_time",
    "HolidayService",
    "CachedJapanHolidayService",
    "get_holiday_service",
    "set_holiday_service",
    "is_holiday",
    "normalize_text",
    "DOW_MAP",
]
