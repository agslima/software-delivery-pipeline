// server/index.js
require('dotenv').config(); // Load environment variables first
const app = require('./app');

const PORT = process.env.PORT || 8090;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
