"""Every user-facing string must exist in Thai — this app is for Thai growers."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messages import EN, MESSAGES, TH, msg, normalise_locale  # noqa: E402


def test_every_code_has_thai_and_english():
    for code, entry in MESSAGES.items():
        assert entry.get(TH), f"{code} missing Thai"
        assert entry.get(EN), f"{code} missing English"


def test_thai_is_the_default():
    assert normalise_locale(None) == TH
    assert normalise_locale("") == TH
    assert normalise_locale("th-TH") == TH
    assert normalise_locale("en-GB") == EN


def test_placeholders_are_filled():
    out = msg("IMAGE_TOO_SMALL", TH, w=1280, h=720, min_px=1600)
    assert "1280" in out and "720" in out and "1600" in out
    assert "{" not in out


def test_missing_params_do_not_crash():
    """A message must never explode just because a caller forgot a field."""
    assert msg("IMAGE_TOO_SMALL", TH)
    assert msg("NOT_A_REAL_CODE", TH) == "NOT_A_REAL_CODE"
