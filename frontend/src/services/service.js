import axios from 'axios'

const API_BASE = 'http://localhost:5001'

export const uploadFile = (accessToken, file) => {
  const fd = new FormData()
  fd.append('file', file)
  const headers = { Authorization: `Bearer ${accessToken}` }
  // Do not set Content-Type; let browser set the boundary
  return axios.post(`${API_BASE}/upload`, fd, { headers, timeout: 120000 })
}
