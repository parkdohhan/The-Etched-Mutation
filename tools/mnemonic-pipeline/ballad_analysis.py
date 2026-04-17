"""
기억유전학 검증: Child Ballads 변이 구조 분석
================================================

Corpus: Francis James Child, *English and Scottish Popular Ballads* (1882-1898)
  - 12개 민요, 총 131개 변이
  - 각 변이는 서로 다른 가수/수집 출처에서 **기억으로 부른 것을 채록**
  - 분자유전학이 아닌 **기억 전승** dynamics의 직접 관찰

Hypotheses
  H1 (null): 변이가 random drift이면 변이간 거리는 Normal
  H2 (memory genetics):
    (a) Master sequence + cloud 구조 → heavy-tailed 거리 분포 (exponential/power-law 우세)
    (b) Error threshold: μ·L < 1 → 긴 민요일수록 cloud radius 작아야 함

Tests:
  T1. Per-ballad cloud structure — pairwise distance 분포
  T2. Distance-to-centroid 분포 형태 (Normal vs Exponential vs Gamma vs Half-Normal vs Pareto)
  T3. Error threshold: cloud radius vs 민요 길이 상관
  T4. Null baseline: 랜덤 text shuffling과 비교
"""
import json
import re
import math
from pathlib import Path
from collections import defaultdict, Counter

import numpy as np
from scipy import stats
from scipy.optimize import minimize

BALLAD_DIR = Path(__file__).resolve().parent / 'variants' / 'child_ballads'

STOPWORDS = set('''
a an the and or but if then of at by for in on to with from into as
is was were are be been being am have has had do does did will would
shall should can could may might must this that these those it its
he she his her him they them their there here what which who whose
when where why how not no yes so very too also just still only own
i you we me us our your my mine ours yours theirs any some all such
up down over under again further once more most each both either
o oh ay aye yea nay thou thee thy thine ye you
'''.split())


def tokenize(text: str) -> list:
    text = text.lower()
    text = re.sub(r"[^a-z\s']", ' ', text)
    toks = [t.strip("'") for t in text.split()]
    return [t for t in toks if t and len(t) > 1 and t not in STOPWORDS]


def tfidf(docs: list):
    vocab = {}
    for d in docs:
        for t in d:
            if t not in vocab:
                vocab[t] = len(vocab)
    n_docs, n_terms = len(docs), len(vocab)
    tf = np.zeros((n_docs, n_terms))
    for i, d in enumerate(docs):
        for t in d:
            tf[i, vocab[t]] += 1
    row_sums = tf.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    tf = tf / row_sums
    df = (tf > 0).sum(axis=0)
    idf = np.log((n_docs + 1) / (df + 1)) + 1
    m = tf * idf
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return m / norms


def cosine_dist(a, b):
    return 1.0 - float(np.dot(a, b))


# ─────────────────────────────────────────────────────────
# 데이터 로드
# ─────────────────────────────────────────────────────────
def load_ballads():
    files = sorted(BALLAD_DIR.glob('*.json'))
    ballads = {}
    for f in files:
        d = json.loads(f.read_text())
        if len(d['variants']) >= 3:  # 분석에 의미있는 최소 변이 수
            ballads[d['number']] = d
    return ballads


# ─────────────────────────────────────────────────────────
# 분석 유틸
# ─────────────────────────────────────────────────────────
def variant_cloud(variants: dict):
    """한 민요의 변이들 → centroid까지 거리 + pairwise 거리"""
    labels = sorted(variants.keys())
    docs = [tokenize(variants[l]) for l in labels]
    vecs = tfidf(docs)
    centroid = vecs.mean(axis=0)
    c_norm = np.linalg.norm(centroid)
    if c_norm > 0:
        centroid = centroid / c_norm
    d_to_centroid = [1 - float(np.dot(v, centroid)) for v in vecs]
    pairwise = []
    for i in range(len(vecs)):
        for j in range(i + 1, len(vecs)):
            pairwise.append(cosine_dist(vecs[i], vecs[j]))
    avg_len = np.mean([len(d) for d in docs])
    return {
        'labels': labels,
        'd_to_centroid': d_to_centroid,
        'pairwise': pairwise,
        'cloud_radius': float(np.mean(d_to_centroid)),
        'n_variants': len(labels),
        'avg_word_count': float(avg_len),
    }


def fit_and_compare(distances: np.ndarray, label: str):
    """여러 분포 family에 대해 KS test — 어느 것이 가장 잘 맞나?"""
    if len(distances) < 5:
        return {}
    results = {}

    # Normal
    m, s = distances.mean(), distances.std(ddof=1)
    if s > 0:
        ks = stats.kstest(distances, 'norm', args=(m, s))
        results['Normal'] = {'D': float(ks.statistic), 'p': float(ks.pvalue), 'params': {'mean': float(m), 'std': float(s)}}

    # Half-Normal (자연스러운 null for 거리)
    # Fit: scale = sqrt(mean of squares)
    try:
        hn_loc, hn_scale = stats.halfnorm.fit(distances)
        ks = stats.kstest(distances, 'halfnorm', args=(hn_loc, hn_scale))
        results['HalfNormal'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    # Exponential (quasispecies equilibrium 예측)
    try:
        exp_loc, exp_scale = stats.expon.fit(distances)
        ks = stats.kstest(distances, 'expon', args=(exp_loc, exp_scale))
        results['Exponential'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    # Gamma (exp 일반화)
    try:
        g_shape, g_loc, g_scale = stats.gamma.fit(distances)
        ks = stats.kstest(distances, 'gamma', args=(g_shape, g_loc, g_scale))
        results['Gamma'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    # Log-normal
    try:
        pos = distances[distances > 0]
        if len(pos) >= 5:
            s_ln, loc_ln, scale_ln = stats.lognorm.fit(pos, floc=0)
            ks = stats.kstest(pos, 'lognorm', args=(s_ln, loc_ln, scale_ln))
            results['Lognormal'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    # Pareto (heavy-tailed)
    try:
        pos = distances[distances > 1e-6]
        if len(pos) >= 5:
            b_p, loc_p, scale_p = stats.pareto.fit(pos)
            ks = stats.kstest(pos, 'pareto', args=(b_p, loc_p, scale_p))
            results['Pareto'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    # Beta (bounded [0,1])
    try:
        clipped = np.clip(distances, 1e-6, 1 - 1e-6)
        a_b, b_b, _, _ = stats.beta.fit(clipped, floc=0, fscale=1)
        ks = stats.kstest(clipped, 'beta', args=(a_b, b_b, 0, 1))
        results['Beta'] = {'D': float(ks.statistic), 'p': float(ks.pvalue)}
    except Exception:
        pass

    return results


def aic_score(log_likelihood, k_params, n):
    return 2 * k_params - 2 * log_likelihood


def null_baseline(all_texts: list, n_samples: int, sample_size: int):
    """
    Null: 모든 변이본 텍스트의 단어 pool에서 랜덤하게 뽑아 가짜 '변이'를 만듦.
    이 가짜 변이들끼리의 distance 분포가 실제 ballad 내 거리 분포와 같은지 비교.
    """
    all_words = [w for d in all_texts for w in d]
    if not all_words:
        return np.array([])
    rng = np.random.default_rng(42)
    fake_docs = []
    for _ in range(n_samples):
        size = rng.integers(50, max(60, sample_size))
        idx = rng.integers(0, len(all_words), size=size)
        fake_docs.append([all_words[i] for i in idx])
    vecs = tfidf(fake_docs)
    centroid = vecs.mean(axis=0)
    c_norm = np.linalg.norm(centroid)
    if c_norm > 0:
        centroid /= c_norm
    d = [1 - float(np.dot(v, centroid)) for v in vecs]
    return np.array(d)


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────
def main():
    print('=' * 72)
    print('Child Ballads — 기억유전학 검증 실험')
    print('=' * 72)

    ballads = load_ballads()
    print(f'분석 대상 민요: {len(ballads)}개 (≥3 변이 보유)')

    per_ballad = {}
    all_centroid_dists = []
    all_pairwise = []
    all_texts_tokens = []

    print(f'\n{"번호":5s}  {"이름":42s}  {"N":>3s}  {"avg_words":>9s}  {"cloud_r":>8s}')
    print('-' * 72)
    for num, b in sorted(ballads.items()):
        cloud = variant_cloud(b['variants'])
        per_ballad[num] = cloud
        all_centroid_dists.extend(cloud['d_to_centroid'])
        all_pairwise.extend(cloud['pairwise'])
        for v in b['variants'].values():
            all_texts_tokens.append(tokenize(v))
        print(f'{num:5d}  {b["title"][:40]:42s}  {cloud["n_variants"]:3d}  {cloud["avg_word_count"]:9.1f}  {cloud["cloud_radius"]:.4f}')

    all_centroid_dists = np.array(all_centroid_dists)
    all_pairwise = np.array(all_pairwise)
    print(f'\n총 {len(all_centroid_dists)} centroid-거리, {len(all_pairwise)} pairwise-거리')

    # ───────────────────────────────────────
    # T2. Centroid 거리 분포 형태
    # ───────────────────────────────────────
    print('\n' + '=' * 72)
    print('T2. Distance-to-centroid 분포 형태 (KS test, lower D = better fit)')
    print('=' * 72)
    fits_cent = fit_and_compare(all_centroid_dists, 'centroid')
    print(f'\n  n = {len(all_centroid_dists)}')
    print(f'  mean = {all_centroid_dists.mean():.4f}  std = {all_centroid_dists.std(ddof=1):.4f}')
    print(f'  skew = {stats.skew(all_centroid_dists):+.3f}  kurt = {stats.kurtosis(all_centroid_dists):+.3f}')
    print()
    for name, r in sorted(fits_cent.items(), key=lambda x: x[1]['D']):
        flag = '✓' if r['p'] > 0.05 else ' '
        print(f'  {flag} {name:12s}  D = {r["D"]:.4f}  p = {r["p"]:.4f}')
    best_cent = min(fits_cent.items(), key=lambda x: x[1]['D'])
    print(f'\n  → Best fit: {best_cent[0]} (D = {best_cent[1]["D"]:.4f})')

    # Pairwise 분포도 같이
    print('\n--- pairwise distances ---')
    fits_pw = fit_and_compare(all_pairwise, 'pairwise')
    print(f'  mean = {all_pairwise.mean():.4f}  skew = {stats.skew(all_pairwise):+.3f}')
    for name, r in sorted(fits_pw.items(), key=lambda x: x[1]['D']):
        flag = '✓' if r['p'] > 0.05 else ' '
        print(f'  {flag} {name:12s}  D = {r["D"]:.4f}  p = {r["p"]:.4f}')

    # ───────────────────────────────────────
    # T3. Error threshold: cloud radius vs ballad length
    # ───────────────────────────────────────
    print('\n' + '=' * 72)
    print('T3. Error threshold 검증: cloud radius vs ballad 평균 길이')
    print('=' * 72)
    print('  Quasispecies 예측: μ·L < 1 → 긴 민요일수록 작은 radius (negative correlation)')

    lengths = np.array([c['avg_word_count'] for c in per_ballad.values()])
    radii = np.array([c['cloud_radius'] for c in per_ballad.values()])
    n_vars = np.array([c['n_variants'] for c in per_ballad.values()])

    r_pearson, p_pearson = stats.pearsonr(lengths, radii)
    r_spearman, p_spearman = stats.spearmanr(lengths, radii)
    # log-length에 대해서도
    r_loglen, p_loglen = stats.pearsonr(np.log(lengths), radii)

    print(f'\n  Pearson(length, radius):     r = {r_pearson:+.3f}  p = {p_pearson:.4f}')
    print(f'  Pearson(log-length, radius): r = {r_loglen:+.3f}  p = {p_loglen:.4f}')
    print(f'  Spearman(length, radius):    ρ = {r_spearman:+.3f}  p = {p_spearman:.4f}')

    print('\n  (length↓, radius↓/↑ plot)')
    print(f'  {"ballad":40s}  {"L":>6s}  {"N":>3s}  {"radius":>8s}')
    sorted_by_L = sorted(per_ballad.items(), key=lambda x: x[1]['avg_word_count'])
    for num, c in sorted_by_L:
        t = ballads[num]['title']
        bar = '▓' * int(c['cloud_radius'] * 50)
        print(f'  {t[:40]:40s}  {c["avg_word_count"]:6.0f}  {c["n_variants"]:3d}  {c["cloud_radius"]:.4f}  {bar}')

    # 변이 수 vs radius (다른 가설)
    r_nvar, p_nvar = stats.pearsonr(n_vars, radii)
    print(f'\n  Pearson(n_variants, radius): r = {r_nvar:+.3f}  p = {p_nvar:.4f}')

    # ───────────────────────────────────────
    # T4. Null baseline (random shuffling)
    # ───────────────────────────────────────
    print('\n' + '=' * 72)
    print('T4. Null baseline — 랜덤 단어 shuffle로 만든 가짜 변이와 비교')
    print('=' * 72)
    avg_len = int(np.mean([len(t) for t in all_texts_tokens]))
    null_cent = null_baseline(all_texts_tokens, n_samples=200, sample_size=avg_len)

    print(f'  실제 centroid dist:  n = {len(all_centroid_dists)}  mean = {all_centroid_dists.mean():.4f}  std = {all_centroid_dists.std():.4f}')
    print(f'  null  centroid dist:  n = {len(null_cent)}  mean = {null_cent.mean():.4f}  std = {null_cent.std():.4f}')

    mw = stats.mannwhitneyu(all_centroid_dists, null_cent, alternative='less')
    ks2 = stats.ks_2samp(all_centroid_dists, null_cent)
    print(f'\n  Mann-Whitney U (real < null):  U = {mw.statistic:.0f}  p = {mw.pvalue:.2e}')
    print(f'  KS 2-sample:                   D = {ks2.statistic:.4f}  p = {ks2.pvalue:.2e}')

    if mw.pvalue < 0.01:
        print(f'  → 실제 변이간 거리가 랜덤 기준보다 **유의하게 작음** — cloud 구조 존재')
    else:
        print(f'  → null과 구분 안 됨')

    # ───────────────────────────────────────
    # T1. Per-ballad 분포 (fit 결과 요약)
    # ───────────────────────────────────────
    print('\n' + '=' * 72)
    print('T1. 개별 민요별 분포 fit (n≥5 변이만)')
    print('=' * 72)
    consistent_winners = Counter()
    for num, c in per_ballad.items():
        if len(c['d_to_centroid']) < 5:
            continue
        fits = fit_and_compare(np.array(c['d_to_centroid']), f'ballad_{num}')
        if fits:
            best = min(fits.items(), key=lambda x: x[1]['D'])
            t = ballads[num]['title'][:32]
            print(f'  {num:3d} {t:34s}  n={len(c["d_to_centroid"]):2d}  best = {best[0]:12s} (D = {best[1]["D"]:.3f})')
            consistent_winners[best[0]] += 1

    print(f'\n  개별 민요 best-fit winners: {dict(consistent_winners.most_common())}')

    # 저장
    summary = {
        'n_ballads': len(per_ballad),
        'n_variants_total': sum(c['n_variants'] for c in per_ballad.values()),
        'centroid_fits': {k: {'D': v['D'], 'p': v['p']} for k, v in fits_cent.items()},
        'pairwise_fits': {k: {'D': v['D'], 'p': v['p']} for k, v in fits_pw.items()},
        'T3': {
            'pearson_r_length_radius': float(r_pearson),
            'pearson_p': float(p_pearson),
            'spearman_rho': float(r_spearman),
            'spearman_p': float(p_spearman),
        },
        'T4': {
            'real_mean': float(all_centroid_dists.mean()),
            'null_mean': float(null_cent.mean()),
            'mann_whitney_p': float(mw.pvalue),
            'ks_2sample_p': float(ks2.pvalue),
        },
        'per_ballad_winners': dict(consistent_winners.most_common()),
    }
    out = Path(__file__).parent / 'ballad_results.json'
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'\n[saved] {out}')


if __name__ == '__main__':
    main()
