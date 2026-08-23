# Exact evaluation contract: 26-circle unit-square packing

The authoritative candidate exposes `run_packing_exact()` and returns an object with exactly these fields:

- `format`: `circle-packing-exact-v2`
- `precision_bits`: an integer from 200 through 512
- `centers`: exactly 26 pairs of canonical nonnegative decimal strings
- `radii`: exactly 26 canonical nonnegative decimal strings, each greater than `0.000001`
- `sum_radii`: the canonical exact decimal sum of all radii

The verifier parses every decimal as `fractions.Fraction`. It rejects non-canonical strings, inconsistent sums, a circle outside `[0,1]^2`, or any negative pairwise squared margin. No geometric tolerance is used.

The score is the negative exact sum of radii. A canonical JSON serialization is bound to a SHA-256 payload digest; the score, margins, precision, and payload digest are bound to a second certificate digest.

`run_packing()` is a non-authoritative binary64 projection supplied only for visualization and generic tooling.
