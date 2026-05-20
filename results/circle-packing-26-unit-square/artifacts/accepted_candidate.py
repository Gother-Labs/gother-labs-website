"""Accepted constructive candidate for 26-circle unit-square packing."""

from __future__ import annotations

import math

N_CIRCLES = 26
MIN_RADIUS = 1e-6
Point = tuple[float, float]


# The evolved run exposed a tight contact graph. The public candidate solves
# that geometry system from a coarse deterministic seed instead of returning
# the replayed coordinates directly.
BOUNDARY_CONTACTS = (
    (0, "left"),
    (0, "bottom"),
    (1, "right"),
    (1, "bottom"),
    (2, "left"),
    (2, "top"),
    (3, "right"),
    (3, "top"),
    (5, "bottom"),
    (6, "bottom"),
    (7, "bottom"),
    (9, "left"),
    (13, "right"),
    (14, "left"),
    (18, "right"),
    (19, "left"),
    (22, "top"),
    (23, "right"),
    (24, "top"),
    (25, "top"),
)

CONTACT_EDGES = (
    (0, 4),
    (0, 5),
    (0, 9),
    (1, 7),
    (1, 8),
    (1, 13),
    (2, 19),
    (2, 24),
    (3, 22),
    (3, 23),
    (4, 5),
    (4, 9),
    (4, 10),
    (4, 15),
    (5, 6),
    (5, 10),
    (6, 7),
    (6, 10),
    (6, 11),
    (7, 8),
    (7, 11),
    (8, 11),
    (8, 12),
    (8, 13),
    (9, 14),
    (9, 15),
    (10, 11),
    (10, 15),
    (10, 16),
    (11, 12),
    (11, 16),
    (12, 13),
    (12, 16),
    (12, 17),
    (12, 18),
    (13, 18),
    (14, 15),
    (14, 19),
    (14, 20),
    (15, 16),
    (15, 20),
    (16, 17),
    (16, 20),
    (17, 18),
    (17, 21),
    (17, 22),
    (17, 23),
    (18, 23),
    (19, 20),
    (19, 24),
    (20, 21),
    (20, 24),
    (21, 22),
    (21, 24),
    (21, 25),
    (22, 23),
    (22, 25),
    (24, 25),
)


def _coarse_seed_layout() -> list[float]:
    """Return a low-precision seed near the evolved contact pattern."""
    seed_rows = (
        (0.11, 0.11, 0.11),
        (0.89, 0.11, 0.11),
        (0.08, 0.92, 0.08),
        (0.92, 0.92, 0.08),
        (0.24, 0.24, 0.07),
        (0.31, 0.09, 0.09),
        (0.50, 0.09, 0.09),
        (0.69, 0.09, 0.09),
        (0.76, 0.24, 0.07),
        (0.10, 0.32, 0.10),
        (0.40, 0.26, 0.10),
        (0.60, 0.26, 0.10),
        (0.73, 0.40, 0.10),
        (0.90, 0.32, 0.10),
        (0.10, 0.52, 0.10),
        (0.27, 0.40, 0.10),
        (0.50, 0.47, 0.14),
        (0.70, 0.62, 0.12),
        (0.90, 0.52, 0.10),
        (0.11, 0.73, 0.11),
        (0.30, 0.62, 0.12),
        (0.50, 0.73, 0.11),
        (0.70, 0.87, 0.13),
        (0.89, 0.73, 0.11),
        (0.30, 0.87, 0.13),
        (0.50, 0.92, 0.08),
    )
    return [value for row in seed_rows for value in row]


# EVOLVE_START: construct_packing
def _contact_residuals(values: list[float]) -> list[float]:
    """Residuals for boundary contacts and pairwise tangent contacts."""
    residuals: list[float] = []

    for index, side in BOUNDARY_CONTACTS:
        x = values[3 * index]
        y = values[3 * index + 1]
        radius = values[3 * index + 2]
        if side == "left":
            residuals.append(x - radius)
        elif side == "right":
            residuals.append(1.0 - x - radius)
        elif side == "bottom":
            residuals.append(y - radius)
        elif side == "top":
            residuals.append(1.0 - y - radius)
        else:
            raise ValueError(f"unknown boundary side: {side}")

    for left, right in CONTACT_EDGES:
        dx = values[3 * left] - values[3 * right]
        dy = values[3 * left + 1] - values[3 * right + 1]
        residuals.append(math.hypot(dx, dy) - values[3 * left + 2] - values[3 * right + 2])

    return residuals


def _residual_norm(values: list[float]) -> float:
    """Return the infinity norm of the contact residual vector."""
    return max(abs(value) for value in _contact_residuals(values))


def _contact_jacobian(values: list[float], residuals: list[float]) -> list[list[float]]:
    """Build a finite-difference Jacobian for the contact equations."""
    jacobian = [[0.0 for _ in values] for _ in residuals]
    for column, value in enumerate(values):
        step = 1e-6 * max(1.0, abs(value))
        shifted = list(values)
        shifted[column] += step
        shifted_residuals = _contact_residuals(shifted)
        for row, residual in enumerate(residuals):
            jacobian[row][column] = (shifted_residuals[row] - residual) / step
    return jacobian


def _solve_linear_system(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Solve a dense square system with partial-pivot Gauss-Jordan elimination."""
    size = len(rhs)
    augmented = [matrix[row][:] + [rhs[row]] for row in range(size)]

    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-14:
            raise RuntimeError("contact Jacobian became singular")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]

        pivot_value = augmented[column][column]
        for item in range(column, size + 1):
            augmented[column][item] /= pivot_value

        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor == 0.0:
                continue
            for item in range(column, size + 1):
                augmented[row][item] -= factor * augmented[column][item]

    return [augmented[row][size] for row in range(size)]


def _bounded_step(values: list[float], step: list[float], scale: float) -> list[float]:
    """Apply one damped Newton step while keeping variables in valid ranges."""
    updated: list[float] = []
    for index, value in enumerate(values):
        candidate = value + scale * step[index]
        if index % 3 == 2:
            updated.append(min(0.5, max(MIN_RADIUS, candidate)))
        else:
            updated.append(min(1.0, max(0.0, candidate)))
    return updated


def _solve_contact_system() -> tuple[list[Point], list[float]]:
    """Solve the evolved contact graph into concrete centers and radii."""
    values = _coarse_seed_layout()
    for _ in range(12):
        residuals = _contact_residuals(values)
        if max(abs(value) for value in residuals) < 1e-12:
            break
        jacobian = _contact_jacobian(values, residuals)
        newton_step = _solve_linear_system(jacobian, [-value for value in residuals])
        baseline_norm = _residual_norm(values)
        step_scale = 1.0
        while step_scale > 1e-4:
            candidate = _bounded_step(values, newton_step, step_scale)
            if _residual_norm(candidate) < baseline_norm:
                values = candidate
                break
            step_scale *= 0.5
        else:
            raise RuntimeError("contact solve failed to find a decreasing Newton step")

    if _residual_norm(values) >= 1e-10:
        raise RuntimeError("contact solve did not converge to evaluator tolerance")

    solved_centers = [(values[3 * index], values[3 * index + 1]) for index in range(N_CIRCLES)]
    solved_radii = [values[3 * index + 2] for index in range(N_CIRCLES)]
    return solved_centers, solved_radii


def _assert_valid(centers: list[Point], radii: list[float]) -> None:
    """Fail fast if numerical drift breaks the public geometry contract."""
    tolerance = 1e-10
    for index, ((x, y), radius) in enumerate(zip(centers, radii, strict=True)):
        if radius <= MIN_RADIUS:
            raise ValueError(f"circle {index} has non-positive radius")
        if x - radius < -tolerance or x + radius > 1.0 + tolerance:
            raise ValueError(f"circle {index} exceeds x-boundary")
        if y - radius < -tolerance or y + radius > 1.0 + tolerance:
            raise ValueError(f"circle {index} exceeds y-boundary")

    for left in range(N_CIRCLES):
        for right in range(left + 1, N_CIRCLES):
            dx = centers[left][0] - centers[right][0]
            dy = centers[left][1] - centers[right][1]
            if math.hypot(dx, dy) + tolerance < radii[left] + radii[right]:
                raise ValueError(f"circles {left} and {right} overlap")


def construct_packing() -> tuple[list[Point], list[float]]:
    """Construct the accepted 26-circle packing from its contact graph."""
    centers, radii = _solve_contact_system()
    _assert_valid(centers, radii)
    return centers, radii


def run_packing() -> tuple[list[Point], list[float], float]:
    """Return centers, radii, and total radius for the evaluator."""
    centers, radii = construct_packing()
    return centers, radii, float(sum(radii))
# EVOLVE_END


__all__ = ["N_CIRCLES", "MIN_RADIUS", "Point", "construct_packing", "run_packing"]
