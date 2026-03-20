const express = require('express');
const path = require('path');
const app = express();

// 1. YOUR API ROUTES GO HERE
// app.get('/api/hello', (req, res) => res.json({ message: "Hello!" }));

// 2. SERVE STATIC FILES
// This points to the 'dist' folder inside your frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 3. THE CATCH-ALL ROUTE
// This ensures that if a user refreshes a React page, they don't get a 404
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 10000; // Render uses port 10000 by default
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));