require('dotenv').config();
const supabase = require('../lib/supabase');
const { hashPassword } = require('../lib/auth');

async function main() {
  const [email, name, password] = process.argv.slice(2);

  if (!email || !name || !password) {
    console.error('Usage: node scripts/create-owner.js <email> <name> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const { data: existing, error: e1 } = await supabase
    .from('users').select('id, email').eq('role', 'owner').maybeSingle();
  if (e1) { console.error('Lookup failed:', e1.message); process.exit(1); }
  if (existing) {
    console.error(`Owner already exists: ${existing.email}. Aborting.`);
    process.exit(1);
  }

  const password_hash = await hashPassword(password);
  const { data, error } = await supabase.from('users').insert({
    email, name, password_hash, role: 'owner', status: 'Active',
  }).select('id, email').single();

  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log(`Owner created: ${data.email} (id=${data.id})`);
}

main().catch(err => { console.error(err); process.exit(1); });
