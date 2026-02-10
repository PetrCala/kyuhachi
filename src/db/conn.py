"""Database connection management."""

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session


class DatabaseConnection:
    """Manages database connections and sessions.

    Supports multiple simultaneous connections (e.g. dev + test),
    connection pooling, and session lifecycle management.
    """

    def __init__(self) -> None:
        self._engines: dict[str, Engine] = {}
        self._session_factories: dict[str, sessionmaker[Session]] = {}

    def _ensure_connection(self, url: str, echo: bool = False) -> None:
        """Ensure a connection exists for the given URL."""
        if url not in self._engines:
            engine = create_engine(url, echo=echo)
            self._engines[url] = engine
            self._session_factories[url] = sessionmaker(
                bind=engine, autoflush=False, autocommit=False
            )

    def get_engine(self, url: str) -> Engine:
        """Get the SQLAlchemy engine for a given URL."""
        self._ensure_connection(url)
        return self._engines[url]

    @contextmanager
    def get_session(self, url: str) -> Generator[Session]:
        """Get a database session for the specified URL.

        Yields:
            SQLAlchemy Session object that auto-closes on exit.
        """
        self._ensure_connection(url)
        session = self._session_factories[url]()
        try:
            yield session
        finally:
            session.close()

    def dispose(self, url: str) -> None:
        """Dispose of a connection and its engine."""
        if url in self._engines:
            self._engines[url].dispose()
            del self._engines[url]
            del self._session_factories[url]

    def dispose_all(self) -> None:
        """Dispose of all connections."""
        for url in list(self._engines.keys()):
            self.dispose(url)


# Global singleton
_db_manager = DatabaseConnection()


@contextmanager
def get_db(url: str) -> Generator[Session]:
    """Convenience context manager for getting a database session.

    Usage:
        from src.db.conn import get_db
        from src.config import get_database_config

        config = get_database_config()
        with get_db(url=config.url) as db:
            results = db.query(Onsen).all()
    """
    if not url.startswith("sqlite://"):
        raise ValueError(f"Expected a sqlite:// URL, got: {url}")

    with _db_manager.get_session(url) as session:
        yield session


def get_engine(url: str) -> Engine:
    """Get the SQLAlchemy engine for a given URL."""
    return _db_manager.get_engine(url)
