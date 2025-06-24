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
  
  // Extract zip code from query parameters
  const zip = event.queryStringParameters.zip;
  if (!zip) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing zip parameter' })
    };
  }
  
  // Get API key from environment variables
  const apiKey = process.env.AIRNOW_API_KEY;
  console.log("Using AirNow API key:", apiKey ? "API key exists" : "No API key");
  
  // Construct AirNow API URL
  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zip}&distance=25&API_KEY=${apiKey}`;
  
  try {
    // Fetch data from AirNow API
    const response = await fetch(url);
    const data = await response.text();
    
    // Return successful response
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: data
    };
  } catch (error) {
    // Log and return error
    console.error("AirNow API error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'AirNow proxy error: ' + error.message })
    };
  }
};
