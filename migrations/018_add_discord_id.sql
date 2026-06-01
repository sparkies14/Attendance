-- Add Discord user ID to users table for bot account linking
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT UNIQUE;
