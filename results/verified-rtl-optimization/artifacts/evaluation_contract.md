# Evaluation contract

This portfolio contains three independent before/after RTL cases. Each case remains bound to its own frozen circuit, target, correctness contract, and paired acceptance sample. There is no pooled portfolio score.

## Common sequence

1. Freeze editable RTL, protected interfaces, functional semantics, formal scope, implementation flow, target, primary metrics, and validity limits.
2. Reject candidates that fail syntax, structure, deterministic functional checks, or the declared formal-equivalence scope.
3. Measure only correctness-valid candidates on the pinned academic VTR/VPR homogeneous LUT6 target with the PTM 45 nm model at 0.9 V and 85 C.
4. Freeze the accepted RTL by hash before the project-contract publication sample.
5. Evaluate 64 fixed paired implementations per case under the case-specific activity model.
6. Accept only when the declared correctness, evidence-completeness, confidence-bound, and resource/metric validity gates pass.

## Metric interpretation

The primary implementation-model readouts are total area, post-route critical-path delay, and active total power. The case-local composite is the equal-weight geometric mean of paired area, delay, and active-power ratios, with the baseline normalized to 1.0 and lower values preferred.

The common score form does not make the three circuits comparable. Different designs, wrappers, activity contracts, and functional workloads mean that case percentages must not be averaged, ranked, or converted into an expected customer uplift.

## Evidence boundary

The public package exposes stable references to baseline and accepted RTL, exact patches, correctness summaries, paired evaluation summaries, provenance, case reports, public verifiers, and hash-addressed raw evidence archives.

The public verifier audits recorded evidence and re-extracts reported metrics from archived logs when the raw archive is supplied. It does not rerun the EDA tools. A fresh external EDA rerun is a stronger reproduction step and is not claimed by this portfolio.

## Claim boundary

These are academic implementation-model comparisons. They are not ASIC signoff, Vivado or Quartus characterization, physical-board measurements, measured energy, manufactured-silicon evidence, accredited certification, or signed independent third-party assurance. The ML-KEM CBD case is not side-channel analysis or certification of a complete ML-KEM system.
