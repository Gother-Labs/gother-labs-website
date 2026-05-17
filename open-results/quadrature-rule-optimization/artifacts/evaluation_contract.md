# Evaluation contract

The quadrature result is scored on a fixed suite of one-dimensional analytic
integrands. Candidate rules define nodes and weights. The evaluator computes the
absolute integration error for each integrand and aggregates those errors into a
single objective.

The objective is lower-is-better. A candidate can be retained only when it
improves the objective under the unchanged integrand suite and scoring rule.

This public contract intentionally excludes non-public generation context,
operational run records, sensitive configuration, and uncurated intermediate
material.
