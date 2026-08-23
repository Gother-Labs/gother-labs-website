# Evaluation contract: 26 variable-radius circles

Each certificate contains exactly 26 rows with finite decimal strings for `x`, `y`, and `radius`. The verifier parses every decimal through `Decimal` into `fractions.Fraction`; binary floating-point never determines acceptance.

For a rational tolerance `tau >= 0`, every radius must be positive, every wall gap must be at least `-tau`, and every pair must satisfy:

```text
(xi - xj)^2 + (yi - yj)^2 >= (ri + rj - tau)^2
```

whenever `ri + rj - tau > 0`.

The score is the exact rational sum of the 26 radii. Higher is better within one fixed tolerance contract. Scores from different tolerances are not interchangeable.

Every primary verification performs:

- 104 wall decisions;
- 325 pairwise decisions;
- 26 radius-positivity decisions;
- 455 total exact decisions.

The three governed certificates are:

- `tolerance_1e-6.csv` under `tau = 1e-6`;
- `tolerance_1e-10.csv` under `tau = 1e-10`;
- `exact.csv` under `tau = 0`.

The two relaxed certificates are also rechecked at zero and must fail. Square roots may be computed for human-readable margins, but never for pass/fail.

The strict local-optimum theorem is a second contract. `prove_local_optimum.py` checks a rational Krawczyk inclusion for one 78-contact root, strict feasibility of the remaining 351 geometric constraints, and a rational enclosure of 78 positive KKT multipliers. It proves strict local optimality only; it does not prove global optimality.
