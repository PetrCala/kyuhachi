"""OSRM-based walking distance matrix with local caching.

Uses the public OSRM demo server (routing.openstreetmap.de) with the foot
profile to compute real walking distances between onsen pairs.
Falls back to haversine × road_factor when OSRM is unavailable.
"""

from __future__ import annotations

import json
import math
import os
import time as time_mod
from typing import Optional

import numpy as np
import requests
from loguru import logger

from src.trail.models import OnsenNode, Segment

# OSRM public demo server with foot profile
OSRM_BASE_URL = "https://routing.openstreetmap.de/routed-foot"

# Max coordinates per OSRM Table API request on the demo server
OSRM_MAX_TABLE_SIZE = 100

# Rate limit: 1 request per second
OSRM_REQUEST_DELAY = 1.1  # Slightly over 1s to be safe


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km between two GPS coordinates."""
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


def build_haversine_matrix(
    nodes: list[OnsenNode], road_factor: float = 1.3
) -> np.ndarray:
    """Build distance matrix using haversine × road_factor (fallback)."""
    n = len(nodes)
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = (
                haversine(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon)
                * road_factor
            )
            matrix[i][j] = matrix[j][i] = d
    return matrix


def _osrm_table_request(
    coords: list[tuple[float, float]],
    sources: Optional[list[int]] = None,
    destinations: Optional[list[int]] = None,
) -> dict:
    """Make a single OSRM Table API request.

    Args:
        coords: List of (lon, lat) tuples (OSRM uses lon,lat order).
        sources: Indices into coords to use as sources (default: all).
        destinations: Indices into coords to use as destinations (default: all).

    Returns:
        JSON response dict with 'distances' and 'durations' matrices.
    """
    coords_str = ";".join(f"{lon},{lat}" for lon, lat in coords)
    url = f"{OSRM_BASE_URL}/table/v1/foot/{coords_str}"

    params = {"annotations": "distance,duration"}
    if sources is not None:
        params["sources"] = ";".join(str(i) for i in sources)
    if destinations is not None:
        params["destinations"] = ";".join(str(i) for i in destinations)

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    if data.get("code") != "Ok":
        raise RuntimeError(
            f"OSRM error: {data.get('code')} - {data.get('message', '')}"
        )

    return data


def _fetch_osrm_matrix_chunked(nodes: list[OnsenNode]) -> np.ndarray:
    """Fetch full NxN distance matrix from OSRM, chunking to stay under limits.

    The OSRM demo server limits the total number of coordinates per request
    to ~100. For N > 100, we use block decomposition: split nodes into groups
    of ~50, then request each (src_group, dst_group) pair separately with
    combined coordinates fitting within the limit.
    """
    n = len(nodes)
    all_coords = [(node.lon, node.lat) for node in nodes]

    if n <= OSRM_MAX_TABLE_SIZE:
        logger.info(f"OSRM: requesting {n}x{n} matrix in single call...")
        data = _osrm_table_request(all_coords)
        distances = data["distances"]
        return np.array(distances) / 1000.0  # meters -> km

    # Split nodes into groups; each pair of groups must fit in 100 coords
    group_size = OSRM_MAX_TABLE_SIZE // 2
    groups: list[list[int]] = []
    for start in range(0, n, group_size):
        groups.append(list(range(start, min(start + group_size, n))))

    num_blocks = len(groups) ** 2
    matrix = np.zeros((n, n))

    logger.info(
        f"OSRM: requesting {n}x{n} matrix in {num_blocks} blocks "
        f"({len(groups)} groups of ~{group_size})..."
    )

    block_num = 0
    for src_group in groups:
        for dst_group in groups:
            block_num += 1

            if src_group == dst_group:
                # Diagonal block: same coords as source and destination
                combined_coords = [all_coords[i] for i in src_group]
                src_indices = list(range(len(src_group)))
                dst_indices = list(range(len(src_group)))
            else:
                # Off-diagonal: source coords then destination coords
                combined_coords = (
                    [all_coords[i] for i in src_group]
                    + [all_coords[i] for i in dst_group]
                )
                src_indices = list(range(len(src_group)))
                dst_indices = list(range(
                    len(src_group), len(src_group) + len(dst_group)
                ))

            logger.debug(
                f"  Block {block_num}/{num_blocks}: "
                f"[{src_group[0]}..{src_group[-1]}] x "
                f"[{dst_group[0]}..{dst_group[-1]}] "
                f"({len(combined_coords)} coords)"
            )

            data = _osrm_table_request(
                combined_coords,
                sources=src_indices,
                destinations=dst_indices,
            )

            distances = data["distances"]
            for i, src_node_idx in enumerate(src_group):
                for j, dst_node_idx in enumerate(dst_group):
                    val = distances[i][j]
                    if val is None:
                        # Unreachable pair - haversine fallback
                        val = (
                            haversine(
                                nodes[src_node_idx].lat, nodes[src_node_idx].lon,
                                nodes[dst_node_idx].lat, nodes[dst_node_idx].lon,
                            ) * 1.3 * 1000
                        )
                    matrix[src_node_idx][dst_node_idx] = val / 1000.0

            if block_num < num_blocks:
                time_mod.sleep(OSRM_REQUEST_DELAY)

    return matrix


def _cache_key(nodes: list[OnsenNode]) -> str:
    """Generate a cache key from the set of node coordinates."""
    coords = sorted((n.id, round(n.lat, 6), round(n.lon, 6)) for n in nodes)
    return json.dumps(coords)


def _load_cache(cache_path: str, nodes: list[OnsenNode]) -> Optional[np.ndarray]:
    """Load cached distance matrix if it matches the current node set."""
    if not os.path.exists(cache_path):
        return None

    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if data.get("key") != _cache_key(nodes):
            logger.info("OSRM cache exists but node set changed, will re-fetch")
            return None

        matrix = np.array(data["matrix"])
        if matrix.shape != (len(nodes), len(nodes)):
            logger.warning("OSRM cache matrix shape mismatch, will re-fetch")
            return None

        logger.info(f"Loaded OSRM distance matrix from cache ({cache_path})")
        return matrix
    except Exception as e:
        logger.warning(f"Failed to load OSRM cache: {e}")
        return None


def _save_cache(cache_path: str, nodes: list[OnsenNode], matrix: np.ndarray) -> None:
    """Save distance matrix to cache file."""
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    data = {
        "key": _cache_key(nodes),
        "node_count": len(nodes),
        "node_ids": [n.id for n in nodes],
        "matrix": matrix.tolist(),
    }
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    logger.info(f"Saved OSRM distance matrix to cache ({cache_path})")


def _osrm_route_request(
    from_lon: float, from_lat: float, to_lon: float, to_lat: float,
    reject_ferry: bool = True,
) -> Optional[list[list[float]]]:
    """Fetch walking route geometry between two points.

    Returns list of [lat, lon] pairs (Folium order), or None on failure
    or if the route uses a ferry (when reject_ferry=True).
    """
    url = (
        f"{OSRM_BASE_URL}/route/v1/foot/"
        f"{from_lon},{from_lat};{to_lon},{to_lat}"
    )
    params = {"overview": "full", "geometries": "geojson", "steps": "true"}

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        return None

    route = data["routes"][0]

    # Check for ferry usage in route steps
    if reject_ferry:
        for leg in route.get("legs", []):
            for step in leg.get("steps", []):
                if step.get("mode") == "ferry":
                    ferry_name = step.get("name", "unknown ferry")
                    ferry_km = step.get("distance", 0) / 1000
                    logger.debug(
                        f"Route rejected: uses ferry '{ferry_name}' "
                        f"({ferry_km:.1f} km)"
                    )
                    return None

    # GeoJSON coordinates are [lon, lat]; flip to [lat, lon] for Folium
    coords = route["geometry"]["coordinates"]
    return [[lat, lon] for lon, lat in coords]


def _geometry_cache_key(
    from_lat: float, from_lon: float, to_lat: float, to_lon: float
) -> str:
    return f"{from_lat:.6f},{from_lon:.6f};{to_lat:.6f},{to_lon:.6f}"


def fetch_route_geometries(
    segments: list[Segment],
    cache_path: str = "",
    refresh: bool = False,
) -> None:
    """Fetch OSRM walking route geometries for all segments.

    Populates each segment's `geometry` field in-place.
    Uses a persistent cache to avoid re-fetching.
    """
    # Load existing cache
    cache: dict[str, list[list[float]]] = {}
    if cache_path and not refresh and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
            logger.info(f"Loaded {len(cache)} cached route geometries")
        except Exception as e:
            logger.warning(f"Failed to load geometry cache: {e}")

    to_fetch: list[tuple[int, str]] = []  # (segment index, cache key)
    for i, seg in enumerate(segments):
        key = _geometry_cache_key(seg.from_lat, seg.from_lon, seg.to_lat, seg.to_lon)
        if key in cache:
            seg.geometry = cache[key]
        else:
            to_fetch.append((i, key))

    if not to_fetch:
        logger.info("All route geometries loaded from cache")
        return

    logger.info(
        f"Fetching {len(to_fetch)} route geometries from OSRM "
        f"({len(segments) - len(to_fetch)} cached)..."
    )

    fetched = 0
    for idx, (seg_i, key) in enumerate(to_fetch):
        seg = segments[seg_i]
        try:
            geometry = _osrm_route_request(
                seg.from_lon, seg.from_lat, seg.to_lon, seg.to_lat
            )
            if geometry:
                seg.geometry = geometry
                cache[key] = geometry
                fetched += 1
        except Exception as e:
            logger.debug(f"Route geometry failed for segment {seg_i}: {e}")

        if idx < len(to_fetch) - 1:
            time_mod.sleep(OSRM_REQUEST_DELAY)

    logger.info(f"Fetched {fetched}/{len(to_fetch)} route geometries")

    # Save updated cache
    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f)
        logger.info(f"Saved geometry cache ({len(cache)} routes)")


def _check_route_for_ferry(
    from_lon: float, from_lat: float,
    to_lon: float, to_lat: float,
) -> bool:
    """Check if an OSRM walking route between two points uses a ferry.

    Returns True if the route uses a ferry, False otherwise.
    """
    url = (
        f"{OSRM_BASE_URL}/route/v1/foot/"
        f"{from_lon},{from_lat};{to_lon},{to_lat}"
    )
    params = {"overview": "false", "steps": "true"}

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        return False

    for leg in data["routes"][0].get("legs", []):
        for step in leg.get("steps", []):
            if step.get("mode") == "ferry":
                return True
    return False


# Penalty distance for pairs that require a ferry (effectively
# unreachable on foot).  Must be large enough that the optimizer
# never chooses this edge, but not so large it overflows int32
# when converted to metres inside OR-Tools.
FERRY_PENALTY_KM = 50_000.0


def detect_ferry_pairs(
    nodes: list[OnsenNode],
    matrix: np.ndarray,
    route_indices: list[int] | None = None,
) -> list[tuple[int, int]]:
    """Detect node pairs whose OSRM route uses a ferry.

    If route_indices is given, only consecutive pairs along that
    route are checked (fast).  Otherwise every matrix entry that
    looks plausible is checked (slow — N² calls).

    Returns list of (i, j) index pairs that use ferries.
    """
    pairs_to_check: list[tuple[int, int]] = []

    if route_indices is not None:
        # Only check consecutive pairs in the route
        for k in range(len(route_indices) - 1):
            i, j = route_indices[k], route_indices[k + 1]
            pairs_to_check.append((i, j))
    else:
        # Check all pairs — very slow, use sparingly
        n = len(nodes)
        for i in range(n):
            for j in range(i + 1, n):
                if matrix[i][j] < FERRY_PENALTY_KM:
                    pairs_to_check.append((i, j))

    if not pairs_to_check:
        return []

    logger.info(
        f"Checking {len(pairs_to_check)} node pairs "
        f"for ferry usage..."
    )

    ferry_pairs: list[tuple[int, int]] = []
    for idx, (i, j) in enumerate(pairs_to_check):
        try:
            uses_ferry = _check_route_for_ferry(
                nodes[i].lon, nodes[i].lat,
                nodes[j].lon, nodes[j].lat,
            )
            if uses_ferry:
                ferry_pairs.append((i, j))
                logger.warning(
                    f"Ferry detected: {nodes[i].name} → "
                    f"{nodes[j].name} "
                    f"({matrix[i][j]:.1f} km)"
                )
        except Exception as e:
            logger.debug(
                f"Ferry check failed for "
                f"{nodes[i].name} → {nodes[j].name}: {e}"
            )

        if idx < len(pairs_to_check) - 1:
            time_mod.sleep(OSRM_REQUEST_DELAY)

    logger.info(
        f"Ferry check complete: {len(ferry_pairs)} of "
        f"{len(pairs_to_check)} pairs use ferries"
    )
    return ferry_pairs


def penalize_ferry_pairs(
    matrix: np.ndarray,
    ferry_pairs: list[tuple[int, int]],
) -> np.ndarray:
    """Set ferry pair distances to a huge penalty (both directions)."""
    matrix = matrix.copy()
    for i, j in ferry_pairs:
        matrix[i][j] = FERRY_PENALTY_KM
        matrix[j][i] = FERRY_PENALTY_KM
    return matrix


def build_distance_matrix(
    nodes: list[OnsenNode],
    use_osrm: bool = True,
    cache_path: str = "",
    road_factor: float = 1.3,
    refresh: bool = False,
) -> np.ndarray:
    """Build the NxN walking distance matrix.

    Uses OSRM walking routes when enabled, with local caching.
    Falls back to haversine × road_factor.
    """
    if not use_osrm:
        logger.info(f"Building haversine distance matrix (factor={road_factor})...")
        return build_haversine_matrix(nodes, road_factor)

    # Try cache first
    if cache_path and not refresh:
        cached = _load_cache(cache_path, nodes)
        if cached is not None:
            return cached

    # Fetch from OSRM
    try:
        logger.info("Fetching walking distances from OSRM...")
        matrix = _fetch_osrm_matrix_chunked(nodes)

        # Save to cache
        if cache_path:
            _save_cache(cache_path, nodes, matrix)

        return matrix
    except Exception as e:
        logger.error(f"OSRM request failed: {e}")
        logger.warning(f"Falling back to haversine × {road_factor}")
        return build_haversine_matrix(nodes, road_factor)
