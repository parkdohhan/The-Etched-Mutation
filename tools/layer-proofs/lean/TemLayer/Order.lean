/-
TEM 층 모델 — 순서 층 (실의 같음·양립·꿰맴·켄달)
docs/층모델_정리와_증명_v0.1-261123.md §3 의 기계 검산판.

원시: 씬의 형 `S`. 회차(실) = 지난 씬의 유한 집합 `dom` + 그 위의 차례 `pos`.
-/
import Mathlib

namespace TemLayer

/-- 회차(실): 지난 씬 집합과, 그 위에서 서로 다른 씬에 서로 다른 차례를 주는 `pos`. -/
structure Run (S : Type*) where
  dom : Finset S
  pos : S → ℕ
  inj : Set.InjOn pos dom

namespace Run

variable {S : Type*}

/-- 양립: 둘 다 지난 씬 쌍의 선후가 전부 같다. (정의 v1 D2 ② 의 원래 문구) -/
def Compat (p q : Run S) : Prop :=
  ∀ a ∈ p.dom, ∀ b ∈ p.dom, a ∈ q.dom → b ∈ q.dom → (p.pos a < p.pos b ↔ q.pos a < q.pos b)

/-- 실 같음(수리안): 지난 씬 집합이 같고, 그 위에서 양립. -/
def Same (p q : Run S) : Prop := p.dom = q.dom ∧ Compat p q

instance [DecidableEq S] (p q : Run S) : Decidable (Compat p q) := by
  unfold Compat; infer_instance

instance [DecidableEq S] (p q : Run S) : Decidable (Same p q) := by
  unfold Same; infer_instance

/-- 정리 9(a): 양립은 자기 자신과 성립한다. -/
theorem Compat.refl (p : Run S) : Compat p p := fun _ _ _ _ _ _ => Iff.rfl

/-- 정리 9(a): 양립은 뒤집어도 성립한다. -/
theorem Compat.symm {p q : Run S} (h : Compat p q) : Compat q p :=
  fun a ha b hb ha' hb' => (h a ha' b hb' ha hb).symm

/-- 정리 9(c): 실 같음(수리안)은 동치 관계다 — 자기·대칭·추이. -/
theorem same_equivalence : Equivalence (Same : Run S → Run S → Prop) where
  refl p := ⟨rfl, Compat.refl p⟩
  symm h := ⟨h.1.symm, h.2.symm⟩
  trans := by
    intro p q r hpq hqr
    refine ⟨hpq.1.trans hqr.1, ?_⟩
    intro a ha b hb ha' hb'
    have haq : a ∈ q.dom := hpq.1 ▸ ha
    have hbq : b ∈ q.dom := hpq.1 ▸ hb
    exact (hpq.2 a ha b hb haq hbq).trans (hqr.2 a haq b hbq ha' hb')

/-- 정리 9(d): 지난 씬 집합이 같은 회차끼리는 양립 = 실 같음. -/
theorem compat_iff_same_of_dom_eq {p q : Run S} (h : p.dom = q.dom) : Compat p q ↔ Same p q :=
  ⟨fun hc => ⟨h, hc⟩, fun hs => hs.2⟩

/-- 목록으로 적은 회차. 차례 = 목록에서의 자리. -/
def ofList [DecidableEq S] (l : List S) (_h : l.Nodup) : Run S where
  dom := l.toFinset
  pos := fun a => l.idxOf a
  inj := by
    intro a ha b hb hab
    have ha' : a ∈ l := by simpa using ha
    have hb' : b ∈ l := by simpa using hb
    exact (List.idxOf_inj ha').mp hab

/-! ### 정리 9(b): 양립은 건너뛰기(추이)가 안 된다 — 반례 -/

def exA : Run ℕ := ofList [1, 2, 3] (by decide)
def exB : Run ℕ := ofList [1, 4] (by decide)
def exC : Run ℕ := ofList [3, 2, 1] (by decide)

theorem compat_not_transitive :
    Compat exA exB ∧ Compat exB exC ∧ ¬ Compat exA exC := by decide

/-- 그러므로 양립은 동치 관계가 아니다. -/
theorem compat_not_equivalence : ¬ Equivalence (Compat : Run ℕ → Run ℕ → Prop) := by
  intro h
  exact compat_not_transitive.2.2 (h.trans compat_not_transitive.1 compat_not_transitive.2.1)

/-! ### 정리 10: 순서의 꿰맴 -/

variable {ι : Type*}

/-- 어느 회차에선가 `a` 가 `b` 보다 먼저다. -/
def Before (runs : ι → Run S) (a b : S) : Prop :=
  ∃ i, a ∈ (runs i).dom ∧ b ∈ (runs i).dom ∧ (runs i).pos a < (runs i).pos b

/-- 꿰맴: 모든 회차의 선후를 한꺼번에 지키는 한 줄 순서가 있다. -/
def Glues (runs : ι → Run S) : Prop :=
  ∃ s : S → S → Prop, IsLinearOrder S s ∧ ∀ a b, Before runs a b → s a b

/-- 정리 10: 한 줄로 꿰매진다 ⟺ 선후를 따라가서 제자리로 돌아오는 길(방향 고리)이 없다. -/
theorem glues_iff_no_cycle (runs : ι → Run S) :
    Glues runs ↔ ∀ a, ¬ Relation.TransGen (Before runs) a a := by
  constructor
  · rintro ⟨s, hs, hle⟩ a hcyc
    have := hs
    have hmono : ∀ {x y}, Relation.ReflTransGen (Before runs) x y → s x y := by
      intro x y h
      induction h with
      | refl => exact refl_of s x
      | tail _ hbc ih => exact trans_of s ih (hle _ _ hbc)
    obtain ⟨c, hac, hca⟩ := Relation.TransGen.head'_iff.mp hcyc
    have h1 : s a c := hle _ _ hac
    have h2 : s c a := hmono hca
    have hEq : a = c := antisymm_of s h1 h2
    obtain ⟨i, ha, hc, hlt⟩ := hac
    rw [hEq] at hlt
    exact lt_irrefl _ hlt
  · intro hno
    let r : S → S → Prop := Relation.ReflTransGen (Before runs)
    have : IsPartialOrder S r :=
      { refl := fun a => Relation.ReflTransGen.refl
        trans := fun a b c hab hbc => Relation.ReflTransGen.trans hab hbc
        antisymm := by
          intro a b hab hba
          by_contra hne
          rcases Relation.reflTransGen_iff_eq_or_transGen.mp hab with h | h
          · exact hne h.symm
          · rcases Relation.reflTransGen_iff_eq_or_transGen.mp hba with h' | h'
            · exact hne h'
            · exact hno a (h.trans h') }
    obtain ⟨s, hs, hrs⟩ := extend_partialOrder r
    exact ⟨s, hs, fun a b hab => hrs a b (Relation.ReflTransGen.single hab)⟩

/-- 따름: 꿰매지면 둘씩은 반드시 양립한다 (역은 거짓 — 아래 예). -/
theorem Glues.compat {runs : ι → Run S} (h : Glues runs) (i j : ι) :
    Compat (runs i) (runs j) := by
  obtain ⟨s, hs, hle⟩ := h
  have := hs
  have key : ∀ (i j : ι) a b, a ∈ (runs i).dom → b ∈ (runs i).dom → a ∈ (runs j).dom →
      b ∈ (runs j).dom → (runs i).pos a < (runs i).pos b → (runs j).pos a < (runs j).pos b := by
    intro i j a b ha hb ha' hb' hlt
    by_contra hnot
    have hne : a ≠ b := by rintro rfl; exact lt_irrefl _ hlt
    have hne' : (runs j).pos a ≠ (runs j).pos b := fun h => hne ((runs j).inj ha' hb' h)
    have hgt : (runs j).pos b < (runs j).pos a := by omega
    have h1 : s a b := hle _ _ ⟨i, ha, hb, hlt⟩
    have h2 : s b a := hle _ _ ⟨j, hb', ha', hgt⟩
    exact hne (antisymm_of s h1 h2)
  intro a ha b hb ha' hb'
  exact ⟨key i j a b ha hb ha' hb', key j i a b ha' hb' ha hb⟩

/-! ### 둘씩은 전부 양립인데 셋은 한 줄로 안 선다 — 예 -/

def exP : Run ℕ := ofList [1, 2, 3, 4] (by decide)
def exQ : Run ℕ := ofList [3, 4, 5, 6] (by decide)
def exR : Run ℕ := ofList [5, 6, 1, 2] (by decide)

def exPQR : Fin 3 → Run ℕ := ![exP, exQ, exR]

theorem exPQR_pairwise_compat : ∀ i j, Compat (exPQR i) (exPQR j) := by decide

theorem exPQR_not_glues : ¬ Glues exPQR := by
  rw [glues_iff_no_cycle]
  push Not
  refine ⟨2, ?_⟩
  have h23 : Before exPQR 2 3 := ⟨0, by decide, by decide, by decide⟩
  have h35 : Before exPQR 3 5 := ⟨1, by decide, by decide, by decide⟩
  have h52 : Before exPQR 5 2 := ⟨2, by decide, by decide, by decide⟩
  exact ((Relation.TransGen.single h23).tail h35).tail h52

/-! ### 정리 11: 켄달 — 지난 씬이 같으면 삼각부등식, 다르면 깨진다 -/

/-- 공통으로 지난 씬 가운데 선후가 뒤집힌 쌍의 수. -/
def disc [DecidableEq S] (p q : Run S) : ℕ :=
  (((p.dom ∩ q.dom) ×ˢ (p.dom ∩ q.dom)).filter
    fun x => p.pos x.1 < p.pos x.2 ∧ q.pos x.2 < q.pos x.1).card

/-- 뒤집힌 쌍이 0 ⟺ 양립. -/
theorem disc_eq_zero_iff [DecidableEq S] (p q : Run S) : disc p q = 0 ↔ Compat p q := by
  unfold disc
  rw [Finset.card_eq_zero, Finset.filter_eq_empty_iff]
  constructor
  · intro h a ha b hb ha' hb'
    have hab := h (x := (a, b)) (by simp [ha, hb, ha', hb'])
    have hba := h (x := (b, a)) (by simp [ha, hb, ha', hb'])
    simp only [not_and, not_lt] at hab hba
    constructor
    · intro hlt
      have h1 := hab hlt
      have hne : a ≠ b := by rintro rfl; exact lt_irrefl _ hlt
      have : q.pos a ≠ q.pos b := fun h' => hne (q.inj ha' hb' h')
      omega
    · intro hlt
      by_contra hnot
      have hne : a ≠ b := by rintro rfl; exact lt_irrefl _ hlt
      have : p.pos a ≠ p.pos b := fun h' => hne (p.inj ha hb h')
      have h2 : p.pos b < p.pos a := by omega
      have := hba h2
      omega
  · intro h x hx
    simp only [Finset.mem_product, Finset.mem_inter] at hx
    intro ⟨h1, h2⟩
    have := (h x.1 hx.1.1 x.2 hx.2.1 hx.1.2 hx.2.2).mp h1
    omega

/-- 지난 씬 집합이 같은 세 회차에서는 삼각부등식이 성립한다. -/
theorem disc_triangle [DecidableEq S] (p q r : Run S) (hpq : p.dom = q.dom) (hqr : q.dom = r.dom) :
    disc p r ≤ disc p q + disc q r := by
  unfold disc
  rw [← hqr, ← hpq]
  simp only [Finset.inter_self]
  refine le_trans (Finset.card_le_card ?_) (Finset.card_union_le _ _)
  intro x hx
  simp only [Finset.mem_filter, Finset.mem_product, Finset.mem_union] at hx ⊢
  obtain ⟨⟨h1, h2⟩, hlt, hgt⟩ := hx
  have hne : x.1 ≠ x.2 := by intro h; rw [h] at hlt; exact lt_irrefl _ hlt
  have hq : q.pos x.1 ≠ q.pos x.2 := fun h => hne (q.inj (hpq ▸ h1) (hpq ▸ h2) h)
  by_cases hc : q.pos x.1 < q.pos x.2
  · exact Or.inr ⟨⟨h1, h2⟩, hc, hgt⟩
  · exact Or.inl ⟨⟨h1, h2⟩, hlt, by omega⟩

def exK1 : Run ℕ := ofList [1, 2, 3, 4] (by decide)
def exK2 : Run ℕ := ofList [3, 4] (by decide)
def exK3 : Run ℕ := ofList [2, 1, 3, 4] (by decide)

/-- 지난 씬이 다르면 깨진다: A–B 0, B–C 0 인데 A–C 는 1. -/
theorem disc_triangle_fails : disc exK1 exK2 = 0 ∧ disc exK2 exK3 = 0 ∧ disc exK1 exK3 = 1 := by
  decide

end Run

end TemLayer
