#!/usr/bin/env python3
"""Confidence intervals and multiple-comparison correction for the
persona-level Big Five x alignment correlations (Track A paper, section 5.3).

Input : docs/paper/data/persona_sim_analysis-260705.json (persona_stats)
Output: printed table. Deterministic (bootstrap seed 20261120).

Unit of analysis is the persona (n = 15), not the scene-play (n = 193):
scene-plays are nested within personas and are not independent.

Run from the repo root:  python3 tools/persona-sim/scripts/7_corr_ci.py
Requires numpy and scipy.
"""
import json
import math
import os

import numpy as np
from scipy import stats

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
PATH = os.path.join(ROOT, 'docs', 'paper', 'data', 'persona_sim_analysis-260705.json')
TRAITS = ['O', 'A', 'E', 'C', 'N']
SEED = 20261120
N_BOOT = 10000

ps = json.load(open(PATH, encoding='utf-8'))['persona_stats']
y = np.array([p['obj_mean'] for p in ps])
n = len(y)

rows = []
for t in TRAITS:
    x = np.array([p['bigfive'][t] for p in ps])
    r, p = stats.pearsonr(x, y)
    z, se = math.atanh(r), 1 / math.sqrt(n - 3)          # Fisher z interval
    lo, hi = math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)
    rho, p_rho = stats.spearmanr(x, y)
    rows.append(dict(t=t, r=r, p=p, lo=lo, hi=hi, rho=rho, p_rho=p_rho, x=x))

# Holm step-down over the five traits tested together
m, prev = len(rows), 0.0
for i, row in enumerate(sorted(rows, key=lambda d: d['p'])):
    prev = min(1.0, max(prev, (m - i) * row['p']))
    row['holm'] = prev

# Percentile bootstrap over personas
rng = np.random.default_rng(SEED)
for row in rows:
    bs = []
    for _ in range(N_BOOT):
        i = rng.integers(0, n, n)
        if np.std(row['x'][i]) > 0 and np.std(y[i]) > 0:
            bs.append(np.corrcoef(row['x'][i], y[i])[0, 1])
    row['b_lo'], row['b_hi'] = np.percentile(bs, [2.5, 97.5])

print(f'n = {n} personas, {m} traits tested')
print('trait  r      95% CI (Fisher z)   p       Holm p  bootstrap 95%      Spearman (p)')
for d in rows:
    print(f"{d['t']}      {d['r']:.3f}  [{d['lo']:+.3f}, {d['hi']:+.3f}]   {d['p']:.4f}  "
          f"{d['holm']:.4f}  [{d['b_lo']:+.3f}, {d['b_hi']:+.3f}]   {d['rho']:.3f} ({d['p_rho']:.4f})")
