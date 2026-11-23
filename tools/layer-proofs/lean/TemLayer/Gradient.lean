/-
TEM 층 모델 — 장부 하나 ⟺ 고리 뒤틀림 0, 나무면 틈 없음
docs/층모델_정리와_증명_v0.1-261123.md §2 의 기계 검산판.

`V` = 점(씬 그물에서는 씬, 회차 그물에서는 회차), `G` = 실이 놓인 그물,
`g a b` = 실 a→b 에 붙은 통역(값은 덧셈이 되는 아무 것 `A` — 감정 벡터 포함),
`h` = 장부(점마다 값 하나).
-/
import Mathlib

namespace TemLayer

open SimpleGraph

variable {V : Type*} {A : Type*} [AddCommGroup A] {G : SimpleGraph V}

/-- 길을 따라 통역을 더한 값. 닫힌 길이면 이것이 뒤틀림 W. -/
def walkSum (g : V → V → A) : {u v : V} → G.Walk u v → A
  | _, _, .nil => 0
  | _, _, @Walk.cons _ _ u w _ _ p => g u w + walkSum g p

@[simp] theorem walkSum_nil (g : V → V → A) (u : V) :
    walkSum g (Walk.nil : G.Walk u u) = 0 := rfl

@[simp] theorem walkSum_cons (g : V → V → A) {u v w : V} (h : G.Adj u v) (p : G.Walk v w) :
    walkSum g (Walk.cons h p) = g u v + walkSum g p := rfl

theorem walkSum_append (g : V → V → A) {u v w : V} (p : G.Walk u v) (q : G.Walk v w) :
    walkSum g (p.append q) = walkSum g p + walkSum g q := by
  induction p with
  | nil => simp
  | cons h p ih => simp [ih, add_assoc]

/-- 통역이 실 위에서만 같으면 길의 합도 같다. -/
theorem walkSum_congr {g g' : V → V → A} (hgg : ∀ a b, G.Adj a b → g a b = g' a b)
    {u v : V} (p : G.Walk u v) : walkSum g p = walkSum g' p := by
  induction p with
  | nil => rfl
  | cons h p ih => simp [hgg _ _ h, ih]

/-- 망원경 합: 통역이 장부의 차이면, 길의 합 = 출발 장부 − 도착 장부. -/
theorem walkSum_grad (h : V → A) {u v : V} (p : G.Walk u v) :
    walkSum (fun a b => h a - h b) p = h u - h v := by
  induction p with
  | nil => simp
  | cons hadj p ih => simp [ih]

/-- 방향을 뒤집으면 부호가 바뀌는 통역은, 길을 거꾸로 걸으면 합의 부호가 바뀐다. -/
theorem walkSum_reverse {g : V → V → A} (hg : ∀ a b, G.Adj a b → g b a = -g a b)
    {u v : V} (p : G.Walk u v) : walkSum g p.reverse = -walkSum g p := by
  induction p with
  | nil => simp
  | cons h p ih =>
    rw [Walk.reverse_cons, walkSum_append, ih]
    simp [hg _ _ h, add_comm]

theorem walkSum_copy (g : V → V → A) {u v u' v' : V} (p : G.Walk u v) (hu : u = u') (hv : v = v') :
    walkSum g (p.copy hu hv) = walkSum g p := by
  subst hu hv; rfl

theorem walkSum_of_nil (g : V → V → A) {u v : V} {p : G.Walk u v} (hp : p.Nil) :
    walkSum g p = 0 := by
  cases p with
  | nil => rfl
  | cons h q => exact absurd hp Walk.not_nil_cons

/-- `g` 는 장부 하나의 차이다. -/
def IsGradient (G : SimpleGraph V) (g : V → V → A) : Prop :=
  ∃ h : V → A, ∀ a b, G.Adj a b → g a b = h a - h b

/-- 모든 닫힌 길에서 뒤틀림이 0 이다. -/
def ZeroHolonomy (G : SimpleGraph V) (g : V → V → A) : Prop :=
  ∀ (u : V) (p : G.Walk u u), walkSum g p = 0

/-- 정리 2 (⇒): 장부 하나가 있으면 어떤 고리를 돌아도 뒤틀림은 0. -/
theorem IsGradient.zeroHolonomy {g : V → V → A} (hg : IsGradient G g) : ZeroHolonomy G g := by
  obtain ⟨h, hh⟩ := hg
  intro u p
  rw [walkSum_congr hh p, walkSum_grad]
  simp

/-- 뒤틀림이 0 이면 통역은 방향을 뒤집을 때 부호가 바뀐다. -/
theorem ZeroHolonomy.antisymm {g : V → V → A} (hz : ZeroHolonomy G g) :
    ∀ a b, G.Adj a b → g b a = -g a b := by
  intro a b hab
  have := hz a (Walk.cons hab (Walk.cons hab.symm Walk.nil))
  simp only [walkSum_cons, walkSum_nil, add_zero] at this
  exact (neg_eq_of_add_eq_zero_right this).symm

/-- 정리 2 (⇐): 어떤 고리를 돌아도 뒤틀림이 0 이면 장부 하나가 있다. -/
theorem ZeroHolonomy.isGradient {g : V → V → A} (hz : ZeroHolonomy G g) : IsGradient G g := by
  classical
  have hanti := hz.antisymm
  -- 덩어리마다 기준점 하나, 기준점에서 각 점까지의 길 하나를 고른다.
  let rep : V → V := fun v => (G.connectedComponentMk v).out
  have hrep : ∀ v, G.Reachable (rep v) v := fun v =>
    ConnectedComponent.exact (Quot.out_eq (G.connectedComponentMk v))
  let P : ∀ v, G.Walk (rep v) v := fun v => (hrep v).some
  refine ⟨fun v => -walkSum g (P v), ?_⟩
  intro a b hab
  have hr : rep a = rep b := by
    simp only [rep]
    rw [ConnectedComponent.sound hab.reachable]
  -- 닫힌 길: 기준점 → a → b → 기준점
  have key : ∀ (r : V) (p : G.Walk r a) (q : G.Walk r b),
      g a b = -walkSum g p - -walkSum g q := by
    intro r p q
    have := hz r (p.append (Walk.cons hab q.reverse))
    rw [walkSum_append, walkSum_cons, walkSum_reverse hanti] at this
    have h2 : g a b = walkSum g q - walkSum g p := by
      rw [eq_sub_iff_add_eq, add_comm]
      have h3 : walkSum g p + g a b = walkSum g q := by
        rw [← add_assoc] at this
        exact add_neg_eq_zero.mp this
      exact h3
    rw [h2]; abel
  have := key (rep a) (P a) ((P b).copy hr.symm rfl)
  rw [this, walkSum_copy]

/-- **정리 2**: 장부 하나가 있다 ⟺ 모든 고리에서 뒤틀림 0. -/
theorem isGradient_iff_zeroHolonomy (g : V → V → A) : IsGradient G g ↔ ZeroHolonomy G g :=
  ⟨IsGradient.zeroHolonomy, ZeroHolonomy.isGradient⟩

/-! ### 나무(고리 없는 그물)에서는 틈이 생길 수 없다 -/

/-- 고리 없는 그물에서는, 돌아가는 길을 쳐내도 합이 같다. -/
theorem walkSum_bypass [DecidableEq V] (hG : G.IsAcyclic) {g : V → V → A}
    (hg : ∀ a b, G.Adj a b → g b a = -g a b) {u v : V} (p : G.Walk u v) :
    walkSum g p.bypass = walkSum g p := by
  induction p with
  | nil => rfl
  | @cons u x v h q ih =>
    rw [Walk.bypass]
    dsimp only
    split_ifs with hs
    · -- 쳐낸 앞부분은 x 에서 u 로 가는 외길이고, 고리가 없으니 실 x–u 하나뿐이다.
      have hpath : (q.bypass.takeUntil u hs).IsPath := (Walk.bypass_isPath q).takeUntil hs
      have hedge : (Walk.cons h.symm Walk.nil : G.Walk x u).IsPath := by
        simp [Walk.cons_isPath_iff, h.ne']
      have heq : q.bypass.takeUntil u hs = Walk.cons h.symm Walk.nil := by
        have := (hG.subsingleton_path x u).elim ⟨_, hpath⟩ ⟨_, hedge⟩
        exact congrArg Subtype.val this
      have hsplit := congrArg (walkSum g) (Walk.take_spec q.bypass hs)
      rw [walkSum_append, heq] at hsplit
      simp only [walkSum_cons, walkSum_nil, add_zero] at hsplit
      rw [walkSum_cons, ← ih, ← hsplit, hg _ _ h]
      abel
    · rw [walkSum_cons, walkSum_cons, ih]

/-- **정리 2 따름 (나무)**: 고리 없는 그물에서는 어떤 통역을 붙여도 뒤틀림이 0 이다. -/
theorem zeroHolonomy_of_isAcyclic (hG : G.IsAcyclic) {g : V → V → A}
    (hg : ∀ a b, G.Adj a b → g b a = -g a b) : ZeroHolonomy G g := by
  classical
  intro u p
  rw [← walkSum_bypass hG hg p]
  exact walkSum_of_nil g (Walk.isPath_iff_nil.mp (Walk.bypass_isPath p))

/-- **정리 2 따름 (나무)**: 고리 없는 그물에서는 어떤 통역을 붙여도 장부 하나로 전부 설명된다. -/
theorem isGradient_of_isAcyclic (hG : G.IsAcyclic) {g : V → V → A}
    (hg : ∀ a b, G.Adj a b → g b a = -g a b) : IsGradient G g :=
  (zeroHolonomy_of_isAcyclic hG hg).isGradient

/-! ### 거꾸로: 고리가 하나라도 있으면 틈이 가능하다 -/

/-- **정리 2 따름 (역)**: 고리가 있는 그물에는, 장부 하나로는 설명되지 않는 통역이 반드시 있다. -/
theorem exists_not_isGradient_of_not_isAcyclic (hG : ¬ G.IsAcyclic) :
    ∃ g : V → V → ℤ, (∀ a b, G.Adj a b → g b a = -g a b) ∧ ¬ IsGradient G g := by
  classical
  rw [isAcyclic_iff_forall_isBridge] at hG
  push Not at hG
  obtain ⟨e, he, hnb⟩ := hG
  induction e using Sym2.ind with
  | _ x y =>
    have hxy : G.Adj x y := he
    have hex : ∃ p : G.Walk x y, s(x, y) ∉ p.edges := by
      by_contra hcon
      push Not at hcon
      exact hnb (isBridge_iff_forall_walk_mem_edges.mpr hcon)
    obtain ⟨p, hp⟩ := hex
    have hne : x ≠ y := hxy.ne
    let g : V → V → ℤ := fun a b => if a = x ∧ b = y then 1 else if a = y ∧ b = x then -1 else 0
    -- 실 x–y 를 안 지나는 길에서는 합이 0
    have havoid : ∀ {u v : V} (q : G.Walk u v), s(x, y) ∉ q.edges → walkSum g q = 0 := by
      intro u v q
      induction q with
      | nil => intro _; rfl
      | @cons u w v h q ih =>
        intro hq
        rw [Walk.edges_cons, List.mem_cons, not_or] at hq
        have h1 : ¬ (u = x ∧ w = y) := fun ⟨h1, h2⟩ => hq.1 (by rw [h1, h2])
        have h2 : ¬ (u = y ∧ w = x) := fun ⟨h1, h2⟩ => hq.1 (by rw [h1, h2, Sym2.eq_swap])
        rw [walkSum_cons, ih hq.2]
        simp [g, h1, h2]
    refine ⟨g, ?_, ?_⟩
    · intro a b _
      by_cases h1 : a = x ∧ b = y
      · obtain ⟨rfl, rfl⟩ := h1
        simp [g, hne, hne.symm]
      · by_cases h2 : a = y ∧ b = x
        · obtain ⟨rfl, rfl⟩ := h2
          simp [g, hne, hne.symm]
        · have h3 : ¬ (b = x ∧ a = y) := fun ⟨h, h'⟩ => h2 ⟨h', h⟩
          have h4 : ¬ (b = y ∧ a = x) := fun ⟨h, h'⟩ => h1 ⟨h', h⟩
          simp [g, h1, h2, h3, h4]
    · intro hgrad
      have := hgrad.zeroHolonomy x (p.append (Walk.cons hxy.symm Walk.nil))
      rw [walkSum_append, havoid p hp] at this
      simp [g, hne, hne.symm] at this

/-- **정리 2 따름 (나무의 특징)**: 틈이 원리적으로 불가능한 그물 = 고리 없는 그물. -/
theorem isAcyclic_iff_forall_isGradient :
    G.IsAcyclic ↔ ∀ g : V → V → ℤ, (∀ a b, G.Adj a b → g b a = -g a b) → IsGradient G g := by
  constructor
  · intro hG g hg
    exact isGradient_of_isAcyclic hG hg
  · intro h
    by_contra hG
    obtain ⟨g, hg, hng⟩ := exists_not_isGradient_of_not_isAcyclic hG
    exact hng (h g hg)

end TemLayer
