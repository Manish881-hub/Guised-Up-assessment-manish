"""
Lightweight embedding sidecar for Guised Up.

Deliberately a separate small service rather than baked into Laravel: Python
has the mature ML ecosystem (sentence-transformers), and keeping it isolated
means it can be redeployed, scaled, or swapped independently of the main API
(see TSD §2, §8).

Run: uvicorn main:app --host 0.0.0.0 --port 8001
"""
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Guised Up Embedding Service")

# all-MiniLM-L6-v2: 384 dimensions, ~80MB, fast enough for CPU inference
# (~10-50ms per short text). Chosen over a larger model since latency on the
# synchronous POST /api/posts path matters more than marginal recall gains.
model = SentenceTransformer("all-MiniLM-L6-v2")


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
    vector = model.encode(request.text, normalize_embeddings=True).tolist()
    return EmbedResponse(embedding=vector, dimensions=len(vector))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
