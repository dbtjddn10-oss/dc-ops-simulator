"""Extract the approved ops-front-v2 game assets from the two source sheets."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets" / "v1.1" / "source"
OUTPUT_ROOT = ROOT / "assets" / "v1.1" / "ops-front-v2"
EQUIPMENT_SHEET = SOURCE_ROOT / "ops-front-v2-equipment-sheet.png"
OPERATOR_SHEET = SOURCE_ROOT / "ops-front-v2-operator-sheet.png"

RACK_CANVAS = (336, 540)
EQUIPMENT_CANVASES = {
    "ups.png": (320, 520),
    "pdu-a.png": (256, 520),
    "pdu-b.png": (256, 520),
    "crac.png": (512, 520),
}
OPERATOR_CANVAS = (320, 400)
BASELINE_RATIO = 0.92
ALPHA_ANCHOR_THRESHOLD = 8


def output_path(relative_path: str) -> Path:
    path = OUTPUT_ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def alpha_baseline(image: Image.Image) -> int:
    alpha = np.asarray(image.getchannel("A"))
    rows = np.where(np.any(alpha > ALPHA_ANCHOR_THRESHOLD, axis=1))[0]
    if not len(rows):
        raise ValueError("Asset crop contains no visible pixels.")
    return int(rows.max())


def place_fixed_crop(
    source: Image.Image,
    box: tuple[int, int, int, int],
    canvas_size: tuple[int, int],
    source_baseline: int,
) -> Image.Image:
    crop = source.crop(box)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    target_baseline = round(canvas_size[1] * BASELINE_RATIO)
    x = (canvas_size[0] - crop.width) // 2
    y = target_baseline - (source_baseline - box[1])
    canvas.alpha_composite(crop, (x, y))
    return canvas


def upper_body_anchor(alpha: np.ndarray) -> tuple[float, int]:
    y_values, x_values = np.where(alpha > ALPHA_ANCHOR_THRESHOLD)
    if not len(y_values):
        raise ValueError("Operator frame contains no visible pixels.")
    top = int(y_values.min())
    baseline = int(y_values.max())
    upper_limit = top + round((baseline - top) * 0.52)
    upper_y, upper_x = np.where((alpha > ALPHA_ANCHOR_THRESHOLD) & (np.indices(alpha.shape)[0] <= upper_limit))
    if not len(upper_y):
        raise ValueError("Operator frame has no stable upper-body anchor.")
    return (float(upper_x.min() + upper_x.max()) / 2, baseline)


def normalize_operator_frame(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    cell = source.crop(box)
    alpha = np.asarray(cell.getchannel("A"))
    anchor_x, baseline = upper_body_anchor(alpha)
    visible_box = cell.getchannel("A").getbbox()
    if visible_box is None:
        raise ValueError("Operator frame is empty.")
    frame = cell.crop(visible_box)
    target_baseline = round(OPERATOR_CANVAS[1] * BASELINE_RATIO)
    x = round(OPERATOR_CANVAS[0] / 2 - (anchor_x - visible_box[0]))
    y = target_baseline - (baseline - visible_box[1])
    canvas = Image.new("RGBA", OPERATOR_CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(frame, (x, y))
    return canvas


def save(image: Image.Image, relative_path: str) -> None:
    image.save(output_path(relative_path), "PNG", optimize=True)


def validate_output(relative_path: str, expected_size: tuple[int, int]) -> dict[str, object]:
    path = OUTPUT_ROOT / relative_path
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        alpha_minimum, alpha_maximum = rgba.getchannel("A").getextrema()
        if rgba.size != expected_size:
            raise ValueError(f"Unexpected canvas for {relative_path}: {rgba.size}")
        if alpha_minimum != 0 or alpha_maximum == 0:
            raise ValueError(f"Transparency validation failed for {relative_path}.")
        visible_box = rgba.getchannel("A").getbbox()
        return {
            "path": relative_path,
            "size": list(rgba.size),
            "alpha": [alpha_minimum, alpha_maximum],
            "visibleBox": list(visible_box) if visible_box else None,
        }


def main() -> None:
    for source_path in (EQUIPMENT_SHEET, OPERATOR_SHEET):
        if not source_path.is_file():
            raise FileNotFoundError(source_path)

    equipment_source = Image.open(EQUIPMENT_SHEET).convert("RGBA")
    operator_source = Image.open(OPERATOR_SHEET).convert("RGBA")

    rack_cells = {
        "rack-normal.png": (276, 10, 596, 522),
        "rack-warning.png": (607, 10, 927, 522),
        "rack-critical.png": (940, 10, 1260, 522),
    }
    for file_name, box in rack_cells.items():
        rack = place_fixed_crop(equipment_source, box, RACK_CANVAS, source_baseline=511)
        save(rack, f"racks/{file_name}")

    equipment_cells = {
        "ups.png": (80, 520, 400, 1004),
        "pdu-a.png": (410, 520, 666, 1004),
        "pdu-b.png": (684, 520, 940, 1004),
        "crac.png": (950, 520, 1436, 1004),
    }
    for file_name, box in equipment_cells.items():
        crop = equipment_source.crop(box)
        source_baseline = box[1] + alpha_baseline(crop)
        equipment = place_fixed_crop(
            equipment_source,
            box,
            EQUIPMENT_CANVASES[file_name],
            source_baseline=source_baseline,
        )
        save(equipment, f"equipment/{file_name}")

    top_cells = [
        (0, 0, 220, 400),
        (220, 0, 440, 400),
        (440, 0, 620, 400),
        (620, 0, 780, 400),
        (780, 0, 970, 400),
        (970, 0, 1150, 400),
        (1150, 0, 1335, 400),
        (1335, 0, 1536, 400),
    ]
    middle_cells = [
        (0, 390, 190, 760),
        (190, 390, 360, 760),
        (360, 390, 530, 760),
        (530, 390, 700, 760),
        (700, 390, 865, 760),
        (865, 390, 1025, 760),
        (1025, 390, 1185, 760),
        (1185, 390, 1355, 760),
        (1355, 390, 1536, 760),
    ]

    idle_down = normalize_operator_frame(operator_source, top_cells[0])
    idle_up = normalize_operator_frame(operator_source, top_cells[1])
    idle_right = normalize_operator_frame(operator_source, top_cells[2])
    save(idle_down, "operators/operator-a/idle-down.png")
    save(idle_up, "operators/operator-a/idle-up.png")
    save(idle_right, "operators/operator-a/idle-right.png")
    save(idle_right.transpose(Image.Transpose.FLIP_LEFT_RIGHT), "operators/operator-a/idle-left.png")

    walk_down = [normalize_operator_frame(operator_source, box) for box in top_cells[4:8]]
    walk_up = [normalize_operator_frame(operator_source, box) for box in middle_cells[0:4]]
    # The sheet provides five complete right-facing candidates. Frames 1, 2, 4,
    # and 5 form the most even contact/passing/contact-opposite/passing cycle.
    walk_right = [normalize_operator_frame(operator_source, middle_cells[index]) for index in (4, 5, 7, 8)]

    for direction, frames in (("down", walk_down), ("up", walk_up), ("right", walk_right)):
        for frame_number, frame in enumerate(frames, start=1):
            save(frame, f"operators/operator-a/walk-{direction}-{frame_number}.png")
    for frame_number, frame in enumerate(walk_right, start=1):
        save(
            frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
            f"operators/operator-a/walk-left-{frame_number}.png",
        )

    expected = {
        **{f"racks/{name}": RACK_CANVAS for name in rack_cells},
        **{f"equipment/{name}": size for name, size in EQUIPMENT_CANVASES.items()},
        **{
            f"operators/operator-a/{name}": OPERATOR_CANVAS
            for name in (
                "idle-down.png",
                "idle-up.png",
                "idle-left.png",
                "idle-right.png",
                *[f"walk-{direction}-{frame}.png" for direction in ("down", "up", "left", "right") for frame in range(1, 5)],
            )
        },
    }
    report = [validate_output(relative_path, size) for relative_path, size in expected.items()]
    print(json.dumps({"count": len(report), "assets": report}, indent=2))


if __name__ == "__main__":
    main()
