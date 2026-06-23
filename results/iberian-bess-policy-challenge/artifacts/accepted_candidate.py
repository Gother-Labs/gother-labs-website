"""Accepted storage_arbitrage_es policy used for the public pre-sell proof."""

from __future__ import annotations

from domains.storage_arbitrage_es.evaluator import (
    build_conservative_cycle_baseline,
    build_quantile_baseline,
    build_spread_tb4_baseline,
    simulate_dispatch,
)
from domains.storage_arbitrage_es.program import DispatchContext, DispatchPlan
from domains.storage_arbitrage_es.program import dispatch_policy as checked_in_policy


def dispatch_policy(ctx: DispatchContext) -> DispatchPlan:
    """Choose the highest-margin valid plan from a small deterministic policy portfolio."""
    candidates: list[tuple[float, str, DispatchPlan]] = []
    for label, builder in (
        ("quantile", build_quantile_baseline),
        ("spread_tb4", build_spread_tb4_baseline),
        ("conservative", build_conservative_cycle_baseline),
    ):
        plan = builder(ctx.prices_eur_per_mwh, ctx.spec)
        simulation = simulate_dispatch(ctx.prices_eur_per_mwh, plan, ctx.spec)
        if simulation.valid:
            candidates.append((float(simulation.profit_eur), label, plan))

    checked_plan = checked_in_policy(ctx)
    checked_simulation = simulate_dispatch(ctx.prices_eur_per_mwh, checked_plan, ctx.spec)
    if checked_simulation.valid:
        candidates.append((float(checked_simulation.profit_eur), "checked_in", checked_plan))

    if not candidates:
        return build_quantile_baseline(ctx.prices_eur_per_mwh, ctx.spec)

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]
