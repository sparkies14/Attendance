require('dotenv').config();
const supabase = require('../lib/supabase');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);

  const { data: managers, error: e1 } = await supabase.from('managers').select('email, name');
  if (e1) { console.error('managers fetch failed:', e1); process.exit(1); }

  const { data: members, error: e2 } = await supabase.from('members').select('email, name, role, status');
  if (e2) { console.error('members fetch failed:', e2); process.exit(1); }

  const { data: existing, error: e3 } = await supabase.from('users').select('email');
  if (e3) { console.error('users fetch failed:', e3); process.exit(1); }
  const existingEmails = new Set((existing || []).map(u => u.email));

  let managersAdded = 0;
  let membersAdded = 0;
  let skipped = 0;

  for (const m of (managers || [])) {
    if (existingEmails.has(m.email)) { skipped++; continue; }
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').insert({
        email: m.email, name: m.name, role: 'admin', status: 'Active', job_role: null,
      });
      if (error) { console.error(`Failed to insert manager ${m.email}:`, error.message); continue; }
    }
    managersAdded++;
    existingEmails.add(m.email);
  }

  for (const mb of (members || [])) {
    if (existingEmails.has(mb.email)) { skipped++; continue; }
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').insert({
        email: mb.email,
        name: mb.name,
        role: 'member',
        status: mb.status || 'Active',
        job_role: mb.role || null,
      });
      if (error) { console.error(`Failed to insert member ${mb.email}:`, error.message); continue; }
    }
    membersAdded++;
    existingEmails.add(mb.email);
  }

  console.log(`Managers → users: ${managersAdded}`);
  console.log(`Members  → users: ${membersAdded}`);
  console.log(`Skipped (already in users): ${skipped}`);
  if (DRY_RUN) console.log('(no rows were actually written — re-run without --dry-run to apply.)');
}

main().catch(err => { console.error(err); process.exit(1); });
