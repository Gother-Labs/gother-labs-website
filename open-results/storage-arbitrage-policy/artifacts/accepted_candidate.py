"""Accepted candidate exported for the Open Result bundle.

This file contains only the accepted public storage dispatch policy. It omits
non-public proposal context and operational run records.
"""

def dispatch_policy(ctx: DispatchContext) -> DispatchPlan:
    prices = np.asarray(ctx.prices_eur_per_mwh, dtype=float)
    horizon = prices.size
    if horizon == 0:
        return DispatchPlan(charge_mw=[], discharge_mw=[], soc_mwh=[])
    spec = ctx.spec
    p_max = float(spec.power_mw)
    c_max = float(spec.capacity_mwh)
    n_ch = float(spec.charge_efficiency)
    n_di = float(spec.discharge_efficiency)
    target = float(spec.final_soc_target_mwh)
    soc = float(spec.initial_soc_mwh)
    charge_plan, discharge_plan, soc_trace = [], [], []
    efficiency_spread = n_ch * n_di
    for step in range(horizon):
        price = prices[step]
        rem = horizon - step - 1
        lookahead = prices[step + 1:step + 6]
        f_avg = float(np.mean(lookahead)) if lookahead.size > 0 else price
        t_min = max(0.0, target - (rem * p_max * n_ch))
        t_max = min(c_max, target + (rem * p_max / n_di))
        ch_lim = max(0.0, min(p_max, (c_max - soc) / n_ch if n_ch > 0 else 0.0, (t_max - soc) / n_ch if n_ch > 0 else 0.0))
        di_lim = max(0.0, min(p_max, (soc - 0.0) * n_di, (soc - t_min) * n_di))
        ch_p, di_p = 0.0, 0.0
        if rem == 0:
            if soc < target: ch_p = min(p_max, (target - soc) / n_ch if n_ch > 0 else 0.0)
            elif soc > target: di_p = min(p_max, (soc - target) * n_di)
        elif soc < t_min:
            ch_p = ch_lim
        elif soc > t_max:
            di_p = di_lim
        elif price < f_avg * (0.5 + 0.5 * efficiency_spread):
            ch_p = ch_lim
        elif price > f_avg * (1.5 - 0.5 * efficiency_spread):
            di_p = di_lim
        soc += (ch_p * n_ch) - (di_p / n_di if n_di > 0 else 0.0)
        soc = float(np.clip(soc, 0.0, c_max))
        charge_plan.append(float(ch_p))
        discharge_plan.append(float(di_p))
        soc_trace.append(float(soc))
    return DispatchPlan(charge_mw=charge_plan, discharge_mw=discharge_plan, soc_mwh=soc_trace)
