import logging
from contextlib import contextmanager

from neo4j import GraphDatabase

from app.config import settings

logger = logging.getLogger(__name__)

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


@contextmanager
def get_session():
    driver = get_driver()
    session = driver.session()
    try:
        yield session
    finally:
        session.close()


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


def init_constraints():
    with get_session() as session:
        session.run("CREATE CONSTRAINT FOR (a:Article) REQUIRE a.id IS UNIQUE IF NOT EXISTS")
        session.run("CREATE CONSTRAINT FOR (t:Topic) REQUIRE t.name IS UNIQUE IF NOT EXISTS")
        session.run("CREATE CONSTRAINT FOR (k:Keyword) REQUIRE k.name IS UNIQUE IF NOT EXISTS")
        logger.info("Neo4j constraints ensured")
