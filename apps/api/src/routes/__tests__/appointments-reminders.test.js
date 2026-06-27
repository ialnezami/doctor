jest.mock('../../queues/reminderQueue');
jest.mock('../../utils/reminderDelays');
jest.mock('../../models/Appointment');
jest.mock('../../models/Doctor');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');

const { getReminderQueue }      = require('../../queues/reminderQueue');
const { computeReminderDelays } = require('../../utils/reminderDelays');

const router = require('../appointments');
const { scheduleReminders, cancelReminders } = router;

beforeEach(() => jest.clearAllMocks());

describe('scheduleReminders', () => {
  it('enqueues two jobs and stores their IDs on the appointment', async () => {
    const mockAdd = jest.fn()
      .mockResolvedValueOnce({ id: 'job-24h' })
      .mockResolvedValueOnce({ id: 'job-1h' });
    const mockSave = jest.fn().mockResolvedValue({});
    getReminderQueue.mockReturnValue({ add: mockAdd });
    computeReminderDelays.mockReturnValue({ delay24h: 5000, delay1h: 1000 });

    const appt = { _id: 'a1', date: new Date(), reminder24hJobId: null, reminder1hJobId: null, save: mockSave };
    await scheduleReminders(appt);

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(
      'reminder-24h',
      { appointmentId: 'a1', reminderType: '24h' },
      { delay: 5000, jobId: 'reminder-a1-24h' }
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'reminder-1h',
      { appointmentId: 'a1', reminderType: '1h' },
      { delay: 1000, jobId: 'reminder-a1-1h' }
    );
    expect(appt.reminder24hJobId).toBe('job-24h');
    expect(appt.reminder1hJobId).toBe('job-1h');
    expect(mockSave).toHaveBeenCalled();
  });

  it('swallows errors without throwing (Redis down)', async () => {
    getReminderQueue.mockReturnValue({
      add: jest.fn().mockRejectedValue(new Error('Redis down')),
    });
    computeReminderDelays.mockReturnValue({ delay24h: 1000, delay1h: 500 });
    const appt = { _id: 'a1', date: new Date(), save: jest.fn() };
    await expect(scheduleReminders(appt)).resolves.toBeUndefined();
  });
});

describe('cancelReminders', () => {
  it('removes both jobs by stored IDs', async () => {
    const mockRemove = jest.fn().mockResolvedValue(true);
    getReminderQueue.mockReturnValue({ remove: mockRemove });

    await cancelReminders({ reminder24hJobId: 'job-24h', reminder1hJobId: 'job-1h' });

    expect(mockRemove).toHaveBeenCalledWith('job-24h');
    expect(mockRemove).toHaveBeenCalledWith('job-1h');
  });

  it('is a no-op when no job IDs stored', async () => {
    const mockRemove = jest.fn();
    getReminderQueue.mockReturnValue({ remove: mockRemove });
    await cancelReminders({ reminder24hJobId: null, reminder1hJobId: null });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
