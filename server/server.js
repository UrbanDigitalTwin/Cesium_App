// Import required modules
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../config/.env") });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const fetch = require("node-fetch");

// Create express app
const app = express();
const port = process.env.PORT || 3000; // Use environment port for Render.com or default to 3000

// Enable CORS for all routes
app.use(cors());

// Define root directory for easier path resolution
const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_SRC = path.resolve(ROOT_DIR, "client/src");
const CLIENT_PUBLIC = path.resolve(ROOT_DIR, "client/public");
const AUTH_DIR = path.resolve(ROOT_DIR, "auth");

// Static file serving - order matters (first match wins)
app.use("/", express.static(CLIENT_SRC));
app.use("/", express.static(CLIENT_PUBLIC));
app.use("/auth", express.static(AUTH_DIR));

// Ensure all CSS, JS and image files are properly served
app.use("/css", express.static(path.join(CLIENT_PUBLIC, "css")));
app.use("/js", express.static(path.join(CLIENT_PUBLIC, "js")));
app.use("/images", express.static(path.join(CLIENT_PUBLIC, "images")));

// Define explicit routes for HTML pages
app.get("/", (req, res) => {
  res.sendFile(path.resolve(CLIENT_SRC, "index.html"));
});

// Add explicit route for login.html
app.get("/login.html", (req, res) => {
  res.sendFile(path.resolve(CLIENT_PUBLIC, "login.html"));
});

// For single page app behavior - catch other routes and serve index.html
app.get(["/dashboard", "/dashboard.html"], (req, res) => {
  res.sendFile(path.resolve(CLIENT_SRC, "index.html"));
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

// API route for camera data
app.get("/cameras", (req, res) => {
  // Read from the response.json file using our absolute path constants
  try {
    const cameraDataPath = path.resolve(CLIENT_PUBLIC, "data/response.json");
    console.log("Loading camera data from:", cameraDataPath);

    const cameraData = fs.readFileSync(cameraDataPath, "utf8");
    res.json(JSON.parse(cameraData));
  } catch (error) {
    console.error("Error reading camera data:", error);
    res.status(500).json({
      error: "Failed to read camera data",
      details: error.message,
    });
  }
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
  const apiKey =
    process.env.TOMTOM_API_KEY || "yQWgvqceUQoSR7g3MySgTGirgroZtMMc"; // Fallback key if env not set
  const { z, x, y, ts } = req.query;

  if (!z || !x || !y) {
    console.error("Missing tile parameters:", req.query);
    return res.status(400).send("Missing tile parameters");
  }

  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/absolute/${z}/${x}/${y}.png?key=${apiKey}&ts=${
    ts || Date.now()
  }`;
  console.log(`Fetching traffic tile: z=${z}, x=${x}, y=${y}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `TomTom API error: ${response.status} - ${response.statusText}`
      );
      return res
        .status(response.status)
        .json({ error: `TomTom API error: ${response.status}` });
    }

    res.set("Content-Type", "image/png");
    response.body.pipe(res);
  } catch (e) {
    console.error("Failed to fetch TomTom traffic data:", e);
    res.status(500).json({ error: "Failed to fetch TomTom traffic data." });
  }
});

// Catch-all route - must be the LAST route
app.get("*", (req, res) => {
  // Check if this is an HTML page request
  if (req.accepts("html")) {
    // Try to find the requested file
    const requestedPath = req.path.startsWith("/")
      ? req.path.slice(1)
      : req.path;

    // Check if the file exists in client/src
    const srcPath = path.resolve(CLIENT_SRC, requestedPath);
    if (fs.existsSync(srcPath)) {
      return res.sendFile(srcPath);
    }

    // Check if the file exists in client/public
    const publicPath = path.resolve(CLIENT_PUBLIC, requestedPath);
    if (fs.existsSync(publicPath)) {
      return res.sendFile(publicPath);
    }

    // Default to index.html for SPA-style navigation
    console.log(`Route not found: ${req.path}, serving index.html`);
    return res.sendFile(path.resolve(CLIENT_SRC, "index.html"));
  }

  // For non-HTML requests like API calls, return 404
  res.status(404).send(`Cannot ${req.method} ${req.path}`);
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `Using port from environment: ${
      process.env.PORT ? "yes" : "no, using default"
    }`
  );
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
