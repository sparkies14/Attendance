require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to .env (use `openssl rand -hex 32`).');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'https://sparkies14.github.io') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());

app.use('/auth',  require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/audit', require('./routes/audit'));

app.use('/admin', require('./routes/adminTardy'));
app.use('/admin', require('./routes/adminHolidays'));
app.use('/admin', require('./routes/adminPolicyConfig'));
app.use('/member', require('./routes/adminTardy'));

app.use('/webhook/attendance',  require('./routes/attendance'));
app.use('/webhook/member-data', require('./routes/memberData'));
app.use('/webhook/dashboard',   require('./routes/dashboard'));
app.use('/webhook/approve',     require('./routes/approve'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance server running on http://localhost:${PORT}`));

require('./lib/cron').registerCron();
