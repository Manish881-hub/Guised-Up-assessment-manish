import os

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Guised Up Embedding Service")

model = SentenceTransformer("all-MiniLM-L6-v2")
DIMENSIONS = model.get_sentence_embedding_dimension()


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to embed")


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class HealthResponse(BaseModel):
    status: str


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest):
    """Generate a normalized embedding vector for the given text."""
    vec = model.encode([request.text], normalize_embeddings=True)[0]
    return EmbedResponse(embedding=vec.tolist(), dimensions=DIMENSIONS)


@app.get("/health", response_model=HealthResponse)
def health():
    """Health check endpoint."""
    return HealthResponse(status="ok")


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host=host, port=port)
