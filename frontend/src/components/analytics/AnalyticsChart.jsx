import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { formatNumber } from "../../lib/analytics.js";

const totalColor = "#40B7E5";

function seriesFor(data, includeTotal) {
  const list = (data?.categories || []).map((item) => ({ key: item.code, label: item.name_th, color: item.color_hex || "#8B5CF6", pattern: item.pattern }));
  return includeTotal ? [...list, { key: "TOTAL", label: "รวม", color: totalColor }] : list;
}

function ValueLabel({ x, y, width, value }) {
  if (value === 0 || value === null || value === undefined) return null;
  return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="#43485c">{formatNumber(value)}</text>;
}

export function AnalyticsChart({ data, rows, chartType, showLegend, showValues, includeTotal, height = 390 }) {
  const series = seriesFor(data, includeTotal);
  const tooltipFormatter = (value, name) => [formatNumber(value), series.find((item) => item.key === name)?.label || name];

  if (chartType === "donut") {
    const pieData = series.filter((item) => item.key !== "TOTAL").map((item) => ({
      name: item.label,
      value: Number(data?.categories?.find((category) => category.code === item.key)?.total || 0),
      color: item.color
    })).filter((item) => item.value > 0);
    return (
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="38%" outerRadius="70%" label={showValues ? ({ name, value }) => `${name} ${formatNumber(value)}` : false}>
              {pieData.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value) => formatNumber(value)} />
            {showLegend && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const Common = chartType === "line" ? LineChart : BarChart;
  return (
    <div className="chart-container" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Common data={rows} margin={{ top: showValues ? 28 : 12, right: 18, left: 4, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e9f1" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatNumber(value, 0)} />
          <Tooltip formatter={tooltipFormatter} />
          {showLegend && <Legend formatter={(value) => series.find((item) => item.key === value)?.label || value} />}
          {series.map((item) => chartType === "line"
            ? <Line key={item.key} type="monotone" dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={3} dot={{ r: 4 }} label={showValues ? { position: "top", formatter: formatNumber, fontSize: 11 } : false} />
            : <Bar key={item.key} dataKey={item.key} name={item.key} fill={item.color} radius={[6, 6, 0, 0]} label={showValues ? <ValueLabel /> : false} />)}
        </Common>
      </ResponsiveContainer>
    </div>
  );
}
