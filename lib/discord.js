const CHANNELS = {
  clockLogs: '1505900376719884319',
  approvals:  '1505900412937699408',
  clockIn:    process.env.DISCORD_CLOCKIN_CHANNEL_ID || '',
};

async function sendMessage(channelId, content) {
  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    if (!response.ok) {
      console.error(`Discord notification failed: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error('Discord notification failed:', err.message);
  }
}

module.exports = { sendMessage, CHANNELS };
