# Evaluation contract

The public qubit-routing result uses the frozen 24-circuit LightSABRE swap-reduction surface.

## Portfolio

- 24 benchmark circuits.
- 3 topology targets: Q20, Willow, and Heron-FEZ.
- 72 total circuit/topology cases.
- Full trial mode with 20 layout trials and 20 routing trials.

## Candidate surface

The candidate changes the deterministic routing policy implementation in `program.rs`. The benchmark scaffold, portfolio assets, scoring direction, and validator remain fixed.

## Score

For each evaluated candidate, the evaluator compares added CNOT count against the LightSABRE reference. The governed score is the negative weighted CNOT reduction:

`score = -weighted_cnot_delta_vs_lightsabre`

Lower is better. The article also reports the positive weighted CNOT reduction because it is the more readable optimization quantity.

## Validity

A candidate must successfully route every case, return finite metrics, preserve deterministic replay behavior, and reproduce the recorded score within an absolute tolerance of 1e-6. The accepted candidate replayed exactly with score `-11506.200000000026` and validity 1.0.
