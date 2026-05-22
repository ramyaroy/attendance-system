const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, initializeAuthTables } = require('./database');

const app = express();

// ======================================================
// MIDDLEWARE (With Expanded Limits for Massive Datasets)
// ======================================================
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
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
const SECRET_KEY = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const ACCESS_TOKEN_EXPIRY = '2m';
const REFRESH_TOKEN_DAYS = 1;
const REFRESH_COOKIE_NAME = 'attendance_refresh_token';
const isProduction = process.env.NODE_ENV === 'production';

function parseCookies(req) {
  return (req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name || '' },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function setRefreshCookie(res, refreshToken) {
  const maxAge = REFRESH_TOKEN_DAYS * 24 * 60 * 60;
  const secure = isProduction ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function clearRefreshCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`
  );
}

async function createRefreshSession(userId) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await db.execute(
    'INSERT INTO refresh_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );

  return refreshToken;
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await db.execute(
    'UPDATE refresh_sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [hashToken(refreshToken)]
  );
}

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
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const [users] = await db.execute(
      'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
      [email.trim()]
    );

    const user = users[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!passwordMatches) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshSession(user.id);
    setRefreshCookie(res, refreshToken);

    return res.json({
      success: true,
      accessToken,
      expiresIn: 120,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login failure:', error.message);
    return res.status(500).json({ message: 'Login service error' });
  }
});

app.post('/refresh', async (req, res) => {
  try {
    const refreshToken = parseCookies(req)[REFRESH_COOKIE_NAME];
    if (!refreshToken) return res.status(401).json({ message: 'Refresh required' });

    const [sessions] = await db.execute(
      `SELECT rs.id, rs.user_id, u.name, u.email
       FROM refresh_sessions rs
       JOIN users u ON u.id = rs.user_id
       WHERE rs.token_hash = ?
         AND rs.revoked_at IS NULL
         AND rs.expires_at > NOW()
       LIMIT 1`,
      [hashToken(refreshToken)]
    );

    const session = sessions[0];
    if (!session) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    await revokeRefreshToken(refreshToken);
    const newRefreshToken = await createRefreshSession(session.user_id);
    setRefreshCookie(res, newRefreshToken);

    const user = { id: session.user_id, name: session.name, email: session.email };
    return res.json({
      success: true,
      accessToken: createAccessToken(user),
      expiresIn: 120,
      user
    });
  } catch (error) {
    console.error('Refresh failure:', error.message);
    return res.status(500).json({ message: 'Refresh service error' });
  }
});

app.post('/logout', async (req, res) => {
  try {
    const refreshToken = parseCookies(req)[REFRESH_COOKIE_NAME];
    await revokeRefreshToken(refreshToken);
    clearRefreshCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout failure:', error.message);
    clearRefreshCookie(res);
    return res.json({ success: true });
  }
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
initializeAuthTables()
  .then(() => {
    app.listen(PORT, () => console.log(`Node Server running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Failed to initialize auth database:', error.message);
    process.exit(1);
  });
