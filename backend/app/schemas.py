"""Wire contract. Mirrors src/domain/types.ts in the frontend.

The server returns raw geometry only. Grading happens on the client so a farmer
can re-grade a stored capture against a buyer's thresholds without re-uploading
the photo — which also keeps grade policy out of the deploy cycle.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class FruitColor(BaseModel):
    """Skin colour in CIE L*a*b*, AFTER correction against the printed strip."""

    L: float = Field(description="lightness, 0 black .. 100 white")
    a: float = Field(description="green -> red")
    b: float = Field(description="blue -> yellow")
    chroma: float
    hue: float = Field(description="hue angle, degrees")
    uniformity: float = Field(
        description="spread of L* across the skin; blemishes and spotting raise it"
    )


class FruitMeasurement(BaseModel):
    i: int
    x: float = Field(description="centre in mat millimetres")
    y: float
    d: float = Field(description="diameter, or major axis for elongated fruit, mm")
    confidence: float
    occluded: bool
    grade: str | None = Field(default=None, description="always null — client grades")
    color: FruitColor | None = None


class MeasurementResult(BaseModel):
    fruitId: str
    matId: str
    counted: int
    measured: int
    meanDiameter: float
    minDiameter: float
    maxDiameter: float
    stdDiameter: float
    scale: float = Field(description="mm per pixel of the rectified sheet")
    cameraHeight: float | None
    heightCorrected: bool
    markersFound: int
    processingMs: int
    fruits: list[FruitMeasurement]
    tally: list[dict] = Field(default_factory=list, description="filled client-side")

    # colour summary across the measurable fruit
    colorCalibrated: bool = False
    colorNote: str | None = None
    meanL: float | None = None
    meanChroma: float | None = None
    meanUniformity: float | None = None

    # diagnostics — surfaced so a bad capture is debuggable in the field
    intrinsicsSource: str | None = None
    reprojectionErrorPx: float | None = None
    sharpness: float | None = None
    homography: list[float] | None = Field(
        default=None,
        description="3x3 row-major, mat mm -> pixels in the uploaded image",
    )
    warnings: list[str] = Field(default_factory=list)


class GrowerIn(BaseModel):
    """Registration payload. Sent ONCE, not with every photo."""

    name: str = ""
    phone: str = ""
    province: str = ""
    orchard: str = ""
    lineUserId: str = ""
    consentAt: str = Field(
        default="",
        description="client timestamp of the PDPA opt-in; without it nothing is stored",
    )


class GrowerOut(BaseModel):
    growerId: str = Field(description="pseudonymous id — safe to store on the device")
    isNew: bool


class ErrorResponse(BaseModel):
    detail: str
    hint: str | None = None


# ---------------------------------------------------------------- counting mode


class ZoneOut(BaseModel):
    """A lane on the printed sheet, in mat millimetres.

    Served rather than hardcoded in the client so the boundary the app draws and
    the boundary the tracker counts on are the same number.
    """

    key: str = Field(description="entry_top | entry_left | work | exit_right")
    x0: float
    y0: float
    x1: float
    y1: float


class SessionIn(BaseModel):
    fruitId: str = "longan"
    matId: str = "full"
    growerId: str = ""
    note: str = ""


class SessionOut(BaseModel):
    sessionId: str
    startedAt: str
    closedAt: str = ""
    fruitId: str
    matId: str
    zones: list[ZoneOut] = Field(default_factory=list)
    counted: int = 0
    tally: dict[str, int] = Field(default_factory=dict)
    meanDiameter: float = 0.0
    minDiameter: float = 0.0
    maxDiameter: float = 0.0


class CountedIn(BaseModel):
    tid: int = Field(description="tracker id, unique within the session")
    d: float = 0.0
    grade: str = "?"
    x: float = 0.0
    y: float = 0.0
    borderline: bool = False


class CountIn(BaseModel):
    fruits: list[CountedIn] = Field(default_factory=list)


class UncountIn(BaseModel):
    tids: list[int] = Field(default_factory=list)
