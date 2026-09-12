from fastapi import FastAPI # pyright: ignore[reportMissingImports]

app = FastAPI(
    title="Distributed Job Processing Platform",
    version="1.0.0",
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "backend",
    }