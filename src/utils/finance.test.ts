import { describe, expect, it } from "vitest";
import { getBudgetSummary } from "./finance";
import type { Expense } from "../types";

const expense = (estimate: number, contracted: number, paid: number): Expense => ({
  id: crypto.randomUUID(),
  project_id: "project",
  title: "항목",
  category: "기타",
  estimate_amount: estimate,
  contracted_amount: contracted,
  paid_amount: paid,
  due_date: null,
  paid_on: null,
  payer: "함께",
  created_at: "",
  updated_at: ""
});

describe("getBudgetSummary", () => {
  it("계약액과 실제 납부액을 중복 합산하지 않는다", () => {
    expect(getBudgetSummary([expense(120_000, 100_000, 30_000)], 200_000)).toEqual({
      contracted: 100_000,
      paid: 30_000,
      unpaid: 70_000,
      remaining: 100_000,
      estimated: 120_000,
      usedPercent: 50
    });
  });

  it("목표 예산이 없을 때 사용률을 0으로 계산한다", () => {
    expect(getBudgetSummary([expense(0, 0, 0)], 0).usedPercent).toBe(0);
  });
});
