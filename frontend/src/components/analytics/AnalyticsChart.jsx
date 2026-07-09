import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { formatNumber } from "../../lib/analytics.js";

const mintPalette = ["#4DB6AC", "#00897B", "#80CBC4", "#B2DFDB", "#00695C", "#004D40"];
const goldPalette = ["#b08f4f", "#cfb076", "#e4cc9f", "#9d7539", "#805c26", "#634417"];

function seriesFor(data, includeTotal, theme) {
  const isGold = theme === "gold";
  const palette = isGold ? goldPalette : mintPalette;
  const totalColor = isGold ? "#8c6b30" : "#004d77";

  const list = (data?.categories || []).map((item, index) => {
    // If database has color, use it as fallback, but prefer theme palette for perfect harmony
    const color = isGold ? palette[index % palette.length] : (item.color_hex || palette[index % palette.length]);
    return { key: item.code, label: item.name_th, color, pattern: item.pattern };
  });

  return includeTotal ? [...list, { key: "TOTAL", label: "รวม", color: totalColor }] : list;
}

function ValueLabel({ x, y, width, value }) {
  if (value === 0 || value === null || value === undefined) return null;
  return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted, #7d705a)">{formatNumber(value)}</text>;
}

export function AnalyticsChart({ data, rows, chartType, showLegend, showValues, includeTotal, theme, height = 390 }) {
  const series = seriesFor(data, includeTotal, theme);
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #d4e5e3)" />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickFormatter={(value) => formatNumber(value, 0)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--color)" }} />
          {showLegend && <Legend formatter={(value) => series.find((item) => item.key === value)?.label || value} />}
          {series.map((item) => chartType === "line"
            ? <Line key={item.key} type="monotone" dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={3} dot={{ r: 4 }} label={showValues ? { position: "top", formatter: formatNumber, fontSize: 11, fill: "var(--text-muted)" } : false} />
            : <Bar key={item.key} dataKey={item.key} name={item.key} fill={item.color} radius={[6, 6, 0, 0]} label={showValues ? <ValueLabel /> : false} />)}
        </Common>
      </ResponsiveContainer>
    </div>
  );
}

