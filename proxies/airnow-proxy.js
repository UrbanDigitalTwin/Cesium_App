const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../config/.env") });
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3002;

app.get("/airnow", async (req, res) => {
  const zip = req.query.zip;
  if (!zip) return res.status(400).send("Missing zip param");
  const apiKey = process.env.AIRNOW_API_KEY;
  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zip}&distance=25&API_KEY=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.text();
    res.set("Access-Control-Allow-Origin", "*");
    res.type("json").send(data);
  } catch (e) {
    res.status(500).send("Proxy error");
  }
});

app.get("/test", (req, res) => res.send("Proxy is working!"));

app.listen(PORT, () =>
  console.log(`Proxy running on http://localhost:${PORT}`)
);
