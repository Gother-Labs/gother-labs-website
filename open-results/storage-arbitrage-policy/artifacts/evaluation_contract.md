# Evaluation contract

The storage result is scored on a frozen set of OMIE day-ahead price scenarios
using a deterministic battery model. Candidate policies receive a dispatch
context and must return one charge, discharge, and state-of-charge value per
price step.

The objective is lower-is-better. It combines scenario-level regret against an
oracle with validity checks for power limits, state-of-charge bounds, and the
terminal state-of-charge target. A candidate can be retained only when it
improves the objective under the unchanged scenario set and scoring rule.

This public contract intentionally excludes non-public generation context,
operational run records, sensitive configuration, and uncurated intermediate
material.
