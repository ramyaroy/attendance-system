const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();

// ======================================================
// MIDDLEWARE (With Expanded Limits for Massive Datasets)
// ======================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ======================================================
// MULTER STORAGE & CONFIG
// ======================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.csv', '.xls', '.xlsx'];
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ];

  const extension = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(extension) && allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files allowed'));
  }
};

const upload = multer({ storage, fileFilter });

// ======================================================
// AUTH SYSTEM CONFIG
// ======================================================
const SECRET_KEY = 'SECRET_KEY';
const REFRESH_SECRET = 'REFRESH_SECRET';
const ACCESS_TOKEN_EXPIRY = '15m'; // Raised to prevent premature expiry during uploads
const refreshTokens = new Set();

const users = [{ email: 'admin@codeclouds.com', password: 'Password123' }];

function verifyToken(req, res, next) {
  let token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  if (token.startsWith('Bearer ')) token = token.slice(7);

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid Token' });
    req.user = decoded;
    next();
  });
}

// Login, Refresh, and Logout hooks
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = users.find(u => u.email === email.trim() && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const accessToken = jwt.sign({ email: user.email }, SECRET_KEY, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ email: user.email }, REFRESH_SECRET, { expiresIn: '1d' });
  refreshTokens.add(refreshToken);

  return res.json({ success: true, accessToken, refreshToken });
});

app.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.has(refreshToken)) return res.status(401).json({ message: 'Invalid refresh token' });

  jwt.verify(refreshToken, REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid refresh token' });
    const newAccessToken = jwt.sign({ email: decoded.email }, SECRET_KEY, { expiresIn: ACCESS_TOKEN_EXPIRY });
    return res.json({ accessToken: newAccessToken });
  });
});

app.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokens.delete(refreshToken);
  return res.json({ success: true });
});

// ======================================================
// FILE UPLOAD HANDLER -> PYTHON COMMUNICATION
// ======================================================
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fullPath = path.resolve(req.file.path);

    // Communicate with Python Engine
    const response = await axios.post(
      'http://127.0.0.1:5000/analyze',
      { filepath: fullPath },
      { 
        headers: { 'Content-Type': 'application/json' }, 
        timeout: 300000, // 5-minute timeout window
        maxContentLength: Infinity,
        maxBodyLength: Infinity 
      }
    );

    const analysis = response.data || {};
    const previewRecords = Array.isArray(analysis.records) ? analysis.records.slice(0, 100) : [];

    return res.json({
      success: true,
      filename: req.file.filename,
      data: {
        ...analysis,
        records: previewRecords,
        records_preview_count: previewRecords.length,
        records_truncated: Array.isArray(analysis.records) && analysis.records.length > previewRecords.length
      }
    });

  } catch (error) {
    console.error('Upload Process Failure:', error.message);
    const errorDetails = error.response?.data?.error || error.message || 'Processing engine error';
    return res.status(500).json({ success: false, error: errorDetails });
  }
});

const PORT = 5001;
app.listen(PORT, () => console.log(`Node Server running on port ${PORT}`));
