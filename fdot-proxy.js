require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3003;

app.get('/fdot-cameras', async (req, res) => {
  const apiKey = process.env.TRAFFIC_VIEW_API_KEY;
  const apiUrl = `https://api.trafficview.org/device/?api-key=${apiKey}&system=fdot&type=device_cctv&format=rf-json`;
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    res.set('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch FDOT camera data.' });
  }
});

app.listen(PORT, () => console.log(`FDOT proxy running on http://localhost:${PORT}`)); 