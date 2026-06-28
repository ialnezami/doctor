const { Queue } = require('bullmq');
const IORedis = require('ioredis');

let _connection;

function getConnection() {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    _connection.on('error', (err) =>
      console.error('[redis] connection error:', err.message)
    );
  }
  return _connection;
}

let _reminderQueue;
let _digestQueue;

function getReminderQueue() {
  if (!_reminderQueue) {
    _reminderQueue = new Queue('appointment-reminders', { connection: getConnection() });
  }
  return _reminderQueue;
}

function getDigestQueue() {
  if (!_digestQueue) {
    _digestQueue = new Queue('daily-digest', { connection: getConnection() });
  }
  return _digestQueue;
}

let _symptomQueue;

function getSymptomQueue() {
  if (!_symptomQueue) {
    _symptomQueue = new Queue('symptom-analysis', { connection: getConnection() });
  }
  return _symptomQueue;
}

module.exports = { getConnection, getReminderQueue, getDigestQueue, getSymptomQueue };
