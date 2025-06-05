# Cesium Live Observation App

A web application for interactive 3D map visualization using CesiumJS, featuring:
- Live geospatial feeds (traffic, air quality, weather)
- New York street camera visualization (toggleable, with popups)
- Modern sidebar UI

## Features
- **3D Cesium Map**: Explore photorealistic 3D tiles and GPS tracks.
- **Live Traffic Overlay**: Toggle real-time traffic data from TomTom.
- **Air Quality (AQI) Panel**: View current AQI for the map center's zip code, styled in a sidebar card.
- **Weather Panel**: View current weather for the map center, styled in a sidebar card.
- **Sidebar UI**: Responsive sidebar with toggles for each live data panel.
- **3D Tileset Toggle**: Show/hide Google Photorealistic 3D Tiles.
- **NY Street Cameras**:
  - Plots all NY cameras from `response.json` as orange points
  - Click a point to see Name, Direction, ID, Roadway, and links to image/video
  - Popup with close button, styled for clarity
  - Toggle cameras on/off with sidebar button
  - **Initial view is in Florida**; flies to NY only when toggling cameras

## Setup Instructions

### 1. Clone or Download
Place all files (`index.html`, `app.js`, `styles.css`, `camera-styles.css`, `server.js`, etc.) in a project directory.

### 2. Install Node.js (for server and AQI proxy)
- Ensure [Node.js](https://nodejs.org/) is installed.

### 3. Add Camera Data
- Place your `response.json` (array of NY camera objects) in the project root.

### 4. Start the Server
```sh
npm install
node server.js
```
- The server will run on `http://localhost:3001`.

### 5. Open the App
- Go to [http://localhost:3001](http://localhost:3001) in your browser.

## Usage
- **Open the sidebar** using the hamburger menu (☰) if hidden.
- **Show Live Traffic**: Toggle real-time traffic overlay.
- **Show Air Quality**: Toggle AQI card for the current map center's zip code.
- **Show Weather**: Toggle weather card for the current map center.
- **3D Tileset**: Show/hide Google 3D tiles.
- **Show NY Street Cameras**: Toggle all NY cameras and fly to NY; click a point for details and links.
- **Move the map**: Panels update to reflect the new center when toggled.

## Configuration
- **API Keys**: Set your Cesium Ion, TomTom, OpenWeatherMap, and AirNow API keys in `app.js`.
- **CSV Data**: Place your GPS CSV file in the project root as referenced in the code.
- **NY Cameras**: Place `response.json` in the root for camera visualization.

## File Structure
- `app.js` — Main Cesium app logic
- `server.js` — Express server to serve static files and camera data
- `response.json` — NY camera data (array of objects)
- `camera-styles.css` — Popup and camera UI styles
- `styles.css` — General app and sidebar styles
- `index.html` — Main HTML file

## Credits
- [CesiumJS](https://cesium.com/cesiumjs/)
- [TomTom Traffic API](https://developer.tomtom.com/)
- [AirNow API](https://docs.airnowapi.org/)
- [OpenWeatherMap API](https://openweathermap.org/api)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)

## License
This project is for educational and demonstration purposes.
