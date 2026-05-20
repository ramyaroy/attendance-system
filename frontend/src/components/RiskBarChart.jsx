import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

export default function RiskBarChart({ employees }) {
  if (!employees || !employees.length) {
    return <p>No high-risk resignation employees found.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={employees} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <XAxis dataKey="Name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Resignation Risk Score" fill="#e74c3c" />
      </BarChart>
    </ResponsiveContainer>
  )
}
