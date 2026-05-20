import React from 'react'
import { PieChart, Pie, Tooltip, Cell, Legend } from 'recharts'

const COLORS = ['#4caf50', '#ff9800', '#f44336']

export default function RiskPieChart({ counts }) {
  const chartData = [
    {
      name: 'Low Resignation Risk',
      value: counts['Low Resignation Risk'] || 0
    },
    {
      name: 'Medium Resignation Risk',
      value: counts['Medium Resignation Risk'] || 0
    },
    {
      name: 'High Resignation Risk',
      value: counts['High Resignation Risk'] || 0
    }
  ]

  return (
    <PieChart width={360} height={300}>
      <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={120} fill="#8884d8">
        {chartData.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
      <Legend />
    </PieChart>
  )
}
