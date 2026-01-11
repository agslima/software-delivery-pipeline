// server/index.js
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 8000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on ${PORT}`);
});
