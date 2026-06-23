# Iberian BESS Policy Challenge v0.1 Contract

Schema: `storage_arbitrage_es_benchmark_contract/v0.1`

## Scope

- Market: OMIE day-ahead
- Region: Iberia
- Horizon: 24 hourly prices
- Asset: single 1 MW / 4 MWh battery

## Baselines

- `no_operation_baseline`: commercial
- `quantile_dispatch_baseline`: primary_commercial_comparison
- `spread_tb4_baseline`: commercial
- `conservative_cycle_baseline`: commercial
- `customer_current_policy`: external_customer_policy_fixture
- `perfect_foresight_lp_upper_bound`: oracle_upper_bound

## Primary Metrics

`score`, `regret_mean_eur`, `baseline_shortfall_eur`, `cycle_adjusted_margin_mean_eur`, `downside_rate`, `constraint_breach_count`

## Limitations

- offline known-price dispatch
- frozen checked-in scenarios
- single battery only
- no intraday, reserves, portfolio, network, tax, imbalance, or bidding constraints
- not an official market benchmark
