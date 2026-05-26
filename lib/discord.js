const CHANNELS = {
  clockLogs: '1505900376719884319',
  approvals:  '1505900412937699408'
};

async function sendMessage(channelId, content) {
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error('Discord notification failed:', err.message);
  }
}

module.exports = { sendMessage, CHANNELS };
