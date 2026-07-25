jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../utils/email');
jest.mock('../../queues/reminderQueue', () => ({ getReminderQueue: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/reminderDelays', () => ({ computeReminderDelays: jest.fn().mockReturnValue({ delay24h: 0, delay1h: 0 }) }));
jest.mock('../../models/Appointment');
jest.mock('../../models/Doctor');

const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/push');
const { sendEmail } = require('../../utils/email');

const router = require('../appointments');
const { notifyUser } = router;

beforeEach(() => jest.clearAllMocks());

function mockUser(overrides = {}) {
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: 'u1', fcmToken: 'tok1', email: 'patient@test.com', name: 'Alice',
      notificationPrefs: { pushEnabled: true, emailEnabled: true },
      ...overrides,
    }),
  });
}

test('always creates Notification record', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'u1', type: 'appointment_confirmed' }));
});

test('skips push when pushEnabled is false', async () => {
  mockUser({ notificationPrefs: { pushEnabled: false, emailEnabled: true } });
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(sendPush).not.toHaveBeenCalled();
});

test('sends email when emailEnabled and emailData provided', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' }, {
    to: 'patient@test.com', subject: 'Confirmed', html: '<p>Hi</p>',
  });
  expect(sendEmail).toHaveBeenCalledWith('patient@test.com', 'Confirmed', '<p>Hi</p>');
});

test('skips email when emailEnabled is false', async () => {
  mockUser({ notificationPrefs: { pushEnabled: true, emailEnabled: false } });
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' }, {
    to: 'patient@test.com', subject: 'Confirmed', html: '<p>Hi</p>',
  });
  expect(sendEmail).not.toHaveBeenCalled();
});

test('skips email when no emailData provided', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' });
  expect(sendEmail).not.toHaveBeenCalled();
});

test('sends push when pushEnabled is true', async () => {
  mockUser(); // default: pushEnabled: true
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(sendPush).toHaveBeenCalled();
});

test('notifies when notificationPrefs is undefined (legacy user)', async () => {
  mockUser({ notificationPrefs: undefined });
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(sendPush).toHaveBeenCalled();
});
