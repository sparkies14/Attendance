const router  = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

// In-memory store: Map<discordId, { code: string, expiresAt: number }>
const _codeStore = new Map();
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function storeCode(discordId, code) {
  _codeStore.set(discordId, { code, expiresAt: Date.now() + CODE_TTL_MS });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Called by the bot when /link is used — returns the code for the bot to DM
function createLinkCode(discordId) {
  const code = generateCode();
  storeCode(discordId, code);
  return code;
}

// POST /discord/link/verify — member submits code from AccountPage
router.post('/verify', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required.' });
  }

  let matchedDiscordId = null;
  for (const [discordId, entry] of _codeStore.entries()) {
    if (entry.code === code) {
      if (Date.now() > entry.expiresAt) {
        _codeStore.delete(discordId);
        return res.status(400).json({ error: 'Code has expired. Type /link again.' });
      }
      matchedDiscordId = discordId;
      break;
    }
  }

  if (!matchedDiscordId) {
    return res.status(400).json({ error: 'Invalid code.' });
  }

  const { error } = await supabase
    .from('users')
    .update({ discord_id: matchedDiscordId })
    .eq('id', req.user.user_id);

  if (error) return res.status(500).json({ error: error.message });

  _codeStore.delete(matchedDiscordId);
  return res.json({ success: true, discord_id: matchedDiscordId });
});

module.exports = { router, storeCode, createLinkCode, _codeStore };
