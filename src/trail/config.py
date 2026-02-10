"""Centralized trail configuration.

Single source of truth for all trail planning parameters.
Every trail module imports from here instead of defining its own constants.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
import os

from src.paths import PATHS


@dataclass
class TrailConfig:
    """All configurable parameters for trail planning."""

    # Walking parameters
    walking_speed_kmh: float = 4.5
    target_daily_km: float = 34.0
    max_daily_km: float = 55.0
    daily_start_time: time = time(7, 0)
    onsen_visit_minutes: int = 45

    # Optimization
    target_onsen_count: int = 100  # Buffer above 88 for closures
    solver_time_limit_seconds: int = 60

    # Trip dates
    start_date: date = field(default_factory=lambda: date(2026, 9, 30))
    end_date: date = field(default_factory=lambda: date(2026, 12, 3))

    # Routing
    use_osrm: bool = True
    osrm_cache_path: str = field(
        default_factory=lambda: os.path.join(
            PATHS.DATA_DIR, "cache", "osrm_distances.json",
        )
    )
    osrm_geometry_cache_path: str = field(
        default_factory=lambda: os.path.join(
            PATHS.DATA_DIR, "cache", "osrm_geometries.json",
        )
    )
    haversine_road_factor: float = 1.3
    refresh_distances: bool = False  # Force re-fetch from OSRM

    # Data classification — excluded onsen IDs
    island_ids: frozenset[int] = frozenset({
        130, 176, 219, 237,          # Remote islands
        90,                           # Amakusa (OSRM can't route)
        116,                          # Sakurajima (OSRM can't route)
        165, 24, 175, 228, 12, 11,   # Shimabara / Unzen area
        217, 96, 246, 205,            # User-excluded (Miyazaki south coast)
    })
    beppu_pattern: str = "別府"

    # Output
    output_dir: str = field(
        default_factory=lambda: os.path.join(PATHS.PROJECT_ROOT, "output")
    )

    @property
    def total_days_available(self) -> int:
        return (self.end_date - self.start_date).days + 1

    @property
    def buffer_count(self) -> int:
        return max(0, self.target_onsen_count - 88)
