const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3002;

app.get('/airnow', async (req, res) => {
  const url = req.query.url;
  console.log('Proxying to:', url);
  if (!url) return res.status(400).send('Missing url param');
  try {
    const response = await fetch(url);
    const data = await response.text();
    res.set('Access-Control-Allow-Origin', '*');
    res.type('json').send(data);
  } catch (e) {
    console.error('Proxy error:', e);
    res.status(500).send('Proxy error');
  }
});

app.get('/test', (req, res) => res.send('Proxy is working!'));

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));