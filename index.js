const express = require('express');
const app = express();
const port = process.env.PORT || 8080; // Use environment variable or default

app.get('/', (req, res) => {
  res.send('Hello World from Nezuko Test Server!');
});

app.get('/qr', (req, res) => {
  res.send('QR Page Test - Hello World!');
});

app.listen(port, () => {
  console.log(`Simple test server listening on internal port ${port}`);
  console.log(`Visit http://<your-elestio-url>/ or http://<your-elestio-url>/qr`);
});
