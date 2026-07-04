require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const helmet         = require('helmet');
const mongoSanitize  = require('express-mongo-sanitize');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initSocket } = require('./socket');
const { startReminderWorker }                          = require('./workers/reminderWorker');
const { startDigestWorker, registerDigestOrchestrator } = require('./workers/digestWorker');
const { startSymptomWorker }                            = require('./workers/symptomWorker');
const { startNoteWorker }                               = require('./workers/noteWorker');
const { startLabWorker }                                = require('./workers/labWorker');
const { startExportWorker }                             = require('./workers/exportWorker');

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000'];

const app = express();

app.set('trust proxy', 1);

// Health endpoint before any redirect — Railway's internal healthcheck hits this
// directly without x-forwarded-proto, so it must respond before the HTTPS redirect.
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// HTTPS redirect in production (skip /health to avoid redirect loop on Railway healthchecks)
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.path !== '/health' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(mongoSanitize());
app.use(apiLimiter);

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/doctors',       require('./routes/doctors'));
app.use('/api/appointments',  require('./routes/appointments'));
app.use('/api/appointments',  require('./routes/notes'));
app.use('/api/appointments',  require('./routes/messages'));
app.use('/api/appointments',  require('./routes/video'));
app.use('/api/reviews',       require('./routes/reviews'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/patients',      require('./routes/patients'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/lab-results',   require('./routes/labResults'));
app.use('/api/share',         require('./routes/share'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/labs',          require('./routes/labs'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/privacy',       require('./routes/privacy'));
app.use('/api/map',           require('./routes/map'));

app.use(errorHandler);

const httpServer = http.createServer(app);
initSocket(httpServer);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    const env = process.env.NODE_ENV || 'development';
    console.log(`\n  MediConnect API`);
    console.log(`  ➜  Local:   http://localhost:${PORT}`);
    console.log(`  ➜  Health:  http://localhost:${PORT}/health`);
    console.log(`  ➜  Mode:    ${env}`);
    console.log(`  ➜  DB:      connected\n`);
  });

  if (process.env.REDIS_URL) {
    startReminderWorker();
    startDigestWorker();
    startSymptomWorker();
    startNoteWorker();
    startLabWorker();
    startExportWorker();
    registerDigestOrchestrator().catch(err =>
      console.error('[digest] orchestrator registration failed:', err.message)
    );
  } else {
    console.warn('[reminders] REDIS_URL not set — reminder workers disabled');
  }
}).catch(err => {
  console.error('DB connection failed', err);
  process.exit(1);
});
