require("dotenv").config({ path: "../config/.env" });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const fetch = require("node-fetch");
const app = express();
const port = 3000;

app.use(cors());

// Serve static files from both client/public and client/src directories
// app.use(express.static("../client/public"));
// app.use(express.static("../client/src"));

// Import path module
const path = require("path");

// Serve static files with explicit path mappings
app.use("/", express.static(path.join(__dirname, "../client/src")));
app.use("/", express.static(path.join(__dirname, "../client/public")));

// Serve files from the auth directory
app.use("/auth", express.static(path.join(__dirname, "../auth")));


// Serve the index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/src/index.html"));
});

// Sample camera data for New York
const sampleCameras = [
  {
    Name: "Times Square Camera",
    DirectionOfTravel: "North",
    ID: "TS1",
    RoadwayName: "Broadway",
    Longitude: -73.9855,
    Latitude: 40.758,
    Url: "https://example.com/ts1.jpg",
    VideoUrl: "https://example.com/ts1.mp4",
  },
  {
    Name: "Central Park Camera",
    DirectionOfTravel: "East",
    ID: "CP1",
    RoadwayName: "Central Park West",
    Longitude: -73.9713,
    Latitude: 40.7812,
    Url: "https://example.com/cp1.jpg",
    VideoUrl: "https://example.com/cp1.mp4",
  },
  {
    Name: "Brooklyn Bridge Camera",
    DirectionOfTravel: "South",
    ID: "BB1",
    RoadwayName: "Brooklyn Bridge",
    Longitude: -73.9969,
    Latitude: 40.7061,
    Url: "https://example.com/bb1.jpg",
    VideoUrl: "https://example.com/bb1.mp4",
  },
  {
    Name: "Empire State Camera",
    DirectionOfTravel: "West",
    ID: "ES1",
    RoadwayName: "5th Avenue",
    Longitude: -73.9857,
    Latitude: 40.7484,
    Url: "https://example.com/es1.jpg",
    VideoUrl: "https://example.com/es1.mp4",
  },
];

// Endpoint for camera data
app.get("/511ny", (req, res) => {
  res.json(sampleCameras);
});

// Serve all cameras from response.json
app.get("/cameras", (req, res) => {
  const dataPath = path.join(__dirname, "../data/response.json");
  fs.readFile(dataPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading camera data:", err);
      return res.status(500).json({ error: "Failed to read camera data" });
    }
    try {
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (parseError) {
      console.error("Error parsing camera data:", parseError);
      return res.status(500).json({ error: "Failed to parse camera data" });
    }
  });
});

// NY511 proxy endpoint
app.get("/ny511-cameras", async (req, res) => {
  const apiKey = process.env.NY511_API_KEY;
  // Adjust the URL and params as needed for your NY511 API usage
  const url = `https://511ny.org/api/endpoint?apiKey=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch NY511 data." });
  }
});

// TomTom Traffic proxy endpoint
app.get("/tomtom-traffic", async (req, res) => {
  const apiKey = process.env.TOMTOM_API_KEY || "yQWgvqceUQoSR7g3MySgTGirgroZtMMc"; // Fallback key if env not set
  const { z, x, y, ts } = req.query;
  
  if (!z || !x || !y) {
    console.error("Missing tile parameters:", req.query);
    return res.status(400).send("Missing tile parameters");
  }
  
  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/absolute/${z}/${x}/${y}.png?key=${apiKey}&ts=${ts || Date.now()}`;
  console.log(`Fetching traffic tile: z=${z}, x=${x}, y=${y}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`TomTom API error: ${response.status} - ${response.statusText}`);
      return res.status(response.status).json({ error: `TomTom API error: ${response.status}` });
    }
    
    res.set("Content-Type", "image/png");
    response.body.pipe(res);
    
  } catch (e) {
    console.error("Failed to fetch TomTom traffic data:", e);
    res.status(500).json({ error: "Failed to fetch TomTom traffic data." });
  }
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Please close the other process or use a different port.`
    );
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
