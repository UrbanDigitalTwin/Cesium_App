const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('.'));

// Sample camera data for New York
const sampleCameras = [
    {
        Name: "Times Square Camera",
        DirectionOfTravel: "North",
        ID: "TS1",
        RoadwayName: "Broadway",
        Longitude: -73.9855,
        Latitude: 40.7580,
        Url: "https://example.com/ts1.jpg",
        VideoUrl: "https://example.com/ts1.mp4"
    },
    {
        Name: "Central Park Camera",
        DirectionOfTravel: "East",
        ID: "CP1",
        RoadwayName: "Central Park West",
        Longitude: -73.9713,
        Latitude: 40.7812,
        Url: "https://example.com/cp1.jpg",
        VideoUrl: "https://example.com/cp1.mp4"
    },
    {
        Name: "Brooklyn Bridge Camera",
        DirectionOfTravel: "South",
        ID: "BB1",
        RoadwayName: "Brooklyn Bridge",
        Longitude: -73.9969,
        Latitude: 40.7061,
        Url: "https://example.com/bb1.jpg",
        VideoUrl: "https://example.com/bb1.mp4"
    },
    {
        Name: "Empire State Camera",
        DirectionOfTravel: "West",
        ID: "ES1",
        RoadwayName: "5th Avenue",
        Longitude: -73.9857,
        Latitude: 40.7484,
        Url: "https://example.com/es1.jpg",
        VideoUrl: "https://example.com/es1.mp4"
    }
];

// Endpoint for camera data
app.get('/511ny', (req, res) => {
    res.json(sampleCameras);
});

// Serve all cameras from response.json
app.get('/cameras', (req, res) => {
    fs.readFile('./response.json', 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read camera data' });
        res.json(JSON.parse(data));
    });
});

const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please close the other process or use a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
}); 