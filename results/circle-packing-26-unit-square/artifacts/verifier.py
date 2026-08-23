#!/usr/bin/env python3
"""Exact verifier for finite-decimal circle-packing certificates.

Pass/fail decisions use ``fractions.Fraction`` only.  Square roots are used
solely to report human-readable margins and never to decide feasibility.
"""

from __future__ import annotations

import csv
import json
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent
N = 26
GEOMETRIC_CONSTRAINTS = 4 * N + N * (N - 1) // 2
POSITIVITY_CONDITIONS = N
TOTAL_CONDITIONS = GEOMETRIC_CONSTRAINTS + POSITIVITY_CONDITIONS


def rational(value: str | Decimal | Fraction | int) -> Fraction:
    if isinstance(value, Fraction):
        return value
    return Fraction(Decimal(value))


def decimal_string(value: Fraction, digits: int = 110) -> str:
    with localcontext() as ctx:
        ctx.prec = digits
        return format(Decimal(value.numerator) / Decimal(value.denominator), ".100g")


def load_certificate(path: Path) -> list[tuple[Fraction, Fraction, Fraction]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != N:
        raise ValueError(f"{path}: expected {N} circles, found {len(rows)}")
    circles = [
        (rational(row["x"]), rational(row["y"]), rational(row["radius"]))
        for row in rows
    ]
    if any(radius <= 0 for _, _, radius in circles):
        raise ValueError(f"{path}: radii must be positive")
    return circles


def verify_circles(
    circles: Iterable[tuple[Fraction, Fraction, Fraction]],
    tolerance: Fraction = Fraction(0),
) -> dict:
    circles = list(circles)
    if len(circles) != N:
        raise ValueError(f"expected {N} circles, found {len(circles)}")

    one = Fraction(1)
    wall_gaps: list[tuple[Fraction, tuple[int, str]]] = []
    for i, (x, y, radius) in enumerate(circles):
        wall_gaps.extend(
            [
                (x - radius, (i, "left")),
                (one - x - radius, (i, "right")),
                (y - radius, (i, "bottom")),
                (one - y - radius, (i, "top")),
            ]
        )

    pair_sq_gaps: list[tuple[Fraction, tuple[int, int]]] = []
    pair_pass = True
    min_pair_margin: Decimal | None = None
    min_pair_where: tuple[int, int] | None = None
    for i, (xi, yi, ri) in enumerate(circles):
        for j in range(i + 1, N):
            xj, yj, rj = circles[j]
            dist2 = (xi - xj) ** 2 + (yi - yj) ** 2
            radius_sum = ri + rj
            pair_sq_gaps.append((dist2 - radius_sum**2, (i, j)))
            required = radius_sum - tolerance
            if required > 0 and dist2 < required**2:
                pair_pass = False
            with localcontext() as ctx:
                ctx.prec = 120
                distance = (Decimal(dist2.numerator) / Decimal(dist2.denominator)).sqrt()
                required_d = Decimal(required.numerator) / Decimal(required.denominator)
                margin = distance - required_d
            if min_pair_margin is None or margin < min_pair_margin:
                min_pair_margin = margin
                min_pair_where = (i, j)

    min_wall, min_wall_where = min(wall_gaps)
    min_pair_sq, min_pair_sq_where = min(pair_sq_gaps)
    valid = (
        min_wall >= -tolerance
        and pair_pass
        and all(radius > 0 for _, _, radius in circles)
    )
    score = sum((radius for _, _, radius in circles), Fraction())
    assert min_pair_margin is not None and min_pair_where is not None
    return {
        "valid": valid,
        "score": decimal_string(score),
        "tolerance": decimal_string(tolerance),
        "min_wall_gap_zero": decimal_string(min_wall),
        "min_wall_where": list(min_wall_where),
        "min_pair_squared_gap_zero": decimal_string(min_pair_sq),
        "min_pair_squared_gap_where": list(min_pair_sq_where),
        "min_wall_margin_at_tolerance": decimal_string(min_wall + tolerance),
        "min_pair_margin_at_tolerance": format(min_pair_margin, ".100g"),
        "min_pair_margin_where": list(min_pair_where),
        "geometric_constraints_checked": GEOMETRIC_CONSTRAINTS,
        "positivity_conditions_checked": POSITIVITY_CONDITIONS,
        "total_conditions_checked": TOTAL_CONDITIONS,
        # Backwards-compatible field retained for historical consumers.  It
        # counts only wall and pairwise geometric constraints.
        "constraints_checked": GEOMETRIC_CONSTRAINTS,
        "decision_arithmetic": "exact rational",
    }


def verify_certificate(path: Path, tolerance: Fraction) -> dict:
    result = verify_circles(load_certificate(path), tolerance)
    try:
        label = path.relative_to(ROOT)
    except ValueError:
        label = path
    result["certificate"] = str(label)
    return result


def verify_repository(write: bool = True) -> dict:
    cases = {
        "1e-6": verify_certificate(
            ROOT / "tolerance_1e-6.csv", Fraction(1, 10**6)
        ),
        "1e-10": verify_certificate(
            ROOT / "tolerance_1e-10.csv", Fraction(1, 10**10)
        ),
        "exact": verify_certificate(ROOT / "exact.csv", Fraction(0)),
    }
    zero_checks = {
        name: verify_certificate(
            ROOT / f"tolerance_{name}.csv", Fraction(0)
        )
        for name in ("1e-6", "1e-10")
    }

    expected_scores = {
        "1e-6": Decimal("2.63599872089287514"),
        "1e-10": Decimal("2.63598308647338795"),
        "exact": Decimal(
            "2.6359830849176077831865694854434817303966767982744748577457711298607038493344723396767997365079"
        ),
    }
    for name, result in cases.items():
        if not result["valid"]:
            raise AssertionError(f"{name} certificate is invalid under its own contract")
        if Decimal(result["score"]) != expected_scores[name]:
            raise AssertionError(f"{name} score changed: {result['score']}")
        if result["geometric_constraints_checked"] != GEOMETRIC_CONSTRAINTS:
            raise AssertionError(f"{name}: incomplete constraint count")
        if result["total_conditions_checked"] != TOTAL_CONDITIONS:
            raise AssertionError(f"{name}: incomplete condition count")
    if zero_checks["1e-6"]["valid"] or zero_checks["1e-10"]["valid"]:
        raise AssertionError("relaxed certificates must not be described as tolerance-zero packings")

    document = {
        "problem": "26 variable-radius circles in the unit square",
        "objective": "maximize the sum of radii",
        "cases": cases,
        "relaxed_certificates_rechecked_at_zero": zero_checks,
        "status": "PASS",
    }
    if write:
        output = ROOT / "verification.json"
        output.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    return document


def main() -> int:
    result = verify_repository(write=True)
    for name, case in result["cases"].items():
        print(f"{name:>5}: PASS  score={case['score']}")
    print("EXACT RATIONAL VERIFICATION: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
