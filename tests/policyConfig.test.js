const mockSelect = jest.fn();
jest.mock('../lib/supabase', () => ({
  from: jest.fn(() => ({ select: mockSelect })),
}));

const supabase = require('../lib/supabase');
const { getThresholds, isOverThreshold } = require('../lib/policyConfig');

beforeEach(() => {
  supabase.from.mockClear();
  mockSelect.mockClear();
});

describe('getThresholds', () => {
  test('returns parsed integer thresholds from DB', async () => {
    mockSelect.mockResolvedValueOnce({
      data: [
        { key: 'threshold_minor_tardy', value: '3' },
        { key: 'threshold_major_tardy', value: '2' },
        { key: 'threshold_awol_half',   value: '1' },
        { key: 'threshold_awol_full',   value: '1' },
      ],
      error: null,
    });
    const t = await getThresholds();
    expect(t).toEqual({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 });
  });

  test('falls back to defaults when a key is missing', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    const t = await getThresholds();
    expect(t).toEqual({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 });
  });

  test('throws when supabase returns an error', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(getThresholds()).rejects.toThrow('DB error');
  });
});

describe('isOverThreshold', () => {
  const thresholds = { minor: 3, major: 2, awolHalf: 1, awolFull: 1 };

  test('returns exceeded=false when all counts are below threshold', () => {
    const result = isOverThreshold({ minor: 2, major: 1, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  test('returns exceeded=true and reason for minor tardy at threshold', () => {
    const result = isOverThreshold({ minor: 3, major: 0, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('3 minor tardies (limit: 3)');
  });

  test('returns exceeded=true and reason for major tardy at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 2, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('2 major tardies (limit: 2)');
  });

  test('returns exceeded=true and reason for awolHalf at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 0, awolHalf: 1, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('1 AWOL half days (limit: 1)');
  });

  test('returns exceeded=true and reason for awolFull at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 0, awolHalf: 0, awolFull: 1 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('1 AWOL full days (limit: 1)');
  });

  test('reports all crossed thresholds, not just the first', () => {
    const result = isOverThreshold({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toHaveLength(4);
  });
});
