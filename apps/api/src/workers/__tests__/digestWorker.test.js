jest.mock('../../models/Doctor');
jest.mock('../../models/User');
jest.mock('../../models/Appointment');
jest.mock('../../models/Notification');
jest.mock('../../utils/push');
jest.mock('../../utils/email');
jest.mock('../../utils/emailTemplates', () => ({
  dailyDigestEmail: jest.fn().mockReturnValue('<p>digest</p>'),
}));
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(),
  getDigestQueue: jest.fn(),
}));
jest.mock('../../utils/reminderDelays', () => ({
  nextLocalSevenAmDelay: jest.fn().mockReturnValue(3600000),
}));

const Doctor       = require('../../models/Doctor');
const User         = require('../../models/User');
const Appointment  = require('../../models/Appointment');
const Notification = require('../../models/Notification');
const { sendPush } = require('../../utils/push');
const { sendEmail } = require('../../utils/email');
const { getDigestQueue } = require('../../queues/reminderQueue');

const { processOrchestratorJob, processDigestSendJob } = require('../digestWorker');

beforeEach(() => jest.clearAllMocks());

describe('processOrchestratorJob', () => {
  it('enqueues digest-send only for doctors with fcmToken', async () => {
    const mockAdd = jest.fn().mockResolvedValue({});
    getDigestQueue.mockReturnValue({ add: mockAdd });
    Doctor.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        { _id: 'd1', timezone: 'UTC',         userId: { _id: 'u1', fcmToken: 'tok1' } },
        { _id: 'd2', timezone: 'Asia/Riyadh', userId: { _id: 'u2', fcmToken: null  } },
      ]),
    });

    await processOrchestratorJob({});

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'digest-send',
      { doctorUserId: 'u1', doctorTimezone: 'UTC' },
      { delay: 3600000 }
    );
  });
});

describe('processDigestSendJob', () => {
  it('skips push and notification when no appointments today', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: 'tok1' }),
    });
    Appointment.countDocuments = jest.fn().mockResolvedValue(0);

    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

    expect(sendPush).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it('sends push and creates Notification when appointments exist', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: 'tok1' }),
    });
    Appointment.countDocuments = jest.fn().mockResolvedValue(3);
    Notification.create = jest.fn().mockResolvedValue({});
    sendPush.mockResolvedValue();

    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

    expect(sendPush).toHaveBeenCalledWith(
      'tok1',
      'Daily Schedule',
      'You have 3 appointment(s) today.',
      {}
    );
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'u1',
      type: 'daily_digest',
      payload: expect.objectContaining({ count: 3 }),
    }));
  });

  it('skips when user has no fcmToken', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: null }),
    });
    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('skips when user not found', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });
    expect(sendPush).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it('sends email when emailEnabled and appointments exist', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'u1', fcmToken: 'tok1', email: 'dr@test.com', name: 'Dr. Ali',
        notificationPrefs: { pushEnabled: true, emailEnabled: true },
      }),
    });
    Appointment.countDocuments = jest.fn().mockResolvedValue(2);
    Notification.create = jest.fn().mockResolvedValue({});
    sendPush.mockResolvedValue();
    sendEmail.mockResolvedValue();

    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

    expect(sendEmail).toHaveBeenCalledWith('dr@test.com', expect.stringContaining('Schedule'), '<p>digest</p>');
  });
});
