# Evaluation contract: 26-circle unit-square packing

The candidate exposes `run_packing()` and returns `(centers, radii, reported_sum)`.

Required behavior:

- return exactly 26 centers and 26 radii
- each center is a finite pair `(x, y)`
- every radius is finite and greater than `1e-6`
- `reported_sum` is finite and matches `sum(radii)` within `1e-9`
- every circle remains inside the unit square within tolerance `1e-10`
- no pair of circles overlaps within tolerance `1e-10`
- two consecutive calls to `run_packing()` return the same centers, radii, and sum within `1e-12`

The score is `-reported_sum`. Lower score is better because minimizing the score maximizes total radius.

The published accepted candidate reconstructs the validated geometry from the evolved contact graph and a coarse deterministic seed. The replayed centers and radii are retained as audit evidence, but the public candidate implementation solves the contact equations before returning geometry to the evaluator.
