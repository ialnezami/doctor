jest.mock('../../models/Appointment');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(),
  getReminderQueue: jest.fn(),
}));

const Appointment  = require('../../models/Appointment');
const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/push');

const { processReminderJob } = require('../reminderWorker');

beforeEach(() => jest.clearAllMocks());

test('skips when appointment not found', async () => {
  Appointment.findById = jest.fn().mockResolvedValue(null);
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips when appointment is cancelled', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    status: 'cancelled', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips when remindersDisabled is true', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    status: 'confirmed', remindersDisabled: true, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips 1h reminder when appointment is < 30 min away', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 10 * 60 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '1h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('creates Notification and sends FCM push when eligible', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({ fcmToken: 'tok123' }),
  });
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();

  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '24h' } });

  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
    recipientId: 'p1',
    type: 'appointment_reminder',
    payload: expect.objectContaining({ reminderType: '24h' }),
  }));
  expect(sendPush).toHaveBeenCalledWith(
    'tok123',
    'Reminder: Appointment Tomorrow',
    expect.stringContaining('10:00'),
    expect.objectContaining({ appointmentId: 'a1', reminderType: '24h' })
  );
});
