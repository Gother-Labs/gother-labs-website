from pathlib import Path

path = Path("styles.css")
text = path.read_text().rstrip()
marker = "#123: remove legacy BESS pseudo-labels once native header semantics are retained."
if marker in text:
    raise SystemExit("#123 pseudo-label cleanup already present")
patch = r'''

@media (max-width: 820px) {
  /* #123: remove legacy BESS pseudo-labels once native header semantics are retained. */
  .bess-whitepaper .bess-contract-table .result-table td:nth-child(n)::before,
  .bess-whitepaper .bess-scenario-table .result-table td:nth-child(n)::before,
  .bess-whitepaper .bess-robustness-table .result-table td:nth-child(n)::before,
  .bess-whitepaper .bess-customer-readout-table .result-table td:nth-child(n)::before {
    display: none !important;
    content: none !important;
  }
}
'''
path.write_text(text + patch.rstrip() + "\n")
