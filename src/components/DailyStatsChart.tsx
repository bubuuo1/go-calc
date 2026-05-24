import {
  CartesianGrid,
  Line,
  LineChart,
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
      <LineChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
        <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 12 }} />
        <YAxis
          stroke="#64748b"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `${Number(value) / 10000}만`}
        />
        <Tooltip
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            color: "#0f172a",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)"
          }}
          formatter={(value) => currency.format(Number(value))}
        />
        <Line
          activeDot={{ r: 5, strokeWidth: 0 }}
          dataKey="expense"
          dot={{ r: 3, strokeWidth: 0 }}
          name="지출"
          stroke="#dc2626"
          strokeWidth={3}
          type="monotone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
