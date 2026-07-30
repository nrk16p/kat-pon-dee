"""The counting endpoints over HTTP, against a synthetic sheet.

Covers the wire contract the on-device tracker depends on: fruit positions in
mat millimetres, a homography to draw with, and a tally that cannot be inflated
by a retry.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import session as sessions                       # noqa: E402
from app import main as mainmod                           # noqa: E402
from app.vision.mats import get_mat                       # noqa: E402
from tools.synthetic import grid_of_spheres, render       # noqa: E402

TRUE_D = 28.0
# a camera preview frame, not a 12 MP photo -- this is what the live path gets
PREVIEW = (1280, 960)


@pytest.fixture(scope="module")
def preview_jpeg() -> bytes:
    mat = get_mat("full")
    img, _ = render(mat, grid_of_spheres(mat, TRUE_D, gap=10.0),
                    height_mm=520.0, image_size=PREVIEW)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert ok
    return buf.tobytes()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "SESSION_DIR", tmp_path / "sessions")
    monkeypatch.setattr(mainmod, "RETAIN", False, raising=False)
    # keep the synthetic frames out of the real capture directory
    monkeypatch.setattr(mainmod, "CAPTURE_DIR", tmp_path / "captures")
    import app.storage as storage
    monkeypatch.setattr(storage, "RETAIN", False)
    return TestClient(mainmod.app)


def _open(client, mat_id: str = "full"):
    r = client.post("/api/session", json={"fruitId": "longan", "matId": mat_id})
    assert r.status_code == 200, r.text
    return r.json()


# -------------------------------------------------------------------- zones --


def test_zones_endpoint_reports_which_sheets_work(client):
    body = client.get("/api/zones", params={"matId": "full"}).json()
    assert body["supportedMats"] == ["full"]
    assert {z["key"] for z in body["zones"]} == {
        "entry_top", "entry_left", "work", "exit_right"
    }


def test_opening_a_session_on_a_too_small_sheet_is_refused_up_front(client):
    """Better a 422 before the farmer starts than a wall halfway through."""
    r = client.post("/api/session", json={"matId": "a4"})
    assert r.status_code == 422
    assert "500" in r.json()["detail"]        # tells them which sheet to use


# -------------------------------------------------------------------- frame --


def test_frame_returns_fruit_in_mat_millimetres_and_a_homography(client, preview_jpeg):
    """Positions must be in sheet coordinates. A tracker keyed on image pixels
    would re-id every fruit the moment the phone is nudged, and count twice."""
    s = _open(client)
    r = client.post(f"/api/session/{s['sessionId']}/frame",
                    files={"image": ("f.jpg", preview_jpeg, "image/jpeg")})
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["markersFound"] == 4
    assert body["counted"] > 20
    assert len(body["homography"]) == 9

    mat = get_mat("full")
    for f in body["fruits"]:
        assert mat.area_lo <= f["x"] <= mat.area_hi
        assert mat.area_lo <= f["y"] <= mat.area_hi
    # coarse, but still good enough to separate grades that sit 3 mm apart
    good = [f["d"] for f in body["fruits"] if not f["occluded"]]
    assert abs(np.median(good) - TRUE_D) < 1.0


def test_live_frames_say_they_are_less_accurate_than_a_still_capture(client, preview_jpeg):
    """The number looks just as authoritative on screen as a still capture's, so
    the caveat rides on every frame rather than hiding in a settings page."""
    s = _open(client)
    body = client.post(f"/api/session/{s['sessionId']}/frame",
                       files={"image": ("f.jpg", preview_jpeg, "image/jpeg")}).json()
    assert any("มม." in w or "mm" in w for w in body["warnings"])


def test_a_preview_frame_is_too_small_for_the_still_endpoint(client, preview_jpeg):
    """The still path keeps its 1600 px floor: marker corner accuracy is the
    whole point there, and a preview frame would quietly degrade it."""
    r = client.post("/api/measure",
                    files={"image": ("f.jpg", preview_jpeg, "image/jpeg")},
                    data={"fruitId": "longan", "matId": "full"})
    assert r.status_code == 422
    assert "1600" in r.json()["detail"]


def test_positions_hold_still_when_the_phone_is_nudged():
    """The assumption the whole counting mode rests on.

    The tracker matches fruit between handfuls by centroid within 10 mm. That
    only works because positions come back in SHEET coordinates: knock the
    phone or change its height and the pixels all move, but the millimetres
    should not. If this drifts past the match radius the tracker hands every
    fruit a new id after a bump and counts the basket twice.
    """
    from app.vision.pipeline import measure_image
    from app.vision.segment import SegmentParams

    mat = get_mat("full")
    spheres = grid_of_spheres(mat, TRUE_D, gap=10.0)

    def positions(offset, height):
        img, gt = render(mat, spheres, height_mm=height, offset_mm=offset,
                         image_size=PREVIEW)
        res = measure_image(img, mat, SegmentParams(), gt["equiv35mm"], None, 2.5)
        return res.fruits

    base = positions((18.0, -12.0), 520.0)
    assert len(base) > 20

    # a hard knock: 30 mm sideways and 40 mm of height at once
    moved = positions((40.0, 10.0), 480.0)
    assert len(moved) == len(base)

    worst = 0.0
    for b in base:
        nearest = min(np.hypot(m.x - b.x, m.y - b.y) for m in moved)
        worst = max(worst, nearest)
    assert worst < 5.0, f"fruit moved {worst:.2f} mm in sheet coordinates"


def test_frame_on_a_closed_session_is_refused(client, preview_jpeg):
    s = _open(client)
    client.post(f"/api/session/{s['sessionId']}/close")
    r = client.post(f"/api/session/{s['sessionId']}/frame",
                    files={"image": ("f.jpg", preview_jpeg, "image/jpeg")})
    assert r.status_code == 409


# ----------------------------------------------------------------- counting --


def _fruits(*tids, grade="AA", d=29.0):
    return {"fruits": [{"tid": t, "d": d, "grade": grade, "x": 200.0, "y": 200.0}
                       for t in tids]}


def test_count_accumulates_and_survives_a_reload(client):
    sid = _open(client)["sessionId"]
    client.post(f"/api/session/{sid}/count", json=_fruits(1, 2))
    body = client.post(f"/api/session/{sid}/count",
                       json=_fruits(3, grade="A", d=26.0)).json()
    assert body["counted"] == 3
    assert body["tally"] == {"A": 1, "AA": 2}
    assert client.get(f"/api/session/{sid}").json()["counted"] == 3


def test_a_retried_count_request_does_not_inflate_the_tally(client):
    sid = _open(client)["sessionId"]
    client.post(f"/api/session/{sid}/count", json=_fruits(1, 2, 3))
    body = client.post(f"/api/session/{sid}/count", json=_fruits(1, 2, 3)).json()
    assert body["counted"] == 3


def test_undo(client):
    sid = _open(client)["sessionId"]
    client.post(f"/api/session/{sid}/count", json=_fruits(1, 2, 3))
    body = client.post(f"/api/session/{sid}/uncount", json={"tids": [2]}).json()
    assert body["counted"] == 2


def test_counting_after_close_is_refused(client):
    sid = _open(client)["sessionId"]
    client.post(f"/api/session/{sid}/count", json=_fruits(1))
    client.post(f"/api/session/{sid}/close")
    assert client.post(f"/api/session/{sid}/count", json=_fruits(2)).status_code == 409
    assert client.get(f"/api/session/{sid}").json()["counted"] == 1


def test_unknown_session_is_404(client):
    assert client.get("/api/session/deadbeefdeadbeef").status_code == 404
    assert client.post("/api/session/deadbeefdeadbeef/count",
                       json=_fruits(1)).status_code == 404


# --------------------------------------------------------------------- auth --


def test_a_token_locks_the_write_endpoints_but_not_health(client, monkeypatch):
    """The tunnel puts this on the public internet; without a token anyone with
    the URL can fill the disk and pollute the training set."""
    monkeypatch.setattr(mainmod, "API_TOKEN", "s3cret")
    assert client.get("/api/health").status_code == 200
    assert client.post("/api/session", json={"matId": "full"}).status_code == 401

    r = client.post("/api/session", json={"matId": "full"},
                    headers={"X-API-Token": "s3cret"})
    assert r.status_code == 200


def test_health_reports_session_storage(client):
    st = client.get("/api/health").json()["storage"]
    assert "sessionsWritable" in st
    assert "sessionDir" in st
