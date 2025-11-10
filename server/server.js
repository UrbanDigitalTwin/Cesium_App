// Import required modules
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "fs";
import fetch from "node-fetch";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Create express app
const app = express();
const port = process.env.PORT || 3000; // Use environment port for Render.com or default to 3000

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

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
  const apiKey = process.env.TOMTOM_API_KEY || "zl9fM8RXwBBTvB7t18M6f7jGUaeXX590"; //fallback key if not set in .env

  if (!apiKey) {
    console.error("TomTom API key is not configured on the server.");
    return res.status(500).json({ error: "TomTom API key is not configured." });
  }

  const { z, x, y, ts } = req.query;

  if (!z || !x || !y) {
    console.error("Missing tile parameters:", req.query);
    return res.status(400).send("Missing tile parameters");
  }

  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/absolute/${z}/${x}/${y}.png?key=${apiKey}&ts=${
    ts || Date.now()
  }`;
  // console.log(`Fetching traffic tile: z=${z}, x=${x}, y=${y}`);

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

// Client configuration endpoint
app.get("/config", (req, res) => {
  // Only expose specific environment variables needed by the client
  res.json({
    cesiumIonToken: process.env.CESIUM_ION_TOKEN || "",
    codetrApiKey: process.env.CODETR_API_KEY || "",
  });
});

// Emergency Management Event Data endpoint
app.get("/em-event-data", async (req, res) => {
  try {
    const apiKey = process.env.EM_FIREBASE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Firebase API key not configured" });
    }

    // Step 1: Get the idtoken by making a POST request to Firebase
    const signUpResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      }
    );

    if (!signUpResponse.ok) {
      const errorData = await signUpResponse.json();
      console.error("Firebase authentication error:", errorData);
      return res.status(signUpResponse.status).json({
        error: "Failed to authenticate with Firebase",
        details: errorData,
      });
    }

    const authData = await signUpResponse.json();
    const idToken = authData.idToken;

    if (!idToken) {
      return res.status(500).json({ error: "Failed to get Firebase idToken" });
    }

    // Step 2: Use the idToken to get events data
    const eventsResponse = await fetch(
      "https://us-central1-cord2-6c88c.cloudfunctions.net/api/events",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      }
    );

    if (!eventsResponse.ok) {
      const errorData = await eventsResponse.json();
      console.error("Events API error:", errorData);
      return res.status(eventsResponse.status).json({
        error: "Failed to fetch event data",
        details: errorData,
      });
    }

    const eventsData = await eventsResponse.json();
    console.log(`Successfully retrieved ${eventsData.length} emergency events`);

    // Return the events data to the client
    res.json(eventsData);
  } catch (error) {
    console.error("Error in /em-event-data endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Image proxy to bypass client-side CORS issues
app.get("/proxy-image", async (req, res) => {
  const { url: imageUrl } = req.query;

  if (!imageUrl) {
    return res.status(400).send("Image URL is required");
  }

  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    // Set the correct content type and pipe the image back to the client
    res.setHeader("Content-Type", imageResponse.headers.get("content-type"));
    imageResponse.body.pipe(res);
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(502).send("Failed to proxy image"); // 502 Bad Gateway
  }
});

// Blues Notehub Sensor API proxy endpoint
app.get("/sensor-data", async (req, res) => {
  const projectUID = process.env.NOTEHUB_PROJECT_UID;
  const accessToken = process.env.NOTEHUB_ACCESS_TOKEN;

  if (!projectUID || !accessToken) {
    console.error("Notehub credentials are not configured on the server.");
    return res
      .status(500)
      .json({ error: "Sensor API is not configured." });
  }

  const url = `https://api.notefile.net/v1/projects/${projectUID}/events?pageSize=50&sortOrder=desc&files=sensors.qo`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Notehub API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `Notehub API error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("Failed to fetch Notehub sensor data:", e);
    res.status(500).json({ error: "Failed to fetch sensor data." });
  }
});

// AirNow proxy endpoint (integrated from airnow-proxy.js)
app.get("/airnow", async (req, res) => {
  const zip = req.query.zip;
  if (!zip) return res.status(400).send("Missing zip param");
  const apiKey = process.env.AIRNOW_API_KEY;
  console.log(
    "Using AirNow API key:",
    apiKey ? "API key exists" : "No API key"
  );

  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zip}&distance=25&API_KEY=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.text();
    res.set("Access-Control-Allow-Origin", "*");
    res.type("json").send(data);
  } catch (e) {
    console.error("AirNow API error:", e.message);
    res.status(500).send("AirNow proxy error");
  }
});

// FDOT proxy endpoint (integrated from fdot-proxy.js)
app.get("/fdot-cameras", async (req, res) => {
  const apiKey = process.env.TRAFFIC_VIEW_API_KEY;
  console.log(
    "Using FDOT Traffic View API key:",
    apiKey ? "API key exists" : "No API key"
  );

  const apiUrl = `https://api.trafficview.org/device/?api-key=${apiKey}&system=fdot&type=device_cctv&format=rf-json`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error("FDOT API error:", response.status, response.statusText);
      res.set("Access-Control-Allow-Origin", "*");
      return res.status(response.status).json({
        error: `FDOT API error: ${response.status} ${response.statusText}`,
      });
    }

    const data = await response.json();
    console.log("Successfully retrieved FDOT camera data");
    res.set("Access-Control-Allow-Origin", "*");
    res.json(data);
  } catch (e) {
    console.error("FDOT API error:", e.message);
    // Ensure CORS headers are sent even on error
    res.set("Access-Control-Allow-Origin", "*");
    res
      .status(500)
      .json({ error: "Failed to fetch FDOT camera data: " + e.message });
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
