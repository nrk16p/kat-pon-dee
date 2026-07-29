"""Registration is a separate step from measuring, and consent gates everything."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

client = TestClient(app)

BASE = {
    "name": "สมชาย ใจดี",
    "phone": "081-234-5678",
    "province": "เชียงใหม่",
    "orchard": "สวนลำไยบ้านหนองหอย",
    "consentAt": "1785250000000",
}


def test_registers_and_returns_a_pseudonymous_id():
    r = client.post("/api/grower", json=BASE)
    assert r.status_code == 200
    body = r.json()
    assert len(body["growerId"]) == 16
    # the id must not leak the phone number it was derived from
    assert "0812345678" not in body["growerId"]
    assert "8123" not in body["growerId"]


def test_same_grower_is_not_duplicated():
    first = client.post("/api/grower", json=BASE).json()
    second = client.post("/api/grower", json=BASE).json()
    assert first["growerId"] == second["growerId"]
    assert second["isNew"] is False


def test_line_identity_survives_a_new_phone_number():
    a = client.post("/api/grower", json={**BASE, "lineUserId": "U4af4980629"}).json()
    b = client.post(
        "/api/grower",
        json={**BASE, "phone": "089-999-9999", "lineUserId": "U4af4980629"},
    ).json()
    assert a["growerId"] == b["growerId"], "changing phone lost the grower"


def test_without_consent_nothing_is_stored():
    r = client.post("/api/grower", json={**BASE, "consentAt": ""})
    assert r.status_code == 422
    assert "ยินยอม" in r.json()["detail"]


def test_without_any_identity_it_refuses():
    r = client.post("/api/grower", json={"name": "ก", "consentAt": "1785"})
    assert r.status_code == 422


def test_measure_takes_only_the_id_now():
    """The personal fields must no longer ride along with every photo."""
    import inspect

    from app.main import measure

    params = set(inspect.signature(measure).parameters)
    assert "growerId" in params
    for leaked in ("growerName", "growerPhone", "consentAt", "lineUserId"):
        assert leaked not in params, f"{leaked} still sent with every capture"


def test_health_reports_whether_data_is_actually_persisting():
    """Retention is best-effort, so a broken disk fails silently by design.
    Health has to make that visible or the training set disappears unnoticed."""
    s = client.get("/api/health").json()["storage"]
    for key in ("retain", "capturesWritable", "growersWritable", "persisting"):
        assert key in s, f"health is missing {key}"
    assert s["persisting"] == (
        s["retain"] and s["capturesWritable"] and s["growersWritable"]
    )
