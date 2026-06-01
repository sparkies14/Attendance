const { fetchHolidays } = require('../lib/calendarific');

function mockFetchOnce(payload, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn(() => Promise.resolve({ ok, status, json: async () => payload }));
}
beforeEach(() => { jest.clearAllMocks(); });

describe('fetchHolidays', () => {
  test('keeps only national holidays and normalizes date to YYYY-MM-DD', async () => {
    mockFetchOnce({
      meta: { code: 200 },
      response: { holidays: [
        { name: "New Year's Day", date: { iso: '2026-01-01T00:00:00' }, type: ['National holiday'] },
        { name: 'Some Observance',  date: { iso: '2026-02-02' },          type: ['Observance'] },
        { name: 'Independence Day', date: { iso: '2026-06-12' },          type: ['National holiday'] },
      ] },
    });
    const out = await fetchHolidays('PH', 2026, 'key');
    expect(out).toEqual([
      { date: '2026-01-01', name: "New Year's Day" },
      { date: '2026-06-12', name: 'Independence Day' },
    ]);
  });
  test('throws a provider error on a non-200 meta code', async () => {
    mockFetchOnce({ meta: { code: 401, error_detail: 'Invalid API key' } });
    await expect(fetchHolidays('PH', 2026, 'bad')).rejects.toThrow('Invalid API key');
  });
  test('throws on HTTP failure', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(fetchHolidays('PH', 2026, 'key')).rejects.toThrow('HTTP 500');
  });
});
