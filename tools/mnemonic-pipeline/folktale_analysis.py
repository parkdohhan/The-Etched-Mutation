"""
기억유전학 외부 데이터 검증 v0.1
— Aesop 우화 번역본 3종의 텍스트 변이 분석

외부 corpus: Project Gutenberg 공공도메인
  • Townsend (1867)  — Rev. G.F. Townsend translation from Greek
  • Jacobs (1894)    — Joseph Jacobs edition
  • Jones (1912)     — V.S. Vernon Jones translation

핵심 아이디어:
  같은 그리스 원전 → 서로 다른 19/20세기 번역자 3명의 "변이체"
  각 번역은 원본의 "전승 + 변형"
  § 12.2의 기질-비의존 속성이 이 텍스트 변이 공간에서도 관찰되는가?

검증:
  1. 우화별 번역자 간 거리의 분포 형태
  2. 우화별 변이 강도(robustness)의 rank vs value → 멱법칙?
  3. 번역자 간 비대칭성 (연도가 거리와 상관?)
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

import numpy as np
from scipy import stats

VAR_DIR = Path(__file__).resolve().parent / 'variants'
FILES = {
    'townsend_1867': VAR_DIR / 'townsend_1867.txt',
    'jacobs_1894':   VAR_DIR / 'jacobs_1894.txt',
    'jones_1912':    VAR_DIR / 'jones_1912.txt',
}
YEARS = {'townsend_1867': 1867, 'jacobs_1894': 1894, 'jones_1912': 1912}

# Gutenberg boilerplate 제거
START_MARKER = '*** START OF'
END_MARKER = '*** END OF'

STOPWORDS = set('''
a an the and or but if then of at by for in on to with from into as
is was were are be been being am have has had do does did will would
shall should can could may might must this that these those it its
he she his her him they them their there here what which who whose
when where why how not no yes so very too also just still only own
i you we me us our your my mine ours yours theirs any some all such
up down over under again further once more most each both either
'''.split())


def strip_gutenberg(text: str) -> str:
    s = text.find(START_MARKER)
    if s > 0:
        text = text[text.find('\n', s) + 1:]
    e = text.find(END_MARKER)
    if e > 0:
        text = text[:e]
    return text


def load(name: str) -> str:
    return strip_gutenberg(FILES[name].read_text(encoding='utf-8'))


# ─────────────────────────────────────────────────────────
# 우화 추출 — 정규화된 제목으로 딕셔너리 구성
# ─────────────────────────────────────────────────────────

def normalize_title(title: str) -> str:
    """'The Hare and the Tortoise' ↔ 'The Tortoise and the Hare' 동일 처리용 정규화."""
    t = title.lower()
    t = re.sub(r'[^a-z\s]', ' ', t)
    words = [w for w in t.split() if w and w not in STOPWORDS]
    return ' '.join(sorted(words))  # sorted → A-and-B vs B-and-A 통일


def extract_fables(text: str, name: str) -> dict[str, str]:
    """
    각 파일에서 우화 블록 추출.
    전략:
      - 짧은 Title-Case 라인(<=60자, 대문자 시작, 주변 공백)을 제목 후보로 봄
      - 제목 다음 첫 비-빈-줄부터 다음 제목 전까지를 body로 잡음
    반환: {normalized_title: body_text}
    """
    lines = text.split('\n')

    # 제목 후보 식별
    def is_title(line: str) -> bool:
        s = line.strip()
        if not s or len(s) > 70: return False
        # 문장부호로 끝나면 제외
        if s.endswith(('.', ',', ';', ':', '?', '!', "'", '"', ')', ']', '—', '-')): return False
        # 숫자/불렛이 주성분이면 제외
        if re.match(r'^[\d\W]+$', s): return False
        # 적어도 한 단어는 대문자로 시작
        words = s.split()
        if len(words) < 2 or len(words) > 12: return False
        cap_count = sum(1 for w in words if w and w[0].isupper())
        # Title case 추정
        return cap_count >= max(2, len(words) - 2)

    # TOC 섹션 skip: "CONTENTS" 이후 첫 챕터 시작까지
    # 간단히: 첫 진짜 본문은 "FABLES" / "A SHORT HISTORY" 후에 옴
    # 여기선 2패스: 모든 후보 수집 후, 동일 제목이 2번 이상 나오는 것만 "실제 제목"으로 간주
    # (첫 등장 = TOC, 두 번째 등장 = 본문 시작)
    candidates = []
    for i, line in enumerate(lines):
        if is_title(line):
            candidates.append((i, line.strip()))

    # 제목 정규화 → 등장 인덱스 리스트
    by_norm = defaultdict(list)
    for i, t in candidates:
        by_norm[normalize_title(t)].append((i, t))

    # 본문 후보: 전체 파일의 15% ~ 92% 구간에 있는 등장
    # (TOC는 앞쪽, Notes/appendix는 끝쪽에 몰리는 경향)
    total_lines = len(lines)
    body_lo = int(total_lines * 0.12)
    body_hi = int(total_lines * 0.95)

    fables = {}
    body_positions = []
    for norm, entries in by_norm.items():
        if not norm or len(norm.split()) < 2:
            continue
        body_entries = [(i, t) for (i, t) in entries if body_lo <= i <= body_hi]
        if not body_entries:
            continue
        # 여러 개면 '가장 긴 body'를 가진 것을 선택
        # (TOC가 본문 구간에 일부 끼어들 수 있으므로)
        best = max(
            body_entries,
            key=lambda x: (
                # 다음 title 후보까지의 거리 — 길수록 본문 가능성 큼
                min(
                    (j for (j, _) in candidates if j > x[0]),
                    default=total_lines,
                ) - x[0]
            )
        )
        body_positions.append((best[0], norm, best[1]))

    body_positions.sort()
    # body 끝 = 다음 title 후보의 시작 (모든 후보 중 현재 이후)
    candidate_lines = sorted(i for i, _ in candidates)
    for idx, (start_i, norm, title) in enumerate(body_positions):
        # 다음 title 후보 (본문 position들에 포함되거나 TOC든 상관없이 가장 가까운 것)
        next_i = next((j for j in candidate_lines if j > start_i), total_lines)
        body = '\n'.join(lines[start_i + 1: next_i]).strip()
        word_count = len(body.split())
        if 30 <= word_count <= 800:
            fables[norm] = {'title': title, 'body': body, 'words': word_count}

    return fables


# ─────────────────────────────────────────────────────────
# TF-IDF 벡터화 (stdlib + numpy)
# ─────────────────────────────────────────────────────────

def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^a-z\s']", ' ', text)
    tokens = [t.strip("'") for t in text.split()]
    tokens = [t for t in tokens if t and t not in STOPWORDS and len(t) > 1]
    return tokens


def build_tfidf_matrix(docs: list[list[str]]):
    """docs: list of token lists → (tfidf matrix, vocab)"""
    vocab = {}
    for doc in docs:
        for t in doc:
            if t not in vocab:
                vocab[t] = len(vocab)
    n_docs = len(docs)
    n_terms = len(vocab)
    tf = np.zeros((n_docs, n_terms))
    for i, doc in enumerate(docs):
        for t in doc:
            tf[i, vocab[t]] += 1
    # L1 normalize within document (term frequency)
    row_sums = tf.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    tf = tf / row_sums
    # IDF
    df = (tf > 0).sum(axis=0)
    idf = np.log((n_docs + 1) / (df + 1)) + 1
    tfidf = tf * idf
    # L2 normalize rows
    row_norm = np.linalg.norm(tfidf, axis=1, keepdims=True)
    row_norm[row_norm == 0] = 1
    tfidf = tfidf / row_norm
    return tfidf, vocab


def cosine_distance(v1, v2):
    return 1.0 - float(np.dot(v1, v2))


# ─────────────────────────────────────────────────────────
# Main analysis
# ─────────────────────────────────────────────────────────

def main():
    print('=' * 70)
    print('기억유전학 외부 corpus 실험: Aesop 우화 번역본 3종')
    print('=' * 70)

    corpora = {name: extract_fables(load(name), name) for name in FILES}
    for name, fab in corpora.items():
        print(f'  {name:18s}  {len(fab):3d} fables extracted')

    # 3개 번역 모두에 존재하는 우화만 남김
    common_keys = set(corpora['townsend_1867'].keys())
    for name in ['jacobs_1894', 'jones_1912']:
        common_keys &= set(corpora[name].keys())
    common = sorted(common_keys)
    print(f'\n  공통 우화 (3개 번역 모두 존재): {len(common)}개')

    # 짧은 이름으로 정렬 출력
    for k in common[:20]:
        titles = [corpora[n][k]['title'] for n in FILES]
        print(f'    · {k[:40]:40s}  [{titles[0][:30]} / {titles[1][:30]} / {titles[2][:30]}]')
    if len(common) > 20:
        print(f'    ... (+{len(common) - 20} more)')

    if len(common) < 5:
        print('\n[FATAL] 공통 우화 < 5 — 추출 로직 재검토 필요')
        return

    # 각 우화별로 3개 번역의 TF-IDF 벡터 + 쌍별 거리 계산
    # 추가: 같은 번역자 내 "다른 우화끼리의 거리" 기저선도 계산 → signal vs noise 비교용
    results = {}  # fable_key -> {pair: distance}
    translator_names = list(FILES.keys())

    # 모든 문서 함께 벡터화 (공통 vocab)
    all_docs = []
    doc_labels = []  # (translator, fable_key)
    for name in translator_names:
        for k in common:
            all_docs.append(tokenize(corpora[name][k]['body']))
            doc_labels.append((name, k))

    tfidf, vocab = build_tfidf_matrix(all_docs)
    print(f'\n  TF-IDF: {tfidf.shape[0]} docs, {tfidf.shape[1]} terms in vocab')

    # 인덱싱 헬퍼
    def idx_of(translator, fable_key):
        return doc_labels.index((translator, fable_key))

    # 우화별 쌍별 거리
    pair_labels = [('townsend_1867', 'jacobs_1894'),
                   ('townsend_1867', 'jones_1912'),
                   ('jacobs_1894', 'jones_1912')]

    per_fable = {}  # fable_key -> list of 3 pair distances
    for k in common:
        dists = []
        for a, b in pair_labels:
            d = cosine_distance(tfidf[idx_of(a, k)], tfidf[idx_of(b, k)])
            dists.append(d)
        per_fable[k] = dists

    # ─────────────────────────────────────────────
    # Check 1: 우화 내 번역자 간 거리의 분포
    # ─────────────────────────────────────────────
    all_within_fable_dists = np.array([d for v in per_fable.values() for d in v])
    print(f'\n[Check 1] 우화 내 번역자 간 cosine 거리 분포 (n={len(all_within_fable_dists)})')
    print(f'  mean = {all_within_fable_dists.mean():.3f}')
    print(f'  std  = {all_within_fable_dists.std(ddof=1):.3f}')
    print(f'  min  = {all_within_fable_dists.min():.3f}')
    print(f'  max  = {all_within_fable_dists.max():.3f}')
    print(f'  skew = {stats.skew(all_within_fable_dists):.3f}')
    print(f'  kurt = {stats.kurtosis(all_within_fable_dists):.3f}')

    # Signal vs baseline: 번역자 내 다른 우화끼리의 거리
    # (동일 번역자, 서로 다른 우화 쌍)
    baseline_dists = []
    for name in translator_names:
        for i, k1 in enumerate(common):
            for k2 in common[i+1:]:
                d = cosine_distance(tfidf[idx_of(name, k1)], tfidf[idx_of(name, k2)])
                baseline_dists.append(d)
    baseline_dists = np.array(baseline_dists)
    print(f'\n  [Baseline] 같은 번역자 내 다른 우화 간 거리 (n={len(baseline_dists)})')
    print(f'  mean = {baseline_dists.mean():.3f}  std = {baseline_dists.std(ddof=1):.3f}')

    signal_ratio = all_within_fable_dists.mean() / baseline_dists.mean()
    print(f'\n  signal/baseline mean ratio = {signal_ratio:.3f}')
    if signal_ratio < 0.8:
        print(f'  → 번역자 간 변이 << 우화 간 차이. 즉 우화는 "stable attractor"')
    else:
        print(f'  → 번역자 간 변이 ~ 우화 간 차이. signal 약함.')

    # Mann-Whitney: within-fable vs baseline
    mw = stats.mannwhitneyu(all_within_fable_dists, baseline_dists, alternative='less')
    print(f'  Mann-Whitney U (within < baseline): p = {mw.pvalue:.2e}')

    # ─────────────────────────────────────────────
    # Check 2: 우화별 변이 강도 (robustness) — 멱법칙 검사
    # ─────────────────────────────────────────────
    print(f'\n[Check 2] 우화별 평균 변이 강도 (robustness distribution)')
    fable_mean_dist = sorted(
        [(k, np.mean(v)) for k, v in per_fable.items()],
        key=lambda x: -x[1]
    )
    print(f'  {"fable":50s}  {"mean_dist":>10s}')
    for k, d in fable_mean_dist:
        bar = '▓' * int(d * 30)
        print(f'  {k[:48]:50s}  {d:>10.3f}  {bar}')

    # Rank vs value log-log regression
    vals = np.array([d for _, d in fable_mean_dist])
    mask = vals > 0
    if mask.sum() >= 4:
        ranks = np.arange(1, mask.sum() + 1)
        log_r = np.log(ranks)
        log_v = np.log(vals[mask])
        slope, intercept, r_value, p_value, std_err = stats.linregress(log_r, log_v)
        print(f'\n  log(rank) vs log(value) regression:')
        print(f'    slope = {slope:.3f}')
        print(f'    R²    = {r_value**2:.4f}')
        print(f'    p     = {p_value:.4f}')
        if r_value**2 > 0.85:
            print(f'  → 강한 멱법칙 시사 (exponent ≈ {abs(slope):.2f})')
        elif r_value**2 > 0.7:
            print(f'  → 약한 멱법칙 시사')
        else:
            print(f'  → 멱법칙 지지 약함')

    # ─────────────────────────────────────────────
    # Check 3: 연대 비대칭 (chronological asymmetry)
    # ─────────────────────────────────────────────
    print(f'\n[Check 3] 연대 거리 vs 텍스트 거리')
    pair_year_delta = {
        ('townsend_1867', 'jacobs_1894'): 27,
        ('townsend_1867', 'jones_1912'):  45,
        ('jacobs_1894',   'jones_1912'):  18,
    }
    for pair, delta in pair_year_delta.items():
        dists_for_pair = [per_fable[k][pair_labels.index(pair)] for k in common]
        mean_d = np.mean(dists_for_pair)
        print(f'  {pair[0][-4:]} ↔ {pair[1][-4:]}  Δyr={delta:3d}  mean_text_dist={mean_d:.3f}')

    # 연대 차 vs 텍스트 거리 상관
    delta_arr = []
    dist_arr = []
    for pair, delta in pair_year_delta.items():
        for k in common:
            delta_arr.append(delta)
            dist_arr.append(per_fable[k][pair_labels.index(pair)])
    delta_arr = np.array(delta_arr)
    dist_arr = np.array(dist_arr)
    r, p = stats.pearsonr(delta_arr, dist_arr)
    print(f'\n  Pearson(Δyear, text_dist): r = {r:+.3f}  p = {p:.4f}')
    if p < 0.05:
        direction = '양' if r > 0 else '음'
        print(f'  → 연대 차가 텍스트 거리와 {direction}의 상관 (분자시계-유사 신호)')
    else:
        print(f'  → 연대 차와 텍스트 거리 무상관 (전승 경로가 연대와 독립)')

    # ─────────────────────────────────────────────
    # Check 4: 분포 KS test
    # ─────────────────────────────────────────────
    print(f'\n[Check 4] 번역자 간 거리 분포 형태 (KS test)')
    arr = all_within_fable_dists
    m, s = arr.mean(), arr.std(ddof=1)
    norm_ks = stats.kstest(arr, 'norm', args=(m, s))
    print(f'  vs Normal:    D = {norm_ks.statistic:.3f}  p = {norm_ks.pvalue:.4f}')
    # Beta fit
    try:
        clipped = np.clip(arr, 1e-6, 1 - 1e-6)
        a_fit, b_fit, _, _ = stats.beta.fit(clipped, floc=0, fscale=1)
        beta_ks = stats.kstest(clipped, 'beta', args=(a_fit, b_fit, 0, 1))
        print(f'  vs Beta(a={a_fit:.2f}, b={b_fit:.2f}):  D = {beta_ks.statistic:.3f}  p = {beta_ks.pvalue:.4f}')
    except Exception as e:
        print(f'  Beta fit failed: {e}')

    # ─────────────────────────────────────────────
    # 결과 dump for reference
    # ─────────────────────────────────────────────
    out = {
        'common_fables': common,
        'per_fable_distances': {k: v for k, v in per_fable.items()},
        'within_fable_summary': {
            'mean': float(all_within_fable_dists.mean()),
            'std': float(all_within_fable_dists.std(ddof=1)),
            'n': int(len(all_within_fable_dists)),
        },
        'baseline_summary': {
            'mean': float(baseline_dists.mean()),
            'std': float(baseline_dists.std(ddof=1)),
            'n': int(len(baseline_dists)),
        },
    }
    out_path = Path(__file__).parent / 'folktale_results.json'
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f'\n[Saved] {out_path}')


if __name__ == '__main__':
    main()
