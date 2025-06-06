const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.get('/fdot-cameras', async (req, res) => {
  const apiUrl = 'https://api.trafficview.org/device/?api-key=2186cbcdd16f4d6796708a4be6c969b8&system=fdot&type=device_cctv&format=rf-json';
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    res.set('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch FDOT camera data.' });
  }
});

const PORT = 3003;
app.listen(PORT, () => console.log(`FDOT proxy running on http://localhost:${PORT}`)); 