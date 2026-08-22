# Result-ledger narrative prototype

This branch prototypes a result-first presentation for optimization work. The public unit is a validated checkpoint, not a generation.

## Vocabulary

- **Baseline:** the frozen reference evaluated under the published contract.
- **Campaign:** a bounded search effort with a named method and configuration.
- **Candidate session:** one independent agent or optimizer trajectory within a campaign.
- **Evaluator probe:** one candidate scored under the frozen contract.
- **Accepted checkpoint:** a valid candidate that improves the incumbent.
- **Incumbent:** the best accepted checkpoint currently published.

Generation counts remain in provenance when they describe the search method, but campaigns using different search processes should not be forced onto a synthetic generation axis.

## Source data needed before publication

The website is generated from `gother-labs-results`, so this visual prototype should be backed by structured source fields before it is merged into the publishing path:

```yaml
result_ledger:
  baseline: {}
  checkpoints: []
  campaigns:
    - method: evolutionary | agentic | numerical
      candidate_sessions: 0
      evaluator_probes: 0
      accepted_checkpoint: null
  current_incumbent: {}
```

Each checkpoint should reference its evaluation contract, artifact, replay, metrics, and campaign. The generated website can then render one consistent ledger for evolutionary, agentic, and hybrid optimization work.
