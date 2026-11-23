/-
TEM 층 모델 — 꿰맴 정리(회차 그물)와 "쌍별로는 못 본다"
docs/층모델_정리와_증명_v0.1-261123.md §4 의 기계 검산판.

`P` = 회차, `S` = 씬, `dom p` = 회차 p 가 지난 씬, `σ p s` = 회차 p 가 씬 s 에 적은 장부.
-/
import TemLayer.Gradient

namespace TemLayer

open SimpleGraph

variable {P S A : Type*} [AddCommGroup A]

/-- 회차 그물(m = 1): 서로 다른 두 회차가 씬을 하나라도 같이 지났으면 잇는다. -/
def overlapGraph (dom : P → Set S) : SimpleGraph P where
  Adj p q := p ≠ q ∧ ∃ s, s ∈ dom p ∧ s ∈ dom q
  symm := ⟨fun _ _ ⟨hne, s, hp, hq⟩ => ⟨hne.symm, s, hq, hp⟩⟩
  loopless := ⟨fun _ h => h.1 rfl⟩

/-- 원본 자격의 전역 장부: 씬마다 값 `f s` 가 있고, 각 회차는 그것을 자기 상수 `h p` 만큼 옮겨 읽는다. -/
def HasLedger (dom : P → Set S) (σ : P → S → A) : Prop :=
  ∃ (f : S → A) (h : P → A), ∀ p s, s ∈ dom p → σ p s = f s + h p

/-- 쌍별 정합(잔차 0): 두 회차의 차이가, 같이 지난 씬 전부에서 같은 값 `g p q` 다. -/
def PairOffsets (dom : P → Set S) (σ : P → S → A) (g : P → P → A) : Prop :=
  ∀ p q s, s ∈ dom p → s ∈ dom q → σ p s - σ q s = g p q

/-- 전역 장부가 있으면 모든 쌍이 정합이다. -/
theorem HasLedger.pairOffsets {dom : P → Set S} {σ : P → S → A} (hL : HasLedger dom σ) :
    ∃ g, PairOffsets dom σ g := by
  obtain ⟨f, h, hfh⟩ := hL
  refine ⟨fun p q => h p - h q, ?_⟩
  intro p q s hp hq
  rw [hfh p s hp, hfh q s hq]; abel

/-- **정리 7 (꿰맴)**: 모든 쌍이 정합일 때,
전역 장부가 있다 ⟺ 회차 그물의 모든 고리에서 뒤틀림이 0. -/
theorem hasLedger_iff_zeroHolonomy {dom : P → Set S} {σ : P → S → A} {g : P → P → A}
    (hg : PairOffsets dom σ g) :
    HasLedger dom σ ↔ ZeroHolonomy (overlapGraph dom) g := by
  constructor
  · rintro ⟨f, h, hfh⟩
    apply IsGradient.zeroHolonomy
    refine ⟨h, ?_⟩
    rintro p q ⟨_, s, hp, hq⟩
    rw [← hg p q s hp hq, hfh p s hp, hfh q s hq]; abel
  · intro hz
    classical
    obtain ⟨h, hh⟩ := hz.isGradient
    refine ⟨fun s => if hs : ∃ p, s ∈ dom p then σ hs.choose s - h hs.choose else 0, h, ?_⟩
    intro p s hp
    have hs : ∃ p, s ∈ dom p := ⟨p, hp⟩
    dsimp only
    rw [dif_pos hs]
    have hp₀ := hs.choose_spec
    generalize hs.choose = p₀ at hp₀
    have e : σ p s - σ p₀ s = h p - h p₀ := by
      by_cases heq : p = p₀
      · subst heq; simp
      · rw [hg p p₀ s hp hp₀]
        exact hh p p₀ ⟨heq, s, hp, hp₀⟩
    have : σ p s = σ p₀ s + (h p - h p₀) := by rw [← e]; abel
    rw [this]; abel

/-! ### 정리 8: 쌍별 표가 똑같은 두 세계 — 한쪽만 꿰매진다 -/

namespace Blind

/-- 감정 3축의 정수 벡터. -/
abbrev Vec := ℤ × ℤ × ℤ

def normSq (v : Vec) : ℤ := v.1 * v.1 + v.2.1 * v.2.1 + v.2.2 * v.2.2

/-- 회차 셋(0,1,2), 씬 여섯(0..5). 겹침: 0∩1 = {0,1}, 1∩2 = {2,3}, 2∩0 = {4,5}. 셋이 다 지난 씬은 없다. -/
def domF : Fin 3 → Finset (Fin 6) := ![{0, 1, 4, 5}, {0, 1, 2, 3}, {2, 3, 4, 5}]

def dom : Fin 3 → Set (Fin 6) := fun p => {s | s ∈ domF p}

instance (p : Fin 3) (s : Fin 6) : Decidable (s ∈ dom p) := by
  unfold dom; exact inferInstanceAs (Decidable (s ∈ domF p))

/-- 세계 X: 회차 상수 h = (1,0,0), (0,1,0), (0,0,1) 로 읽은 장부 하나. -/
def σX : Fin 3 → Fin 6 → Vec := fun p s =>
  if p = 0 ∧ 4 ≤ s then (1, 0, -1)
  else if p = 1 ∧ s ≤ 1 then (-1, 1, 0)
  else if p = 2 ∧ 2 ≤ s ∧ s ≤ 3 then (0, -1, 1)
  else 0

/-- 세계 Y: 같은 벡터 (-1,1,0) 가 고리를 한 방향으로 돈다. -/
def σY : Fin 3 → Fin 6 → Vec := fun p s =>
  if p = 0 ∧ 4 ≤ s then (-1, 1, 0)
  else if p = 1 ∧ s ≤ 1 then (-1, 1, 0)
  else if p = 2 ∧ 2 ≤ s ∧ s ≤ 3 then (-1, 1, 0)
  else 0

def hX : Fin 3 → Vec := ![(1, 0, 0), (0, 1, 0), (0, 0, 1)]

def gX : Fin 3 → Fin 3 → Vec := fun p q => hX p - hX q

def gY : Fin 3 → Fin 3 → Vec := fun p q =>
  if q = p + 1 then (1, -1, 0) else if p = q + 1 then (-1, 1, 0) else 0

/-- 두 세계 모두 모든 쌍이 정합이다(잔차 0). -/
theorem pairOffsets_X : PairOffsets dom σX gX := by unfold PairOffsets; decide
theorem pairOffsets_Y : PairOffsets dom σY gY := by unfold PairOffsets; decide

/-- 쌍마다의 거리(제곱)가 두 세계에서 완전히 같다. -/
theorem same_pairwise_table : ∀ p q, normSq (gX p q) = normSq (gY p q) := by decide

/-- 세계 X 에는 전역 장부가 있다. -/
theorem hasLedger_X : HasLedger dom σX := by
  refine ⟨fun s => if s ≤ 1 then (-1, 0, 0) else if s ≤ 3 then (0, -1, 0) else (0, 0, -1), hX, ?_⟩
  decide

/-- 세계 Y 에는 전역 장부가 없다. -/
theorem not_hasLedger_Y : ¬ HasLedger dom σY := by
  rw [hasLedger_iff_zeroHolonomy pairOffsets_Y]
  intro hz
  have h01 : (overlapGraph dom).Adj 0 1 := ⟨by decide, 0, by decide, by decide⟩
  have h12 : (overlapGraph dom).Adj 1 2 := ⟨by decide, 2, by decide, by decide⟩
  have h20 : (overlapGraph dom).Adj 2 0 := ⟨by decide, 4, by decide, by decide⟩
  have := hz 0 (Walk.cons h01 (Walk.cons h12 (Walk.cons h20 Walk.nil)))
  simp only [walkSum_cons, walkSum_nil, add_zero] at this
  revert this
  decide

/-- **정리 8**: 쌍별 정합도 같고 쌍별 거리표도 같은데, 한 세계는 꿰매지고 다른 세계는 안 꿰매진다.
따라서 "꿰매지는가"는 쌍별 표의 함수가 아니다. -/
theorem pairwise_blind :
    PairOffsets dom σX gX ∧ PairOffsets dom σY gY ∧
    (∀ p q, normSq (gX p q) = normSq (gY p q)) ∧
    HasLedger dom σX ∧ ¬ HasLedger dom σY :=
  ⟨pairOffsets_X, pairOffsets_Y, same_pairwise_table, hasLedger_X, not_hasLedger_Y⟩

end Blind

end TemLayer
