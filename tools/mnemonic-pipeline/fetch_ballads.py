"""
Child Ballads (Francis James Child, 1882-1898) 변이본 수집.
Wikisource raw API 사용, AI 처리 없음.

각 민요는 수십 명의 다른 가수가 구전으로 기억·전승한 버전이 Child이 수집·번호 표기.
변이는 '해석'이 아니라 '기억의 재구성' — 기억유전학 검증에 적합한 corpus.
"""
import urllib.request
import re
import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / 'variants' / 'child_ballads'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Child 번호 : 민요 이름 (다중 변이가 있는 것으로 알려진 것들)
BALLADS = {
    4:   "Lady Isabel and the Elf Knight",
    12:  "Lord Randal",
    37:  "Thomas the Rhymer",
    53:  "Young Beichan",
    58:  "Sir Patrick Spens",
    73:  "Lord Thomas and Fair Annet",
    84:  "Bonny Barbara Allan",
    85:  "Lady Alice",
    99:  "Johnie Scot",
    173: "Mary Hamilton",
    200: "The Gypsy Laddie",
    243: "James Harris (The Daemon Lover)",
    272: "The Suffolk Miracle",
    274: "Our Goodman",
    286: "The Sweet Trinity (The Golden Vanity)",
}

def chapter_url(num: int) -> str:
    # Part 번호는 대략 ballad_num / 34 → 실제는 더 복잡하지만 범용 URL 패턴
    # Wikisource uses "Part_N/Chapter_M" where M is the absolute ballad number
    # Parts roughly split: 1(1-28), 2(29-53), 3(54-79), 4(80-113), 5(114-155),
    #                     6(156-188), 7(189-225), 8(226-265), 9(266-305), 10(appendix)
    parts = [(28, 1), (53, 2), (79, 3), (113, 4), (155, 5),
             (188, 6), (225, 7), (265, 8), (305, 9)]
    for max_num, part in parts:
        if num <= max_num:
            return f"https://en.wikisource.org/w/index.php?title=The_English_and_Scottish_Popular_Ballads/Part_{part}/Chapter_{num}&action=raw"
    raise ValueError(f"ballad {num} beyond known range")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'mnemonic-genetics-research/0.1'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


VARIANT_PATTERN = re.compile(
    r'\{\{c\|\{\{larger\|\{\{anchor\+?\|([A-Za-z])\}\}.*?<poem>(.*?)</poem>',
    re.DOTALL
)

TEMPLATE_CLEAN = re.compile(r'\{\{[^{}]*\}\}')
FOOTNOTE_CLEAN = re.compile(r'<ref.*?</ref>', re.DOTALL)
TAG_CLEAN = re.compile(r'<[^>]+>')
BRACKET_CLEAN = re.compile(r'\[\[[^\]]*?\|([^\]]+)\]\]')
BRACKET_CLEAN2 = re.compile(r'\[\[([^\]]+)\]\]')


def clean_poem(text: str) -> str:
    # 중첩 템플릿 반복 제거
    prev = None
    while text != prev:
        prev = text
        text = TEMPLATE_CLEAN.sub('', text)
    text = FOOTNOTE_CLEAN.sub('', text)
    text = BRACKET_CLEAN.sub(r'\1', text)
    text = BRACKET_CLEAN2.sub(r'\1', text)
    text = TAG_CLEAN.sub('', text)
    text = re.sub(r"''+", '', text)  # italic/bold markers
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_variants(raw: str):
    variants = {}
    for m in VARIANT_PATTERN.finditer(raw):
        letter = m.group(1).upper()
        text = clean_poem(m.group(2))
        word_count = len(text.split())
        if 50 <= word_count <= 3000:  # 실제 ballad 텍스트 크기 범위
            variants[letter] = text
    return variants


def main():
    results = {}
    for num, title in BALLADS.items():
        try:
            url = chapter_url(num)
            raw = fetch(url)
            variants = parse_variants(raw)
            if len(variants) >= 2:
                (OUT_DIR / f'{num:03d}.json').write_text(
                    json.dumps({'number': num, 'title': title, 'variants': variants}, ensure_ascii=False, indent=2)
                )
                results[num] = (title, list(variants.keys()), {k: len(v.split()) for k, v in variants.items()})
                print(f'  {num:3d} {title:40s}  {len(variants)} variants: {" ".join(variants.keys())}  words: {[len(v.split()) for v in variants.values()]}')
            else:
                print(f'  {num:3d} {title:40s}  SKIP ({len(variants)} variant)')
        except Exception as e:
            print(f'  {num:3d} {title:40s}  ERROR {type(e).__name__}: {e}')

    total_variants = sum(len(r[1]) for r in results.values())
    print(f'\n총 {len(results)}개 민요, {total_variants}개 변이 수집')


if __name__ == '__main__':
    main()
