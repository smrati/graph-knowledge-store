from pydantic import BaseModel


class GraphNeighbor(BaseModel):
    id: str
    title: str
    shared_nodes: int
    connection_type: str


class GraphNeighborsResponse(BaseModel):
    article_id: str
    neighbors: list[GraphNeighbor]


class GraphNode(BaseModel):
    id: str
    label: str
    name: str | None = None
    title: str | None = None
    type: str | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str


class SubgraphResponse(BaseModel):
    article_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class GraphStatsResponse(BaseModel):
    articles: int
    topics: int
    keywords: int
    entities: int
