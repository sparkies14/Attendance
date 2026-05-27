const mockMembersSelect = jest.fn();
const mockAttSelect     = jest.fn();
const mockInsert        = jest.fn();

jest.mock('../lib/supabase', () => {
  const chain = {};
  chain.select    = jest.fn(() => chain);
  chain.eq        = jest.fn(() => chain);
  chain.maybeSingle = jest.fn();
  chain.insert    = mockInsert;

  return {
    from: jest.fn(table => {
      if (table === 'users')      return { select: mockMembersSelect };
      if (table === 'attendance') return { select: mockAttSelect, insert: mockInsert };
      return chain;
    }),
  };
});

const supabase = require('../lib/supabase');
const { runAwolCheck } = require('../lib/cron');

const ACTIVE_MEMBERS = [
  { email: 'ana@test.com', name: 'Ana', role: 'member', job_role: 'Developer' },
  { email: 'bob@test.com', name: 'Bob', role: 'member', job_role: null },
];

function makeMembersChain(members) {
  const chain = { eq: jest.fn() };
  chain.eq.mockImplementationOnce(() => chain);
  chain.eq.mockImplementationOnce(() => Promise.resolve({ data: members, error: null }));
  mockMembersSelect.mockReturnValueOnce(chain);
}

function makeAttChain(existingRow) {
  const chain = { eq: jest.fn(), maybeSingle: jest.fn() };
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: existingRow, error: null });
  mockAttSelect.mockReturnValueOnce(chain);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe('runAwolCheck', () => {
  test('inserts AWOL FULL DAY record for member with no attendance row', async () => {
    makeMembersChain(ACTIVE_MEMBERS.slice(0, 1)); // one member: Ana
    makeAttChain(null); // no existing row

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@test.com',
      name: 'Ana',
      date: '2026-05-27',
      status: 'Approved',
      late_status: 'AWOL FULL DAY',
      entry_type: 'auto',
    }));
  });

  test('skips member who already has an attendance row for the date', async () => {
    makeMembersChain(ACTIVE_MEMBERS.slice(0, 1));
    makeAttChain({ id: 'existing-row-id' }); // row exists

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('processes multiple members independently', async () => {
    makeMembersChain(ACTIVE_MEMBERS); // Ana + Bob
    makeAttChain({ id: 'exists' }); // Ana has a row
    makeAttChain(null);              // Bob does not

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test('uses job_role for the role field when available', async () => {
    makeMembersChain([{ email: 'ana@test.com', name: 'Ana', role: 'member', job_role: 'Developer' }]);
    makeAttChain(null);

    await runAwolCheck('2026-05-27');

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ role: 'Developer' }));
  });

  test('falls back to users.role when job_role is null', async () => {
    makeMembersChain([{ email: 'bob@test.com', name: 'Bob', role: 'member', job_role: null }]);
    makeAttChain(null);

    await runAwolCheck('2026-05-27');

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ role: 'member' }));
  });

  test('returns the date used in the result', async () => {
    makeMembersChain([]);
    const result = await runAwolCheck('2026-06-01');
    expect(result.date).toBe('2026-06-01');
  });
});
