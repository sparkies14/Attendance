const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());

const mockStorageUpload     = jest.fn();
const mockStorageSignedUrl  = jest.fn();
const mockStorageRemove     = jest.fn();

jest.mock('../lib/supabase', () => ({
  from: jest.fn(),
  storage: {
    from: jest.fn(() => ({
      upload:           mockStorageUpload,
      createSignedUrl:  mockStorageSignedUrl,
      remove:           mockStorageRemove,
    })),
  },
}));

const supabase = require('../lib/supabase');
const router   = require('../routes/leaveEvidence');

// Thenable chain — resolves at any terminal call (maybeSingle, single, order)
// and also when awaited directly (delete().eq() pattern).
function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    catch:       () => Promise.resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    order:       jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
    delete:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp(role, email) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role }; next(); });
  app.use('/leave', router);
  return app;
}

const LEAVE_MINE  = { id: 'leave-1', email: 'ana@test.com' };
const LEAVE_OTHER = { id: 'leave-2', email: 'other@test.com' };

const EVIDENCE_LIST = [{
  id: 'ev-1', leave_id: 'leave-1', uploaded_by: 'ana@test.com',
  file_name: 'cert.pdf', external_url: null, note: null, created_at: '2026-05-27T00:00:00Z',
}];
const EVIDENCE_FILE     = { id: 'ev-1', file_path: 'leave-1/123-cert.pdf' };
const EVIDENCE_URL_ONLY = { id: 'ev-2', file_path: null };
const EVIDENCE_BY_OTHER = { id: 'ev-3', uploaded_by: 'other@test.com', file_path: null };
const EVIDENCE_BY_SELF  = { id: 'ev-4', uploaded_by: 'ana@test.com',  file_path: null };
const INSERTED_EVIDENCE = {
  id: 'ev-new', leave_id: 'leave-1', uploaded_by: 'ana@test.com',
  file_name: null, external_url: 'https://drive.google.com/file', note: null, created_at: '2026-05-27T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageUpload.mockResolvedValue({ error: null });
  mockStorageSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.url/cert.pdf' }, error: null });
  mockStorageRemove.mockResolvedValue({ error: null });
});

/* ─── GET /leave/:id/evidence ─── */
describe('GET /leave/:id/evidence', () => {
  test('returns 404 when leave not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-1/evidence');
    expect(res.status).toBe(404);
  });

  test('returns 403 when member accesses another member\'s leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(403);
  });

  test('returns evidence list for own leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_LIST));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-1/evidence');
    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(1);
    expect(res.body.evidence[0].file_name).toBe('cert.pdf');
  });

  test('admin can access any leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(0);
  });

  test('owner can access any leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('owner', 'owner@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(200);
  });
});

/* ─── POST /leave/:id/evidence ─── */
describe('POST /leave/:id/evidence', () => {
  test('returns 400 when neither file nor external_url provided', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file or.*external_url/i);
  });

  test('inserts URL-only evidence and returns 201', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(INSERTED_EVIDENCE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence')
      .send({ external_url: 'https://drive.google.com/file' });
    expect(res.status).toBe(201);
    expect(res.body.evidence.external_url).toBe('https://drive.google.com/file');
  });

  test('returns 403 when member posts to another member\'s leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-2/evidence')
      .send({ external_url: 'https://example.com' });
    expect(res.status).toBe(403);
  });

  test('uploads file to storage and inserts evidence row', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c({ ...INSERTED_EVIDENCE, file_name: 'cert.pdf', external_url: null }));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence')
      .attach('file', Buffer.from('fake pdf'), { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringContaining('leave-1/'),
      expect.any(Buffer),
      { contentType: 'application/pdf' },
    );
    expect(res.body.evidence.file_name).toBe('cert.pdf');
  });
});

/* ─── DELETE /leave/:id/evidence/:eid ─── */
describe('DELETE /leave/:id/evidence/:eid', () => {
  test('returns 403 when member deletes another member\'s evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_OTHER));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/ev-3');
    expect(res.status).toBe(403);
  });

  test('uploader can delete their own evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_SELF));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/ev-4');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('admin can delete any evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_OTHER));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .delete('/leave/leave-2/evidence/ev-3');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('removes file from storage when evidence has a file_path', async () => {
    const evWithFile = { id: 'ev-5', uploaded_by: 'ana@test.com', file_path: 'leave-1/123-cert.pdf' };
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(evWithFile));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com')).delete('/leave/leave-1/evidence/ev-5');
    expect(res.status).toBe(200);
    expect(mockStorageRemove).toHaveBeenCalledWith(['leave-1/123-cert.pdf']);
  });

  test('returns 404 when evidence item not found', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/nonexistent');
    expect(res.status).toBe(404);
  });
});

/* ─── GET /leave/:id/evidence/:eid/url ─── */
describe('GET /leave/:id/evidence/:eid/url', () => {
  test('returns 400 when evidence has no file_path', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_URL_ONLY));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/ev-2/url');
    expect(res.status).toBe(400);
  });

  test('returns signed URL for file evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_FILE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/ev-1/url');
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://signed.url/cert.pdf');
  });

  test('returns 404 when evidence item not found', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/nonexistent/url');
    expect(res.status).toBe(404);
  });
});
