def test_health_returns_200(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_response_structure(client):
    response = client.get("/api/v1/health")
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["service"] == "ekonlabs-ai-core"
    assert body["data"]["status"] == "ok"
    assert "timestamp" in body["meta"]
