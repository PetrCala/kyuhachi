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

from src.trail.models import OnsenNode

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

    The OSRM demo server limits table requests to ~100 coordinates.
    For N > 100, we batch sources in chunks while using all N as destinations.
    """
    n = len(nodes)
    # OSRM uses lon,lat order
    all_coords = [(node.lon, node.lat) for node in nodes]

    if n <= OSRM_MAX_TABLE_SIZE:
        # Single request for the full matrix
        logger.info(f"OSRM: requesting {n}x{n} matrix in single call...")
        data = _osrm_table_request(all_coords)
        distances = data["distances"]
        return np.array(distances) / 1000.0  # meters → km

    # Chunked: split sources into batches
    chunk_size = OSRM_MAX_TABLE_SIZE - 1  # Leave room
    matrix = np.zeros((n, n))
    num_chunks = math.ceil(n / chunk_size)

    logger.info(f"OSRM: requesting {n}x{n} matrix in {num_chunks} chunks...")

    for chunk_idx in range(num_chunks):
        start = chunk_idx * chunk_size
        end = min(start + chunk_size, n)
        source_indices = list(range(start, end))

        logger.info(
            f"  Chunk {chunk_idx + 1}/{num_chunks}: "
            f"sources [{start}..{end - 1}] × {n} destinations"
        )

        data = _osrm_table_request(
            all_coords,
            sources=source_indices,
            destinations=list(range(n)),
        )

        distances = data["distances"]  # (end-start) × n matrix
        for i, src_idx in enumerate(source_indices):
            for j in range(n):
                val = distances[i][j]
                if val is None:
                    # OSRM returns null for unreachable pairs - use haversine fallback
                    val = (
                        haversine(
                            nodes[src_idx].lat,
                            nodes[src_idx].lon,
                            nodes[j].lat,
                            nodes[j].lon,
                        )
                        * 1.3
                        * 1000
                    )  # km → meters
                matrix[src_idx][j] = val / 1000.0  # meters → km

        # Rate limit
        if chunk_idx < num_chunks - 1:
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
