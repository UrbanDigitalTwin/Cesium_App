const fetch = require('node-fetch');
require('dotenv').config();

exports.handler = async (event) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Get API key from environment variables
  const apiKey = process.env.TRAFFIC_VIEW_API_KEY;
  console.log("Using FDOT Traffic View API key:", apiKey ? "API key exists" : "No API key");
  
  // Construct FDOT API URL
  const apiUrl = `https://api.trafficview.org/device/?api-key=${apiKey}&system=fdot&type=device_cctv&format=rf-json`;
  
  try {
    // Fetch data from FDOT API
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error("FDOT API error:", response.status, response.statusText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `FDOT API error: ${response.status} ${response.statusText}` 
        })
      };
    }
    
    const data = await response.json();
    console.log("Successfully retrieved FDOT camera data");
    
    // Return successful response
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    // Log and return error
    console.error("FDOT API error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Failed to fetch FDOT camera data: " + error.message 
      })
    };
  }
};
