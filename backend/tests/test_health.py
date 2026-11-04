from fastapi.testclient import TestClient


async def test_health_sends_200(client: TestClient) -> None:
    response = client.get("/api/health-check/")  
    assert response.status_code == 200
