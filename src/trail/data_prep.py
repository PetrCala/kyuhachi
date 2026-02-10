"""Data preparation: load onsens, classify, build distance matrix."""

from __future__ import annotations

import math

import numpy as np
from loguru import logger

from src.config import get_database_config
from src.db.conn import get_db
from src.db.models import Onsen
from src.trail.models import OnsenNode
from src.trail.hours_adapter import parse_business_hours


# Haversine distance in km
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Island onsen IDs (unreachable on foot)
ISLAND_IDS = {176, 237, 130, 219}

# Road factor: multiply haversine distance by this to approximate actual walking distance
ROAD_FACTOR = 1.3

# Beppu address pattern
BEPPU_PATTERN = "別府"


def load_onsens(db_url: str | None = None) -> list[OnsenNode]:
    """Load all onsens from the database and classify them."""
    if db_url is None:
        config = get_database_config()
        db_url = config.url

    nodes: list[OnsenNode] = []

    with get_db(url=db_url) as session:
        onsens = session.query(Onsen).all()

        for o in onsens:
            parsed = parse_business_hours(o.business_hours)

            node = OnsenNode(
                id=o.id,
                name=o.facility_name or "",
                area_name=o.onsen_area_name or "",
                lat=o.latitude,
                lon=o.longitude,
                prefecture=o.prefecture or "",
                address=o.address or "",
                usage_time=parsed.usage_time,
                closed_days=parsed.closed_days,
                raw_business_hours=o.business_hours or "",
            )

            # Classify mandatory (Beppu)
            if BEPPU_PATTERN in (o.address or ""):
                node.is_mandatory = True

            # Classify excluded (islands)
            if o.id in ISLAND_IDS:
                node.is_excluded = True
                node.exclude_reason = "island (unreachable on foot)"

            # Classify excluded (permanently closed)
            if parsed.usage_time.is_closed:
                node.is_excluded = True
                node.exclude_reason = "permanently closed"

            nodes.append(node)

    mandatory = [n for n in nodes if n.is_mandatory]
    excluded = [n for n in nodes if n.is_excluded]
    eligible = [n for n in nodes if not n.is_excluded]

    logger.info(
        f"Loaded {len(nodes)} onsens: "
        f"{len(mandatory)} mandatory (Beppu), "
        f"{len(excluded)} excluded, "
        f"{len(eligible)} eligible"
    )

    return nodes


def get_eligible(nodes: list[OnsenNode]) -> list[OnsenNode]:
    """Return only eligible (non-excluded) onsens."""
    return [n for n in nodes if not n.is_excluded]


def get_mandatory(nodes: list[OnsenNode]) -> list[OnsenNode]:
    """Return mandatory (Beppu) onsens."""
    return [n for n in nodes if n.is_mandatory]


def build_distance_matrix(
    nodes: list[OnsenNode], road_factor: float = ROAD_FACTOR
) -> np.ndarray:
    """Build a symmetric distance matrix (km) for a list of onsen nodes.

    Uses haversine distance multiplied by road_factor.
    """
    n = len(nodes)
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon)
            matrix[i][j] = matrix[j][i] = d * road_factor
    return matrix


def find_beppu_centroid(nodes: list[OnsenNode]) -> tuple[float, float]:
    """Calculate the centroid of Beppu onsens."""
    beppu = [n for n in nodes if n.is_mandatory]
    if not beppu:
        return (33.28, 131.50)  # Default Beppu coordinates
    lat = sum(n.lat for n in beppu) / len(beppu)
    lon = sum(n.lon for n in beppu) / len(beppu)
    return (lat, lon)


def find_nearest_node(
    lat: float, lon: float, nodes: list[OnsenNode]
) -> tuple[OnsenNode, float]:
    """Find the nearest node to a given point."""
    best = None
    best_dist = float("inf")
    for n in nodes:
        d = haversine(lat, lon, n.lat, n.lon)
        if d < best_dist:
            best_dist = d
            best = n
    return best, best_dist  # type: ignore[return-value]


def print_summary(nodes: list[OnsenNode]) -> None:
    """Print a summary of loaded onsen data."""
    eligible = get_eligible(nodes)
    mandatory = get_mandatory(nodes)
    excluded = [n for n in nodes if n.is_excluded]

    print(f"\n{'='*60}")
    print(f"Onsen Data Summary")
    print(f"{'='*60}")
    print(f"Total onsens:     {len(nodes)}")
    print(f"Eligible:         {len(eligible)}")
    print(f"Mandatory (Beppu):{len(mandatory)}")
    print(f"Excluded:         {len(excluded)}")

    for n in excluded:
        print(f"  - #{n.id} {n.display_name}: {n.exclude_reason}")

    # Prefecture breakdown
    from collections import Counter
    pref_counts = Counter(n.prefecture for n in eligible)
    print(f"\nEligible by prefecture:")
    for pref, count in pref_counts.most_common():
        print(f"  {pref}: {count}")

    # Lat range
    lats = [n.lat for n in eligible]
    print(f"\nLatitude range: {min(lats):.2f}°N to {max(lats):.2f}°N")
    print(f"North-south span: ~{haversine(min(lats), 131, max(lats), 131):.0f} km")

    # Hours parsing stats
    has_windows = sum(1 for n in eligible if n.usage_time and n.usage_time.windows)
    unknown = sum(
        1 for n in eligible if n.usage_time and n.usage_time.unknown_or_non_time
    )
    print(f"\nHours parsed:     {has_windows}/{len(eligible)} have time windows")
    print(f"Unknown hours:    {unknown}")
    print(f"{'='*60}\n")
