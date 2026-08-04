const LabResult  = require('../../models/LabResult');
const Notification = require('../../models/Notification');

describe('LabResult schema extensions', () => {
  it('status enum includes processing', () => {
    const path = LabResult.schema.path('status');
    expect(path.enumValues).toContain('processing');
  });

  it('tests value is not required', () => {
    const path = LabResult.schema.path('tests.value');
    expect(path.isRequired).toBeFalsy();
  });

  it('has prescriptionId path', () => {
    expect(LabResult.schema.path('prescriptionId')).toBeDefined();
  });
});

describe('Notification schema', () => {
  it('type enum includes lab_ready', () => {
    const path = Notification.schema.path('type');
    expect(path.enumValues).toContain('lab_ready');
  });
});
