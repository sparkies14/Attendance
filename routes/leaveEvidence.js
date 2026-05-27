const router      = require('express').Router();
const multer      = require('multer');
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and PDF files are allowed.'));
  },
});

router.use(requireAuth);

async function checkAccess(leaveId, user) {
  const { data: leave } = await supabase
    .from('leave_log').select('id, email').eq('id', leaveId).maybeSingle();
  if (!leave) return { leave: null, allowed: false };
  const elevated = ['owner', 'admin'].includes(user.role);
  return { leave, allowed: elevated || leave.email === user.email };
}

router.get('/:id/evidence', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data, error } = await supabase
    .from('leave_evidence')
    .select('id, leave_id, uploaded_by, file_name, external_url, note, created_at')
    .eq('leave_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ evidence: data || [] });
});

router.post('/:id/evidence', upload.single('file'), async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { external_url, note } = req.body || {};
  const file = req.file;
  if (!file && !external_url) return res.status(400).json({ error: 'Provide a file or an external_url.' });

  let file_path = null;
  let file_name = null;

  if (file) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    file_path = `${req.params.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('leave-evidence')
      .upload(file_path, file.buffer, { contentType: file.mimetype });
    if (upErr) return res.status(500).json({ error: upErr.message });
    file_name = file.originalname;
  }

  const { data, error } = await supabase
    .from('leave_evidence')
    .insert({
      leave_id:     req.params.id,
      uploaded_by:  req.user.email,
      file_path,
      file_name,
      external_url: external_url || null,
      note:         note || null,
    })
    .select('id, leave_id, uploaded_by, file_name, external_url, note, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ evidence: data });
});

router.delete('/:id/evidence/:eid', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data: ev } = await supabase
    .from('leave_evidence')
    .select('id, uploaded_by, file_path')
    .eq('id', req.params.eid)
    .eq('leave_id', req.params.id)
    .maybeSingle();
  if (!ev) return res.status(404).json({ error: 'Evidence not found.' });

  const elevated   = ['owner', 'admin'].includes(req.user.role);
  const isUploader = ev.uploaded_by === req.user.email;
  if (!elevated && !isUploader) return res.status(403).json({ error: 'Forbidden.' });

  if (ev.file_path) {
    await supabase.storage.from('leave-evidence').remove([ev.file_path]);
  }

  const { error } = await supabase.from('leave_evidence').delete().eq('id', ev.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

router.get('/:id/evidence/:eid/url', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data: ev } = await supabase
    .from('leave_evidence')
    .select('id, file_path')
    .eq('id', req.params.eid)
    .eq('leave_id', req.params.id)
    .maybeSingle();
  if (!ev) return res.status(404).json({ error: 'Evidence not found.' });
  if (!ev.file_path) return res.status(400).json({ error: 'This evidence has no file — use the external_url directly.' });

  const { data: signed, error: signErr } = await supabase.storage
    .from('leave-evidence')
    .createSignedUrl(ev.file_path, 3600);
  if (signErr) return res.status(500).json({ error: signErr.message });
  return res.json({ url: signed.signedUrl });
});

module.exports = router;
