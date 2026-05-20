import React, { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

const API_BASE = 'http://localhost:5001'

export default function App() {
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [records, setRecords] = useState([])
  const [riskCounts, setRiskCounts] = useState({})
  const [highRisk, setHighRisk] = useState([])
  const [analyticsDetails, setAnalyticsDetails] = useState({
    summary: {},
    employeeScores: [],
    maxLateEmployees: [],
    overtimeEmployees: [],
    mostHolidaysTaken: [],
    trend: '',
    trendPoints: [],
    overtimePoints: [],
    loginLogoutComparison: [],
    statusCounts: {}
  })
  const [totalRecords, setTotalRecords] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadDecisionPending, setUploadDecisionPending] = useState(false)
  const fileInputRef = useRef(null)
  const isAuthenticated = Boolean(accessToken)

  useEffect(() => {
    const storedAccessToken = localStorage.getItem('accessToken')
    const storedRefreshToken = localStorage.getItem('refreshToken')

    if (storedAccessToken && storedRefreshToken) {
      setAccessToken(storedAccessToken)
      setRefreshToken(storedRefreshToken)
    }
  }, [])

  const saveTokens = (newAccessToken, newRefreshToken) => {
    setAccessToken(newAccessToken)
    setRefreshToken(newRefreshToken)
    localStorage.setItem('accessToken', newAccessToken)
    localStorage.setItem('refreshToken', newRefreshToken)
  }

  const clearAuth = () => {
    setAccessToken('')
    setRefreshToken('')
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }

  const resetDashboard = () => {
    setRecords([])
    setHighRisk([])
    setRiskCounts({})
    setAnalyticsDetails({
      summary: {},
      employeeScores: [],
      maxLateEmployees: [],
      overtimeEmployees: [],
      mostHolidaysTaken: [],
      trend: '',
      trendPoints: [],
      overtimePoints: [],
      loginLogoutComparison: [],
      statusCounts: {}
    })
    setTotalRecords(0)
    setSelectedFileName('')
    setError('')
  }

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/logout`, { refreshToken })
    } catch (e) {
      // Logout should always return the user to the login screen locally.
    }

    clearAuth()
    resetDashboard()
    window.location.href = '/login'
  }

  const uploadFiles = useCallback(
    async (files) => {
      if (!files.length) return

      if (!accessToken) {
        setError('Please login before uploading a file.')
        return
      }

      const file = files[0]
      setSelectedFileName(file.name)
      setLoading(true)
      setError('')

      const formData = new FormData()
      formData.append('file', file)

      try {
        const response = await axios.post(`${API_BASE}/upload`, formData, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'multipart/form-data'
          }
        })

        const analyticsData = response.data?.data || {}
        setRecords(analyticsData.records || [])
        setRiskCounts(analyticsData.risk_counts || {})
        setHighRisk(analyticsData.high_resignation_risk || [])
        setAnalyticsDetails({
          summary: analyticsData.analytics || {},
          employeeScores: analyticsData.employee_attendance_scores || [],
          maxLateEmployees: analyticsData.max_late_employees || [],
          overtimeEmployees: analyticsData.overtime_employees || [],
          mostHolidaysTaken: analyticsData.most_holidays_taken || [],
          trend: analyticsData.trend || '',
          trendPoints: analyticsData.trend_points || [],
          overtimePoints: analyticsData.overtime_points || [],
          loginLogoutComparison: analyticsData.login_logout_comparison || [],
          statusCounts: analyticsData.status_counts || {}
        })
        setTotalRecords(analyticsData.total_records || 0)
        setUploadDecisionPending(true)
      } catch (err) {
        const serverError = err.response?.data
        const missingColumns = serverError?.missing_columns?.join(', ')
        setError(missingColumns ? `Missing required columns: ${missingColumns}` : serverError?.error || err.message || 'Upload failed. Please retry.')
      } finally {
        setLoading(false)
      }
    },
    [accessToken]
  )

  const handleFileInputChange = (event) => {
    uploadFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => {
    setIsDragActive(false)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragActive(false)
    uploadFiles(Array.from(event.dataTransfer.files || []))
  }

  const LoginPage = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [err, setErr] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const navigate = useNavigate()

    const submit = async (event) => {
      event.preventDefault()
      setErr('')
      setIsSubmitting(true)

      try {
        const response = await axios.post(`${API_BASE}/login`, {
          email: email.trim(),
          password
        })

        saveTokens(response.data.accessToken, response.data.refreshToken)
        navigate('/')
      } catch (loginError) {
        setPassword('')
        setErr(loginError.response?.data?.message || 'Invalid email or password. Please retry.')
      } finally {
        setIsSubmitting(false)
      }
    }

    return (
      <div className="panel login-panel">
        <div className="login-header">
          <h2>Login</h2>
          <p>Enter your email and password to continue to the attendance dashboard.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="primary full-width" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Login'}
          </button>

          {err && <p className="form-error">{err}</p>}
        </form>
      </div>
    )
  }

  const UploadPage = () => {
    const navigate = useNavigate()

    useEffect(() => {
      if (!uploadDecisionPending || loading || error) return

      const addAnotherFile = window.confirm(
        'File uploaded successfully. Do you want to add another file?\n\nOK: Upload another file\nCancel: Go to dashboard'
      )

      setUploadDecisionPending(false)
      if (addAnotherFile) {
        setSelectedFileName('')
        return
      }

      navigate('/')
    })

    return (
      <div className="panel">
        <div className="section-heading">
          <h2>Upload Attendance File</h2>
          <p className="muted">Drop a CSV or Excel sheet. Node saves the file, then Python calculates the attendance analytics.</p>
        </div>

        <div className="upload-form">
          <div
            className={`dropzone ${isDragActive ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileInputChange}
            />
            <p>{isDragActive ? 'Release to upload this file' : 'Drag and drop CSV or Excel file here'}</p>

            <button type="button" onClick={() => fileInputRef.current?.click()} className="primary" disabled={loading}>
              Select File
            </button>
          </div>

          {selectedFileName && (
            <p className="selected-file">
              Selected: <strong>{selectedFileName}</strong>
            </p>
          )}

          <div className="hint">
            <small>Accepted formats: .csv, .xls, .xlsx</small>
          </div>
        </div>

        {loading && <p className="muted">Uploading and calculating...</p>}
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  const DashboardPage = () => (
    <div className="dashboard">
      <section className="panel dashboard-summary">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">Upload attendance data to calculate risk levels and review high-risk employees.</p>
        </div>
        <Link to="/upload" className="button-link">Upload File</Link>
      </section>

      {Object.keys(analyticsDetails.summary).length > 0 && (
        <section className="panel">
          <h2>Attendance Summary</h2>
          <div className="metric-grid">
            {Object.entries(analyticsDetails.summary).map(([label, value]) => (
              <div className="metric-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {analyticsDetails.trend && (
        <section className="panel">
          <h2>Trend Intelligence</h2>
          <p className="trend-text">{analyticsDetails.trend}</p>
          {analyticsDetails.trendPoints.length > 0 && (
            <p className="muted">{analyticsDetails.trendPoints.length} day trend calculated with linear regression.</p>
          )}
        </section>
      )}

      <section className="chart-grid">
        <RiskDistributionChart counts={riskCounts} />
        <OvertimeLineChart data={analyticsDetails.overtimePoints} />
        <LoginLogoutOverlapChart data={analyticsDetails.loginLogoutComparison} />
        <StatusPieChart counts={analyticsDetails.statusCounts} />
        <LateLoginChart data={analyticsDetails.maxLateEmployees} />
        <HolidayTakenChart data={analyticsDetails.mostHolidaysTaken} />
        <AttendanceScoreChart data={analyticsDetails.employeeScores} />
      </section>

      <section className="analytics-grid">
        <SummaryList
          title="Overtime Employees"
          rows={analyticsDetails.overtimeEmployees}
          emptyText="No overtime detected."
          columns={[
            ['Name', 'Name'],
            ['Overtime Hours', 'overtime_hours'],
            ['Overtime Minutes', 'overtime_minutes']
          ]}
        />
      </section>

      <section className="panel">
        <h2>High Risk Employees Identified</h2>
        {highRisk.length ? (
          <div className="records-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status Context</th>
                  <th>Productivity Index</th>
                  <th>Risk Score</th>
                </tr>
              </thead>
              <tbody>
                {highRisk.map((employee, index) => (
                  <tr key={`${employee.Name || 'employee'}-${index}`}>
                    <td>{employee.Name || 'Unknown'}</td>
                    <td>{employee['Employee Status']}</td>
                    <td>{employee['Productivity Score']}%</td>
                    <td className="risk-score">{employee['Resignation Risk Score']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No high risk employees found yet.</p>
        )}
      </section>

      {totalRecords > 0 && (
        <section className="panel">
          <h2>Processed Records</h2>
          <p className="muted">{totalRecords} records calculated by the Python service.</p>
          {records.length > 0 && records.length < totalRecords && (
            <p className="muted">Showing a {records.length} record preview to keep uploads responsive.</p>
          )}
        </section>
      )}
    </div>
  )

  const SummaryList = ({ title, rows, columns, emptyText }) => (
    <section className="panel summary-list">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="records-table compact-table">
          <table>
            <thead>
              <tr>
                {columns.map(([label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, index) => (
                <tr key={`${title}-${row.Name || index}`}>
                  {columns.map(([label, key]) => (
                    <td key={`${label}-${key}`}>{row[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{emptyText}</p>
      )}
    </section>
  )

  const RiskDistributionChart = ({ counts }) => {
    const chartData = [
      { name: 'Low', value: counts['Low Resignation Risk'] || 0 },
      { name: 'Medium', value: counts['Medium Resignation Risk'] || 0 },
      { name: 'High', value: counts['High Resignation Risk'] || 0 }
    ]
    const colors = ['#2a9d8f', '#f4a261', '#d62828']
    const hasData = chartData.some((item) => item.value > 0)

    return (
      <section className="panel chart-card">
        <h2>Resignation Risk Distribution</h2>
        {hasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={95} label>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">Upload data to view risk distribution.</p>
        )}
      </section>
    )
  }

  const OvertimeLineChart = ({ data }) => (
    <section className="panel chart-card">
      <h2>Overtime Trend</h2>
      {data.length ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="Date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="overtime_minutes" name="Overtime Minutes" stroke="#0f8b8d" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="muted">Upload data to view overtime trends.</p>
      )}
    </section>
  )

  const LateLoginChart = ({ data }) => {
    const chartData = data
      .filter((employee) => employee.late_logins > 0)
      .sort((a, b) => b.late_logins - a.late_logins)
      .slice(0, 8)

    return (
      <section className="panel chart-card">
        <h2>Employees With Max Late Login</h2>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 42 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Name" angle={-25} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="late_logins" name="Late Login" fill="#d62828" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No late login events found.</p>
        )}
      </section>
    )
  }

  const HolidayTakenChart = ({ data }) => {
    const chartData = data
      .filter((employee) => employee.holidays_taken > 0)
      .sort((a, b) => b.holidays_taken - a.holidays_taken)
      .slice(0, 8)

    return (
      <section className="panel chart-card">
        <h2>Most Holidays Taken</h2>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 42 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Name" angle={-25} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="holidays_taken" name="Holidays" fill="#f4a261" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No holiday/leave rows found.</p>
        )}
      </section>
    )
  }

  const AttendanceScoreChart = ({ data }) => {
    const chartData = data
      .filter((employee) => employee.average_attendance_score !== undefined)
      .sort((a, b) => b.average_attendance_score - a.average_attendance_score)
      .slice(0, 8)

    return (
      <section className="panel chart-card">
        <h2>Attendance Scores</h2>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 42 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Name" angle={-25} textAnchor="end" height={70} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="average_attendance_score" name="Attendance Score" fill="#2a9d8f" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">Upload data to calculate attendance scores.</p>
        )}
      </section>
    )
  }

  const LoginLogoutOverlapChart = ({ data }) => (
    <section className="panel chart-card">
      <h2>Login vs Logout</h2>
      {data.length ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barGap="-55%" margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="login" name="Login" fill="#264de4" opacity={0.82} />
            <Bar dataKey="logout" name="Logout" fill="#ff9f1c" opacity={0.68} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="muted">Upload data to compare login and logout counts.</p>
      )}
    </section>
  )

  const StatusPieChart = ({ counts }) => {
    const chartData = [
      { name: 'Office', value: counts.Office || 0 },
      { name: 'Remote', value: counts.Remote || 0 },
      { name: 'Holidays', value: counts.Leave || 0 }
    ]
    const colors = ['#2a9d8f', '#264de4', '#f4a261']
    const hasData = chartData.some((item) => item.value > 0)

    return (
      <section className="panel chart-card">
        <h2>Holidays vs Remote vs Office</h2>
        {hasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={95} label>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">Upload data to view work distribution.</p>
        )}
      </section>
    )
  }

  return (
    <Router>
      <div className="app-shell">
        <header className="app-header">
          <Link to={isAuthenticated ? '/' : '/login'} className="brand-link">
            Attendance AI Portal
          </Link>

          <nav>
            {isAuthenticated ? (
              <>
                <Link to="/">Dashboard</Link>
                <Link to="/upload">Upload</Link>
                <button type="button" className="nav-button" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <LoginPage />} />
            <Route path="/upload" element={isAuthenticated ? <UploadPage /> : <Navigate to="/login" />} />
            <Route path="/" element={isAuthenticated ? <DashboardPage /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
