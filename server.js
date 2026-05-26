require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'https://sparkies14.github.io') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

app.use('/webhook/check-role',  require('./routes/checkRole'));
app.use('/webhook/attendance',  require('./routes/attendance'));
app.use('/webhook/member-data', require('./routes/memberData'));
app.use('/webhook/dashboard',   require('./routes/dashboard'));
app.use('/webhook/approve',     require('./routes/approve'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance server running on http://localhost:${PORT}`));
