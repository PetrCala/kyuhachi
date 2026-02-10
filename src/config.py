"""Database environment configuration.

Supports multiple environments (dev, prod, test) with priority resolution:
1. Explicit path override (--database /path/to/db.db)
2. CLI flag (--env prod)
3. KYUSHU_ENV environment variable
4. Default: dev
"""

import os
from enum import Enum
from dataclasses import dataclass

from loguru import logger

from src.paths import PATHS


class DatabaseEnvironment(Enum):
    """Database environment types."""

    DEV = "dev"
    PROD = "prod"
    TEST = "test"


@dataclass
class DatabaseConfig:
    """Database configuration for a specific environment."""

    env: DatabaseEnvironment
    url: str
    path: str | None
    is_prod: bool

    def get_display_name(self) -> str:
        """Get human-readable display name for this environment."""
        return "PRODUCTION" if self.is_prod else self.env.value.upper()


def get_database_path(env: DatabaseEnvironment) -> str | None:
    """Get filesystem path for a database environment."""
    if env == DatabaseEnvironment.DEV:
        return PATHS.DB_PATH_DEV
    elif env == DatabaseEnvironment.PROD:
        return PATHS.DB_PATH_PROD
    elif env == DatabaseEnvironment.TEST:
        return None  # In-memory database
    else:
        raise ValueError(f"Unknown environment: {env}")


def get_database_url_for_env(env: DatabaseEnvironment) -> str:
    """Get SQLAlchemy database URL for an environment."""
    if env == DatabaseEnvironment.TEST:
        return "sqlite:///:memory:"

    path = get_database_path(env)
    if path is None:
        raise ValueError(f"No database path for environment: {env}")

    return f"sqlite:///{path}"


def get_database_config(
    env_override: str | None = None,
    path_override: str | None = None,
) -> DatabaseConfig:
    """Resolve database configuration with priority handling.

    Priority order:
    1. path_override (explicit database path)
    2. env_override (explicit environment: dev/prod)
    3. KYUSHU_ENV environment variable
    4. Default to 'dev'
    """
    # Priority 1: Explicit path override
    if path_override:
        abs_path = os.path.abspath(path_override)
        url = f"sqlite:///{abs_path}"
        logger.debug(f"Using explicit database path: {abs_path}")
        return DatabaseConfig(
            env=DatabaseEnvironment.DEV, url=url, path=abs_path, is_prod=False
        )

    # Priority 2: Explicit environment override (--env flag)
    if env_override:
        try:
            env = DatabaseEnvironment(env_override.lower())
        except ValueError as exc:
            raise ValueError(
                f"Invalid environment: {env_override}. Valid options: dev, prod"
            ) from exc
    # Priority 3: Environment variable
    elif os.getenv("KYUSHU_ENV"):
        env_str = os.getenv("KYUSHU_ENV", "").lower()
        try:
            env = DatabaseEnvironment(env_str)
        except ValueError as exc:
            raise ValueError(
                f"Invalid KYUSHU_ENV: {env_str}. Valid options: dev, prod"
            ) from exc
        logger.debug(f"Using environment from KYUSHU_ENV: {env.value}")
    # Priority 4: Default to dev
    else:
        env = DatabaseEnvironment.DEV
        logger.debug("Using default environment: dev")

    url = get_database_url_for_env(env)
    path = get_database_path(env)
    is_prod = env == DatabaseEnvironment.PROD

    return DatabaseConfig(env=env, url=url, path=path, is_prod=is_prod)
