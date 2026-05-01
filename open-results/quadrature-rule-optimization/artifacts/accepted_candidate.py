"""Accepted candidate exported for the Open Result bundle.

This file contains only the accepted public quadrature rule. It omits
non-public proposal context and operational run records.
"""

# EVOLVE_START: quadrature_rule
def quadrature_rule(spec: QuadratureSpec) -> QuadratureRule:
    """
    Construct a quadrature rule using Gauss-Legendre nodes with enhanced endpoint clustering.
    """
    n = max(1, int(spec.n_points))
    if n == 1:
        return QuadratureRule(nodes=[0.5], weights=[1.0])

    nodes, weights = np.polynomial.legendre.leggauss(n)
    if n >= 2:
        alpha = 1.7
        nodes = np.sign(nodes) * (np.abs(nodes) ** alpha)

    mapped_nodes = 0.5 * (nodes + 1.0)
    mapped_weights = 0.5 * weights
    rule = QuadratureRule(nodes=list(mapped_nodes), weights=list(mapped_weights))

    if getattr(spec, "enforce_symmetry", False):
        n_half = n // 2
        for i in range(n_half):
            avg_node = 0.5 * (rule.nodes[i] + (1.0 - rule.nodes[n - 1 - i]))
            rule.nodes[i] = avg_node
            rule.nodes[n - 1 - i] = 1.0 - avg_node
            avg_weight = 0.5 * (rule.weights[i] + rule.weights[n - 1 - i])
            rule.weights[i] = avg_weight
            rule.weights[n - 1 - i] = avg_weight

    return _renormalize(rule)
# EVOLVE_END
