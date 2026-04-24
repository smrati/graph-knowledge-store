import logging
import uuid

from app.graph.neo4j_client import get_session

logger = logging.getLogger(__name__)


def sync_article_to_graph(
    article_id: uuid.UUID,
    title: str,
    topics: list[str],
    keywords: list[str],
    entities: list[dict],
) -> None:
    with get_session() as session:
        session.run(
            "MERGE (a:Article {id: $id}) SET a.title = $title",
            id=str(article_id),
            title=title,
        )

        session.run(
            """
            MATCH (a:Article {id: $id})
            OPTIONAL MATCH (a)-[r:HAS_TOPIC]->()
            OPTIONAL MATCH (a)-[r2:HAS_KEYWORD]->()
            OPTIONAL MATCH (a)-[r3:MENTIONS_ENTITY]->()
            DELETE r, r2, r3
            """,
            id=str(article_id),
        )

        for topic in topics:
            session.run(
                """
                MERGE (t:Topic {name: $name})
                MERGE (a:Article {id: $id})
                MERGE (a)-[:HAS_TOPIC]->(t)
                """,
                name=topic,
                id=str(article_id),
            )

        for kw in keywords:
            session.run(
                """
                MERGE (k:Keyword {name: $name})
                MERGE (a:Article {id: $id})
                MERGE (a)-[:HAS_KEYWORD]->(k)
                """,
                name=kw,
                id=str(article_id),
            )

        for ent in entities:
            session.run(
                """
                MERGE (e:Entity {name: $name, type: $type})
                MERGE (a:Article {id: $id})
                MERGE (a)-[:MENTIONS_ENTITY]->(e)
                """,
                name=ent.get("name", ""),
                type=ent.get("type", "Concept"),
                id=str(article_id),
            )

        logger.info(f"Synced article {article_id} to graph: {len(topics)} topics, {len(keywords)} keywords, {len(entities)} entities")


def delete_article_from_graph(article_id: uuid.UUID) -> None:
    with get_session() as session:
        session.run(
            """
            MATCH (a:Article {id: $id})
            DETACH DELETE a
            """,
            id=str(article_id),
        )
        logger.info(f"Deleted article {article_id} from graph")


def get_article_neighbors(article_id: uuid.UUID, limit: int = 10) -> list[dict]:
    with get_session() as session:
        result = session.run(
            """
            MATCH (a:Article {id: $id})-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]->(n)<-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY]-(other:Article)
            WHERE other <> a
            WITH other, count(n) AS shared_nodes, labels(n) AS node_labels
            RETURN other.id AS id, other.title AS title,
                   shared_nodes,
                   [label IN node_labels WHERE label IN ['Topic', 'Keyword', 'Entity']][0] AS connection_type
            ORDER BY shared_nodes DESC
            LIMIT $limit
            """,
            id=str(article_id),
            limit=limit,
        )
        neighbors = []
        for record in result:
            neighbors.append(
                {
                    "id": record["id"],
                    "title": record["title"],
                    "shared_nodes": record["shared_nodes"],
                    "connection_type": record["connection_type"],
                }
            )
        return neighbors


def get_article_subgraph(article_id: uuid.UUID, depth: int = 2) -> dict:
    with get_session() as session:
        result = session.run(
            """
            MATCH path = (a:Article {id: $id})-[:HAS_TOPIC|HAS_KEYWORD|MENTIONS_ENTITY*1..2]-(connected)
            RETURN nodes(path) AS nodes, relationships(path) AS rels
            LIMIT 50
            """,
            id=str(article_id),
            depth=depth,
        )
        nodes_set = {}
        edges = []
        for record in result:
            for node in record["nodes"]:
                node_labels = list(node.labels)
                label = node_labels[0] if node_labels else "Unknown"
                props = dict(node)
                node_id = str(props.pop("id", ""))
                if not node_id:
                    node_id = str(props.get("name", ""))
                nodes_set[node_id] = {"id": node_id, "label": label, **props}

            for rel in record["rels"]:
                start_id = str(rel.start_node["id"]) if "id" in dict(rel.start_node) else str(rel.start_node.get("name", ""))
                end_id = str(rel.end_node["id"]) if "id" in dict(rel.end_node) else str(rel.end_node.get("name", ""))
                edges.append({"source": start_id, "target": end_id, "type": rel.type})

        return {"nodes": list(nodes_set.values()), "edges": edges}


def get_graph_stats() -> dict:
    with get_session() as session:
        articles = session.run("MATCH (a:Article) RETURN count(a) AS count").single()["count"]
        topics = session.run("MATCH (t:Topic) RETURN count(t) AS count").single()["count"]
        keywords = session.run("MATCH (k:Keyword) RETURN count(k) AS count").single()["count"]
        entities = session.run("MATCH (e:Entity) RETURN count(e) AS count").single()["count"]
        return {
            "articles": articles,
            "topics": topics,
            "keywords": keywords,
            "entities": entities,
        }
