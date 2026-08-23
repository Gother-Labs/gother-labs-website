#!/usr/bin/env python3
"""Rigorous interval certificate for the 78-contact local optimum.

The proof decisions use closed intervals with ``fractions.Fraction`` endpoints.
NumPy and mpmath are used only to propose a midpoint, a preconditioner, and
dual approximations; accepting or rejecting the certificate never depends on
their floating-point answers.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction
from pathlib import Path


ROOT = Path(__file__).resolve().parent
N = 26
DIMENSION = 3 * N
ACTIVE_THRESHOLD = Fraction(1, 10**40)
ROOT_RADIUS = Fraction(1, 10**90)
DUAL_RADIUS = Fraction(1, 10**10)
OUTPUT = ROOT / "local_optimum_interval.json"
CERTIFICATE = ROOT / "local_optimum_certificate.json"

Constraint = tuple[str, int, str] | tuple[str, int, int]
ALL: list[Constraint] = [
    ("W", i, side) for i in range(N) for side in ("L", "R", "B", "T")
] + [("P", i, j) for i in range(N) for j in range(i + 1, N)]


@dataclass(frozen=True)
class Interval:
    lo: Fraction
    hi: Fraction

    def __post_init__(self) -> None:
        if self.lo > self.hi:
            raise ValueError("reversed interval")

    @classmethod
    def point(cls, value: Fraction | int) -> "Interval":
        value = Fraction(value)
        return cls(value, value)

    def __add__(self, other: "Interval") -> "Interval":
        return Interval(self.lo + other.lo, self.hi + other.hi)

    def __sub__(self, other: "Interval") -> "Interval":
        return Interval(self.lo - other.hi, self.hi - other.lo)

    def __neg__(self) -> "Interval":
        return Interval(-self.hi, -self.lo)

    def __mul__(self, other: "Interval") -> "Interval":
        products = (
            self.lo * other.lo,
            self.lo * other.hi,
            self.hi * other.lo,
            self.hi * other.hi,
        )
        return Interval(min(products), max(products))

    def scale(self, value: Fraction) -> "Interval":
        return self * Interval.point(value)

    def magnitude(self) -> Fraction:
        return max(abs(self.lo), abs(self.hi))


ZERO = Interval.point(0)


def key_string(key: Constraint) -> str:
    return ":".join(map(str, key))


def load_seed() -> list[Fraction]:
    with (ROOT / "exact.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != N:
        raise AssertionError("expected 26 circles")
    values = []
    for row in rows:
        values.extend(Fraction(Decimal(row[name])) for name in ("x", "y", "radius"))
    return values


def wall_gap(state: list, i: int, side: str):
    x, y, radius = state[3 * i : 3 * i + 3]
    one = Interval.point(1) if isinstance(x, Interval) else Fraction(1)
    if side == "L":
        return x - radius
    if side == "R":
        return one - x - radius
    if side == "B":
        return y - radius
    if side == "T":
        return one - y - radius
    raise ValueError(side)


def gap(state: list, key: Constraint):
    """Polynomial gap: wall distance or squared pair separation."""
    if key[0] == "W":
        return wall_gap(state, key[1], key[2])
    _, i, j = key
    xi, yi, ri = state[3 * i : 3 * i + 3]
    xj, yj, rj = state[3 * j : 3 * j + 3]
    return (xi - xj) * (xi - xj) + (yi - yj) * (yi - yj) - (ri + rj) * (ri + rj)


def detect_active(seed: list[Fraction]) -> list[Constraint]:
    active = [key for key in ALL if abs(gap(seed, key)) < ACTIVE_THRESHOLD]
    if len(active) != DIMENSION:
        raise AssertionError(f"expected 78 active constraints, found {len(active)}")
    if any(gap(seed, key) <= 0 for key in ALL):
        raise AssertionError("the strict seed must be exactly feasible")
    return active


def mp_system(state: list, active: list[Constraint]):
    import mpmath as mp

    values = mp.matrix(DIMENSION, 1)
    jacobian = mp.matrix(DIMENSION, DIMENSION)
    for row, key in enumerate(active):
        if key[0] == "W":
            _, i, side = key
            x, y, radius = state[3 * i : 3 * i + 3]
            if side == "L":
                values[row] = x - radius
                jacobian[row, 3 * i] = 1
            elif side == "R":
                values[row] = 1 - x - radius
                jacobian[row, 3 * i] = -1
            elif side == "B":
                values[row] = y - radius
                jacobian[row, 3 * i + 1] = 1
            else:
                values[row] = 1 - y - radius
                jacobian[row, 3 * i + 1] = -1
            jacobian[row, 3 * i + 2] = -1
        else:
            _, i, j = key
            xi, yi, ri = state[3 * i : 3 * i + 3]
            xj, yj, rj = state[3 * j : 3 * j + 3]
            dx, dy, radius_sum = xi - xj, yi - yj, ri + rj
            values[row] = dx * dx + dy * dy - radius_sum * radius_sum
            jacobian[row, 3 * i] = 2 * dx
            jacobian[row, 3 * j] = -2 * dx
            jacobian[row, 3 * i + 1] = 2 * dy
            jacobian[row, 3 * j + 1] = -2 * dy
            jacobian[row, 3 * i + 2] = -2 * radius_sum
            jacobian[row, 3 * j + 2] = -2 * radius_sum
    return values, jacobian


def propose_midpoint(seed: list[Fraction], active: list[Constraint]) -> list[Fraction]:
    import mpmath as mp

    mp.mp.dps = 150
    state = [mp.mpf(value.numerator) / value.denominator for value in seed]
    for _ in range(3):
        values, jacobian = mp_system(state, active)
        correction = mp.lu_solve(jacobian, -values)
        state = [state[i] + correction[i] for i in range(DIMENSION)]
    # These are proposal points, not asserted enclosures. The rational
    # Krawczyk test below validates whatever decimal midpoint is produced.
    return [Fraction(Decimal(mp.nstr(value, 125))) for value in state]


def point_function(state: list[Fraction], active: list[Constraint]) -> list[Fraction]:
    return [gap(state, key) for key in active]


def jacobian_rows(state: list[Interval], active: list[Constraint]) -> list[dict[int, Interval]]:
    rows: list[dict[int, Interval]] = []
    two = Interval.point(2)
    for key in active:
        row: dict[int, Interval] = {}
        if key[0] == "W":
            _, i, side = key
            if side == "L":
                row[3 * i] = Interval.point(1)
            elif side == "R":
                row[3 * i] = Interval.point(-1)
            elif side == "B":
                row[3 * i + 1] = Interval.point(1)
            else:
                row[3 * i + 1] = Interval.point(-1)
            row[3 * i + 2] = Interval.point(-1)
        else:
            _, i, j = key
            dx = state[3 * i] - state[3 * j]
            dy = state[3 * i + 1] - state[3 * j + 1]
            radius_sum = state[3 * i + 2] + state[3 * j + 2]
            row[3 * i] = two * dx
            row[3 * j] = -(two * dx)
            row[3 * i + 1] = two * dy
            row[3 * j + 1] = -(two * dy)
            row[3 * i + 2] = -(two * radius_sum)
            row[3 * j + 2] = -(two * radius_sum)
        rows.append(row)
    return rows


def rational_preconditioner(midpoint: list[Fraction], active: list[Constraint]):
    import numpy as np

    point_box = [Interval.point(value) for value in midpoint]
    sparse = jacobian_rows(point_box, active)
    matrix = np.zeros((DIMENSION, DIMENSION), dtype=float)
    for i, row in enumerate(sparse):
        for j, value in row.items():
            matrix[i, j] = float(value.lo)
    inverse = np.linalg.inv(matrix)
    preconditioner = [
        [Fraction(Decimal(format(float(inverse[i, j]), ".17g"))) for j in range(DIMENSION)]
        for i in range(DIMENSION)
    ]
    return preconditioner, matrix


def left_product_error(
    preconditioner: list[list[Fraction]],
    jacobian: list[dict[int, Interval]],
) -> list[list[Interval]]:
    columns: list[list[tuple[int, Interval]]] = [[] for _ in range(DIMENSION)]
    for row_index, row in enumerate(jacobian):
        for column, value in row.items():
            columns[column].append((row_index, value))
    error = []
    for i in range(DIMENSION):
        error_row = []
        for j in range(DIMENSION):
            product = ZERO
            for k, value in columns[j]:
                product = product + value.scale(preconditioner[i][k])
            error_row.append(Interval.point(1 if i == j else 0) - product)
        error.append(error_row)
    return error


def krawczyk_root(
    midpoint: list[Fraction],
    radius: Fraction,
    active: list[Constraint],
    preconditioner: list[list[Fraction]],
):
    box = [Interval(value - radius, value + radius) for value in midpoint]
    jacobian = jacobian_rows(box, active)
    residual = point_function(midpoint, active)
    error = left_product_error(preconditioner, jacobian)
    delta = Interval(-radius, radius)
    images = []
    for i in range(DIMENSION):
        correction = sum(
            (preconditioner[i][k] * residual[k] for k in range(DIMENSION)),
            Fraction(),
        )
        image = Interval.point(midpoint[i] - correction)
        for value in error[i]:
            image = image + value * delta
        images.append(image)
    ratios = [
        max(midpoint[i] - image.lo, image.hi - midpoint[i]) / radius
        for i, image in enumerate(images)
    ]
    contraction = max(sum((value.magnitude() for value in row), Fraction()) for row in error)
    if not all(midpoint[i] - radius < images[i].lo <= images[i].hi < midpoint[i] + radius for i in range(DIMENSION)):
        raise AssertionError("Krawczyk root image is not strictly inside the box")
    if contraction >= 1:
        raise AssertionError("Krawczyk preconditioned Jacobian is not a contraction")
    return box, jacobian, images, max(ratios), contraction


def transpose_system_error(
    preconditioner: list[list[Fraction]],
    jacobian: list[dict[int, Interval]],
) -> list[list[Interval]]:
    # D = C^T and A = J^T.  Each column j of D*A uses only the nonzero
    # variables in active row j, so no dense interval multiplication is needed.
    error = []
    for i in range(DIMENSION):
        row = []
        for j in range(DIMENSION):
            product = ZERO
            for variable, value in jacobian[j].items():
                product = product + value.scale(preconditioner[variable][i])
            row.append(Interval.point(1 if i == j else 0) - product)
        error.append(row)
    return error


def propose_multipliers(point_matrix) -> list[Fraction]:
    import numpy as np

    objective = np.zeros(DIMENSION)
    objective[2::3] = 1
    approximate = np.linalg.solve(point_matrix.T, -objective)
    return [Fraction(Decimal(format(float(value), ".17g"))) for value in approximate]


def certify_multipliers(
    jacobian: list[dict[int, Interval]],
    preconditioner: list[list[Fraction]],
    midpoint: list[Fraction],
    radius: Fraction,
):

    # Residual H(lambda)=J(X)^T lambda + grad(f), enclosing the coefficient
    # matrix at the already isolated primal root.
    residual = [Interval.point(1 if variable % 3 == 2 else 0) for variable in range(DIMENSION)]
    for row_index, row in enumerate(jacobian):
        for variable, value in row.items():
            residual[variable] = residual[variable] + value.scale(midpoint[row_index])

    error = transpose_system_error(preconditioner, jacobian)
    delta = Interval(-radius, radius)
    images = []
    for i in range(DIMENSION):
        correction = ZERO
        for variable in range(DIMENSION):
            correction = correction + residual[variable].scale(preconditioner[variable][i])
        image = Interval.point(midpoint[i]) - correction
        for value in error[i]:
            image = image + value * delta
        images.append(image)
    ratios = [
        max(midpoint[i] - image.lo, image.hi - midpoint[i]) / radius
        for i, image in enumerate(images)
    ]
    if not all(midpoint[i] - radius < images[i].lo <= images[i].hi < midpoint[i] + radius for i in range(DIMENSION)):
        raise AssertionError("dual Krawczyk image is not strictly inside the multiplier box")
    lower = min(midpoint[i] - radius for i in range(DIMENSION))
    if lower <= 0:
        raise AssertionError("multipliers are not certified strictly positive")
    return midpoint, images, max(ratios), lower


def floor_decimal(value: Fraction, places: int) -> str:
    scale = 10**places
    scaled = value.numerator * scale // value.denominator
    return f"{scaled // scale}.{scaled % scale:0{places}d}"


def ceil_decimal(value: Fraction, places: int) -> str:
    scale = 10**places
    scaled = -(-value.numerator * scale // value.denominator)
    return f"{scaled // scale}.{scaled % scale:0{places}d}"


def upper_decimal(value: Fraction, places: int = 30) -> str:
    return ceil_decimal(value, places)


def lower_decimal(value: Fraction, places: int = 30) -> str:
    return floor_decimal(value, places)


def power_of_ten_label(value: Fraction) -> str:
    if value.numerator == 1:
        exponent = len(str(value.denominator)) - 1
        if value.denominator == 10**exponent:
            return f"1e-{exponent}"
    return finite_decimal(value)


def finite_decimal(value: Fraction) -> str:
    """Serialize a terminating rational exactly, without Decimal rounding."""
    sign = "-" if value < 0 else ""
    numerator, denominator = abs(value.numerator), value.denominator
    twos = fives = 0
    while denominator % 2 == 0:
        denominator //= 2
        twos += 1
    while denominator % 5 == 0:
        denominator //= 5
        fives += 1
    if denominator != 1:
        raise ValueError("certificate proposal is not a terminating decimal")
    places = max(twos, fives)
    numerator *= 2 ** (places - twos) * 5 ** (places - fives)
    scale = 10**places
    if places == 0:
        return sign + str(numerator)
    return f"{sign}{numerator // scale}.{numerator % scale:0{places}d}"


def generate_certificate() -> dict:
    seed = load_seed()
    active = detect_active(seed)
    midpoint = propose_midpoint(seed, active)
    preconditioner, point_matrix = rational_preconditioner(midpoint, active)
    dual_midpoint = propose_multipliers(point_matrix)
    certificate = {
        "schema_version": 1,
        "description": "Rational proposal data for exact interval verification; none of these approximations is trusted without prove_local_optimum.py.",
        "active_contacts": [key_string(key) for key in active],
        "root_midpoint": [finite_decimal(value) for value in midpoint],
        "root_radius": finite_decimal(ROOT_RADIUS),
        "preconditioner": [
            [finite_decimal(value) for value in row] for row in preconditioner
        ],
        "dual_midpoint": [finite_decimal(value) for value in dual_midpoint],
        "dual_radius": finite_decimal(DUAL_RADIUS),
    }
    CERTIFICATE.write_text(json.dumps(certificate, separators=(",", ":")) + "\n", encoding="utf-8")
    return certificate


def parse_key(value: str) -> Constraint:
    kind, first, second = value.split(":")
    if kind == "W":
        return (kind, int(first), second)
    if kind == "P":
        return (kind, int(first), int(second))
    raise ValueError(value)


def proof(certificate: dict | None = None) -> dict:
    if certificate is None:
        certificate = json.loads(CERTIFICATE.read_text(encoding="utf-8"))
    if certificate.get("schema_version") != 1:
        raise AssertionError("unsupported local-optimum certificate schema")
    seed = load_seed()
    detected = detect_active(seed)
    active = [parse_key(value) for value in certificate["active_contacts"]]
    if active != detected:
        raise AssertionError("certificate contact system differs from exact seed detection")
    midpoint = [Fraction(Decimal(value)) for value in certificate["root_midpoint"]]
    root_radius = Fraction(Decimal(certificate["root_radius"]))
    preconditioner = [
        [Fraction(Decimal(value)) for value in row]
        for row in certificate["preconditioner"]
    ]
    dual_midpoint = [Fraction(Decimal(value)) for value in certificate["dual_midpoint"]]
    dual_radius = Fraction(Decimal(certificate["dual_radius"]))
    if len(midpoint) != DIMENSION or len(dual_midpoint) != DIMENSION:
        raise AssertionError("certificate vector dimensions are incorrect")
    if len(preconditioner) != DIMENSION or any(len(row) != DIMENSION for row in preconditioner):
        raise AssertionError("certificate preconditioner dimensions are incorrect")
    box, jacobian, root_image, root_ratio, contraction = krawczyk_root(
        midpoint, root_radius, active, preconditioner
    )
    dual_midpoint, dual_image, dual_ratio, multiplier_lower = certify_multipliers(
        jacobian, preconditioner, dual_midpoint, dual_radius
    )

    active_set = set(active)
    inactive = [(gap(box, key), key) for key in ALL if key not in active_set]
    inactive_gap, inactive_key = min(inactive, key=lambda item: item[0].lo)
    if inactive_gap.lo <= 0:
        raise AssertionError("an inactive geometric constraint is not strictly separated")
    radius_lower = min(box[3 * i + 2].lo for i in range(N))
    if radius_lower <= 0:
        raise AssertionError("a radius is not strictly positive")

    score = Interval(
        sum((box[3 * i + 2].lo for i in range(N)), Fraction()),
        sum((box[3 * i + 2].hi for i in range(N)), Fraction()),
    )
    contact_serialization = "\n".join(key_string(key) for key in active) + "\n"
    certificate_bytes = (json.dumps(certificate, separators=(",", ":")) + "\n").encode()
    report = {
        "schema_version": 1,
        "status": "PASS",
        "claim": "The unique 78-contact configuration in the certified box is a strict local maximizer of the sum of radii for 26 circles in the unit square.",
        "decision_arithmetic": "closed intervals with exact rational endpoints",
        "floating_point_role": "mpmath and NumPy propose approximations only; every acceptance inequality is recomputed with Fraction endpoints",
        "certificate": {
            "path": "local_optimum_certificate.json",
            "sha256": hashlib.sha256(certificate_bytes).hexdigest(),
            "default_verifier_dependencies": "Python standard library only",
        },
        "constraint_model": {
            "wall_gap": "x-r, 1-x-r, y-r, or 1-y-r >= 0",
            "pair_gap": "(xi-xj)^2+(yi-yj)^2-(ri+rj)^2 >= 0",
            "objective": "sum of the 26 radii",
            "variables": DIMENSION,
            "geometric_constraints": len(ALL),
        },
        "contact_system": {
            "active_count": len(active),
            "wall_contacts": sum(key[0] == "W" for key in active),
            "pair_contacts": sum(key[0] == "P" for key in active),
            "contacts": [key_string(key) for key in active],
            "sha256": hashlib.sha256(contact_serialization.encode()).hexdigest(),
        },
        "primal_krawczyk": {
            "box_radius": power_of_ten_label(root_radius),
            "strict_inclusion": True,
            "maximum_component_inclusion_ratio_upper": upper_decimal(root_ratio),
            "preconditioned_jacobian_infinity_norm_upper": upper_decimal(contraction),
            "unique_root_in_box": True,
            "jacobian_nonsingular_throughout_box": True,
        },
        "feasibility": {
            "minimum_inactive_polynomial_gap_lower": lower_decimal(inactive_gap.lo, 40),
            "minimum_inactive_constraint": key_string(inactive_key),
            "minimum_radius_lower": lower_decimal(radius_lower, 40),
            "all_351_inactive_geometric_constraints_strict": True,
            "all_radii_strictly_positive": True,
        },
        "dual_krawczyk": {
            "box_radius": power_of_ten_label(dual_radius),
            "strict_inclusion": True,
            "maximum_component_inclusion_ratio_upper": upper_decimal(dual_ratio),
            "minimum_multiplier_lower": lower_decimal(multiplier_lower, 15),
            "all_78_multipliers_strictly_positive": True,
            "stationarity_sign_convention": "grad(objective) + J(active_gaps)^T lambda = 0",
        },
        "score_enclosure": {
            "lower": floor_decimal(score.lo, 105),
            "upper": ceil_decimal(score.hi, 105),
        },
        "theorem": {
            "root": "K(X) subset int(X) gives one unique regular zero x* in X.",
            "local_maximum": "Because the 78 active gap gradients form a basis and grad(f)=-J^T lambda with lambda>0, active gaps are local coordinates and every nonzero feasible gap vector strictly decreases f in a sufficiently small neighborhood.",
            "conclusion": "strict local maximum; no claim of global optimality",
        },
        "internal_certificate_dimensions": {
            "primal_image_components": len(root_image),
            "dual_image_components": len(dual_image),
            "dual_midpoint_components": len(dual_midpoint),
        },
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--regenerate-certificate",
        action="store_true",
        help="use pinned NumPy/mpmath only to replace the rational proposal data",
    )
    args = parser.parse_args()
    certificate = generate_certificate() if args.regenerate_certificate else None
    report = proof(certificate)
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
