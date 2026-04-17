"""
기억유전학 검증 파이프라인 v0.1

기억유전학 v0.3 §12.2 "기질-비의존적 속성 비교"의 첫 실증.
TEM plays 데이터에서 α(정렬도) 시계열을 추출해 quasispecies 이론이 예측하는
분포 형태와 비교한다.

검증 항목:
  1. α의 전체 분포 형태 (normal / lognormal / beta 중 어느 family인가)
  2. 축적 곡선 형태 (scene_order 진행에 따른 α 변화 — 분자시계 saturation 유사?)
  3. 강건성 분포 (scene별 α 분산의 분포 — 멱법칙 여부)
  4. 방문 효과 (visit=1 vs visit=2 — Op 5 과잉수선 방향 확인)

사용법: python3 analyze.py
"""

import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.optimize import curve_fit

DATA_DIR = Path(__file__).resolve().parent.parent / 'persona-sim' / 'data'
MEMORIES = ['MM23L', 'E-004']


def load_plays(code: str):
    with open(DATA_DIR / f'{code}_plays.json') as f:
        return json.load(f)


def group_sessions(plays):
    """(persona_id, visit) → [play records sorted by scene_order]"""
    sessions = defaultdict(list)
    for p in plays:
        key = (p['persona_id'], p['visit'])
        sessions[key].append(p)
    for key in sessions:
        sessions[key].sort(key=lambda r: r['scene_order'])
    return sessions


def group_by_scene(plays):
    """scene_id → [α values across all visits]"""
    by_scene = defaultdict(list)
    for p in plays:
        by_scene[p['scene_id']].append(p['alignment'])
    return by_scene


# ─────────────────────────────────────────────────────────
# Check 1: α 전체 분포 형태
# ─────────────────────────────────────────────────────────
def check_distribution_shape(alphas, label):
    n = len(alphas)
    arr = np.array(alphas)
    mean = float(arr.mean())
    std = float(arr.std(ddof=1))
    skew = float(stats.skew(arr))
    kurt = float(stats.kurtosis(arr))

    # KS test: normal, lognormal, beta
    # Beta는 [0,1]에 자연 적합 — α의 정의역과 일치
    norm_ks = stats.kstest(arr, 'norm', args=(mean, std))

    # Lognormal (require >0)
    positive = arr[arr > 0]
    if len(positive) >= 3:
        log_arr = np.log(positive)
        ln_mean, ln_std = float(log_arr.mean()), float(log_arr.std(ddof=1))
        lognorm_ks = stats.kstest(positive, 'lognorm', args=(ln_std, 0, np.exp(ln_mean)))
    else:
        lognorm_ks = None

    # Beta fit via MLE
    try:
        # α ∈ (0,1) 필요 → 경계 살짝 이동
        arr_bounded = np.clip(arr, 1e-6, 1 - 1e-6)
        a, b, loc, scale = stats.beta.fit(arr_bounded, floc=0, fscale=1)
        beta_ks = stats.kstest(arr_bounded, 'beta', args=(a, b, loc, scale))
    except Exception as e:
        a, b, beta_ks = None, None, None

    print(f'\n[Check 1] α 전체 분포 — {label}')
    print(f'  n={n}  mean={mean:.3f}  std={std:.3f}  skew={skew:.3f}  kurt={kurt:.3f}')
    print(f'  KS vs Normal:    D={norm_ks.statistic:.3f}  p={norm_ks.pvalue:.4f}')
    if lognorm_ks:
        print(f'  KS vs Lognormal: D={lognorm_ks.statistic:.3f}  p={lognorm_ks.pvalue:.4f}')
    if beta_ks:
        print(f'  KS vs Beta(a={a:.2f}, b={b:.2f}): D={beta_ks.statistic:.3f}  p={beta_ks.pvalue:.4f}')

    # 판정: p > 0.05이면 해당 분포 기각 못함
    best = max(
        [('Normal', norm_ks.pvalue)] +
        ([('Lognormal', lognorm_ks.pvalue)] if lognorm_ks else []) +
        ([('Beta', beta_ks.pvalue)] if beta_ks else []),
        key=lambda x: x[1]
    )
    print(f'  → Best fit: {best[0]} (p={best[1]:.4f})')
    return {'mean': mean, 'std': std, 'best_family': best[0], 'best_p': best[1]}


# ─────────────────────────────────────────────────────────
# Check 2: 축적 곡선 — scene_order별 α 평균
# ─────────────────────────────────────────────────────────
def check_accumulation_curve(plays, label):
    by_order = defaultdict(list)
    for p in plays:
        # visit=1만 — 첫 방문에서의 누적 패턴
        if p['visit'] == 1:
            by_order[p['scene_order']].append(p['alignment'])

    orders = sorted(by_order.keys())
    means = [statistics.mean(by_order[o]) for o in orders]
    counts = [len(by_order[o]) for o in orders]

    print(f'\n[Check 2] 축적 곡선 (visit=1, scene_order별 평균 α) — {label}')
    for o, m, c in zip(orders, means, counts):
        bar = '█' * int(m * 40)
        print(f'  order={o:2d}  n={c:3d}  α={m:.3f}  {bar}')

    if len(orders) < 4:
        print('  → scene 수 부족, 형태 피팅 생략')
        return None

    x = np.array(orders, dtype=float)
    y = np.array(means, dtype=float)

    # 후보 1: 지수 saturation  y = a + (b - a) * (1 - exp(-k*x))
    def sat_exp(x, a, b, k):
        return a + (b - a) * (1 - np.exp(-k * x))

    # 후보 2: 멱법칙 decay  y = a * x^(-b) + c
    def power_decay(x, a, b, c):
        return a * np.power(x, -b) + c

    # 후보 3: 선형
    def linear(x, a, b):
        return a + b * x

    results = {}
    try:
        popt_sat, _ = curve_fit(sat_exp, x, y, p0=[0.5, 0.7, 0.3], maxfev=5000)
        y_pred = sat_exp(x, *popt_sat)
        rss = np.sum((y - y_pred) ** 2)
        tss = np.sum((y - y.mean()) ** 2)
        results['exponential_saturation'] = {'R2': 1 - rss/tss if tss > 0 else 0, 'params': popt_sat.tolist()}
    except Exception as e:
        results['exponential_saturation'] = {'error': str(e)}

    try:
        popt_pow, _ = curve_fit(power_decay, x, y, p0=[0.3, 1.0, 0.5], maxfev=5000)
        y_pred = power_decay(x, *popt_pow)
        rss = np.sum((y - y_pred) ** 2)
        tss = np.sum((y - y.mean()) ** 2)
        results['power_decay'] = {'R2': 1 - rss/tss if tss > 0 else 0, 'params': popt_pow.tolist()}
    except Exception as e:
        results['power_decay'] = {'error': str(e)}

    try:
        popt_lin, _ = curve_fit(linear, x, y, maxfev=5000)
        y_pred = linear(x, *popt_lin)
        rss = np.sum((y - y_pred) ** 2)
        tss = np.sum((y - y.mean()) ** 2)
        results['linear'] = {'R2': 1 - rss/tss if tss > 0 else 0, 'params': popt_lin.tolist()}
    except Exception as e:
        results['linear'] = {'error': str(e)}

    print('\n  함수 피팅 결과 (R²):')
    for name, r in results.items():
        if 'R2' in r:
            print(f'    {name:25s}  R²={r["R2"]:+.4f}  params={[round(v,3) for v in r["params"]]}')
        else:
            print(f'    {name:25s}  FAILED  ({r["error"][:40]})')

    valid = {k: v for k, v in results.items() if 'R2' in v}
    if valid:
        best = max(valid.items(), key=lambda kv: kv[1]['R2'])
        print(f'  → Best shape family: {best[0]} (R²={best[1]["R2"]:.4f})')
        return best[0]
    return None


# ─────────────────────────────────────────────────────────
# Check 3: 강건성 분포 — scene별 α 분산이 멱법칙을 따르나
# ─────────────────────────────────────────────────────────
def check_robustness_distribution(plays, label):
    by_scene = group_by_scene(plays)

    scene_vars = []
    for sid, alphas in by_scene.items():
        if len(alphas) >= 3:
            scene_vars.append((sid, statistics.variance(alphas), len(alphas)))

    scene_vars.sort(key=lambda x: -x[1])  # 분산 큰 순

    print(f'\n[Check 3] Scene별 α 분산 분포 — {label}')
    for sid, v, n in scene_vars:
        bar = '▓' * int(v * 1000)
        print(f'  scene={sid[:8]}  n={n:3d}  Var(α)={v:.4f}  {bar}')

    if len(scene_vars) < 4:
        print('  → scene 수 부족, 멱법칙 검사 생략')
        return None

    # Rank vs value — 멱법칙이면 log-log plot이 직선
    ranks = np.arange(1, len(scene_vars) + 1)
    vals = np.array([v for _, v, _ in scene_vars])
    # 0값 제거
    mask = vals > 0
    if mask.sum() < 3:
        print('  → 비-영 분산 scene 부족')
        return None

    log_r = np.log(ranks[mask])
    log_v = np.log(vals[mask])
    slope, intercept, r_value, p_value, std_err = stats.linregress(log_r, log_v)

    print(f'\n  log-log regression: slope={slope:.3f}  R²={r_value**2:.4f}  p={p_value:.4f}')
    if r_value**2 > 0.7:
        print(f'  → 멱법칙 시사 (|slope|={abs(slope):.2f} = power-law exponent)')
    else:
        print(f'  → 멱법칙 지지 약함')
    return {'slope': slope, 'R2': r_value**2}


# ─────────────────────────────────────────────────────────
# Check 4: 방문 효과 — Op 5 (과잉 수선) 방향 검증
# ─────────────────────────────────────────────────────────
def check_visit_effect(plays, label):
    # (persona, scene) 쌍에서 visit=1 vs visit=2 α 비교
    by_scene_persona = defaultdict(dict)
    for p in plays:
        key = (p['persona_id'], p['scene_id'])
        by_scene_persona[key][p['visit']] = p['alignment']

    paired = [(d[1], d[2]) for d in by_scene_persona.values() if 1 in d and 2 in d]

    print(f'\n[Check 4] 방문 효과 (visit=1 → visit=2 α 변화) — {label}')
    print(f'  paired samples: {len(paired)}')

    if len(paired) < 5:
        print('  → 쌍 부족, 검사 생략')
        return None

    v1 = np.array([a for a, _ in paired])
    v2 = np.array([b for _, b in paired])
    deltas = v2 - v1

    mean_delta = float(deltas.mean())
    t_stat, t_p = stats.ttest_rel(v2, v1)

    print(f'  mean Δα (v2 − v1) = {mean_delta:+.4f}')
    print(f'  paired t-test: t={t_stat:.3f}  p={t_p:.4f}')

    # 방향 해석
    if t_p < 0.05:
        if mean_delta > 0:
            verdict = '재방문 시 유의하게 α 상승 → Op 5 과잉수선(convergence 증가) 지지'
        else:
            verdict = '재방문 시 유의하게 α 하락 → Op 2 편향변이(divergence 증가) 지지'
    else:
        verdict = '유의한 변화 없음 → Op 5/2 어느 쪽도 강하게 작동하지 않음'
    print(f'  → {verdict}')
    return {'mean_delta': mean_delta, 'p': t_p}


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────
def main():
    all_alphas_by_memory = {}

    for code in MEMORIES:
        print('=' * 70)
        print(f'MEMORY: {code}')
        print('=' * 70)

        plays = load_plays(code)
        alphas = [p['alignment'] for p in plays]
        all_alphas_by_memory[code] = alphas

        check_distribution_shape(alphas, code)
        check_accumulation_curve(plays, code)
        check_robustness_distribution(plays, code)
        check_visit_effect(plays, code)

    print('\n' + '=' * 70)
    print('통합 (Cross-memory)')
    print('=' * 70)
    combined = [a for v in all_alphas_by_memory.values() for a in v]
    check_distribution_shape(combined, 'ALL MEMORIES')


if __name__ == '__main__':
    main()
