# Evaluation contract: PSPLIB J30 RCPSP

## Benchmark

The public benchmark is a frozen subset of the Project Scheduling Problem Library (PSPLIB) J30 single-mode resource-constrained project scheduling problem. The portfolio contains 80 instances: parameters 1, 7, 13, 19, 25, 31, 37, and 43 crossed with instances 1 through 10. Every evaluated instance has a proven optimal makespan in the PSPLIB solution set.

## Candidate surface

Candidates may change only the deterministic activity-priority rule used by serial schedule generation:

- `priority_score(activity, state, instance)` returns a finite float for each eligible activity.
- `select_activity(eligible_activities, instance)` chooses one currently eligible activity id.

The evaluator then schedules the selected activity at the earliest time that satisfies all predecessor and renewable-resource constraints.

## Validity gates

A candidate is invalid if it returns non-finite priority values, chooses a non-eligible activity, violates precedence, exceeds renewable-resource capacities, omits an activity, or uses non-deterministic behavior. The accepted candidate reported here evaluated 80/80 instances with zero feasibility penalty and zero invalid priority values.

## Objective

The objective is lower-is-better:

`score = mean_gap_pct + 0.35 * p95_gap_pct + feasibility_penalty`

where `gap_pct = 100 * (candidate_makespan - optimal_makespan) / optimal_makespan`. The public chain reports a score reduction from 14.312164873860446 to 12.086633114086395.

## Scope

This is a bounded public scheduling benchmark. It is not a wall-clock speed benchmark, it does not cover all 480 J30 instances, and it is not presented as a production scheduler without further validation.
