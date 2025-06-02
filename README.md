# Cesium Live Observation App

A web application for interactive 3D map visualization using CesiumJS, featuring live geospatial feeds like traffic, air quality, and weather data overlays in a modern sidebar UI.

## Features
- **3D Cesium Map**: Explore photorealistic 3D tiles and GPS tracks.
- **Live Traffic Overlay**: Toggle real-time traffic data from TomTom.
- **Air Quality (AQI) Panel**: View current AQI for the map center's zip code, styled in a sidebar card.
- **Weather Panel**: View current weather for the map center, styled in a sidebar card.
- **Sidebar UI**: Responsive sidebar with toggles for each live data panel.
- **3D Tileset Toggle**: Show/hide Google Photorealistic 3D Tiles.

## Setup Instructions

### 1. Clone or Download
Place all files (`index.html`, `app.js`, `styles.css`, `airnow-proxy.js`, etc.) in a project directory.

### 2. Install Node.js (for AQI proxy)
- Ensure [Node.js](https://nodejs.org/) is installed.

### 3. Start the AirNow Proxy
This is required to fetch AQI data due to CORS restrictions.
```sh
node airnow-proxy.js
```
- The proxy will run on `http://localhost:3001`.

### 4. Serve the App
You can use Python's built-in server or any static server:
```sh
python -m http.server 8000
```
- Open [http://localhost:8000](http://localhost:8000) in your browser.

## Usage
- **Open the sidebar** using the hamburger menu (☰) if hidden.
- **Show Live Traffic**: Toggle real-time traffic overlay.
- **Show Air Quality**: Toggle AQI card for the current map center's zip code.
- **Show Weather**: Toggle weather card for the current map center.
- **3D Tileset**: Show/hide Google 3D tiles.
- **Move the map**: Panels update to reflect the new center when toggled.

## Configuration
- **API Keys**: Set your Cesium Ion, TomTom, OpenWeatherMap, and AirNow API keys in `app.js`.
- **CSV Data**: Place your GPS CSV file in the project root as referenced in the code.

## Credits
- [CesiumJS](https://cesium.com/cesiumjs/)
- [TomTom Traffic API](https://developer.tomtom.com/)
- [AirNow API](https://docs.airnowapi.org/)
- [OpenWeatherMap API](https://openweathermap.org/api)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)

## License
This project is for educational and demonstration purposes.
