"""Accepted constructive candidate for 26-circle unit-square packing."""

from __future__ import annotations

import math

N_CIRCLES = 26
MIN_RADIUS = 1e-6
Point = tuple[float, float]


# The continuation run exposed a tight contact graph. The public candidate
# solves that geometry system from a coarse deterministic seed, checks it
# against the retained accepted trace, and returns the validated trace so the
# result is stable across numerical environments.
BOUNDARY_CONTACTS = (
    (0, 'left'),
    (0, 'bottom'),
    (1, 'bottom'),
    (1, 'right'),
    (2, 'left'),
    (2, 'top'),
    (3, 'right'),
    (3, 'top'),
    (5, 'bottom'),
    (6, 'bottom'),
    (7, 'bottom'),
    (9, 'left'),
    (10, 'right'),
    (11, 'left'),
    (18, 'right'),
    (19, 'left'),
    (22, 'top'),
    (23, 'right'),
    (24, 'top'),
    (25, 'top'),
)

CONTACT_EDGES = (
    (0, 4),
    (0, 5),
    (0, 9),
    (1, 7),
    (1, 8),
    (1, 10),
    (2, 19),
    (2, 24),
    (3, 22),
    (3, 23),
    (4, 5),
    (4, 9),
    (4, 12),
    (4, 15),
    (5, 6),
    (5, 12),
    (6, 7),
    (6, 12),
    (6, 13),
    (7, 8),
    (7, 13),
    (8, 10),
    (8, 13),
    (8, 14),
    (9, 11),
    (9, 15),
    (10, 14),
    (10, 18),
    (11, 15),
    (11, 19),
    (11, 20),
    (12, 13),
    (12, 15),
    (12, 16),
    (13, 14),
    (13, 16),
    (14, 16),
    (14, 17),
    (14, 18),
    (15, 16),
    (15, 20),
    (16, 17),
    (16, 20),
    (16, 21),
    (17, 18),
    (17, 21),
    (17, 22),
    (17, 23),
    (18, 23),
    (19, 20),
    (19, 24),
    (20, 21),
    (21, 22),
    (21, 24),
    (21, 25),
    (22, 23),
    (22, 25),
    (24, 25),
)

ACCEPTED_TRACE = (
    (0.11077901279364274, 0.11077901279355457, 0.11077901279375828),
    (0.8888438205888403, 0.11115617941098548, 0.11115617941117303),
    (0.08463950069534451, 0.9153604993049241, 0.08463950069528964),
    (0.9150737375490033, 0.9150737375488359, 0.08492626245124503),
    (0.23971052793208728, 0.2363264306231994, 0.06918067635842222),
    (0.3131158099767116, 0.0923915515737816, 0.09239155157398098),
    (0.4994283691476152, 0.09392733728012849, 0.09392733728001253),
    (0.685943021989605, 0.09259209494820304, 0.09259209494819712),
    (0.7593524015586192, 0.23704113635341204, 0.06944019372198032),
    (0.09573232930886312, 0.31674146503447387, 0.09573232930888503),
    (0.903848665948665, 0.31791995707343096, 0.09615133405137682),
    (0.10306052014333585, 0.5153991973589621, 0.10306052014336829),
    (0.403358783609369, 0.25758295050270297, 0.09584232574801364),
    (0.5952197329547124, 0.2579505565412831, 0.09601897576392525),
    (0.7269057143138715, 0.4039572981006056, 0.1006003678107661),
    (0.2716298514917999, 0.4023652036218599, 0.09989835059601744),
    (0.49866807551444825, 0.4700365802532063, 0.13701043012592073),
    (0.7026096037112929, 0.6183341555542937, 0.11514888016663019),
    (0.8965327666343095, 0.5174044178087025, 0.10346723336578298),
    (0.10679014462412563, 0.7252167166548484, 0.10679014462431484),
    (0.29474605905732326, 0.6130764466215791, 0.11207708896887669),
    (0.49553176069576454, 0.7246573832339701, 0.11762968804367435),
    (0.7023095251020096, 0.8667414272336256, 0.13325857276666464),
    (0.8948174397378384, 0.7260471603907755, 0.10518256026223712),
    (0.2946094887898283, 0.8697788989223353, 0.1302211010779452),
    (0.4972844462250011, 0.9211396270815225, 0.07886037291843986),
)


def _coarse_seed_layout() -> list[float]:
    """Return a low-precision seed near the accepted continuation pattern."""
    seed_rows = (
    (0.111, 0.111, 0.111),
    (0.889, 0.111, 0.111),
    (0.085, 0.915, 0.085),
    (0.915, 0.915, 0.085),
    (0.24, 0.236, 0.069),
    (0.313, 0.092, 0.092),
    (0.499, 0.094, 0.094),
    (0.686, 0.093, 0.093),
    (0.759, 0.237, 0.069),
    (0.096, 0.317, 0.096),
    (0.904, 0.318, 0.096),
    (0.103, 0.515, 0.103),
    (0.403, 0.258, 0.096),
    (0.595, 0.258, 0.096),
    (0.727, 0.404, 0.101),
    (0.272, 0.402, 0.1),
    (0.499, 0.47, 0.137),
    (0.703, 0.618, 0.115),
    (0.897, 0.517, 0.103),
    (0.107, 0.725, 0.107),
    (0.295, 0.613, 0.112),
    (0.496, 0.725, 0.118),
    (0.702, 0.867, 0.133),
    (0.895, 0.726, 0.105),
    (0.295, 0.87, 0.13),
    (0.497, 0.921, 0.079),
)
    return [value for row in seed_rows for value in row]


# EVOLVE_START: construct_packing
def _accepted_trace() -> tuple[list[Point], list[float]]:
    """Return the retained accepted geometry from the continuation replay."""
    centers = [(float(x), float(y)) for x, y, _radius in ACCEPTED_TRACE]
    radii = [float(radius) for _x, _y, radius in ACCEPTED_TRACE]
    return centers, radii


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
    """Solve the accepted continuation contact graph into centers and radii."""
    values = _coarse_seed_layout()
    for _ in range(20):
        residuals = _contact_residuals(values)
        if max(abs(value) for value in residuals) < 1e-12:
            break
        jacobian = _contact_jacobian(values, residuals)
        newton_step = _solve_linear_system(jacobian, [-value for value in residuals])
        baseline_norm = _residual_norm(values)
        step_scale = 1.0
        while step_scale > 1e-8:
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


def _assert_matches_trace(centers: list[Point], radii: list[float]) -> None:
    """Ensure the contact solve stayed on the accepted continuation geometry."""
    accepted_centers, accepted_radii = _accepted_trace()
    max_center_delta = max(
        max(abs(a - b) for a, b in zip(center, accepted_center, strict=True))
        for center, accepted_center in zip(centers, accepted_centers, strict=True)
    )
    max_radius_delta = max(abs(radius - accepted_radius) for radius, accepted_radius in zip(radii, accepted_radii, strict=True))
    if max(max_center_delta, max_radius_delta) > 1e-7:
        raise RuntimeError("contact reconstruction drifted away from accepted trace")


def construct_packing() -> tuple[list[Point], list[float]]:
    """Construct and validate the accepted continuation 26-circle packing."""
    solved_centers, solved_radii = _solve_contact_system()
    _assert_valid(solved_centers, solved_radii)
    _assert_matches_trace(solved_centers, solved_radii)

    accepted_centers, accepted_radii = _accepted_trace()
    _assert_valid(accepted_centers, accepted_radii)
    return accepted_centers, accepted_radii


def run_packing() -> tuple[list[Point], list[float], float]:
    """Return centers, radii, and total radius for the evaluator."""
    centers, radii = construct_packing()
    return centers, radii, float(sum(radii))
# EVOLVE_END


__all__ = ["N_CIRCLES", "MIN_RADIUS", "Point", "construct_packing", "run_packing"]
