require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { initSocket } = require('./socket');
const { startReminderWorker }                          = require('./workers/reminderWorker');
const { startDigestWorker, registerDigestOrchestrator } = require('./workers/digestWorker');
const { startSymptomWorker }                            = require('./workers/symptomWorker');

const app = express();

app.use(cors());
app.use(express.json());

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
app.use('/api/labs',          require('./routes/labs'));
app.use('/api/users',         require('./routes/users'));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

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
