/-
TEM 층 모델 — 무게(걸음 수)의 근거: 다중 그물 에너지 = 실 안 흩어짐 + 실 사이 어긋남
docs/층모델_정리와_증명_v0.1-261123.md §2.5 의 기계 검산판.
-/
import Mathlib

namespace TemLayer

open Finset

variable {E : Type*} [NormedAddCommGroup E] [InnerProductSpace ℝ E]

/-- 한 실 위의 걸음들 `d i` 와 아무 기준값 `c` 에 대해:
Σ‖d − c‖² = Σ‖d − 평균‖² + (걸음 수)·‖평균 − c‖². -/
theorem sum_sq_decomp {ι : Type*} (s : Finset ι) (d : ι → E) (c : E) :
    ∑ i ∈ s, ‖d i - c‖ ^ 2 =
      ∑ i ∈ s, ‖d i - (s.card : ℝ)⁻¹ • ∑ j ∈ s, d j‖ ^ 2
        + s.card * ‖(s.card : ℝ)⁻¹ • ∑ j ∈ s, d j - c‖ ^ 2 := by
  rcases s.eq_empty_or_nonempty with rfl | hs
  · simp
  set g := (s.card : ℝ)⁻¹ • ∑ j ∈ s, d j with hg
  have hcard : (s.card : ℝ) ≠ 0 := by exact_mod_cast hs.card_pos.ne'
  have hsum : ∑ i ∈ s, (d i - g) = 0 := by
    rw [sum_sub_distrib, sum_const, hg, ← Nat.cast_smul_eq_nsmul ℝ, smul_smul,
      mul_inv_cancel₀ hcard, one_smul, sub_self]
  have hpt : ∀ i, ‖d i - c‖ ^ 2 =
      ‖d i - g‖ ^ 2 + 2 * inner ℝ (d i - g) (g - c) + ‖g - c‖ ^ 2 := by
    intro i
    have : d i - c = (d i - g) + (g - c) := by abel
    rw [this, norm_add_sq_real]
  simp_rw [hpt]
  rw [sum_add_distrib, sum_add_distrib, ← mul_sum, ← sum_inner, hsum, inner_zero_left]
  simp [sum_const, nsmul_eq_mul]

variable {T K : Type*} [Fintype T] [Fintype K] [DecidableEq K]

/-- 실 `κ` 위의 걸음들. -/
def fiber (k : T → K) (κ : K) : Finset T := univ.filter fun t => k t = κ

/-- 실 `κ` 의 통역 = 그 위 걸음들의 평균. -/
noncomputable def edgeMean (k : T → K) (d : T → E) (κ : K) : E :=
  ((fiber k κ).card : ℝ)⁻¹ • ∑ t ∈ fiber k κ, d t

/-- **정리 5**: 걸음마다 한 가닥으로 본 에너지(왼쪽)는, 어떤 장부 `c` 를 대든,
"실 안 흩어짐"(장부와 무관) + "걸음 수를 무게로 한 실 사이 어긋남" 으로 갈라진다.
`k t` = 걸음 t 가 놓인 실, `c κ` = 장부가 실 κ 에 대해 말하는 값(두 끝 장부의 차). -/
theorem multi_energy_decomp (k : T → K) (d : T → E) (c : K → E) :
    ∑ t, ‖d t - c (k t)‖ ^ 2 =
      ∑ κ, ∑ t ∈ fiber k κ, ‖d t - edgeMean k d κ‖ ^ 2
        + ∑ κ, ((fiber k κ).card : ℝ) * ‖edgeMean k d κ - c κ‖ ^ 2 := by
  rw [← sum_add_distrib, ← sum_fiberwise univ k]
  refine sum_congr rfl fun κ _ => ?_
  have : ∑ t ∈ univ.filter (fun t => k t = κ), ‖d t - c (k t)‖ ^ 2
      = ∑ t ∈ fiber k κ, ‖d t - c κ‖ ^ 2 := by
    refine sum_congr rfl fun t ht => ?_
    rw [(mem_filter.mp ht).2]
  rw [this]
  exact sum_sq_decomp (fiber k κ) d (c κ)

/-- 따름: 실 안 흩어짐은 장부를 바꿔도 안 변하므로, 다중 그물에서 가장 잘 맞는 장부와
걸음 수를 무게로 한 씬 그물에서 가장 잘 맞는 장부는 같다. -/
theorem multi_energy_le_iff (k : T → K) (d : T → E) (c c' : K → E) :
    ∑ t, ‖d t - c (k t)‖ ^ 2 ≤ ∑ t, ‖d t - c' (k t)‖ ^ 2 ↔
      ∑ κ, ((fiber k κ).card : ℝ) * ‖edgeMean k d κ - c κ‖ ^ 2
        ≤ ∑ κ, ((fiber k κ).card : ℝ) * ‖edgeMean k d κ - c' κ‖ ^ 2 := by
  rw [multi_energy_decomp k d c, multi_energy_decomp k d c']
  exact add_le_add_iff_left _

/-! ### ρ 의 분자(에너지)와 "장부 하나" 를 잇는 다리 -/

section Rho

variable {V : Type*}

/-- 씬 그물의 에너지: 실 `κ`(두 끝 `α κ`, `β κ`, 무게 `w κ`, 통역 `g κ`)마다,
통역과 장부 차이의 어긋남을 제곱해 무게를 곱해 더한 것. ρ 의 분자는 이것의 최솟값. -/
noncomputable def energy (α β : K → V) (w : K → ℝ) (g : K → E) (h : V → E) : ℝ :=
  ∑ κ, w κ * ‖g κ - (h (α κ) - h (β κ))‖ ^ 2

omit [InnerProductSpace ℝ E] [DecidableEq K] in
/-- 에너지는 음수가 아니다 (ρ ≥ 0). -/
theorem energy_nonneg (α β : K → V) {w : K → ℝ} (hw : ∀ κ, 0 < w κ) (g : K → E) (h : V → E) :
    0 ≤ energy α β w g h :=
  sum_nonneg fun κ _ => mul_nonneg (hw κ).le (sq_nonneg _)

omit [InnerProductSpace ℝ E] [DecidableEq K] in
/-- 장부를 전부 0 으로 두면 에너지는 분모 Σ w‖g‖² 와 같다 (그러므로 최솟값 ≤ 분모, ρ ≤ 1). -/
theorem energy_zero_ledger (α β : K → V) (w : K → ℝ) (g : K → E) :
    energy α β w g (fun _ => (0 : E)) = ∑ κ, w κ * ‖g κ‖ ^ 2 := by
  simp [energy]

omit [InnerProductSpace ℝ E] [DecidableEq K] in
/-- **ρ = 0 의 뜻**: 에너지가 0 인 장부 `h` ⟺ 모든 실에서 통역이 정확히 `h` 의 차이. -/
theorem energy_eq_zero_iff (α β : K → V) {w : K → ℝ} (hw : ∀ κ, 0 < w κ) (g : K → E) (h : V → E) :
    energy α β w g h = 0 ↔ ∀ κ, g κ = h (α κ) - h (β κ) := by
  unfold energy
  rw [sum_eq_zero_iff_of_nonneg fun κ _ => mul_nonneg (hw κ).le (sq_nonneg _)]
  constructor
  · intro hz κ
    have := hz κ (mem_univ κ)
    rcases mul_eq_zero.mp this with h0 | h0
    · exact absurd h0 (hw κ).ne'
    · exact sub_eq_zero.mp (norm_eq_zero.mp ((pow_eq_zero_iff two_ne_zero).mp h0))
  · intro hg κ _
    rw [hg κ]; simp

end Rho

end TemLayer
