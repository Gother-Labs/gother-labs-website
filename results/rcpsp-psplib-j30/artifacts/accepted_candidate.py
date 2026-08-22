"""Accepted deterministic priority rule for the public PSPLIB J30 result."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ActivityView:
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
    activity: ActivityView
    state: ScheduleStateView
    priority: float


@dataclass(frozen=True, slots=True)
class InstanceView:
    instance_id: str
    horizon: int
    resource_capacities: tuple[int, ...]
    optimal_makespan: int
    job_count: int


class RcpspPriorityProgram:
    def score_activity(self, activity: ActivityView, state: ScheduleStateView, instance: InstanceView) -> float:
        return priority_score(activity, state, instance)

    def select_activity(self, eligible_activities: tuple[EligibleActivityView, ...], instance: InstanceView) -> int:
        return select_activity(eligible_activities, instance)


# EVOLVE_START: priority_score
def priority_score(activity: ActivityView, state: ScheduleStateView, instance: InstanceView) -> float:
    """Return a deterministic structural score combining urgency and pressure."""
    _ = instance
    demand_ratio = activity.demand_capacity_ratios[0] if activity.demand_capacity_ratios else 0.0
    weighted_demand = float(activity.demands[0]) * float(demand_ratio)
    features = (
        float(activity.downstream_critical_path),
        float(activity.duration),
        weighted_demand,
        float(len(activity.successors)),
        float(activity.transitive_successor_count),
        float(state.earliest_resource_feasible_start),
        float(max(0, state.earliest_resource_feasible_start - state.earliest_precedence_start)),
        float(max(0, state.current_makespan - state.earliest_precedence_start)),
        float(state.projected_finish),
        float(activity.bottleneck_ratio),
        float(activity.resource_pressure),
        float(activity.successor_work),
    )
    weights = (
        3.3361354926476796,
        0.18699002132011017,
        2.4505973763972735,
        -0.09293668648981424,
        3.3371341011147093,
        -13.251521592471839,
        1.0566568726367724,
        -0.30825674063037856,
        -0.01765515517782279,
        3.3477197898098976,
        -0.7005088135706682,
        -0.20886456423277294,
    )
    return float(sum(weight * value for weight, value in zip(weights, features)))
# EVOLVE_END


# EVOLVE_START: select_activity
def select_activity(eligible_activities: tuple[EligibleActivityView, ...], instance: InstanceView) -> int:
    """Select the highest deterministic priority and break ties by activity id."""
    _ = instance
    selected = max(eligible_activities, key=lambda item: (item.priority, -item.activity.id))
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
