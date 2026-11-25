import type { Expense } from "../types";

export function getBudgetSummary(expenses: Expense[], budgetTarget: number) {
  const contracted = expenses.reduce((sum, expense) => sum + expense.contracted_amount, 0);
  const paid = expenses.reduce((sum, expense) => sum + expense.paid_amount, 0);
  return {
    contracted,
    paid,
    unpaid: contracted - paid,
    remaining: budgetTarget - contracted,
    estimated: expenses.reduce((sum, expense) => sum + expense.estimate_amount, 0),
    usedPercent: budgetTarget > 0 ? Math.min(100, Math.round((contracted / budgetTarget) * 100)) : 0
  };
}

export function formatWon(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}
