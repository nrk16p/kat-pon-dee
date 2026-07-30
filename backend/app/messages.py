"""Localised messages.

Every string that can reach a farmer's screen lives here, Thai first. The API
returns a machine-readable `code` alongside the localised text, so the client can
branch on the cause without string-matching, and so a message can be reworded
without breaking anything.
"""
from __future__ import annotations

from typing import Any

TH = "th"
EN = "en"

MESSAGES: dict[str, dict[str, str]] = {
    # ---------------------------------------------------------- upload ------
    "EMPTY_UPLOAD": {
        TH: "ไม่พบไฟล์ภาพ",
        EN: "empty upload",
    },
    "IMAGE_TOO_LARGE": {
        TH: "ไฟล์ภาพใหญ่เกินไป (เกิน {max_mb} MB)",
        EN: "image too large (over {max_mb} MB)",
    },
    "DECODE_FAILED": {
        TH: "อ่านไฟล์ภาพไม่ได้ กรุณาถ่ายใหม่",
        EN: "could not decode the image",
    },
    "IMAGE_TOO_SMALL": {
        TH: (
            "ภาพเล็กเกินไป ({w}×{h} px) ต้องมีด้านยาวอย่างน้อย {min_px} px "
            "เพื่อให้อ่านมุมมาร์กเกอร์ได้แม่นยำ — แนะนำให้กด “เลือกจากคลังภาพ” "
            "แล้วถ่ายด้วยกล้องของเครื่อง ซึ่งได้ความละเอียดเต็ม"
        ),
        EN: (
            "image too small ({w}×{h} px); need at least {min_px} px on the long "
            "side. Use “choose from gallery” to shoot with the native camera."
        ),
    },
    # ------------------------------------------------------------- mat ------
    "UNKNOWN_MAT": {
        TH: "ไม่รู้จักแผ่นสอบเทียบ “{mat_id}”",
        EN: "unknown calibration mat “{mat_id}”",
    },
    "BASELINE_MISMATCH": {
        TH: (
            "ระยะมาร์กเกอร์ไม่ตรงกัน แอปส่งมา {client} มม. "
            "แต่แผ่น “{mat_id}” ของเซิร์ฟเวอร์คือ {server} มม."
        ),
        EN: (
            "baseline mismatch: client sent {client} mm, the server's “{mat_id}” "
            "sheet is {server} mm"
        ),
    },
    # ---------------------------------------------------------- grower ------
    "NO_CONSENT": {
        TH: "ยังไม่ได้ให้ความยินยอม จึงไม่สามารถบันทึกข้อมูลได้",
        EN: "no consent recorded — nothing can be stored",
    },
    "NO_IDENTITY": {
        TH: "ต้องมีเบอร์โทรหรือบัญชี LINE อย่างน้อยหนึ่งอย่าง",
        EN: "need either a phone number or a LINE account",
    },
    # --------------------------------------------------------- markers ------
    "NO_MARKERS": {
        TH: (
            "ไม่พบมาร์กเกอร์ ArUco ในภาพ — ต้องถ่ายให้เห็นแผ่นสอบเทียบ "
            "และมุมทั้ง 4 อยู่ในกรอบ"
        ),
        EN: "no ArUco markers detected — the calibration sheet must be in frame",
    },
    "MARKERS_INCOMPLETE": {
        TH: (
            "พบมาร์กเกอร์ไม่ครบ (เจอ {n} จาก 4) — จัดให้มุมทั้ง 4 อยู่ในกรอบ "
            "ไม่มีเงาหรือแสงสะท้อนบังมาร์กเกอร์"
        ),
        EN: (
            "only {n} of 4 markers found — get all four corners in frame, with no "
            "shadow or glare across them"
        ),
    },
    "HOMOGRAPHY_FAILED": {
        TH: "คำนวณมุมมองจากมาร์กเกอร์ไม่สำเร็จ กรุณาถ่ายใหม่ให้ตรงขึ้น",
        EN: "could not solve the homography from the marker corners",
    },
    "PIPELINE_FAILED": {
        TH: "ประมวลผลไม่สำเร็จ ({err})",
        EN: "pipeline failed ({err})",
    },
    # -------------------------------------------------------- warnings ------
    "WARN_NO_EXIF_FOCAL": {
        TH: (
            "ไม่พบระยะโฟกัสของกล้องในไฟล์ (EXIF) ระบบใช้ค่าประมาณ 26 มม. "
            "การชดเชยความสูงของผลจึงเป็นค่าโดยประมาณ"
        ),
        EN: (
            "camera focal length unknown (no EXIF) — an assumed 26 mm equivalent "
            "was used, so the height correction is approximate"
        ),
    },
    "WARN_HIGH_REPROJECTION": {
        TH: (
            "ค่าคลาดเคลื่อนการฉายภาพสูง ({px} px) — แผ่นอาจไม่เรียบ "
            "หรือค่าระยะโฟกัสไม่ตรงกับกล้องจริง"
        ),
        EN: (
            "pose reprojection error {px} px — the sheet may not be flat, or the "
            "assumed focal length is wrong"
        ),
    },
    "WARN_BLURRY": {
        TH: (
            "ภาพไม่คมพอ (คะแนนความคม {score}) ขนาดที่วัดได้จะเล็กกว่าความจริง "
            "— กรุณาถ่ายใหม่ ให้กล้องโฟกัสที่แผ่นและมืออยู่นิ่ง"
        ),
        EN: (
            "capture is not sharp enough (focus score {score}); diameters will "
            "read small — retake with the camera focused on the sheet and held still"
        ),
    },
    "WARN_TOO_CROWDED": {
        TH: (
            "ผลไม้ติดกันแน่นเกินไป (คลุมพื้นที่ {pct}% ของกรอบวัด) จนแยกทีละลูกไม่ได้ "
            "— กรุณาเกลี่ยให้เป็นชั้นเดียวและเว้นช่องว่างระหว่างผล"
        ),
        EN: (
            "fruit are packed too tightly ({pct}% of the area) to separate — spread "
            "them into a single layer with gaps between fruit"
        ),
    },
    "WARN_COLOR_UNCALIBRATED": {
        TH: (
            "ยังไม่ได้สอบเทียบสี ({why}) — ค่าสีและผิวเป็นค่าดิบจากกล้อง "
            "เปรียบเทียบข้ามภาพหรือข้ามเครื่องไม่ได้"
        ),
        EN: (
            "colour not calibrated ({why}) — colour and skin figures are raw "
            "camera values and cannot be compared across photos or phones"
        ),
    },
    "WARN_NO_CAMERA_HEIGHT": {
        TH: (
            "หาความสูงกล้องไม่ได้ ค่าที่วัดยังไม่ได้ชดเชยความสูงของผล "
            "จึงสูงกว่าความจริงประมาณ 0.4–1.1 มม."
        ),
        EN: (
            "camera height unavailable — diameters are NOT height-compensated and "
            "read high by roughly 0.4-1.1 mm"
        ),
    },
    # -------------------------------------------------- counting session ----
    "MAT_TOO_SMALL_FOR_ZONES": {
        TH: (
            "แผ่น “{mat_id}” เล็กเกินไปสำหรับโหมดนับ พื้นที่วัด {area} มม. "
            "หักช่องวางและช่องออกแล้วเหลือ {work} มม. ต้องมีอย่างน้อย {min_work} มม. "
            "— ใช้แผ่น 500 มม."
        ),
        EN: (
            "sheet “{mat_id}” is too small for counting mode: a {area} mm area "
            "leaves {work} mm of work zone, and {min_work} mm is the minimum. "
            "Use the 500 mm sheet."
        ),
    },
    "SESSION_NOT_FOUND": {
        TH: "ไม่พบรอบนับนี้",
        EN: "no such counting session",
    },
    "SESSION_CLOSED": {
        TH: "รอบนับนี้ปิดแล้ว เปิดรอบใหม่เพื่อนับต่อ",
        EN: "this session is closed — open a new one to keep counting",
    },
    "SESSION_TOO_LONG": {
        TH: "รอบนับนี้ยาวเกิน {max} รายการ กรุณาปิดแล้วเปิดรอบใหม่",
        EN: "session exceeded {max} events — close it and open a new one",
    },
    "SESSION_WRITE_FAILED": {
        # the count IS the product here, so unlike a dropped photo this must be
        # visible: a tally the server did not record is a tally nobody can defend
        TH: "บันทึกยอดนับไม่สำเร็จ ({err}) ยอดบนหน้าจออาจไม่ตรงกับที่บันทึกไว้",
        EN: "could not record the count ({err}) — the on-screen tally may not match what is stored",
    },
    "SESSION_READ_FAILED": {
        TH: "อ่านรอบนับไม่สำเร็จ ({err})",
        EN: "could not read the session ({err})",
    },
    "UNAUTHORIZED": {
        TH: "ไม่ได้รับอนุญาตให้เข้าถึงเซิร์ฟเวอร์นี้",
        EN: "not authorised for this server",
    },
    "WARN_LIVE_PRECISION": {
        TH: (
            "โหมดสดวัดหยาบกว่าการถ่ายนิ่ง (คลาดประมาณ ±{mm} มม.) "
            "ใช้ช่วยคัดได้ แต่ถ้าจะใช้เป็นหลักฐานให้ถ่ายนิ่งอีกครั้ง"
        ),
        EN: (
            "live mode is coarser than a still capture (about ±{mm} mm). Fine for "
            "sorting; take a still capture for anything you hand to a buyer."
        ),
    },
}


def msg(code: str, locale: str = TH, **kw: Any) -> str:
    """Localised text for a code. Falls back to Thai, then to the code itself."""
    entry = MESSAGES.get(code)
    if entry is None:
        return code
    template = entry.get(locale) or entry.get(TH) or code
    try:
        return template.format(**kw)
    except (KeyError, IndexError):
        return template


def normalise_locale(raw: str | None) -> str:
    return EN if (raw or "").lower().startswith("en") else TH
