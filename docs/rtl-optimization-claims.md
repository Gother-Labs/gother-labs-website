# RTL optimization page claim ledger

This ledger governs quantitative and capability claims on
`/rtl-optimization/`. The website is a public presentation surface, not the
authority for the underlying evidence.

## Evidence snapshot

- Canonical public repository:
  `https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study`
- Reviewed release: `v2.2.2`
- Reviewed commit: `8cd8b47`
- Website reconciliation date: `2026-08-24`
- Public evidence scope: three independent RTL cases under academic VTR/PTM
  45 nm homogeneous LUT6 evaluation contracts.

## Published claim map

| Website claim | Canonical source | Required context |
| --- | --- | --- |
| SHA-1: 2.27% lower composite PPA estimate | `cases/sha1/README.md` at `v2.2.2` | Academic VTR/PTM 45 nm estimate; case-local frozen contract |
| INT8 MatVec: 8.3230% lower composite PPA estimate | `cases/int8-matvec/README.md` at `v2.2.2` | Academic homogeneous LUT6 target; no commercial DSP/BRAM/ASIC cell model |
| ML-KEM CBD: 9.7338% lower composite PPA estimate | `cases/mlkem-cbd/README.md` at `v2.2.2` | Academic VTR/PTM 45 nm estimate; not side-channel analysis or system certification |
| Public packages include before/after RTL, exact patch, correctness evidence, paired measurements, checksums, and verifier | Repository `README.md`, `METHODOLOGY.md`, and case READMEs at `v2.2.2` | Optimization machinery is outside the public evidence boundary |
| A customer pilot freezes one design and evaluation contract before optimization | Repository `README.md` and `METHODOLOGY.md` at `v2.2.2` | Customer-owned flow and acceptance policy remain authoritative |

## Mandatory boundary

The three public percentages must never be presented as:

- ASIC signoff or commercial-FPGA characterization;
- board, measured-energy, or manufactured-silicon evidence;
- a guaranteed customer outcome;
- a cross-circuit ranking, average expected uplift, or universal range;
- certification of a complete cryptographic or AI system.

Public claims must state that each percentage applies only to its case's frozen
contract. Formal claims must remain within the scope declared by the source
case.

## Change control

Reconcile this ledger and the public page whenever the evidence repository
publishes a new release. Do not update a percentage from an untagged branch,
private run, draft report, or unpublished customer engagement. Every new
quantitative claim needs a stable public source and its limitations on the same
page.
