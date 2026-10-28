from fastapi import FastAPI
from app.routes import router

app = FastAPI()

app.include_router(router=router, prefix="/api", tags=["API"])

def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

main()
