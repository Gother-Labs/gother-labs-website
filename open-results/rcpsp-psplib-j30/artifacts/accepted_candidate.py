"""Evolvable priority rule for PSPLIB J30 RCPSP scheduling."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ActivityView:
    """Immutable activity facts exposed to the priority rule."""

    id: int
    duration: int
    demands: tuple[int, ...]
    demand_capacity_ratios: tuple[float, ...]
    successors: tuple[int, ...]
    predecessors: tuple[int, ...]
    critical_path_tail: int
    downstream_critical_path: int
    resource_pressure: float
    bottleneck_ratio: float
    transitive_successor_count: int
    successor_work: int


@dataclass(frozen=True, slots=True)
class ScheduleStateView:
    """Immutable partial-schedule facts exposed to the priority rule."""

    scheduled: frozenset[int]
    unscheduled: frozenset[int]
    eligible: tuple[int, ...]
    earliest_precedence_start: int
    earliest_resource_feasible_start: int
    resource_wait: int
    projected_finish: int
    current_makespan: int
    remaining_count: int
    scheduled_count: int
    eligible_count: int
    remaining_work: int


@dataclass(frozen=True, slots=True)
class EligibleActivityView:
    """One eligible activity plus its local state and priority score."""

    activity: ActivityView
    state: ScheduleStateView
    priority: float


@dataclass(frozen=True, slots=True)
class InstanceView:
    """Immutable benchmark instance facts exposed to the priority rule."""

    instance_id: str
    horizon: int
    resource_capacities: tuple[int, ...]
    optimal_makespan: int
    job_count: int


class RcpspPriorityProgram:
    """Program wrapper exposing the evolvable priority score."""

    def score_activity(self, activity: ActivityView, state: ScheduleStateView, instance: InstanceView) -> float:
        """Return the score used by the evaluator to choose the next activity."""
        return priority_score(activity, state, instance)

    def select_activity(self, eligible_activities: tuple[EligibleActivityView, ...], instance: InstanceView) -> int:
        """Return the selected activity id from the eligible set."""
        return select_activity(eligible_activities, instance)


# EVOLVE_START: priority_score
def priority_score(activity: ActivityView, state: ScheduleStateView, instance: InstanceView) -> float:
    """Return a deterministic priority score for one eligible RCPSP activity."""
    # Critical path urgency: prioritize jobs that are on the critical path
    cp_score = activity.critical_path_tail * 3.0
    # Downstream impact: prioritize jobs that unlock more work
    unlock_score = activity.successor_work * 0.15 + activity.transitive_successor_count * 1.5
    # Resource contention: prioritize jobs that are bottleneck-heavy
    resource_score = activity.bottleneck_ratio * 100.0 + activity.resource_pressure * 10.0
    # Urgency: penalize jobs that have been waiting past their earliest possible start
    wait_time = max(0, state.current_makespan - state.earliest_precedence_start)
    wait_score = wait_time * 1.5
    # Remaining work pressure: scale priority based on total remaining work to maintain throughput
    remaining_score = state.remaining_work * 0.05
    # Final score with tie-breaker based on job ID
    return cp_score + unlock_score + resource_score + wait_score + remaining_score - (0.01 * activity.id)
# EVOLVE_END


# EVOLVE_START: select_activity
def select_activity(eligible_activities: tuple[EligibleActivityView, ...], instance: InstanceView) -> int:
    """Choose one eligible activity after all local priority scores are available."""
    # Prioritize earlier start times to keep resources busy, then use the refined priority score.
    selected = min(eligible_activities, key=lambda item: (item.state.earliest_resource_feasible_start, -item.priority))
    return int(selected.activity.id)
# EVOLVE_END


__all__ = [
    "ActivityView",
    "EligibleActivityView",
    "InstanceView",
    "RcpspPriorityProgram",
    "ScheduleStateView",
    "priority_score",
    "select_activity",
]
