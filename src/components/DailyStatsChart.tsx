import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type DailyStat = {
  day: string;
  income: number;
  expense: number;
  balance: number;
};

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function DailyStatsChart({ data }: { data: DailyStat[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
        <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
        <XAxis dataKey="day" stroke="#d4d4d8" tick={{ fontSize: 12 }} />
        <YAxis
          stroke="#d4d4d8"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `${Number(value) / 10000}만`}
        />
        <Tooltip
          contentStyle={{
            background: "#09090b",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            color: "#ffffff"
          }}
          formatter={(value) => currency.format(Number(value))}
        />
        <Legend />
        <Bar dataKey="income" name="수입" fill="#34d399" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="지출" fill="#dc2626" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
