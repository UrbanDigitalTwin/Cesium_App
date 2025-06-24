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

### Local Development

#### 1. Clone or Download
Place all files in a project directory.

#### 2. Install Dependencies
```sh
npm install
```

#### 3. Local Development Options

**Option 1: Express Server (Legacy)**
```sh
npm run dev:express
```
- The Express server will run on `http://localhost:3000`

**Option 2: Netlify Development (Recommended)**
```sh
npm run dev:netlify
```
- This uses Netlify CLI to simulate the production environment locally
- Serverless functions will be available at `/.netlify/functions/`
- Clean API routes (e.g., `/airnow`) will work via redirects

### Netlify Deployment

#### 1. Set Up Netlify
- Create a Netlify account at [netlify.com](https://www.netlify.com/)
- Install Netlify CLI globally (if not already installed): `npm install -g netlify-cli`
- Login to Netlify: `netlify login`

#### 2. Configure Environment Variables
- Copy `.env.example` to `.env` for local development
- Add your API keys to the `.env` file
- For production, add these same variables in the Netlify dashboard:
  - Go to your site → Site settings → Build & deploy → Environment variables
  - Add each API key: `TRAFFIC_VIEW_API_KEY`, `AIRNOW_API_KEY`, `TOMTOM_API_KEY`, etc.

#### 3. Deploy to Netlify
```sh
npm run deploy
```

Or deploy manually:
```sh
netlify deploy --prod
```

- Follow the prompts to select your Netlify site
- The app will be deployed with serverless functions for all API endpoints

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
