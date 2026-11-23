/-
TEM 층 모델 — 회차 하나 안에서는 틈이 없다 / ρ_multi = 0 의 뜻
docs/층모델_정리와_증명_v0.1-261123.md §2.4, §2.5 의 기계 검산판.
-/
import TemLayer.Gradient

namespace TemLayer

open SimpleGraph

variable {V : Type*} {A : Type*} [AddCommGroup A] {G : SimpleGraph V}

/-- **실 하나는 모순이 없다**: 한 회차가 씬마다 장부를 하나씩만 적었다면,
그 회차의 걸음들은 (그물 모양이 어떻든) 그 장부 하나로 전부 설명된다. -/
theorem single_run_isGradient (σ : V → A) : IsGradient G (fun a b => σ a - σ b) :=
  ⟨σ, fun _ _ _ => rfl⟩

/-- 따라서 회차 하나만으로는 어떤 고리를 돌아도 뒤틀림이 0 이다. -/
theorem single_run_zeroHolonomy (σ : V → A) : ZeroHolonomy G (fun a b => σ a - σ b) :=
  (single_run_isGradient σ).zeroHolonomy

/-- **정리 6**: 회차가 "장부 하나 `f` + 자기 상수 `c`" 로 읽으면, 그 회차의 모든 걸음은 `f` 의 차이다. -/
theorem step_of_shifted_ledger (f : V → A) (c : A) (a b : V) :
    (f a + c) - (f b + c) = f a - f b := by abel

/-- **정리 5(다)**: 거꾸로, 한 회차의 이웃한 걸음이 전부 장부 `h` 의 차이와 같으면,
그 회차의 장부는 지난 씬 전부에서 `h` 를 상수 하나만큼 옮긴 것이다. -/
theorem const_shift_of_steps (σ h : V → A) (l : List V)
    (hl : l.IsChain fun a b => σ a - σ b = h a - h b) :
    ∃ c : A, ∀ a ∈ l, σ a = h a + c := by
  have hl' : l.IsChain fun a b => σ a - h a = σ b - h b := by
    refine hl.imp fun a b hab => ?_
    have : σ a - h a - (σ b - h b) = 0 := by
      have e : σ a - h a - (σ b - h b) = (σ a - σ b) - (h a - h b) := by abel
      rw [e, hab, sub_self]
    exact sub_eq_zero.mp this
  have : IsTrans V (fun a b => σ a - h a = σ b - h b) := ⟨fun _ _ _ h1 h2 => h1.trans h2⟩
  have hp := hl'.pairwise
  cases l with
  | nil => exact ⟨0, by simp⟩
  | cons x l =>
    refine ⟨σ x - h x, fun a ha => ?_⟩
    have : σ a - h a = σ x - h x := by
      rcases List.mem_cons.mp ha with rfl | hal
      · rfl
      · exact ((List.pairwise_cons.mp hp).1 a hal).symm
    rw [← this]; abel

end TemLayer
