def test_health_tra_200_khi_db_song(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_tra_503_khi_db_chet(client, monkeypatch):
    from app.api import health

    def db_hong():
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health, "ping_db", db_hong)
    r = client.get("/api/v1/health")
    assert r.status_code == 503
    assert r.json() == {"status": "down"}
