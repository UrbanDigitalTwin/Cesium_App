const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // For Netlify, we need to bundle the JSON data into the function
    // This is because we cannot access the filesystem in production
    // Instead, we include a static copy of the data here
    const responseData = [
      {
        "FeedID": "NY-RWIS-CCTV-000144",
        "Location": "Hawthorne Circle",
        "State": "NY",
        "Latitude": 41.101265,
        "Longitude": -73.822321,
        "Url": "https://511ny.org/map/Cctv/8736--12"
      },
      {
        "FeedID": "NY-RWIS-CCTV-000145",
        "Location": "Taconic State Parkway, S of Pleasantville Rd",
        "State": "NY",
        "Latitude": 41.130188,
        "Longitude": -73.805086,
        "Url": "https://511ny.org/map/Cctv/8737--12"
      },
      {
        "FeedID": "NY-RWIS-CCTV-000146", 
        "Location": "Taconic State Parkway, N of Pleasantville Rd",
        "State": "NY",
        "Latitude": 41.143153,
        "Longitude": -73.797330,
        "Url": "https://511ny.org/map/Cctv/8738--12"
      },
      {
        "FeedID": "NY-RWIS-CCTV-000147",
        "Location": "I-95, Larchmont Toll Barrier",
        "State": "NY",
        "Latitude": 40.923360,
        "Longitude": -73.785980,
        "Url": "https://511ny.org/map/Cctv/8739--12"
      }
    ];

    // For local development, we can also try to read from the file
    // This will only work during local development with netlify dev
    let jsonData = responseData;
    
    try {
      // During local development, try to access the file
      if (process.env.NETLIFY_DEV === 'true') {
        const dataPath = path.resolve('./client/public/data/response.json');
        if (fs.existsSync(dataPath)) {
          const fileData = fs.readFileSync(dataPath, 'utf8');
          jsonData = JSON.parse(fileData);
          console.log('Successfully read camera data from local file');
        }
      }
    } catch (readError) {
      console.log('Could not read local file, using bundled data:', readError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonData)
    };
  } catch (error) {
    console.error('Error in cameras function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load camera data: ' + error.message })
    };
  }
};
