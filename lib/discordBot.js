const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const supabase = require('./supabase');
const { CHANNELS } = require('./discord');
const { createLinkCode } = require('../routes/discordLink');
const { classifyLateStatus } = require('./rules');

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return {
    date: `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`,
    time: `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`,
    hour: jst.getHours(),
    minute: jst.getMinutes(),
  };
}

async function dmUser(client, discordId, message) {
  try {
    const user = await client.users.fetch(discordId);
    const dm   = await user.createDM();
    await dm.send(message);
  } catch (err) {
    console.error(`Discord DM failed to ${discordId}:`, err.message);
  }
}

async function handleClockIn(client, message) {
  const discordId = message.author.id;

  // Look up linked account
  const { data: user } = await supabase
    .from('users')
    .select('id, email, name, job_role, status')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (!user) {
    await dmUser(client, discordId,
      "Your Discord account isn't linked to an attendance account yet. Ask your admin to set it up, or type `/link` to link it yourself.");
    return;
  }

  if (user.status !== 'Active') {
    await dmUser(client, discordId, "Your account is not active. Please contact your admin.");
    return;
  }

  const jst = getJST();

  // After 9:10 JST → manual entry required
  const isLate = jst.hour > 9 || (jst.hour === 9 && jst.minute > 10);
  if (isLate) {
    await dmUser(client, discordId,
      `⏰ You're past 9:10 JST (current time: ${jst.time}). Please use **manual entry** on the website to clock in.`);
    return;
  }

  // Check if already clocked in today
  const { data: existing } = await supabase
    .from('attendance')
    .select('id, clock_out')
    .eq('email', user.email)
    .eq('date', jst.date)
    .maybeSingle();

  if (existing && (!existing.clock_out || existing.clock_out === '')) {
    await dmUser(client, discordId, `You're already clocked in today.`);
    return;
  }

  const lateStatus = classifyLateStatus(jst.hour, jst.minute);

  const { error } = await supabase.from('attendance').insert({
    email:      user.email,
    name:       user.name,
    role:       user.job_role || 'member',
    date:       jst.date,
    clock_in:   jst.time,
    clock_out:  '',
    total_hours: 0,
    last_clock_in: jst.time,
    accumulated_hours: 0,
    entry_type: 'auto',
    status:     'Approved',
    late_status: lateStatus,
    fingerprint: '',
    reason:     '',
  });

  if (error) {
    console.error('Discord clock-in insert failed:', error.message);
    await dmUser(client, discordId, "Something went wrong clocking you in. Please use the website.");
    return;
  }

  await message.reply(`✅ **${user.name}** clocked in at **${jst.time} JST**`);
}

async function handleLinkCommand(client, interaction) {
  const discordId = interaction.user.id;
  const code = createLinkCode(discordId);
  await interaction.reply({ content: "Check your DMs for your link code!", ephemeral: true });
  await dmUser(client, discordId,
    `🔗 Your Discord link code is: **${code}**\n\nGo to your Account page on the website and enter this code within 5 minutes.`);
}

async function registerSlashCommand() {
  const token    = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !guildId || !clientId) {
    console.warn('Discord: missing DISCORD_CLIENT_ID, skipping slash command registration.');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    const commands = [
      new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Discord account to your attendance account')
        .toJSON(),
    ];
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Discord: /link slash command registered.');
  } catch (err) {
    console.error('Discord: slash command registration failed:', err.message);
  }
}

function initDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn('Discord: DISCORD_BOT_TOKEN not set, bot disabled.');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once('ready', async () => {
    console.log(`Discord bot ready: ${client.user.tag}`);
    await registerSlashCommand();
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!CHANNELS.clockIn) return;
    if (message.channelId !== CHANNELS.clockIn) return;
    await handleClockIn(client, message);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'link') {
      await handleLinkCommand(client, interaction);
    }
  });

  client.on('error', (err) => console.error('Discord client error:', err.message));

  client.login(token).catch(err => console.error('Discord login failed:', err.message));
}

module.exports = { initDiscordBot };
