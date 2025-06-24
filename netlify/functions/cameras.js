const fs = require("fs");
const path = require("path");

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // Default empty array in case we can't access data
    let jsonData = [];

    try {
      // During local development, try to access the file
      if (process.env.NETLIFY_DEV === "true") {
        const dataPath = path.resolve("./client/public/data/response.json");
        if (fs.existsSync(dataPath)) {
          const fileData = fs.readFileSync(dataPath, "utf8");
          jsonData = JSON.parse(fileData);
          console.log("Successfully read camera data from local file");
        } else {
          console.log("response.json file not found at path:", dataPath);
        }
      } else {
        // For production environment, this won't work
        // You'll need to either bundle the data at build time or fetch it from an external source
        console.log("Not in local development environment, file access will not work");
      }
    } catch (readError) {
      console.log("Error reading local file:", readError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonData),
    };
  } catch (error) {
    console.error("Error in cameras function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to load camera data: " + error.message,
      }),
    };
  }
};
