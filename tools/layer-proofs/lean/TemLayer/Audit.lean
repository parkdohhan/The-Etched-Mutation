/-
검산 감사: 주요 정리가 어떤 공리에 기대는지 출력한다.
표준 공리 셋(propext, Classical.choice, Quot.sound)만 나와야 하고, `sorryAx` 가 나오면 빈칸이 있다는 뜻.
-/
import TemLayer.Order
import TemLayer.Gradient
import TemLayer.Runs
import TemLayer.Glue
import TemLayer.Energy

open TemLayer

#print axioms Run.same_equivalence
#print axioms Run.compat_not_equivalence
#print axioms Run.glues_iff_no_cycle
#print axioms Run.Glues.compat
#print axioms Run.exPQR_pairwise_compat
#print axioms Run.exPQR_not_glues
#print axioms Run.disc_eq_zero_iff
#print axioms Run.disc_triangle
#print axioms Run.disc_triangle_fails
#print axioms isGradient_iff_zeroHolonomy
#print axioms isGradient_of_isAcyclic
#print axioms isAcyclic_iff_forall_isGradient
#print axioms single_run_zeroHolonomy
#print axioms const_shift_of_steps
#print axioms hasLedger_iff_zeroHolonomy
#print axioms Blind.pairwise_blind
#print axioms multi_energy_decomp
#print axioms multi_energy_le_iff
#print axioms energy_eq_zero_iff
#print axioms energy_nonneg
#print axioms energy_zero_ledger
