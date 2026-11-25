import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatWon } from "../utils/finance";

interface CategoryAmount {
  category: string;
  amount: number;
}

export default function CategorySpendingChart({ data }: { data: CategoryAmount[] }) {
  return (
    <div className="h-[230px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#eff0eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="category" tick={{ fill: "#858a80", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(value: number) => `${Math.round(value / 10_000)}만`} tick={{ fill: "#858a80", fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
          <Tooltip formatter={(value) => formatWon(Number(value))} />
          <Bar dataKey="amount" name="계약 금액" fill="#829472" radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
