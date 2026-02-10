"""Data models for trail optimization."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
from typing import Optional

from src.trail.parsers.usage_time import UsageTimeParsed
from src.trail.parsers.closed_days import ClosedDaysParsed


@dataclass
class OnsenNode:
    """A single onsen as a node in the trail graph."""

    id: int
    name: str
    area_name: str
    lat: float
    lon: float
    prefecture: str
    address: str
    is_mandatory: bool = False  # True for Beppu onsens
    is_excluded: bool = False  # True for islands, permanently closed
    exclude_reason: str = ""
    usage_time: Optional[UsageTimeParsed] = None
    closed_days: Optional[ClosedDaysParsed] = None
    raw_business_hours: str = ""

    @property
    def display_name(self) -> str:
        if self.area_name and self.name:
            return f"{self.area_name}：{self.name}"
        return self.name or self.area_name or f"Onsen #{self.id}"


@dataclass
class Segment:
    """A walking segment between two points."""

    from_name: str
    from_lat: float
    from_lon: float
    to_name: str
    to_lat: float
    to_lon: float
    distance_km: float
    estimated_hours: float


@dataclass
class DayPlan:
    """A single day's plan."""

    day_number: int
    date: date
    segments: list[Segment] = field(default_factory=list)
    onsens_visited: list[OnsenNode] = field(default_factory=list)
    visit_times: list[Optional[time]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    overnight_type: str = "tent"  # "tent", "onsen", "hotel"
    overnight_name: str = ""

    @property
    def walking_km(self) -> float:
        return sum(s.distance_km for s in self.segments)

    @property
    def walking_hours(self) -> float:
        return sum(s.estimated_hours for s in self.segments)


@dataclass
class Trail:
    """Complete trail plan."""

    ordered_onsens: list[OnsenNode] = field(default_factory=list)
    days: list[DayPlan] = field(default_factory=list)
    start_point: tuple[float, float] = (0.0, 0.0)
    start_name: str = ""
    end_point: tuple[float, float] = (0.0, 0.0)
    end_name: str = "Beppu"
    excluded_onsens: list[OnsenNode] = field(default_factory=list)
    skipped_onsens: list[OnsenNode] = field(default_factory=list)

    @property
    def total_distance_km(self) -> float:
        return sum(d.walking_km for d in self.days)

    @property
    def total_days(self) -> int:
        return len(self.days)

    @property
    def total_onsens(self) -> int:
        return len(self.ordered_onsens)

    @property
    def prefectures_visited(self) -> set[str]:
        return {o.prefecture for o in self.ordered_onsens if o.prefecture}
