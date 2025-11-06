// initialize app when window loads
window.onload = async function () {
  // fetch config
  let codetrApiKey = null;
  try {
    const response = await fetch("/config");
    const config = await response.json();

    if (config.cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = config.cesiumIonToken;
    } else {
      console.error("No Cesium Ion token provided in server config");
    }

    if (config.codetrApiKey) {
      codetrApiKey = config.codetrApiKey;
    } else {
      console.error("No Co-DETR API key provided in server config");
    }
  } catch (error) {
    console.error("Failed to load configuration:", error);
  }

  // 511NY camera API config
  let cameraEntities = [];
  let activeCameraInfoBox = null;
  let camerasVisible = false; // Start with cameras hidden

  // Emergency management config
  let emEventEntities = [];
  let emEventsVisible = false;

  // --- Bounding Box Variables ---
  let boundingBoxState = 'initial'; // States: 'initial', 'creating-box', 'drawing-shape', 'active', 'editing'
  let currentBoundingBox = null;
  let boundingBoxHandler = null;
  let tempBoundingBox = null;
  let boundingBoxCoordinates = [];
  let isBoundingBoxActivated = false;
  let editHandles = [];
  let editingHandler = null;
  let originalBoundingBoxCartesians = null;
  let draggedHandle = null;
  let isDraggingHandle = false;
  let cameraPanRequest = null;

  // --- Boundary Selection Variables ---
  let usStatesData = [];
  let usCountiesData = [];
  let sviData = new Map();

  // --- Weather Alerts Variables ---
  let weatherAlertEntities = [];
  let weatherAlertsVisible = false;

  // --- River Gauge Variables ---
  let gaugeEntities = [];
  let activeGaugeInfoBox = null;

  // --- CO2 Sensor Variables ---
  let sensorEntities = [];
  let activeSensorInfoBox = null;

  // --- Flood Level Analysis Variables ---
  let floodLevelEntities = [];

  /**
   * Determines the status and color of a river gauge based on its current water level
   * compared to its defined flood stages.
   * @param {number} currentLevel The current water level of the gauge.
   * @param {object} floodLevels An object containing the flood stage values (e.g., action, minor, moderate, major).
   * @returns {{status: string, color: Cesium.Color, description: string}} An object with the status name, Cesium color, and a brief description.
   */
  function getGaugeStatus(currentLevel, floodLevels) {
    // Handle cases where flood levels are not defined for a gauge
    if (!floodLevels) {
      return { status: 'Normal', color: Cesium.Color.GREEN, description: 'The water level is within the normal range.' };
    }

    const {
      action_stage: action,
      minor_flood_stage: minor,
      moderate_flood_stage: moderate,
      major_flood_stage: major
    } = floodLevels;

    if (currentLevel === null || currentLevel === undefined) {
      return { status: 'Unknown', color: Cesium.Color.GRAY, description: 'Current water level is not available.' };
    }

    if (major && currentLevel >= major) {
      return { status: 'Major Flood', color: Cesium.Color.DARKRED, description: 'Extensive inundation of structures and roads.' };
    }
    if (moderate && currentLevel >= moderate) {
      return { status: 'Moderate Flood', color: Cesium.Color.RED, description: 'Some inundation of structures and roads near the stream.' };
    }
    if (minor && currentLevel >= minor) {
      return { status: 'Minor Flood', color: Cesium.Color.ORANGE, description: 'Minimal or no property damage, but possibly some public threat.' };
    }
    if (action && currentLevel >= action) {
      return { status: 'Action Stage', color: Cesium.Color.YELLOW, description: 'Water level is approaching bankfull. Action is necessary.' };
    }
    // Assuming a 'low' threshold isn't provided, we'll consider anything below 'action' as normal.
    if (action && currentLevel < action) {
        return { status: 'Normal', color: Cesium.Color.GREEN, description: 'The water level is within the normal range.' };
    }

    // Fallback for gauges without defined stages
    return { status: 'Normal', color: Cesium.Color.GREEN, description: 'The water level is within the normal range.' };
  }
  // fetch and process camera data
  async function fetchAndProcessCameras() {
    try {
      console.log("Fetching camera data...");
      // Using the local JSON file for now
      const response = await fetch("/cameras");
      const data = await response.json();

      if (data.error) {
        console.error("API Error:", data.error);
        return;
      }

      // Clear existing camera entities
      cameraEntities.forEach((entity) => {
        if (viewer.entities.contains(entity)) {
          viewer.entities.remove(entity);
        }
      });
      cameraEntities = [];

      // process each camera
      data.forEach((camera) => {
        if (!camera.Longitude || !camera.Latitude) return;
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            camera.Longitude,
            camera.Latitude
          ),
          point: {
            pixelSize: 8,
            color: Cesium.Color.ORANGE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            show: camerasVisible, // Use the current camerasVisible state
          },
          properties: {
            name: camera.Name || "Unknown",
            direction: camera.DirectionOfTravel || "Unknown",
            id: camera.ID || "Unknown",
            roadway: camera.RoadwayName || "Unknown",
            imageUrl: camera.Url || "",
            videoUrl: camera.VideoUrl || "",
          },
        });
        cameraEntities.push(entity);
      });

      console.log(`Added ${cameraEntities.length} camera entities`);
    } catch (error) {
      console.error("Error fetching camera data:", error);
    } finally {
      return;
    }
  }

  // Create camera info box HTML
  function createCameraInfoBox(camera) {
    return `
            <div class="camera-info-box">
                <button class="camera-info-close" onclick="document.getElementById('cameraInfoContainer').style.display='none'">&times;</button>
                <h3>${camera.name}</h3>
                <p><strong>Direction:</strong> ${camera.direction}</p>
                <p><strong>ID:</strong> ${camera.id}</p>
                <p><strong>Roadway:</strong> ${camera.roadway}</p>
                <div class="camera-links">
                    ${
                      camera.imageUrl
                        ? `<a href="#" class="camera-link" onclick="showImageBelowDialog('${camera.imageUrl.replace(
                            /'/g,
                            "\\'"
                          )}');return false;">View Image</a>`
                        : ""
                    }
                    ${
                      camera.videoUrl
                        ? `<a href="#" class="camera-link" onclick="showVideoBelowDialog('${camera.videoUrl.replace(
                            /'/g,
                            "\\'"
                          )}');return false;">Watch Video</a>`
                        : ""
                    }
                </div>
            </div>
        `;
  }

  // create emergency event info box HTML
  function createEmergencyEventInfoBox(event) {
    // Format timestamp if we have one
    let timeStr = "Unknown";
    if (event.time && event.time._seconds) {
      try {
        const date = new Date(event.time._seconds * 1000);
        timeStr = date.toLocaleString();
      } catch (e) {
        console.error("Error formatting event time:", e);
      }
    }

    // Create image carousel HTML if images exist
    let imagesHtml = "";
    if (event.images && event.images.length > 0) {
      // create a unique ID for this carousel
      const carouselId = `carousel-${Date.now()}`;

      // Generate carousel slides
      const slides = event.images
        .map((img, index) => {
          return `
          <div class="carousel-slide ${
            index === 0 ? "active" : ""
          }" data-index="${index}">
            <img src="${img}" class="carousel-image" onclick="openFullscreenImage(this)" />
            <button class="detect-btn" onclick="detectImage(this, '${img.replace(
              /'/g,
              "\\'"
            )}')">
              <i class="fas fa-search"></i>
              <span>Detect</span>
            </button>
          </div>
        `;
        })
        .join("");

      // generate carousel navigation dots
      const navDots =
        event.images.length > 1
          ? `
          <div class="carousel-nav">
            ${event.images
              .map(
                (_, index) =>
                  `<span class="carousel-dot ${index === 0 ? "active" : ""}"
                  onclick="navigateCarousel('${carouselId}', ${index})"></span>`
              )
              .join("")}
          </div>
        `
          : "";

      // Add navigation buttons if there's more than one image
      const navButtons =
        event.images.length > 1
          ? `
          <button class="carousel-prev" onclick="navigateCarousel('${carouselId}', 'prev')">&#10094;</button>
          <button class="carousel-next" onclick="navigateCarousel('${carouselId}', 'next')">&#10095;</button>
        `
          : "";

      imagesHtml = `
        <div class="event-images">
          <p><strong>Images:</strong></p>
          <div class="carousel-container" id="${carouselId}">
            <div class="carousel-track">
              ${slides}
            </div>
            ${navButtons}
            ${navDots}
          </div>
        </div>
      `;

      // add carousel navigation function if it's not already there
      if (!window.navigateCarousel) {
        window.navigateCarousel = function (carouselId, direction) {
          const container = document.getElementById(carouselId);
          if (!container) return;

          const slides = container.querySelectorAll(".carousel-slide");
          const dots = container.querySelectorAll(".carousel-dot");
          if (!slides.length) return;

          // Find current active slide
          let activeIndex = 0;
          slides.forEach((slide, i) => {
            if (slide.classList.contains("active")) activeIndex = i;
          });

          // calculate next index
          let nextIndex;
          if (direction === "next") {
            nextIndex = (activeIndex + 1) % slides.length;
          } else if (direction === "prev") {
            nextIndex = (activeIndex - 1 + slides.length) % slides.length;
          } else {
            // If direction is a number, use that as the index
            nextIndex = parseInt(direction);
            if (
              isNaN(nextIndex) ||
              nextIndex < 0 ||
              nextIndex >= slides.length
            ) {
              nextIndex = 0;
            }
          }

          // Update active classes
          slides.forEach((slide) => slide.classList.remove("active"));
          dots.forEach((dot) => dot.classList.remove("active"));

          slides[nextIndex].classList.add("active");
          if (dots[nextIndex]) dots[nextIndex].classList.add("active");
        };
      }
    }

    return `
      <div class="camera-info-box event-info-box">
        <button class="camera-info-close" onclick="document.getElementById('cameraInfoContainer').style.display='none'">&times;</button>
        <h3>${event.title || "Emergency Event"}</h3>
        <div class="event-status ${event.active ? "active" : "inactive"}">
          ${event.active ? "ACTIVE" : "INACTIVE"}
        </div>
        <p><strong>Type:</strong> ${event.eventType || "Unknown"}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        <p><strong>Description:</strong> ${
          event.description || "No description available."
        }</p>
        ${imagesHtml}
      </div>
    `;
  }

  // Function to handle image detection API call (template)
  window.detectImage = async function (buttonElement, imageUrl) {
    console.log("Detecting objects in image:", imageUrl);

    // Add a loading state to the button
    buttonElement.classList.add("loading");
    buttonElement.disabled = true;
    const originalText = buttonElement.querySelector("span").textContent;
    buttonElement.querySelector("span").textContent = "Detecting...";

    try {
      if (!codetrApiKey) {
        throw new Error("Co-DETR API Key is not configured.");
      }

      // 1. Fetch the image through the server-side proxy to avoid CORS issues
      const proxyUrl = `/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      const imageResponse = await fetch(proxyUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      const imageBlob = await imageResponse.blob();

      // 2. Create a File object from the blob
      const imageFile = new File([imageBlob], "image.png", {
        type: "image/png",
      });

      // 3. Create FormData and append the file and score threshold
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("score-treshold", "0.5");

      // 4. Make the API call
      const detectUrl =
        "https://codetr-api.cis251126.projects.jetstream-cloud.org/detect";
      const detectResponse = await fetch(detectUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${codetrApiKey}`,
        },
        body: formData,
      });

      if (!detectResponse.ok) {
        let errorBody = "Could not read error response.";
        try {
          // Try to parse as JSON first, as many APIs do.
          const errorJson = await detectResponse.json();
          errorBody = JSON.stringify(errorJson);
        } catch (e) {
          // If not JSON, read as text.
          errorBody = await detectResponse.text();
        }
        throw new Error(`API Error: ${detectResponse.status} - ${errorBody}`);
      }
      
      const contentType = detectResponse.headers.get("content-type");
      const imageElement = buttonElement.parentElement.querySelector("img");

      if (contentType && contentType.startsWith("image/")) {
        // Handle image response
        console.log("Detection API returned an image.");
        const imageBlob = await detectResponse.blob();
        const newImageUrl = URL.createObjectURL(imageBlob);
        
        if (imageElement) {
          imageElement.src = newImageUrl;
        }

      } else if (contentType && contentType.includes("application/json")) {
        // Handle JSON response (existing logic)
        const results = await detectResponse.json();
        console.log("Detection results:", results);

        if (imageElement && results.length > 0) {
          const slide = buttonElement.closest(".carousel-slide");
          if (slide) {
            slide.querySelectorAll(".detection-box").forEach((box) => box.remove());
            results.forEach((res) => {
              const box = document.createElement("div");
              box.className = "detection-box";
              box.style.left = `${(res.box.x1 / imageElement.naturalWidth) * 100}%`;
              box.style.top = `${(res.box.y1 / imageElement.naturalHeight) * 100}%`;
              box.style.width = `${((res.box.x2 - res.box.x1) / imageElement.naturalWidth) * 100}%`;
              box.style.height = `${((res.box.y2 - res.box.y1) / imageElement.naturalHeight) * 100}%`;
              box.setAttribute("data-label", `${res.label} (${res.score.toFixed(2)})`);
              slide.appendChild(box);
            });
          }
        }
      } else {
        throw new Error(`Detection API returned an unexpected content type: ${contentType}.`);
      }
    } catch (error) {
      console.error("Detection API call failed:", error);
      alert("Image detection failed. See console for details.");
    } finally {
      // Restore button to its original state
      buttonElement.classList.remove("loading");
      buttonElement.disabled = false;
      buttonElement.querySelector("span").textContent = originalText;
    }
  };

  // Function to handle image detection API call (template)
  window.detectImage = async function (buttonElement, imageUrl) {
    console.log("Detecting objects in image:", imageUrl);

    // Add a loading state to the button
    buttonElement.classList.add("loading");
    buttonElement.disabled = true;
    const originalText = buttonElement.querySelector("span").textContent;
    buttonElement.querySelector("span").textContent = "Detecting...";

    try {
      if (!codetrApiKey) {
        throw new Error("Co-DETR API Key is not configured.");
      }

      // 1. Fetch the image through the server-side proxy to avoid CORS issues
      const proxyUrl = `/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      const imageResponse = await fetch(proxyUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      const imageBlob = await imageResponse.blob();

      // 2. Create a File object from the blob
      const imageFile = new File([imageBlob], "image.png", {
        type: "image/png",
      });

      // 3. Create FormData and append the file and score threshold
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("score-treshold", "0.5");

      // 4. Make the API call
      const detectUrl =
        "https://codetr-api.cis251126.projects.jetstream-cloud.org/detect";
      const detectResponse = await fetch(detectUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${codetrApiKey}`,
        },
        body: formData,
      });

      if (!detectResponse.ok) {
        let errorBody = "Could not read error response.";
        try {
          // Try to parse as JSON first, as many APIs do.
          const errorJson = await detectResponse.json();
          errorBody = JSON.stringify(errorJson);
        } catch (e) {
          // If not JSON, read as text.
          errorBody = await detectResponse.text();
        }
        throw new Error(`API Error: ${detectResponse.status} - ${errorBody}`);
      }
      
      const contentType = detectResponse.headers.get("content-type");
      const imageElement = buttonElement.parentElement.querySelector("img");

      if (contentType && contentType.startsWith("image/")) {
        // Handle image response
        console.log("Detection API returned an image.");
        const imageBlob = await detectResponse.blob();
        const newImageUrl = URL.createObjectURL(imageBlob);
        
        if (imageElement) {
          imageElement.src = newImageUrl;
        }

      } else if (contentType && contentType.includes("application/json")) {
        // Handle JSON response (existing logic)
        const results = await detectResponse.json();
        console.log("Detection results:", results);

        if (imageElement && results.length > 0) {
          const slide = buttonElement.closest(".carousel-slide");
          if (slide) {
            slide.querySelectorAll(".detection-box").forEach((box) => box.remove());
            results.forEach((res) => {
              const box = document.createElement("div");
              box.className = "detection-box";
              box.style.left = `${(res.box.x1 / imageElement.naturalWidth) * 100}%`;
              box.style.top = `${(res.box.y1 / imageElement.naturalHeight) * 100}%`;
              box.style.width = `${((res.box.x2 - res.box.x1) / imageElement.naturalWidth) * 100}%`;
              box.style.height = `${((res.box.y2 - res.box.y1) / imageElement.naturalHeight) * 100}%`;
              box.setAttribute("data-label", `${res.label} (${res.score.toFixed(2)})`);
              slide.appendChild(box);
            });
          }
        }
      } else {
        throw new Error(`Detection API returned an unexpected content type: ${contentType}.`);
      }
    } catch (error) {
      console.error("Detection API call failed:", error);
      alert("Image detection failed. See console for details.");
    } finally {
      // Restore button to its original state
      buttonElement.classList.remove("loading");
      buttonElement.disabled = false;
      buttonElement.querySelector("span").textContent = originalText;
    }
  };

  // Initialize the Cesium Viewer with specific options
  const imageryProviderViewModels = [
    ...Cesium.createDefaultImageryProviderViewModels(),
  ];
  const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: true,
    timeline: true,
    navigationHelpButton: true,
    sceneModePicker: true,
    geocoder: true,
    baseLayerPicker: true,
    fullscreenButton: false,
    homeButton: true,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: true,
    imageryProviderViewModels: imageryProviderViewModels,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.googleapis.com/v1/3dtiles/root.json?key=AIzaSyBxVOS_tR1Wmt9WQNxowI-8JhW1HvRzJ8Y",
      credit: " Google",
    }),
  });

  // Define the home camera view options
  const homeCameraView = {
    destination: Cesium.Cartesian3.fromDegrees(-81.2015, 28.5812, 2000), // SLIGHTLY *SOUTH* of UCF
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0,
    },
    duration: 0 // Set to 0 for an instant view on load
  };

  // Set the initial camera view by flying to it instantly. This correctly frames the target.
  viewer.camera.flyTo(homeCameraView);

  // Override the default home button behavior to fly to our custom initial view
  viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true; // Prevent the default action
    viewer.camera.flyTo({ ...homeCameraView, duration: 2.0 }); // Use a smooth flight for the button click
  });

  // Add camera info box container to the DOM
  const cameraInfoContainer = document.createElement("div");
  cameraInfoContainer.id = "cameraInfoContainer";
  cameraInfoContainer.style.display = "none";
  document.body.appendChild(cameraInfoContainer);

  // Add gauge info box container to the DOM
  const gaugeInfoBoxContainer = document.getElementById("gaugeInfoBox");
  if (!gaugeInfoBoxContainer) {
    console.error("Gauge info box container not found in HTML.");
  }

  // click handler for camera entities and emergency events
  const cameraHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  cameraHandler.setInputAction(async (click) => {
    const picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id) {
      // Check if it's a camera entity
      if (cameraEntities.includes(picked.id)) {
        const camera = picked.id.properties;
        if (activeCameraInfoBox) {
          activeCameraInfoBox.style.display = "none";
        }

        cameraInfoContainer.innerHTML = createCameraInfoBox({
          name: camera.name.getValue(),
          direction: camera.direction.getValue(),
          id: camera.id.getValue(),
          roadway: camera.roadway.getValue(),
          imageUrl: camera.imageUrl.getValue(),
          videoUrl: camera.videoUrl.getValue(),
        });

        cameraInfoContainer.style.display = "block";
        activeCameraInfoBox = cameraInfoContainer;
      }
      // --- FIX: Handle river gauge clicks within the main handler ---
      else if (picked.id.properties && picked.id.properties.isRiverGauge) {
        const props = picked.id.properties;
        const gaugeId = props.lid.getValue();
        const gaugeName = props.name.getValue();

        // Fly to the entity, keeping it centered on screen with an offset
        viewer.flyTo(picked.id, {
          duration: 1.5,
          offset: new Cesium.HeadingPitchRange(
            viewer.camera.heading, // Keep the current heading
            Cesium.Math.toRadians(-35.0), // A slightly less steep angle
            3000 // Range from the target in meters
          ),
        });

        // Show loading state
        gaugeInfoBoxContainer.innerHTML = `
          <div class="gauge-info-box">
            <button class="gauge-info-close">&times;</button>
            <h4>${gaugeName} (${gaugeId})</h4>
            <p>Loading forecast data...</p>
          </div>
        `;
        gaugeInfoBoxContainer.classList.remove('hidden');
        gaugeInfoBoxContainer.querySelector('.gauge-info-close').onclick = () => {
          gaugeInfoBoxContainer.classList.add('hidden');
          activeGaugeInfoBox = null;
        };
        activeGaugeInfoBox = gaugeInfoBoxContainer;

        // Fetch forecast data
        const gaugeDetailsUrl = `https://api.water.noaa.gov/nwps/v1/gauges/${gaugeId}`;
        console.log('Requesting gauge details from:', gaugeDetailsUrl);

        try {
          const forecastRes = await fetchWithTimeout(gaugeDetailsUrl, {}, 10000);
          if (!forecastRes.ok) throw new Error(`API Error ${forecastRes.status}`);
          const forecastData = await forecastRes.json();

          let forecastHtml = '<p>No forecast data available.</p>';
          
          // --- FIX: Handle different API response structures for gauge data ---
          // The `/gauges/{id}` endpoint returns data in `status.observed`, not `observed.data[]`.
          const observedStatus = forecastData.status?.observed;
          const floodLevels = forecastData.flood?.levels || forecastData.flood?.categories; // Handle both `levels` and `categories` structures
          const currentStage = observedStatus?.primary;

          // Primary case: We have a current, valid observation reading from the `status` object.
          if (currentStage !== undefined && currentStage > -999) {
            // Get status even if flood levels are not defined. The function will handle it.
            const status = getGaugeStatus(currentStage, floodLevels);
            
            forecastHtml = `
              <div class="gauge-forecast-details">
                <div class="gauge-metric">
                  <span class="gauge-label">Current Water Level</span>
                  <span class="gauge-value">${currentStage.toFixed(2)} ${observedStatus.primaryUnit}</span>
                </div>
                <div class="gauge-metric">
                  <span class="gauge-label">Status</span>
                  <span class="gauge-value" style="color: ${status.color.toCssColorString()};">${status.status}</span>
                </div>
              </div>
              <div class="gauge-status-legend">
                <div class="gauge-legend-item"><span class="dot" style="background-color: ${Cesium.Color.GREEN.toCssColorString()};"></span> Normal</div>
                <div class="gauge-legend-item"><span class="dot" style="background-color: ${Cesium.Color.YELLOW.toCssColorString()};"></span> Action</div>
                <div class="gauge-legend-item"><span class="dot" style="background-color: ${Cesium.Color.ORANGE.toCssColorString()};"></span> Minor</div>
                <div class="gauge-legend-item"><span class="dot" style="background-color: ${Cesium.Color.RED.toCssColorString()};"></span> Moderate</div>
                <div class="gauge-legend-item"><span class="dot" style="background-color: ${Cesium.Color.DARKRED.toCssColorString()};"></span> Major</div>
              </div>
              <p class="gauge-timestamp">Observation valid at: ${new Date(observedStatus.validTime).toLocaleString()}</p>
            `;
          } else if (forecastData.forecast && forecastData.forecast.data && forecastData.forecast.data.length > 0) {
            const forecastInfo = forecastData.forecast;
            // Fallback to forecast if observation is missing
            const latestForecast = forecastInfo.data[0];
            const stage = latestForecast.primary;
            forecastHtml = `
              <div class="gauge-forecast-details">
                <div class="gauge-metric">
                  <span class="gauge-label">Forecast Stage</span>
                  <span class="gauge-value">${stage.toFixed(2)} ${forecastInfo.primaryUnits}</span>
                </div>
                <div class="gauge-metric">
                  <span class="gauge-label">Status</span>
                  <span class="gauge-value">Forecast Only</span>
                </div>
              </div>
              <p class="gauge-timestamp">Forecast valid at: ${new Date(latestForecast.validTime).toLocaleString()}</p>
            `;
          } else if (forecastData.observed) {
            // Case where `observed` object exists but has no valid data.
            forecastHtml = `<p>Current observation data is not available for this gauge.</p>`;
          } else {
            forecastHtml = `<p>No current observation or forecast data is available.</p>`;
          }
          gaugeInfoBoxContainer.innerHTML = `
            <div class="gauge-info-box">
              <button class="gauge-info-close">&times;</button>
              <h4>${gaugeName} (${gaugeId})</h4>
              ${forecastHtml}
            </div>
          `;
          gaugeInfoBoxContainer.querySelector('.gauge-info-close').onclick = () => {
            gaugeInfoBoxContainer.classList.add('hidden');
            activeGaugeInfoBox = null;
          };

        } catch (error) {
          console.error("Error fetching gauge forecast:", error);
          gaugeInfoBoxContainer.innerHTML = `
            <div class="gauge-info-box">
              <button class="gauge-info-close">&times;</button>
              <h4>${gaugeName} (${gaugeId})</h4>
              <p style="color: #ff5252;">Error loading forecast data.</p>
            </div>
          `;
          gaugeInfoBoxContainer.querySelector('.gauge-info-close').onclick = () => {
            gaugeInfoBoxContainer.classList.add('hidden');
            activeGaugeInfoBox = null;
          };
        }
      }
      // Check if it's an emergency event entity
      else if (picked.id.properties && picked.id.properties.isEmergencyEvent) {
        const event = picked.id.properties;
        if (activeCameraInfoBox) {
          activeCameraInfoBox.style.display = "none";
        }

        cameraInfoContainer.innerHTML = createEmergencyEventInfoBox({
          id: event.id && event.id.getValue(),
          title: event.title && event.title.getValue(),
          description: event.description && event.description.getValue(),
          eventType: event.eventType && event.eventType.getValue(),
          time: event.time && event.time.getValue(),
          active: event.active && event.active.getValue(),
          images: event.images && event.images.getValue(),
        });

        cameraInfoContainer.style.display = "block";
        activeCameraInfoBox = cameraInfoContainer;
      }
      // Check if it's a CO2 sensor entity
      else if (picked.id.properties && picked.id.properties.isCo2Sensor) {
        const props = picked.id.properties;
        const sensorData = props.sensorData.getValue();
        if (sensorData) {
          showSensorInfoBox(sensorData);
        }
      } else {
        if (activeCameraInfoBox) {
          activeCameraInfoBox.style.display = "none";
          activeCameraInfoBox = null;
        }
        // Also hide gauge info box if it's open
        if (gaugeInfoBoxContainer) {
          gaugeInfoBoxContainer.classList.add('hidden');
          gaugeInfoBoxContainer.innerHTML = '';
          activeGaugeInfoBox = null;
        }
        if (activeSensorInfoBox) {
          activeSensorInfoBox.classList.add('hidden');
          activeSensorInfoBox.innerHTML = '';
          activeSensorInfoBox = null;
        }
      }
    } else {
      if (activeCameraInfoBox) {
        activeCameraInfoBox.style.display = "none";
        activeCameraInfoBox = null;
      }
      // Also hide gauge info box if it's open
      if (gaugeInfoBoxContainer) {
        gaugeInfoBoxContainer.classList.add('hidden');
        gaugeInfoBoxContainer.innerHTML = '';
        activeGaugeInfoBox = null;
      }
      if (activeSensorInfoBox) {
        activeSensorInfoBox.classList.add('hidden');
        activeSensorInfoBox.innerHTML = '';
        activeSensorInfoBox = null;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Toggle camera visibility
  async function toggleCameras() {
    // fetch camera data if it's not already loaded
    if (cameraEntities.length === 0) {
      await fetchAndProcessCameras();
    }
    camerasVisible = !camerasVisible;
    cameraEntities.forEach((entity) => {
      if (entity.point) {
        entity.point.show = camerasVisible;
      }
    });
    return camerasVisible;
  }

  // Add camera toggle button to the sidebar
  const sidebarCameraBtn = document.getElementById("nycGeojsonBtn");
  if (sidebarCameraBtn) {
    sidebarCameraBtn.onclick = async function () {
      this.textContent = "Loading...";
      const isVisible = await toggleCameras();
      this.classList.toggle("active");
      this.textContent = isVisible
        ? "Hide NY Street Cameras"
        : "Show NY Street Cameras"; // only fly to the specific NY point when cameras are shown
      if (isVisible) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            -73.82557002406561,
            40.715533967837096,
            2000
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0,
          },
          duration: 2,
        });
      }
    };
  }

  let csvData = [];
  let tileset = null;
  const GOOGLE_3D_TILESET_ASSET_ID = 2275207;

  // Load Google Photorealistic 3D Tiles
  async function loadTileset() {
    try {
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
        GOOGLE_3D_TILESET_ASSET_ID
      );
      viewer.scene.primitives.add(tileset);

      // load and plot GPS points
      const response = await fetch("data/syncronized_df_with_class (1).csv");
      const csvText = await response.text();
      const lines = csvText.split("\n");

      csvData = lines.slice(1).map((line) => {
        const values = line.split(",");
        return {
          date: values[0],
          time: values[1],
          lat: parseFloat(values[2]),
          lon: parseFloat(values[3]),
          alt: parseFloat(values[4]),
          image: values[9],
          class: values[10] || "unknown",
          UCF: values[11] === "true", // expects 'true' in the UCF column
        };
      });

      const positions = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].split(",");
        if (line.length >= 11) {
          const lat = parseFloat(line[2]);
          const lon = parseFloat(line[3]);
          const alt = parseFloat(line[4]);
          const classType = line[10] || "unknown";

          positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));

          const color =
            classType.trim().toUpperCase() === "ASPHALT"
              ? Cesium.Color.BLUE
              : classType.trim().toUpperCase() === "UNPAVED"
              ? Cesium.Color.RED
              : Cesium.Color.YELLOW;

          const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
            point: {
              pixelSize: 4,
              color: color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
            },
            properties: {
              index: i - 1,
            },
            show: false,
          });
          if (!window.mainPathPoints) window.mainPathPoints = [];
          window.mainPathPoints.push(entity);
        }
      }

      mainPathEntity = viewer.entities.add({
        polyline: {
          positions: positions,
          width: 3,
          material: Cesium.Color.RED,
        },
        show: false,
      });

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          -81.2016141073140628,
          28.5812889447392,
          2000
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
      });
    } catch (error) {
      console.error("Error:", error);
    }
  }

  loadTileset();

  // --- Live Traffic Layer Logic ---
  let trafficLayer = null;
  // No need to define API key here, server proxy handles it
  function addTrafficLayer() {
    try {
      console.log("Adding traffic layer...");
      const ts = Date.now();
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `/tomtom-traffic?z={z}&x={x}&y={y}&ts=${ts}`,
        credit: "Traffic data TomTom",
        maximumLevel: 20,
        // Error handling for tile loading
        errorCallback: function (e) {
          console.error("Error loading traffic tile:", e);
        },
      });
      trafficLayer = viewer.imageryLayers.addImageryProvider(
        provider,
        viewer.imageryLayers.length
      );
      console.log("Traffic layer added successfully");
    } catch (error) {
      console.error("Failed to add traffic layer:", error);
    }
  }
  function removeTrafficLayer() {
    if (trafficLayer) {
      viewer.imageryLayers.remove(trafficLayer, false);
      trafficLayer = null;
    }
  }
  let trafficRefreshInterval = null;
  function startTrafficAnimation() {
    if (trafficRefreshInterval) return;
    trafficRefreshInterval = setInterval(() => {
      if (trafficLayer) {
        removeTrafficLayer();
      }
      addTrafficLayer();
    }, 30000);
  }
  function stopTrafficAnimation() {
    if (trafficRefreshInterval) {
      clearInterval(trafficRefreshInterval);
      trafficRefreshInterval = null;
    }
  }

  // --- Traffic Legend Logic ---
  function showTrafficLegend() {
    const legend = document.getElementById('trafficLegend');
    if (legend) {
      legend.innerHTML = `
        <h5>Traffic Flow</h5>
        <div class="traffic-legend-gradient"></div>
        <div class="traffic-legend-labels">
          <span>Fast</span>
          <span>Slow</span>
        </div>
      `;
      legend.classList.remove('hidden');
    }
  }
  function hideTrafficLegend() {
    const legend = document.getElementById('trafficLegend');
    if (legend) {
      legend.classList.add('hidden');
    }
  }

  // Emergency management functionality
  async function fetchEmergencyEvents() {
    try {
      // Show loading indicator on the button
      if (sidebarEmergencyManageBtn) {
        sidebarEmergencyManageBtn.textContent = "Loading Events...";
        sidebarEmergencyManageBtn.disabled = true;
      }

      const response = await fetch("/em-event-data");

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error fetching emergency events:", errorData);
        alert(
          `Failed to load emergency events: ${
            errorData.error || response.statusText
          }`
        );
        return;
      }

      const eventData = await response.json();
      console.log(`Received ${eventData.length} emergency events`);

      // Clear existing event entities
      clearEmergencyEvents();

      // Create a point primitive collection for better performance
      const pointPrimitives = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );

      // process each event and add it to the map
      eventData.forEach((event) => {
        if (!event.latitude || !event.longitude) return;

        // Create a color based on event type
        let color;
        switch (event.eventType?.toLowerCase()) {
          case "hurricane":
            color = Cesium.Color.BLUE;
            break;
          case "earthquake":
            color = Cesium.Color.ORANGE;
            break;
          case "tornado":
            color = Cesium.Color.PURPLE;
            break;
          case "wildfire":
            color = Cesium.Color.RED;
            break;
          default:
            color = Cesium.Color.YELLOW;
        }

        // Calculate a position elevated from the ground for better visibility
        const elevatedPosition = Cesium.Cartesian3.fromDegrees(
          event.longitude,
          event.latitude,
          50 // Height in meters above ground
        );

        // Add point primitive for each event (the visual part)
        const point = pointPrimitives.add({
          position: elevatedPosition,
          pixelSize: 16,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.5, 8.0e6, 0.5),
          translucencyByDistance: new Cesium.NearFarScalar(
            1.5e5,
            1.0,
            1.5e7,
            0.5
          ),
        });

        // Add an entity with more info for click events
        // Using a larger transparent hit area to make clicking easier
        const entity = viewer.entities.add({
          position: elevatedPosition,
          point: { // This is the clickable area
            pixelSize: 30, // Much larger size for easier hit testing
            color: Cesium.Color.TRANSPARENT.withAlpha(0.01), // Nearly transparent but still detectable
          },
          properties: {
            id: event.id,
            title: event.title,
            description: event.description,
            eventType: event.eventType,
            time: event.time,
            active: event.active,
            images: event.images,
            isEmergencyEvent: true, // Flag to identify as emergency event
          },
        });

        emEventEntities.push(entity);
      });

      // Store the point primitive collection for toggling visibility
      window.emPointPrimitives = pointPrimitives;
      emEventsVisible = true;

      // Update the button text
      if (sidebarEmergencyManageBtn) {
        sidebarEmergencyManageBtn.textContent = "Hide Emergency Events";
        sidebarEmergencyManageBtn.disabled = false;
        sidebarEmergencyManageBtn.classList.add("active");
      }

      // Fly to the first event if there is one
      if (eventData.length > 0) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            eventData[0].longitude,
            eventData[0].latitude - 0.025,
            2500 // Height in meters
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0,
          },
          duration: 2,
        });
      }
    } catch (error) {
      console.error("Error in fetchEmergencyEvents:", error);
      alert(`Error loading emergency events: ${error.message}`);

      // Reset button state on error
      if (sidebarEmergencyManageBtn) {
        sidebarEmergencyManageBtn.textContent = "Emergency Management";
        sidebarEmergencyManageBtn.disabled = false;
        sidebarEmergencyManageBtn.classList.remove("active");
      }
    }
  }

  // Clear emergency event entities from the map
  function clearEmergencyEvents() {
    // remove entities
    emEventEntities.forEach((entity) => {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    });
    emEventEntities = [];

    // Remove point primitives collection
    if (window.emPointPrimitives) {
      viewer.scene.primitives.remove(window.emPointPrimitives);
      window.emPointPrimitives = null;
    }
  }

  // Toggle emergency events visibility
  function toggleEmergencyEvents() {
    if (emEventsVisible) {
      // Hide events
      if (window.emPointPrimitives) {
        window.emPointPrimitives.show = false;
      }
      emEventsVisible = false;
      return false;
    } else {
      // Check if we already have events loaded
      if (window.emPointPrimitives) {
        window.emPointPrimitives.show = true;
        emEventsVisible = true;
        return true;
      } else {
        // Need to fetch events first
        fetchEmergencyEvents();
        return true;
      }
    }
  }

  // --- Sidebar and Hamburger Logic ---
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  const sidebarEmergencyManageBtn = document.getElementById(
    "sidebarEmergencyManageBtn"
  );
  const sidebarTrafficBtn = document.getElementById("sidebarTrafficBtn");
  const appFlexContainer = document.getElementById("appFlexContainer");
  const maximizeMapBtn = document.getElementById("maximizeMapBtn");

  let maximized = true;
  appFlexContainer.classList.add("maximized");
  sidebar.classList.remove("open");
  hamburgerBtn.style.display = "flex";
  sidebarRestoreBtn.style.display = "none";

  hamburgerBtn.onclick = function () {
    sidebar.classList.add("open");
    appFlexContainer.classList.remove("maximized");
    hamburgerBtn.style.display = "none";
    sidebarRestoreBtn.style.display = "none";
    maximized = false;
  };

  sidebarCloseBtn.onclick = function () {
    sidebar.classList.remove("open");
    hamburgerBtn.style.display = "flex";
    sidebarRestoreBtn.style.display = "none";
    appFlexContainer.classList.add("maximized");
    maximized = true;
  };

  sidebarRestoreBtn.onclick = function () {
    sidebar.classList.add("open");
    appFlexContainer.classList.remove("maximized");
    hamburgerBtn.style.display = "none";
    sidebarRestoreBtn.style.display = "none";
    maximized = false;
  };

  sidebarTrafficBtn.onclick = async function () {
    if (trafficLayer) {
      removeTrafficLayer();
      await addTileset();
      sidebarTrafficBtn.classList.remove("active");
      sidebarTrafficBtn.textContent = "Show Live Traffic";
      stopTrafficAnimation();
      hideTrafficLegend();
    } else {
      removeTileset();
      setBaseLayerToBing();
      addTrafficLayer();
      sidebarTrafficBtn.classList.add("active");
      sidebarTrafficBtn.textContent = "Hide Live Traffic";
      startTrafficAnimation();
      showTrafficLegend();
    }
  };

  const sidebarTilesetBtn = document.getElementById("sidebarTilesetBtn");
  sidebarTilesetBtn.onclick = async function () {
    if (tileset && viewer.scene.primitives.contains(tileset)) {
      removeTileset();
      sidebarTilesetBtn.classList.remove("active");
    } else {
      await addTileset();
      sidebarTilesetBtn.classList.add("active");
    }
  };

  // Emergency management button click handler
  if (sidebarEmergencyManageBtn) {
    sidebarEmergencyManageBtn.onclick = function () {
      if (sidebarEmergencyManageBtn) {
        sidebarEmergencyManageBtn.disabled = true;
      }

      const isVisible = toggleEmergencyEvents();

      // Update button text based on visibility state
      if (sidebarEmergencyManageBtn) {
        if (isVisible) {
          sidebarEmergencyManageBtn.textContent = "Hide Emergency Events";
          sidebarEmergencyManageBtn.classList.add("active");
        } else {
          sidebarEmergencyManageBtn.textContent = "Show Emergency Events";
          sidebarEmergencyManageBtn.classList.remove("active");
        }
        sidebarEmergencyManageBtn.disabled = false;
      }
    };
  }

  sidebar.classList.remove("open");
  hamburgerBtn.style.display = "flex";
  sidebarRestoreBtn.style.display = "none";
  sidebarTrafficBtn.classList.remove("active");
  sidebarTrafficBtn.textContent = "Show Live Traffic";
  sidebarTilesetBtn.classList.remove("active");

  if (viewer.baseLayerPickerViewModel) {
    viewer.baseLayerPickerViewModel.selectedImageryChanged.addEventListener(
      function () {
        if (tileset && viewer.scene.primitives.contains(tileset)) {
          removeTileset();
          sidebarTilesetBtn.classList.remove("active");
        }
      }
    );
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  const infoPanel = document.getElementById("infoPanel");
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    console.log("Picked:", picked);
    if (
      Cesium.defined(picked) &&
      picked.id &&
      picked.id.properties &&
      Cesium.defined(picked.id.properties.index)
    ) {
      const index = picked.id.properties.index.getValue();
      console.log("Picked index:", index);
      const data = csvData[index];
      console.log("Picked data:", data);
      if (data) {
        infoPanel.innerHTML = `
            <button id="closeInfoPanel" class="close-btn">&times;</button>
            <div style="display: flex; align-items: flex-start;">
              <div style="flex: 1; min-width: 0;">
                <h3>Meta Data</h3>
                <!-- <p><strong>Class:</strong> ${data.class}</p> -->
                <p><strong>Date:</strong> ${data.date}</p>
                <p><strong>Time:</strong> ${data.time}</p>
                <p><strong>Location:</strong><br>
                   Lat: ${data.lat.toFixed(6)}<br>
                   Lon: ${data.lon.toFixed(6)}<br>
                   Alt: ${data.alt.toFixed(2)}m</p>
              </div>
              ${ // show image and segmented image if available
                data.image
                  ? `<div style="margin-left: 32px; margin-top: 24px;"><img src="data/Camera/${data.image}" alt="Point Image" style="max-width:300px; max-height:200px; border-radius:4px;"></div><div style="margin-left: 32px; margin-top: 24px;"><img src="data/segmented_camera/${data.image}.png" alt="Segmented Point Image" style="max-width:300px; max-height:200px; border-radius:4px;"></div>`
                  : ""
              }
            </div>
          `;
        infoPanel.style.display = "block";
        document.getElementById("closeInfoPanel").onclick = () => {
          infoPanel.style.display = "none";
        };
      }
    } else {
      infoPanel.style.display = "none";
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  const sidebarAqiBtn = document.getElementById("sidebarAqiBtn");
  const aqiList = document.getElementById("aqiList");
  let aqiPanelOpen = false;

  sidebarAqiBtn.onclick = async function () {
    aqiPanelOpen = !aqiPanelOpen;
    if (aqiPanelOpen) {
      aqiList.style.display = "block";
      sidebarAqiBtn.classList.add("active");
      sidebarAqiBtn.textContent = "Hide Air Quality";
      sidebarAqiBtn.textContent = "Loading...";
      aqiList.innerHTML = "";
      const center = getCameraCenter(viewer);
      const zipCode = await getZipCodeFromLatLon(center.lat, center.lon);
      if (!zipCode) {
        aqiList.innerHTML =
          '<li style="color:#e53935;">Unable to determine zip code for this area.</li>';
        sidebarAqiBtn.textContent = "Hide Air Quality";
        return;
      }
      // Use relative path for the consolidated endpoint
      const response = await fetch(`/airnow?zip=${zipCode}`);
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const stationsByArea = {};
        data.forEach((station) => {
          const key = `${station.ReportingArea}-${station.StateCode}`;
          if (!stationsByArea[key] || station.AQI > stationsByArea[key].AQI) {
            stationsByArea[key] = station;
          }
        });
        const sortedStations = Object.values(stationsByArea).sort(
          (a, b) => b.AQI - a.AQI
        );
        aqiList.innerHTML = sortedStations
          .map((station) => {
            const category = station.Category
              ? station.Category.Name
              : "Unknown";
            const categoryClass = category.toLowerCase().replace(/\s+/g, "-");
            return `
              <li class="aqi-station">
                <div class="aqi-station-header">
                  <div class="aqi-station-name">${
                    station.ReportingArea || "Unknown Location"
                  }</div>
                  <div class="aqi-station-state">${
                    station.StateCode || ""
                  }</div>
                </div>
                <div class="aqi-station-details">
                  <span class="aqi-station-label">Parameter:</span>
                  <span class="aqi-station-value">${
                    station.ParameterName || "N/A"
                  }</span>
                  <span class="aqi-station-label">AQI Value:</span>
                  <span class="aqi-station-value">${station.AQI || "N/A"}</span>
                  <span class="aqi-station-label">Category:</span>
                  <span class="aqi-station-value">
                    <span class="aqi-category aqi-category-${categoryClass}">${category}</span>
                  </span>
                  <span class="aqi-station-label">Last Updated:</span>
                  <span class="aqi-station-value">${new Date(
                    station.DateObserved + "T" + station.HourObserved + ":00"
                  ).toLocaleString()}</span>
                </div>
              </li>
            `;
          })
          .join("");
      } else {
        aqiList.innerHTML =
          '<li style="color:#e53935;">No AQI data found for this zip code.</li>';
      }
    } else {
      aqiList.style.display = "none";
      aqiList.innerHTML = "";
      sidebarAqiBtn.classList.remove("active");
      sidebarAqiBtn.textContent = "Show Air Quality";
    }
  };

  const sidebarWeatherBtn = document.getElementById("sidebarWeatherBtn");
  const weatherDropdown = document.getElementById("weatherDropdown");
  const weatherPanelSidebar = document.getElementById("weatherPanelSidebar");
  let weatherDropdownOpen = false;

  sidebarWeatherBtn.onclick = async function () {
    weatherDropdownOpen = !weatherDropdownOpen;
    if (weatherDropdownOpen) {
      weatherDropdown.style.display = "block";
      sidebarWeatherBtn.classList.add("active");
      sidebarWeatherBtn.textContent = "Hide Weather";
      const center = getCameraCenter(viewer);
      await updateWeatherPanel(center.lat, center.lon, true);
    } else {
      weatherDropdown.style.display = "none";
      weatherPanelSidebar.innerHTML = "Loading weather...";
      sidebarWeatherBtn.classList.remove("active");
      sidebarWeatherBtn.textContent = "Show Weather";
    }
  };

  async function updateWeatherPanel(lat, lon, sidebarMode = false) {
    const apiKey = "667758377b3d240c37f2328bc7e02743";
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const panel = sidebarMode
        ? weatherPanelSidebar
        : document.getElementById("weatherPanel");
      if (data && data.weather && data.weather.length > 0) {
        const icon = data.weather[0].icon;
        const desc = data.weather[0].description;
        const temp = data.main.temp;
        const feelsLike = data.main.feels_like;
        const wind = data.wind.speed;
        const windDeg = data.wind.deg;
        const clouds = data.clouds ? data.clouds.all : null;
        const humidity = data.main.humidity;
        const sunrise = data.sys.sunrise
          ? new Date(data.sys.sunrise * 1000).toLocaleTimeString()
          : null;
        const sunset = data.sys.sunset
          ? new Date(data.sys.sunset * 1000).toLocaleTimeString()
          : null;
        panel.innerHTML = `
            <ul style="padding:0;list-style:none;margin:0;">
              <li class="aqi-station">
                <div style="display:flex;align-items:center;gap:12px;">
                  <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="Weather icon">
                  <div>
                    <div style='font-weight:bold; font-size:16px; margin-bottom:2px; color:#1976d2;'>${
                      desc.charAt(0).toUpperCase() + desc.slice(1)
                    }</div>
                    <div><strong>Temp:</strong> ${temp}&deg;C</div>
                    <div><strong>Feels like:</strong> ${feelsLike}&deg;C</div>
                    <div><strong>Wind:</strong> ${wind} m/s (${windDeg}&deg;)</div>
                    <div><strong>Cloudiness:</strong> ${
                      clouds !== null ? clouds + "%" : "N/A"
                    }</div>
                    <div><strong>Humidity:</strong> ${humidity}%</div>
                    <div><strong>Sunrise:</strong> ${sunrise || "N/A"}</div>
                    <div><strong>Sunset:</strong> ${sunset || "N/A"}</div>
                  </div>
                </div>
              </li>
            </ul>
          `;
      } else {
        panel.innerHTML = `
            <ul style="padding:0;list-style:none;margin:0;">
              <li class="aqi-station">Weather data unavailable</li>
            </ul>
          `;
      }
    } catch (e) {
      const panel = sidebarMode
        ? weatherPanelSidebar
        : document.getElementById("weatherPanel");

      if (panel) {
        panel.innerHTML = `
          <ul style="padding:0;list-style:none;margin:0;">
            <li class="aqi-station">Weather error</li>
          </ul>
        `;
      } else {
        console.log("Weather panel element not found");
      }
    }
  }

  function getCameraCenter(viewer) {
    const scene = viewer.scene;
    const camera = scene.camera;
    const ray = camera.getPickRay(
      new Cesium.Cartesian2(scene.canvas.width / 2, scene.canvas.height / 2)
    );
    const globe = scene.globe;
    const intersection = globe.pick(ray, scene);
    if (intersection) {
      const cartographic = Cesium.Cartographic.fromCartesian(intersection);
      return {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lon: Cesium.Math.toDegrees(cartographic.longitude),
      };
    }
    const carto = Cesium.Cartographic.fromCartesian(camera.positionWC);
    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
    };
  }

  let weatherTimeout;
  function updateWeatherOnMove() {
    if (weatherTimeout) clearTimeout(weatherTimeout);
    weatherTimeout = setTimeout(() => {
      const center = getCameraCenter(viewer);
      if (weatherDropdownOpen) {
        updateWeatherPanel(center.lat, center.lon, true);
      }
    }, 500);
  }
  viewer.camera.moveEnd.addEventListener(updateWeatherOnMove);

  const initialCenter = getCameraCenter(viewer);
  updateWeatherPanel(initialCenter.lat, initialCenter.lon);

  function setBaseLayerToBing() {
    let bingProvider = null;
    if (viewer.baseLayerPicker && viewer.baseLayerPicker.viewModel) {
      bingProvider =
        viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find(
          (vm) =>
            vm.name === "Bing Maps Aerial" || vm.name === "Bing Maps Roads"
        );
      if (bingProvider) {
        viewer.baseLayerPicker.viewModel.selectedImagery = bingProvider;
      }
    }
  }

  function removeTileset() {
    if (tileset && viewer.scene.primitives.contains(tileset)) {
      viewer.scene.primitives.remove(tileset);
      tileset.destroy && tileset.destroy();
      tileset = null;
    }
  }
  async function addTileset() {
    if (!tileset) {
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
        GOOGLE_3D_TILESET_ASSET_ID
      );
      viewer.scene.primitives.add(tileset);
    } else if (!viewer.scene.primitives.contains(tileset)) {
      viewer.scene.primitives.add(tileset);
    }
  }

  maximizeMapBtn.onclick = function () {
    appFlexContainer.classList.add("maximized");
    sidebar.classList.remove("open");
    hamburgerBtn.style.display = "flex";
    sidebarRestoreBtn.style.display = "none";
    maximized = true;
    setTimeout(() => viewer.resize(), 350);
  };

  const observer = new MutationObserver(() => {
    setTimeout(() => viewer.resize(), 350);
  });
  observer.observe(sidebar, { attributes: true, attributeFilter: ["class"] });

  // Helper: Get zip code from lat/lon using Nominatim
  async function getZipCodeFromLatLon(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return data.address?.postcode
        ? data.address.postcode
        : null;
    } catch (e) {
      return null;
    }
  }

  // Inject message into Cesium base layer picker dropdown
  setTimeout(() => {
    const baseLayerPickerDropdown = document.querySelector(
      ".cesium-baseLayerPicker-dropDown, .cesium-baseLayerPicker-dropDown-visible"
    );
    if (
      baseLayerPickerDropdown &&
      !document.getElementById("tileset-warning-message")
    ) {
      const msg = document.createElement("div");
      msg.id = "tileset-warning-message";
      msg.style.cssText =
        "background:#fff3cd;color:#856404;border:1px solid #ffeeba;border-radius:4px;font-size:14px;padding:10px 14px;margin-bottom:12px;";
      msg.innerHTML =
        "<strong>Note:</strong> To apply filters, please turn off the 3D tileset.";
      baseLayerPickerDropdown.insertBefore(
        msg,
        baseLayerPickerDropdown.firstChild
      );
    }
  }, 1200);

  // Show image below the info box
  window.showImageBelowDialog = function (url) {
    // remove any existing image popup
    const oldPopup = document.getElementById("inlineImagePopup");
    if (oldPopup) oldPopup.remove();

    // Create new popup
    const popup = document.createElement("div");
    popup.id = "inlineImagePopup";
    popup.className = "inline-image-popup";
    popup.innerHTML = `
        <span class="inline-image-close" onclick="this.parentElement.remove()">&times;</span>
        <img src="${url}" alt="Camera Image" style="max-width:320px;max-height:220px;display:block;margin:8px auto 0 auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" />
      `;

    // Insert below the camera info box
    const infoBox = document.getElementById("cameraInfoContainer");
    if (infoBox) {
      infoBox.appendChild(popup);
    }
  };

  // Show video below the info box
  window.showVideoBelowDialog = function (url) {
    // remove any existing video popup
    const oldPopup = document.getElementById("inlineVideoPopup");
    if (oldPopup) {
      // Dispose of any existing Video.js player to prevent memory leaks
      const existingPlayer = videojs.getPlayer("hlsVideoPlayer");
      if (existingPlayer) {
        existingPlayer.dispose();
      }
      oldPopup.remove();
    }

    // Create new popup
    const popup = document.createElement("div");
    popup.id = "inlineVideoPopup";
    popup.className = "inline-video-popup";

    // create close button
    const closeBtn = document.createElement("span");
    closeBtn.className = "inline-video-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.onclick = function () {
      // Dispose of Video.js player when closing
      const player = videojs.getPlayer("hlsVideoPlayer");
      if (player) {
        player.dispose();
      }
      popup.remove();
    };
    popup.appendChild(closeBtn);

    // Create video container with Video.js
    const videoContainer = document.createElement("div");
    videoContainer.style.margin = "8px auto 0 auto";

    // Create video element with Video.js classes
    const videoEl = document.createElement("video");
    videoEl.id = "hlsVideoPlayer";
    videoEl.className =
      "video-js vjs-default-skin vjs-big-play-button vjs-live";
    videoEl.controls = true;
    videoEl.preload = "auto";
    videoEl.style.maxWidth = "320px";
    videoEl.style.maxHeight = "220px";
    videoEl.style.borderRadius = "6px";
    videoEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    videoEl.style.background = "#000";

    // Create source element
    const sourceEl = document.createElement("source");
    sourceEl.src = url;
    sourceEl.type = "application/x-mpegURL"; // HLS MIME type
    videoEl.appendChild(sourceEl);

    // Add fallback text
    const fallbackText = document.createElement("p");
    fallbackText.className = "vjs-no-js";
    fallbackText.textContent =
      "To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video";
    videoEl.appendChild(fallbackText);

    videoContainer.appendChild(videoEl);
    popup.appendChild(videoContainer);

    // Insert below the camera info box
    const infoBox = document.getElementById("cameraInfoContainer");
    if (infoBox) {
      infoBox.appendChild(popup);

      // Initialize Video.js player with HLS support
      const player = videojs("hlsVideoPlayer", {
        autoplay: true,
        muted: true, // Required for autoplay in most browsers
        liveui: true, // Enable the enhanced live UI
        liveTracker: {
          trackingThreshold: 0,
          liveTolerance: 15,
        },
        html5: {
          vhs: {
            overrideNative: true,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      });

      // Make the LIVE button clickable and functional
      player.ready(function () {
        // Override the LiveButton click handler
        const liveButton = player.controlBar.getChild("liveButton");
        if (liveButton) {
          // Remove existing click handler and add our custom one
          liveButton.off("click");
          liveButton.on("click", function () {
            // Seek to live edge
            if (
              player.liveTracker &&
              typeof player.liveTracker.seekToLiveEdge === "function"
            ) {
              player.liveTracker.seekToLiveEdge();

              // Always resume playback after clicking LIVE button
              if (player.paused()) {
                player.play();
              }
            }
          });

          // Update the button visual state
          player.liveTracker.on("liveedgechange", function () {
            if (player.liveTracker.atLiveEdge()) {
              liveButton.addClass("vjs-live-edge");
            } else {
              liveButton.removeClass("vjs-live-edge");
            }
          });
        }

        // Force seeking to live edge on initial load
        player.on("loadedmetadata", function () {
          if (
            player.liveTracker &&
            typeof player.liveTracker.seekToLiveEdge === "function"
          ) {
            player.liveTracker.seekToLiveEdge();
          }
        });
      });

      // Handle errors
      player.on("error", function () {
        console.error("Video player error:", player.error());
      });
    }
  };

  // --- Fullscreen Image Modal Logic ---
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImg");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  let isPanning = false;
  let startX, startY, transformX = 0, transformY = 0, scale = 1;

  function resetModalTransform() {
    scale = 1;
    transformX = 0;
    transformY = 0;
    modalImg.style.transform = `translate(${transformX}px, ${transformY}px) scale(${scale})`;
  }

  window.openFullscreenImage = function (imageElement) {
    if (modal && modalImg && imageElement) {
      const src = imageElement.src; // Get the CURRENT src, which might be a blob URL
      resetModalTransform();
      modal.style.display = "block";
      modalImg.src = src;
    }
  };

  function closeModal() {
    if (modal) {
      modal.style.display = "none";
      modalImg.src = "";
      resetModalTransform();
    }
  }

  if (modalCloseBtn) {
    modalCloseBtn.onclick = closeModal;
  }

  if (modal) {
    modal.onclick = function (event) {
      // Close if clicking on the background, not the image itself
      if (event.target === modal || event.target.id === 'modalImageWrapper') {
        closeModal();
      }
    };

    modalImg.addEventListener('mousedown', (e) => {
      // Only allow panning if the image is zoomed in.
      if (scale <= 1) {
        modalImg.style.cursor = 'grab'; // Show grab cursor but don't pan
        return;
      }
      e.preventDefault();
      isPanning = true;
      startX = e.clientX - transformX;
      startY = e.clientY - transformY;
      modalImg.classList.add('panning');
      modalImg.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      modalImg.classList.remove('panning');
      modalImg.style.cursor = scale > 1 ? 'grab' : 'default';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning || scale <= 1) return;
      e.preventDefault();

      let newTransformX = e.clientX - startX;
      let newTransformY = e.clientY - startY;

      // Calculate the boundaries
      const rect = modalImg.getBoundingClientRect();
      const containerRect = modal.getBoundingClientRect();

      const maxX = Math.max(0, (rect.width - containerRect.width) / 2);
      const maxY = Math.max(0, (rect.height - containerRect.height) / 2);

      // Clamp the translation to the calculated boundaries
      transformX = Math.max(-maxX, Math.min(maxX, newTransformX));
      transformY = Math.max(-maxY, Math.min(maxY, newTransformY));

      modalImg.style.transform = `translate(${transformX}px, ${transformY}px) scale(${scale})`;
    });

    modal.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scaleAmount = 0.1;
      const oldScale = scale;

      if (e.deltaY < 0) {
        // Zoom in
        scale += scaleAmount;
      } else {
        // Zoom out
        scale = Math.max(0.1, scale - scaleAmount);
      }
      
      // Update cursor based on new scale
      modalImg.style.cursor = scale > 1 ? 'grab' : 'default';


      // Get mouse position relative to the viewport
      const rect = modalImg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Adjust translation to keep the point under the mouse stationary
      transformX = transformX - (mouseX / oldScale) * (scale - oldScale);
      transformY = transformY - (mouseY / oldScale) * (scale - oldScale);

      // If zoomed out completely, reset the pan
      if (scale <= 1) {
          transformX = 0;
          transformY = 0;
          scale = 1; // Ensure scale is exactly 1
      } else {
        // After zooming, re-clamp the position to stay within bounds
        const newImageWidth = modalImg.naturalWidth * scale;
        const newImageHeight = modalImg.naturalHeight * scale;
        const containerRect = modal.getBoundingClientRect();

        const maxX = Math.max(0, (newImageWidth - containerRect.width) / 2);
        const maxY = Math.max(0, (newImageHeight - containerRect.height) / 2);

        transformX = Math.max(-maxX, Math.min(maxX, transformX));
        transformY = Math.max(-maxY, Math.min(maxY, transformY));
      }

      modalImg.style.transform = `translate(${transformX}px, ${transformY}px) scale(${scale})`;
    });
  }

  function setupModalClose() {
    // This function is now partially handled by the new modal logic above,
    // but we can keep it for safety or remove it if fully redundant.
    // For now, let's ensure it doesn't conflict.
    const legacyCloseBtn = document.getElementById("modalCloseBtn");
    if (legacyCloseBtn) {
      legacyCloseBtn.onclick = function (e) {
        e.stopPropagation();
        closeModal();
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupModalClose);
  } else {
    setupModalClose();
  }

  // Camera interoperability (path toggle) button logic
  let mainPathEntity = null;
  const pathToggleBtn = document.getElementById("ucfInteropBtn");
  if (pathToggleBtn) {
    pathToggleBtn.onclick = function () {
      if (mainPathEntity && window.mainPathPoints) {
        const isVisible = mainPathEntity.show;
        mainPathEntity.show = !isVisible;
        window.mainPathPoints.forEach((pt) => (pt.show = !isVisible));
        this.classList.toggle("active", !isVisible);

        // Move the Cesium camera viewer to the first data point
        if (!isVisible) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              -81.2016141073140628,
              28.5812889447392,
              2500
            ),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-60),
              roll: 0.0,
            },
            duration: 2,
          });
        }

        // Always show 'Camera Interoperability' as button text
        this.textContent = !isVisible
          ? "Hide Camera Interoperability Data"
          : "Camera Interoperability";
      }
    };
  }

  // Sidebar dropdown logic
  const dropdownHeaders = document.querySelectorAll(".dropdown-header");
  dropdownHeaders.forEach((header) => {
    header.addEventListener("click", function () {
      const parent = this.parentElement;
      const isOpen = parent.classList.contains("open");
      // Close all dropdowns
      document
        .querySelectorAll(".sidebar-section.dropdown")
        .forEach((sec) => sec.classList.remove("open"));
      // Open this one if it was not already open
      if (!isOpen) parent.classList.add("open");
    });
  });

  let trafficViewLayer = null;
  const trafficViewApiKey = "2186cbcdd16f4d6796708a4be6c969b8";
  const trafficViewBtn = document.getElementById("trafficViewBtn");
  if (trafficViewBtn) {
    trafficViewBtn.onclick = function () {
      // Remove TomTom traffic layer if present
      if (trafficLayer) {
        removeTrafficLayer();
        sidebarTrafficBtn.classList.remove("active");
        sidebarTrafficBtn.textContent = "Show Live Traffic";
        hideTrafficLegend();
        stopTrafficAnimation();
      }
      // Toggle Traffic View layer
      if (trafficViewLayer) {
        viewer.imageryLayers.remove(trafficViewLayer, false);
        trafficViewLayer = null;
        this.classList.remove("active");
        this.textContent = "Traffic View";
      } else {
        // Example: using MapTiler Traffic tiles
        trafficViewLayer = viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: `https://api.maptiler.com/tiles/traffic/{z}/{x}/{y}.png?key=${trafficViewApiKey}`,
            credit: "Traffic data © MapTiler",
            maximumLevel: 20,
          }),
          viewer.imageryLayers.length
        );
        this.classList.add("active");
        this.textContent = "Hide Traffic View";
      }
    };
  }

  // --- FDOT Traffic Cameras Integration ---
  let fdotCameraEntities = [];
  let fdotCamerasVisible = false;
  const fdotBtn = document.getElementById("fdotTrafficBtn");
  if (fdotBtn) {
    fdotBtn.onclick = async function () {
      if (fdotCamerasVisible) {
        // Hide and remove all FDOT camera entities
        fdotCameraEntities.forEach((e) => viewer.entities.remove(e));
        fdotCameraEntities = [];
        fdotCamerasVisible = false;
        this.classList.remove("active");
        this.textContent = "FDOT Traffic Cameras";
      } else {
        this.textContent = "Loading...";
        // Use relative path for the consolidated endpoint
        const response = await fetch("/fdot-cameras");
        const data = await response.json();
        const devices = data.deviceData.devices;
        window.fdotDevices = devices;
        fdotCameraEntities = devices
          .filter((device) => device["device-status"] === "on")
          .map((device) => {
            const lat = device.location.center.Point.pos.lat;
            const lon = device.location.center.Point.pos.lon;
            const imageUrl = device["cctv-info"].urls.find(
              (u) => u.type === "image"
            ).url;
            const desc = device.location.description;
            return viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat),
              point: {
                pixelSize: 8,
                color: Cesium.Color.LIME,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
              },
              properties: { description: desc, imageUrl: imageUrl },
            });
          });
        fdotCamerasVisible = true;
        this.classList.add("active");
        this.textContent = "Hide FDOT Cameras";
      }
    };
    // Click handler for FDOT camera points
    const fdotHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    fdotHandler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (
        Cesium.defined(picked) &&
        picked.id &&
        fdotCameraEntities.includes(picked.id)
      ) {
        const props = picked.id.properties;
        // Extract additional info from the original device object
        const device =
          window.fdotDevices &&
          window.fdotDevices.find(
            (d) =>
              d.location &&
              d.location.description === props.description.getValue()
          );
        let road = "",
          county = "",
          status = "",
          lastUpdate = "",
          lat = "",
          lon = "",
          videoUrl = "";
        if (device) {
          road =
            device.pointLocation &&
            device.pointLocation.onAddress &&
            device.pointLocation.onAddress.road &&
            device.pointLocation.onAddress.road.name
              ? device.pointLocation.onAddress.road.name
              : "";
          county =
            device.pointLocation &&
            device.pointLocation.onAddress &&
            device.pointLocation.onAddress.countyFull
              ? device.pointLocation.onAddress.countyFull
              : "";
          status = device["device-status"] || "";
          lastUpdate =
            device["cctv-info"] && device["cctv-info"].lastUpdate
              ? device["cctv-info"].lastUpdate
              : "";
          lat =
            device.location &&
            device.location.center &&
            device.location.center.Point &&
            device.location.center.Point.pos.lat;
          lon =
            device.location &&
            device.location.center &&
            device.location.center.Point &&
            device.location.center.Point.pos.lon;
          const v =
            device["cctv-info"] && device["cctv-info"].urls
              ? device["cctv-info"].urls.find((u) => u.type === "rtmp")
              : null;
          videoUrl = v ? v.url : "";
        }
        infoPanel.innerHTML = `
            <button id=\"closeInfoPanel\" class=\"close-btn\">&times;</button>
            <div style=\"display: flex; align-items: flex-start;\">
              <div style=\"flex: 1; min-width: 0;\">
                <h3>FDOT Traffic Camera</h3>
                <p><strong>Description:</strong> ${props.description.getValue()}</p>
                <p><strong>Status:</strong> ${status}</p>
                <p><strong>Last Update:</strong> ${lastUpdate}</p>
                <p><strong>Coordinates:</strong> ${lat}, ${lon}</p>
              </div>
              <div style=\"margin-left: 32px; margin-top: 24px;\">
                <img src=\"${props.imageUrl.getValue()}\" alt=\"Camera Image\" style=\"max-width:300px; max-height:200px; border-radius:4px;\">
              </div>
            </div>
          `;
        infoPanel.style.display = "block";
        document.getElementById("closeInfoPanel").onclick = () => {
          infoPanel.style.display = "none";
        };
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  // --- Bounding Box Functions ---
  const bbCreateBtn = document.getElementById('bbCreateBtn');
  const bbCreateOptions = document.getElementById('bbCreateOptions');
  const bbCreateBoxBtn = document.getElementById('bbCreateBoxBtn');
  const bbDrawShapeBtn = document.getElementById('bbDrawShapeBtn');
  const bbSelectBoundaryBtn = document.getElementById('bbSelectBoundaryBtn');
  const bbBoundaryDialog = document.getElementById('bbBoundaryDialog');
  const bbBoundaryOverlay = document.getElementById('bbBoundaryOverlay');
  const bbBoundaryCloseBtn = document.getElementById('bbBoundaryCloseBtn');
  const bbBoundarySearch = document.getElementById('bbBoundarySearch');
  const bbBoundaryList = document.getElementById('bbBoundaryList');
  const bbEditBtn = document.getElementById('bbEditBtn');
  const bbActivateBtn = document.getElementById('bbActivateBtn');
  const bbDeleteBtn = document.getElementById('bbDeleteBtn');
  const boundingBoxUI = document.getElementById('boundingBoxUI');
  const bbTitle = document.querySelector('.bounding-box-text');
  const bbDescription = document.querySelector('.bounding-box-description');

  // --- Bounding Box Stats Elements ---
  const bbStatsBtn = document.getElementById('bbStatsBtn');
  const bbStatsPopup = document.getElementById('bbStatsPopup');
  const bbStatsCloseBtn = document.getElementById('bbStatsCloseBtn');
  const bbStatsArea = document.getElementById('bb-stats-area');
  const bbStatsPerimeter = document.getElementById('bb-stats-perimeter');
  const bbStatsCenter = document.getElementById('bb-stats-center');
  const copyAreaBtn = document.getElementById('copy-area-btn');
  const copyPerimeterBtn = document.getElementById('copy-perimeter-btn');
  const copyCenterBtn = document.getElementById('copy-center-btn');
  // --- Bounding Box Filter Dialog Elements ---
  const bbFilterDialog = document.getElementById('bbFilterDialog');
  const bbFilterToggleBtn = document.getElementById('bbFilterToggleBtn');
  let wasFilterDialogMaximized = true; // To remember the state before editing
  const filterState = {};

  // Colors for different states
  const colorCreating = Cesium.Color.YELLOW.withAlpha(0.5);
  const colorInactive = new Cesium.Color(0.8, 0.2, 0.2, 0.3); // Dark pleasant red
  const colorActive = Cesium.Color.CYAN.withAlpha(0.3);

  function updateBoundingBoxUI(newState) {
    boundingBoxState = newState;

    // Reset all buttons to a default state
    bbCreateBtn.textContent = 'Create';
    bbTitle.textContent = 'Bounding Box';
    bbDescription.textContent = 'Draw and manage analysis areas on the map.';
    boundingBoxUI.className = 'bounding-box-ui'; // Reset class

    bbCreateBtn.disabled = false;
    bbCreateOptions.classList.add('hidden'); // Hide options by default
    bbEditBtn.disabled = true;
    bbActivateBtn.disabled = true;
    bbDeleteBtn.disabled = true;
    bbStatsBtn.classList.add('hidden');

    // Reset title attribute for activate button
    bbActivateBtn.removeAttribute('title');


    switch (boundingBoxState) {
      case 'initial':
        boundingBoxUI.classList.add('state-initial');
        bbEditBtn.disabled = true;
        break;
      case 'creating-box':
        bbCreateBtn.textContent = 'Cancel';
        bbCreateBtn.disabled = false;
        bbTitle.textContent = 'Drawing Bounding Box...';
        bbDescription.textContent = 'Click and drag to draw. Right-click or press Esc to cancel.';
        boundingBoxUI.classList.add('state-creating');
        break;
      case 'drawing-shape':
        bbCreateBtn.textContent = 'Cancel';
        bbCreateBtn.disabled = false;
        bbTitle.textContent = 'Drawing Shape...';
        bbDescription.textContent = 'Click and drag to draw. Right-click or press Esc to cancel.';
        boundingBoxUI.classList.add('state-creating');
        break;
      case 'active':
        bbCreateBtn.disabled = true;
        bbEditBtn.disabled = false;
        bbActivateBtn.disabled = false;
        bbDeleteBtn.disabled = false;
        bbStatsBtn.classList.remove('hidden');

        // Check if any filter is selected
        const anyFilterSelected = Object.values(filterState).some(v => v);
        if (!anyFilterSelected) {
          bbActivateBtn.disabled = true;
          bbActivateBtn.title = 'Enable one or more filters to query';
        }

        if (isBoundingBoxActivated) {
          // If it's a polygon, editing is not allowed.
          if (currentBoundingBox && currentBoundingBox.polygon) {
            bbEditBtn.disabled = true;
            bbEditBtn.title = 'Editing is not supported for drawn shapes.';
          }
          bbActivateBtn.textContent = 'Deactivate';
          bbTitle.textContent = 'Bounding Box Active';
          bbDescription.textContent = 'Box is active. Filtering or analysis can be performed.';
          boundingBoxUI.classList.add('state-active');
        } else {
          bbActivateBtn.textContent = 'Activate';
          bbTitle.textContent = 'Bounding Box Set';
          bbDescription.textContent = 'Box is ready. You can now edit, activate, or delete it.';
          // If it's a polygon, editing is not allowed.
          if (currentBoundingBox && currentBoundingBox.polygon) {
            bbEditBtn.disabled = true;
            bbEditBtn.title = 'Editing is not supported for drawn shapes.';
          }
          boundingBoxUI.classList.add('state-inactive');
        }
        break;
      case 'editing':
        bbCreateBtn.textContent = 'Save';
        bbCreateBtn.disabled = false;
        bbEditBtn.textContent = 'Cancel';
        bbEditBtn.disabled = false;
        bbTitle.textContent = 'Editing Bounding Box';
        bbDescription.textContent = 'Adjust the corners of the box. Click Save when done.';
        boundingBoxUI.classList.add('state-creating'); // Use same color as creating
        bbEditBtn.disabled = false;
        bbActivateBtn.disabled = true;
        bbDeleteBtn.disabled = true;
        break;
    }
  }

  bbCreateBtn.onclick = () => {
    if (boundingBoxState === 'initial') {
      bbCreateOptions.classList.toggle('hidden');
    } else if (['creating-box', 'drawing-shape'].includes(boundingBoxState)) {
      handleCancelBoundingBox();
    } else if (boundingBoxState === 'editing') {
      handleSaveBoundingBox();
    }
  };

  // Hide create options when clicking outside
  document.addEventListener('click', function(event) {
    if (!bbCreateBtn.contains(event.target) && !bbCreateOptions.contains(event.target)) {
      bbCreateOptions.classList.add('hidden');
    }
  });

  bbCreateBoxBtn.onclick = () => {
    handleCreateRectangle();
  };
  bbDrawShapeBtn.onclick = () => {
    handleDrawShape();
  };
  bbSelectBoundaryBtn.onclick = () => {
    handleSelectBoundary();
  };

  bbEditBtn.onclick = () => {
    if (boundingBoxState === 'active') handleEditBoundingBox();
    else if (boundingBoxState === 'editing') handleCancelEdit();
  };
  bbActivateBtn.onclick = handleActivateBoundingBox;
  bbDeleteBtn.onclick = handleDeleteBoundingBox;
  bbStatsBtn.onclick = () => {
    bbStatsPopup.classList.toggle('visible');
  };
  bbStatsCloseBtn.onclick = () => {
    bbStatsPopup.classList.remove('visible');
  };

  // --- Bounding Box Stats Copy Logic ---
  let currentStats = {}; // To hold the raw data for copying

  function copyToClipboard(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
      const icon = buttonElement.querySelector('i');
      const originalIconClass = icon.className;
      const originalTitle = buttonElement.title;

      // Provide visual feedback
      icon.className = 'fas fa-check'; // Change to checkmark
      buttonElement.title = 'Copied!';

      // Revert after a short delay
      setTimeout(() => {
        icon.className = originalIconClass;
        buttonElement.title = originalTitle;
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy to clipboard.');
    });
  }

  if (copyAreaBtn) {
    copyAreaBtn.onclick = (e) => {
      e.stopPropagation();
      const text = `${currentStats.areaKm2.toFixed(4)} km² / ${currentStats.areaMi2.toFixed(4)} mi²`;
      copyToClipboard(text, copyAreaBtn);
    };
  }
  if (copyPerimeterBtn) {
    copyPerimeterBtn.onclick = (e) => {
      e.stopPropagation();
      const text = `${currentStats.perimeterKm.toFixed(4)} km / ${currentStats.perimeterMi.toFixed(4)} mi`;
      copyToClipboard(text, copyPerimeterBtn);
    };
  }
  if (copyCenterBtn) {
    copyCenterBtn.onclick = (e) => {
      e.stopPropagation();
      const text = `${currentStats.lat.toFixed(6)}, ${currentStats.lon.toFixed(6)}`;
      copyToClipboard(text, copyCenterBtn);
    };
  }


  // Listener for the Escape key to cancel drawing
  const escapeKeyListener = (event) => {
    if (event.key === 'Escape') {
        handleCancelBoundingBox();
    }
  };

  function handleCreateRectangle() {
    updateBoundingBoxUI('creating-box');
    console.log('Starting bounding box creation...');
    viewer.canvas.style.cursor = 'crosshair';

    let startPosition = null;
    let isDrawing = false;

    boundingBoxHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    // Add keyboard listener for Escape key
    document.addEventListener('keydown', escapeKeyListener);

    // Handle mouse down: start drawing
    boundingBoxHandler.setInputAction(function (event) {
      isDrawing = true;
      viewer.scene.screenSpaceCameraController.enableInputs = false; // Disable map controls
      startPosition = viewer.scene.pickPosition(event.position);

      // If we can't pick a position, cancel drawing
      if (!Cesium.defined(startPosition)) {
        isDrawing = false;
        viewer.scene.screenSpaceCameraController.enableInputs = true;
        return;
      }

      // Create a temporary box for visual feedback
      if (tempBoundingBox) viewer.entities.remove(tempBoundingBox);
      
      tempBoundingBox = viewer.entities.add({
        rectangle: {
          // Use a callback property to update the rectangle dynamically
          coordinates: new Cesium.CallbackProperty(function() {
            if (isDrawing && Cesium.defined(startPosition) && Cesium.defined(mousePosition)) {
              return Cesium.Rectangle.fromCartesianArray([startPosition, mousePosition]);
            }
            // Return a minimal rectangle if not drawing
            return Cesium.Rectangle.fromCartesianArray([startPosition, startPosition]);
          }, false),
          material: colorCreating,
          height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
        }
      });
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    let mousePosition = null;
    // Handle mouse move: update the box size
    boundingBoxHandler.setInputAction(function (event) {
      if (isDrawing) viewer.scene.screenSpaceCameraController.enableInputs = false;
      mousePosition = viewer.scene.pickPosition(event.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Handle mouse up: finalize the box
    boundingBoxHandler.setInputAction(function (event) {
      if (!isDrawing || !startPosition || !mousePosition) {
        handleCancelBoundingBox();
        return;
      }
      
      isDrawing = false;
      viewer.scene.screenSpaceCameraController.enableInputs = true; // Re-enable map controls

      boundingBoxCoordinates = [startPosition, mousePosition];
      finalizeBoundingBox();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Right click cancels the drawing
    boundingBoxHandler.setInputAction(function () {
      handleCancelBoundingBox();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  function handleDrawShape() {
    updateBoundingBoxUI('drawing-shape');
    viewer.canvas.style.cursor = 'crosshair';

    let isDrawing = false;
    let positions = [];

    boundingBoxHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    document.addEventListener('keydown', escapeKeyListener);

    boundingBoxHandler.setInputAction(function (event) {
        isDrawing = true;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        const cartesian = viewer.scene.pickPosition(event.position);
        if (Cesium.defined(cartesian)) {
            positions.push(cartesian);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    boundingBoxHandler.setInputAction(function (event) {
        if (isDrawing) {
            const cartesian = viewer.scene.pickPosition(event.endPosition);
            if (Cesium.defined(cartesian)) {
                positions.push(cartesian);
                if (tempBoundingBox) {
                    // This is a bit of a hack to force update of the polyline
                    tempBoundingBox.polyline.positions = new Cesium.CallbackProperty(() => positions, false);
                } else {
                    tempBoundingBox = viewer.entities.add({
                        polyline: {
                            positions: new Cesium.CallbackProperty(() => positions, false),
                            width: 3,
                            material: colorCreating,
                            clampToGround: true
                        }
                    });
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    boundingBoxHandler.setInputAction(function () {
        if (!isDrawing || positions.length < 3) {
            handleCancelBoundingBox();
            return;
        }
        isDrawing = false;
        viewer.scene.screenSpaceCameraController.enableInputs = true;

        // Store the polygon hierarchy instead of raw coordinates
        boundingBoxCoordinates = new Cesium.PolygonHierarchy(positions);
        finalizeBoundingBox();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Right click cancels the drawing
    boundingBoxHandler.setInputAction(function () {
        handleCancelBoundingBox();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  function handleSelectBoundary() {
    bbBoundaryOverlay.classList.remove('hidden');
    bbBoundaryDialog.classList.remove('hidden');
    bbCreateOptions.classList.add('hidden');
    populateBoundaryList(); // Initial population

    // Focus the search input after a short delay to ensure it's visible and ready.
    setTimeout(() => {
      bbBoundarySearch.focus();
    }, 100);
  }

  bbBoundaryCloseBtn.onclick = () => {
    bbBoundaryOverlay.classList.add('hidden');
    bbBoundaryDialog.classList.add('hidden');
  };

  // --- Keyboard Navigation for Boundary Dialog ---
  function updateBoundaryHighlight(newItem) {
    const currentHighlighted = bbBoundaryList.querySelector('.keyboard-highlight');
    if (currentHighlighted) {
      currentHighlighted.classList.remove('keyboard-highlight');
    }
    if (newItem) {
      newItem.classList.add('keyboard-highlight');
      // Ensure the highlighted item is visible within the scrollable list
      newItem.scrollIntoView({ block: 'nearest' });
    }
  }

  bbBoundarySearch.addEventListener('keydown', (e) => {
    const items = bbBoundaryList.querySelectorAll('.bb-boundary-item');
    if (items.length === 0) return;

    const currentHighlighted = bbBoundaryList.querySelector('.keyboard-highlight');
    let currentIndex = -1;
    if (currentHighlighted) {
      currentIndex = Array.from(items).indexOf(currentHighlighted);
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      updateBoundaryHighlight(items[nextIndex]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      updateBoundaryHighlight(items[prevIndex]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentHighlighted) {
        currentHighlighted.click(); // Trigger the existing click handler
      }
    }
  });

  // Add a keydown listener to the dialog itself for the Escape key
  bbBoundaryDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      bbBoundaryCloseBtn.click();
    }
  });

  // When the dialog is opened, also listen for Escape on the document
  const originalHandleSelectBoundary = handleSelectBoundary;
  handleSelectBoundary = function() {
    originalHandleSelectBoundary();
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        bbBoundaryCloseBtn.click();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
    // Clean up listener when dialog closes
    const originalClose = bbBoundaryCloseBtn.onclick;
    bbBoundaryCloseBtn.onclick = () => {
      originalClose();
      document.removeEventListener('keydown', escapeHandler);
    };
  };

  bbBoundarySearch.oninput = (e) => {
    populateBoundaryList(e.target.value.toLowerCase());
  };

  async function fetchBoundaryData() {
    try {
      // Use publicly hosted GeoJSON files as a free API endpoint.
      const statesUrl = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
      const countiesUrl = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';

      const [statesRes, countiesRes] = await Promise.all([
        fetch(statesUrl),
        fetch(countiesUrl)
      ]);

      if (!statesRes.ok || !countiesRes.ok) {
        throw new Error('Failed to load boundary data from the public API.');
      }
      const statesJson = await statesRes.json();
      const countiesJson = await countiesRes.json();

      // Helper to get state name from FIPS code, as the county data uses FIPS.
      const stateFipsMap = new Map(statesJson.features.map(f => [f.id, f.properties.name]));

      // Adapt the county data to include STATE_NAME, which our app expects.
      countiesJson.features.forEach(feature => {
        const stateFips = feature.properties.STATE;
        feature.properties.STATE_NAME = stateFipsMap.get(stateFips) || 'Unknown';
      });

      // Sort Florida to the top
      usStatesData = statesJson.features.sort((a, b) => {
        if (a.properties.name === 'Florida') return -1;
        if (b.properties.name === 'Florida') return 1;
        return a.properties.name.localeCompare(b.properties.name);
      });

      // Separate Florida counties and sort them, then combine with other sorted counties
      const floridaCounties = countiesJson.features
        .filter(f => f.properties.STATE_NAME === 'Florida')
        .sort((a, b) => a.properties.NAME.localeCompare(b.properties.NAME));
      
      const otherCounties = countiesJson.features
        .filter(f => f.properties.STATE_NAME !== 'Florida')
        .sort((a, b) => a.properties.NAME.localeCompare(b.properties.NAME));

      usCountiesData = [...floridaCounties, ...otherCounties];

      console.log('Boundary data loaded successfully.');
    } catch (error) {
      console.error(error);
      bbBoundaryList.innerHTML = `<p style="color: #ff5252;">${error.message}</p>`;
    }
  }

  /**
   * A more robust CSV parser that handles quoted fields containing commas.
   * @param {string} str The CSV string to parse.
   * @returns {string[]} An array of column values.
   */
  function parseCsvRow(str) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  async function fetchSviData() {
    try {
      // The SVI data is in a CSV file. We need to fetch and parse it.
      const response = await fetch('/data/SVI_2022_US_county.csv');
      if (!response.ok) {
        throw new Error('Failed to load SVI data.');
      }
      const csvText = await response.text();
      const lines = csvText.split('\n').slice(1); // Skip header row

      lines.forEach(line => {
        const columns = parseCsvRow(line);
        // The FIPS code is in the 'FIPS' column (index 5).
        // The overall SVI percentile is in the 'RPL_THEMES' column (index 98).
        const fips = columns[5];
        const overallSvi = parseFloat(columns[98]);
  
        if (fips && !isNaN(overallSvi)) {
          // The FIPS code in the CSV might have leading zeros, but GeoJSON FIPS might not.
          // We'll store it as is, and handle comparisons carefully.
          sviData.set(fips, {
            overall: overallSvi
          });
        }
      });

      console.log(`SVI data loaded for ${sviData.size} counties.`);
    } catch (error) {
      console.error('Error fetching or parsing SVI data:', error);
      // You might want to disable the SVI filter if data loading fails.
    }
  }

  function populateBoundaryList(searchTerm = '') {
    if (usStatesData.length === 0) {
      bbBoundaryList.innerHTML = '<p>Loading boundaries...</p>';
      return;
    }

    const filteredStates = usStatesData.filter(f => f.properties.name.toLowerCase().includes(searchTerm));
    const filteredCounties = usCountiesData.filter(f => 
      f.properties.NAME.toLowerCase().includes(searchTerm) || 
      f.properties.STATE_NAME.toLowerCase().includes(searchTerm)
    );

    let html = '';

    if (filteredStates.length > 0) {
      html += '<h5 class="bb-boundary-category">States</h5>';
      html += filteredStates.map(feature => 
        `<button class="bb-boundary-item" data-type="state" data-name="${feature.properties.name}">
          ${feature.properties.name}
        </button>`
      ).join('');
    }

    if (filteredCounties.length > 0) {
      html += '<h5 class="bb-boundary-category">Counties</h5>';
      html += filteredCounties.map(feature => 
        `<button class="bb-boundary-item" data-type="county" data-name="${feature.properties.NAME}" data-state="${feature.properties.STATE_NAME}">
          ${feature.properties.NAME}, ${feature.properties.STATE_NAME}
        </button>`
      ).join('');
    }

    bbBoundaryList.innerHTML = html || '<p>No boundaries found.</p>';

    // Highlight the first item for keyboard navigation
    const firstItem = bbBoundaryList.querySelector('.bb-boundary-item');
    if (firstItem) {
      updateBoundaryHighlight(firstItem);
    }
  }

  bbBoundaryList.onclick = async (e) => {
    const target = e.target.closest('.bb-boundary-item');
    if (!target) return;

    const { type, name, state } = target.dataset;
    bbBoundaryDialog.classList.add('hidden');
    bbBoundaryOverlay.classList.add('hidden');
    bbBoundarySearch.value = '';

    let feature;
    if (type === 'state') {
      feature = usStatesData.find(f => f.properties.name === name);
    } else {
      feature = usCountiesData.find(f => f.properties.NAME === name && f.properties.STATE_NAME === state);
    }

    if (!feature) {
      console.error('Selected boundary feature not found.');
      return;
    }

    const geoJsonDataSource = await Cesium.GeoJsonDataSource.load(feature);
    const entity = geoJsonDataSource.entities.values[0];

    // Extract polygon hierarchy and finalize the bounding box
    boundingBoxCoordinates = entity.polygon.hierarchy.getValue();
    finalizeBoundingBox();
  };

  function handleDrawShape() {
    updateBoundingBoxUI('drawing-shape');
    viewer.canvas.style.cursor = 'crosshair';

    let isDrawing = false;
    let positions = [];

    boundingBoxHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    document.addEventListener('keydown', escapeKeyListener);

    boundingBoxHandler.setInputAction(function (event) {
        isDrawing = true;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        const cartesian = viewer.scene.pickPosition(event.position);
        if (Cesium.defined(cartesian)) {
            positions.push(cartesian);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    boundingBoxHandler.setInputAction(function (event) {
        if (isDrawing) {
            const cartesian = viewer.scene.pickPosition(event.endPosition);
            if (Cesium.defined(cartesian)) {
                positions.push(cartesian);
                if (tempBoundingBox) {
                    // This is a bit of a hack to force update of the polyline
                    tempBoundingBox.polyline.positions = new Cesium.CallbackProperty(() => positions, false);
                } else {
                    tempBoundingBox = viewer.entities.add({
                        polyline: {
                            positions: new Cesium.CallbackProperty(() => positions, false),
                            width: 3,
                            material: colorCreating,
                            clampToGround: true
                        }
                    });
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    boundingBoxHandler.setInputAction(function () {
        if (!isDrawing || positions.length < 3) {
            handleCancelBoundingBox();
            return;
        }
        isDrawing = false;
        viewer.scene.screenSpaceCameraController.enableInputs = true;

        // Store the polygon hierarchy instead of raw coordinates
        boundingBoxCoordinates = new Cesium.PolygonHierarchy(positions);
        finalizeBoundingBox();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Right click cancels the drawing
    boundingBoxHandler.setInputAction(function () {
        handleCancelBoundingBox();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  function finalizeBoundingBox() {
    bbFilterDialog.classList.remove('hidden'); // Show the filter dialog
    document.removeEventListener('keydown', escapeKeyListener);
    if (boundingBoxHandler) {
      boundingBoxHandler.destroy();
      boundingBoxHandler = null;
      viewer.canvas.style.cursor = 'default';
    }
    
    if (tempBoundingBox) {
      viewer.entities.remove(tempBoundingBox);
      tempBoundingBox = null;
    }

    if (currentBoundingBox) {
      viewer.entities.remove(currentBoundingBox);
    }

    if (Array.isArray(boundingBoxCoordinates)) { // It's a rectangle
        const rect = Cesium.Rectangle.fromCartesianArray(boundingBoxCoordinates);
        currentBoundingBox = viewer.entities.add({
            rectangle: {
                coordinates: rect,
                material: colorInactive,
                height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                outline: true,
                outlineColor: colorInactive.withAlpha(1.0),
                outlineWidth: 2
            }
        });

        const zoomOutFactor = 0.2;
        const paddedRect = Cesium.Rectangle.clone(rect);
        paddedRect.west -= rect.width * zoomOutFactor;
        paddedRect.east += rect.width * zoomOutFactor;
        paddedRect.south -= rect.height * zoomOutFactor;
        paddedRect.north += rect.height * zoomOutFactor;

        viewer.camera.flyTo({
            destination: paddedRect,
            duration: 1.5
        });
        console.log('Bounding box finalized:', rect);
    } else { // It's a polygon
        currentBoundingBox = viewer.entities.add({
            polygon: {
                hierarchy: boundingBoxCoordinates,
                material: colorInactive,
                height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                outline: true,
                outlineColor: colorInactive.withAlpha(1.0),
                outlineWidth: 2
            }
        });

        // Fly to the bounding sphere of the polygon
        const boundingSphere = Cesium.BoundingSphere.fromPoints(boundingBoxCoordinates.positions);
        viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 1.5,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), boundingSphere.radius * 1.5)
        });
        console.log('Bounding shape finalized.');
    }

    updateBoundingBoxUI('active');
    calculateAndShowBoundingBoxStats();
  }

  // Add click listener to the overlay to close the dialog
  if (bbBoundaryOverlay) {
    bbBoundaryOverlay.onclick = () => {
      bbBoundaryCloseBtn.onclick(); // Reuse the existing close logic
    };
  }
  function handleCancelBoundingBox() {
    bbFilterDialog.classList.add('hidden'); // Hide the filter dialog
    bbStatsPopup.classList.remove('visible');

    viewer.scene.screenSpaceCameraController.enableInputs = true; // Re-enable map controls
    document.removeEventListener('keydown', escapeKeyListener);
    if (boundingBoxHandler) {
      boundingBoxHandler.destroy();
      boundingBoxHandler = null;
      viewer.canvas.style.cursor = 'default';
    }
    if (tempBoundingBox) {
      viewer.entities.remove(tempBoundingBox);
      tempBoundingBox = null;
    }
    boundingBoxCoordinates = [];
    isBoundingBoxActivated = false;
    updateBoundingBoxUI('initial');
    console.log('Canceled bounding box creation.');
  }

  function createEditHandles() {
    if (!currentBoundingBox || !currentBoundingBox.rectangle) return;

    const rect = currentBoundingBox.rectangle.coordinates.getValue();
    const positions = [
      new Cesium.Cartesian3.fromRadians(rect.west, rect.north), // NW
      new Cesium.Cartesian3.fromRadians(rect.east, rect.north), // NE
      new Cesium.Cartesian3.fromRadians(rect.east, rect.south), // SE
      new Cesium.Cartesian3.fromRadians(rect.west, rect.south), // SW
    ];

    positions.forEach((pos, index) => {
      const handle = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 12,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always render on top
        },
        properties: {
          isEditHandle: true,
          corner: ['NW', 'NE', 'SE', 'SW'][index]
        }
      });
      editHandles.push(handle);
    });
  }

  function removeEditHandles() {
    editHandles.forEach(h => viewer.entities.remove(h));
    editHandles = [];
  }

  function panCameraOnEdgeDrag(mousePosition) {
    const canvas = viewer.canvas;
    const margin = 50; // pixels from edge
    let moveDirection = new Cesium.Cartesian2(0, 0);

    if (mousePosition.x < margin) moveDirection.x = -1;
    else if (mousePosition.x > canvas.clientWidth - margin) moveDirection.x = 1;

    if (mousePosition.y < margin) moveDirection.y = -1;
    else if (mousePosition.y > canvas.clientHeight - margin) moveDirection.y = 1;

    if (moveDirection.x !== 0 || moveDirection.y !== 0) {
      if (!cameraPanRequest) {
        const pan = () => {
          const moveRate = 5.0; // pixels per frame
          viewer.camera.moveRight(moveDirection.x * moveRate);
          viewer.camera.moveUp(moveDirection.y * -moveRate); // Y is inverted in screen space
          cameraPanRequest = requestAnimationFrame(pan);
        };
        cameraPanRequest = requestAnimationFrame(pan);
      }
    } else {
      if (cameraPanRequest) {
        cancelAnimationFrame(cameraPanRequest);
        cameraPanRequest = null;
      }
    }
  }

  function handleEditBoundingBox() {
    if (!currentBoundingBox || !currentBoundingBox.rectangle) return;

    // Store the current state, then minimize the filter dialog and hide the toggle button
    wasFilterDialogMaximized = !bbFilterDialog.classList.contains('minimized');
    bbFilterDialog.classList.add('minimized');
    bbFilterToggleBtn.textContent = '+'; // Set to minimized state icon
    bbFilterToggleBtn.style.display = 'none';

    updateBoundingBoxUI('editing');
    bbEditBtn.textContent = 'Cancel';
    let activeRectangle = null;

    // Store original state for cancellation
    if (currentBoundingBox.rectangle.material) {
      currentBoundingBox.rectangle.material = colorCreating;
    }

    const rect = currentBoundingBox.rectangle.coordinates.getValue();
    activeRectangle = Cesium.Rectangle.clone(rect);
    originalBoundingBoxCartesians = Cesium.Rectangle.clone(rect);

    createEditHandles();

    editingHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    viewer.canvas.style.cursor = 'move';

    editingHandler.setInputAction(event => {
      const pickedObject = viewer.scene.pick(event.position);
      if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties.isEditHandle) {
        isDraggingHandle = true;
        draggedHandle = pickedObject.id;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        viewer.canvas.style.cursor = 'grabbing';
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    editingHandler.setInputAction(event => {
      if (isDraggingHandle && draggedHandle) {
        const newPosition = viewer.scene.pickPosition(event.endPosition);
        if (Cesium.defined(newPosition)) {
          // Only update the handle's position. The CallbackProperty will handle the rest.
          // --- New intuitive drag logic ---
          const newCartographic = Cesium.Cartographic.fromCartesian(newPosition);
          const cornerType = draggedHandle.properties.corner.getValue();

          // Update the appropriate edge of the rectangle based on which corner is being dragged
          let { north, south, east, west } = activeRectangle;
          if (cornerType.includes('N')) north = newCartographic.latitude;
          if (cornerType.includes('S')) south = newCartographic.latitude;
          if (cornerType.includes('W')) west = newCartographic.longitude;
          if (cornerType.includes('E')) east = newCartographic.longitude;

          // --- FIX: Ensure north >= south and east >= west ---
          activeRectangle.north = Math.max(north, south);
          activeRectangle.south = Math.min(north, south);
          activeRectangle.east = Math.max(east, west);
          activeRectangle.west = Math.min(east, west);
          // --- End of Fix ---

          // Update all handle positions based on the new rectangle coordinates
          editHandles.forEach(handle => {
            const handleCorner = handle.properties.corner.getValue();
            let lon = handleCorner.includes('W') ? activeRectangle.west : activeRectangle.east;
            let lat = handleCorner.includes('N') ? activeRectangle.north : activeRectangle.south;
            handle.position = Cesium.Cartesian3.fromRadians(lon, lat);
          });

        } else {
          // If newPosition is undefined (e.g., pointing at the sky), do nothing to prevent errors.
        }

        // Check if we need to pan the camera
        panCameraOnEdgeDrag(event.endPosition);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Use a CallbackProperty for smooth, real-time updates
    currentBoundingBox.rectangle.coordinates = new Cesium.CallbackProperty(() => {
      return activeRectangle;
    }, false);

    editingHandler.setInputAction(() => {
      isDraggingHandle = false;
      draggedHandle = null;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      viewer.canvas.style.cursor = 'move';
      if (cameraPanRequest) {
        cancelAnimationFrame(cameraPanRequest);
        cameraPanRequest = null;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    console.log('Enabling bounding box editing...');
  }

  function handleSaveBoundingBox() {
    if (editingHandler) {
      editingHandler.destroy();
      editingHandler = null;
    }
    // Restore filter dialog state and button visibility
    if (wasFilterDialogMaximized) {
      bbFilterDialog.classList.remove('minimized');
      bbFilterToggleBtn.textContent = '-';
    }
    bbFilterToggleBtn.style.display = 'flex';

    removeEditHandles();
    viewer.canvas.style.cursor = 'default';

    // Finalize the new coordinates
    if (currentBoundingBox && currentBoundingBox.rectangle) {
      const finalRect = currentBoundingBox.rectangle.coordinates.getValue();
      boundingBoxCoordinates = [
        Cesium.Cartesian3.fromRadians(finalRect.west, finalRect.south),
        Cesium.Cartesian3.fromRadians(finalRect.east, finalRect.north)
      ];
      // Revert to a static rectangle for performance
      currentBoundingBox.rectangle.coordinates = finalRect;

      // Deactivate the box upon saving, requiring the user to re-activate.
      isBoundingBoxActivated = false;
      currentBoundingBox.rectangle.material = colorInactive;
      currentBoundingBox.rectangle.outlineColor = colorInactive.withAlpha(1.0);
      clearTemperatureGrid(); // Clear old analysis results
      resetAllFiltersUI(); // Ensure filter UI is reset
      clearWeatherAlerts();
      clearRiverGauges();
      clearSensorEntities();
      clearFloodLevelEntities();
    }
    calculateAndShowBoundingBoxStats(); // Recalculate stats on save
    originalBoundingBoxCartesians = null;

    // Reset UI
    bbEditBtn.textContent = 'Edit';
    updateBoundingBoxUI('active');
    console.log('Saved bounding box edits.');
  }

  function handleCancelEdit() {
    if (editingHandler) {
      editingHandler.destroy();
      editingHandler = null;
    }
    // Restore filter dialog state and button visibility
    if (wasFilterDialogMaximized) {
      bbFilterDialog.classList.remove('minimized');
      bbFilterToggleBtn.textContent = '-';
    }
    bbFilterToggleBtn.style.display = 'flex';

    removeEditHandles();
    viewer.canvas.style.cursor = 'default';

    // Revert to original coordinates
    if (currentBoundingBox && currentBoundingBox.rectangle && originalBoundingBoxCartesians) {
      // Revert to the static, original rectangle
      currentBoundingBox.rectangle.coordinates = new Cesium.CallbackProperty(() => originalBoundingBoxCartesians, false);
      currentBoundingBox.rectangle.coordinates = originalBoundingBoxCartesians;
      resetAllFiltersUI(); // Ensure filter UI is reset
    }
    originalBoundingBoxCartesians = null;

    bbEditBtn.textContent = 'Edit';
    updateBoundingBoxUI('active');
    calculateAndShowBoundingBoxStats(); // Recalculate stats
    console.log('Canceled bounding box edits, reverting to previous state.');
  }
  
  // --- NOAA NWS API and Heatmap Functions ---
  let temperatureHeatmapEntity = null;
  let temperatureAnalysisRunning = false;
  // --- Global state for heatmap opacity controls ---
  let heatmapOpacity = 0.7; // The current logical opacity value.
  let lastVisibleOpacity = 0.7; // Stores the opacity value before it was hidden.


  // --- Fixed temperature scale for heatmap (Fahrenheit) ---
  const HEATMAP_MIN_TEMP_F = 0;
  const HEATMAP_MAX_TEMP_F = 110;
  const HEATMAP_TEMP_RANGE_F = HEATMAP_MAX_TEMP_F - HEATMAP_MIN_TEMP_F;

  /**
   * Gets the RGB color from the heatmap gradient for a given temperature.
   * @param {number} tempF The temperature in Fahrenheit.
   * @returns {string} A CSS 'rgb(r,g,b)' color string.
   */
  function getColorForTemperature(tempF) {
    const position = (tempF - HEATMAP_MIN_TEMP_F) / HEATMAP_TEMP_RANGE_F;
    const clampedPosition = Cesium.Math.clamp(position, 0, 1);

    // Get the full gradient array
    const gradientColors = createColorGradient();

    // Find the color at the calculated position
    const colorIndex = Math.floor(clampedPosition * 255);
    const color = gradientColors[colorIndex];
    if (!color) return 'rgb(0,0,0)'; // Fallback
    const [r, g, b] = color;
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Fetches a resource with a specified timeout.
   * @param {string} resource The URL to fetch.
   * @param {object} options Fetch options.
   * @param {number} timeout The timeout in milliseconds.
   * @returns {Promise<Response>} A promise that resolves with the response.
   */
  async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
  
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
  }
  /**
   * Creates a color gradient from blue to red for the heatmap.
   * @returns {Array<[number, number, number]>} An array of 256 RGB color values.
   */
  function createColorGradient() {
    const colors = [];
    // A more traditional Blue -> Green -> Yellow -> Red temperature gradient
    const colorStops = [
      { stop: 0,    color: [0, 0, 255] },    // Coldest: Blue
      { stop: 0.25, color: [0, 255, 255] },  // Cool: Cyan
      { stop: 0.5,  color: [0, 255, 0] },    // Moderate: Green
      { stop: 0.75, color: [255, 255, 0] },  // Warm: Yellow
      { stop: 1,    color: [255, 0, 0] }     // Hottest: Red
    ];

    for (let i = 0; i < 256; i++) {
        const position = i / 255;
        let startStop, endStop;
        for (let j = 0; j < colorStops.length - 1; j++) {
            if (position >= colorStops[j].stop && position <= colorStops[j + 1].stop) {
                startStop = colorStops[j];
                endStop = colorStops[j + 1];
                break;
            }
        }

        const t = (position - startStop.stop) / (endStop.stop - startStop.stop);
        const r = Math.round(startStop.color[0] + t * (endStop.color[0] - startStop.color[0]));
        const g = Math.round(startStop.color[1] + t * (endStop.color[1] - startStop.color[1]));
        const b = Math.round(startStop.color[2] + t * (endStop.color[2] - startStop.color[2]));
        colors.push([r, g, b]);
    }
    return colors;
  }

  /**
   * Creates or updates a reusable progress bar within a container element.
   * @param {HTMLElement} container The element to hold the progress bar.
   * @param {number} progress The current progress value.
   * @param {number} total The total value for 100%.
   * @param {string} [label] Optional text to display. If not provided, a default "Loading..." text is used.
   */
  function updateProgressBar(container, progress, total, label = '') {
    const percentage = total > 0 ? (progress / total) * 100 : 0;

    let progressBarContainer = container.querySelector('.progress-bar-container');
    if (!progressBarContainer) {
        container.innerHTML = `
            <div class="progress-bar-container">
                <div class="progress-bar-fill"></div>
                <span class="progress-bar-label"></span>
            </div>
        `;
        progressBarContainer = container.querySelector('.progress-bar-container');
    }

    progressBarContainer.querySelector('.progress-bar-fill').style.width = `${percentage}%`;
    progressBarContainer.querySelector('.progress-bar-label').textContent = label || `Loading... (${progress}/${total})`;
  }

  /**
   * Generates a heatmap canvas from a set of data points.
   * This uses a simple gradient method inspired by heatmap.js.
   * @param {number} width The width of the canvas.
   * @param {number} height The height of the canvas.
   * @param {Array<{x: number, y: number, value: number}>} points The data points to plot (coordinates and values are normalized 0-1).
   * @param {number} radius The radius of each point's influence.
   * @returns {HTMLCanvasElement} The generated heatmap canvas.
   */
  function createHeatmapCanvas(width, height, points, radius) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // 1. Create a grayscale intensity map using radial gradients
      ctx.filter = `blur(${Math.round(width / 30)}px)`;
      points.forEach(point => {
          const x = point.x * width;
          const y = point.y * height;

          const r = radius;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
          // The alpha of the gradient is determined by the point's value
          gradient.addColorStop(0, `rgba(0, 0, 0, ${point.value})`);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = gradient;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });

      // 2. Colorize the map based on the intensity (alpha)
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const gradientColors = createColorGradient();

      for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3]; // Intensity is in the alpha channel
          if (alpha > 0) {
              const color = gradientColors[alpha];
              data[i] = color[0];     // R
              data[i + 1] = color[1]; // G
              data[i + 2] = color[2]; // B
              // Make it more opaque for better visibility
              data[i + 3] = Math.min(255, alpha + 100);
          }
      }
      ctx.putImageData(imageData, 0, 0);

      return canvas;
  }

  /**
   * Renders a temperature heatmap on the map within the given bounds.
   * @param {Cesium.Rectangle} bounds The bounding box for the heatmap.
   * @param {Array<{lon: number, lat: number, value: number}>} dataPoints The temperature data.
   */
  function renderTemperatureHeatmap(bounds, dataPoints) {
      if (dataPoints.length === 0 || !bounds) return;
  
      // Get the number of points per side to calculate dynamic blur
      const pointsPerSide = Math.sqrt(dataPoints.length);
  
      // Normalize data and map to canvas coordinates
      const canvasWidth = 150;
      const canvasHeight = 150;
      const boundingRectangle = (bounds instanceof Cesium.Rectangle) ? bounds : Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);
      const { west, south, east, north } = boundingRectangle;
      const lonRange = east - west;
      const latRange = north - south;
  
      const canvasPoints = dataPoints.map(p => {
          // Clamp the temperature to our fixed range (e.g., 0°F to 110°F)
          const clampedTemp = Cesium.Math.clamp(p.value, HEATMAP_MIN_TEMP_F, HEATMAP_MAX_TEMP_F);
          // Normalize the clamped temperature to a 0-1 value for the color gradient
          return {
              x: (Cesium.Math.toRadians(p.lon) - west) / lonRange,
              y: (north - Cesium.Math.toRadians(p.lat)) / latRange,
              value: (clampedTemp - HEATMAP_MIN_TEMP_F) / HEATMAP_TEMP_RANGE_F
          };
      });

      // Dynamically adjust radius for more blur on smaller grids
      // a smaller grid (e.g., 2x2) gets a larger radius to appear more continuous.
      // a larger grid (e.g., 16x16) gets a smaller radius.
      // the radius is increased significantly to ensure a very smooth blend.
      const radius = 15 + (16 - pointsPerSide) * 5;
      const heatmapCanvas = createHeatmapCanvas(canvasWidth, canvasHeight, canvasPoints, radius);
  
      // Create Cesium entity
      if (temperatureHeatmapEntity) {
          viewer.entities.remove(temperatureHeatmapEntity);
      }

      const material = new Cesium.ImageMaterialProperty({
        image: heatmapCanvas,
        transparent: true,
        color: new Cesium.Color(1.0, 1.0, 1.0, heatmapOpacity)
      });

      if (bounds instanceof Cesium.Rectangle) {
        temperatureHeatmapEntity = viewer.entities.add({
            rectangle: {
                coordinates: bounds,
                material: material,
                height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.3)
            }
        });
      } else { // It's a PolygonHierarchy
        temperatureHeatmapEntity = viewer.entities.add({
            polygon: {
                hierarchy: bounds,
                material: material,
                // STC is needed for texture mapping on polygons
                stc: new Cesium.CallbackProperty(() => {
                  return new Cesium.PolygonHierarchy(
                    bounds.positions,
                    bounds.holes.map(hole => new Cesium.PolygonHierarchy(hole.positions))
                  );
                }, false),
                height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.3)
            }
        });
      }
  }
  /**
   * Calculates the appropriate height for the heatmap rectangle based on camera altitude.
   * This prevents z-fighting with the 3D tileset when zoomed out.
   * @returns {number} The calculated height in meters.
   */
  function getDynamicHeatmapHeight() {
    if (!viewer) return 20; // Default height if viewer isn't ready

    const cameraHeight = viewer.camera.positionCartographic.height;

    // Define camera altitude range for scaling
    const minCameraHeight = 1000;  // Start scaling up sooner
    const maxCameraHeight = 100000; // Continue scaling for longer

    // Define corresponding rectangle height range
    const minRectangleHeight = 50;   // Increased minimum height when zoomed in
    const maxRectangleHeight = 4000; // Significantly increased maximum height for far zoom

    if (cameraHeight <= minCameraHeight) {
      return minRectangleHeight;
    }
    if (cameraHeight >= maxCameraHeight) {
      return maxRectangleHeight;
    }

    // Linearly interpolate the rectangle height based on the camera's altitude
    const t = (cameraHeight - minCameraHeight) / (maxCameraHeight - minCameraHeight);
    return Cesium.Math.lerp(minRectangleHeight, maxRectangleHeight, t);
  }

  /**
   * Checks if a point is inside a polygon using the Ray-Casting algorithm.
   * This is a reliable, standard algorithm that does not depend on a specific Cesium version.
   * @param {Cesium.Cartographic} point The point to check (longitude/latitude in radians).
   * @param {Array<Cesium.Cartographic>} polygonVertices An array of the polygon's vertices.
   * @returns {boolean} True if the point is inside the polygon.
   */
  function isPointInPolygon(point, polygonVertices) {
    const x = point.longitude;
    const y = point.latitude;
    let isInside = false;

    for (let i = 0, j = polygonVertices.length - 1; i < polygonVertices.length; j = i++) {
      const xi = polygonVertices[i].longitude;
      const yi = polygonVertices[i].latitude;
      const xj = polygonVertices[j].longitude;
      const yj = polygonVertices[j].latitude;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

      if (intersect) {
        isInside = !isInside;
      }
    }
    return isInside;
  }
  /**
   * Creates a grid of points within a given bounding box.
   * The density of the grid is determined dynamically by the size of the box.
   * unless a fixed number of points is specified.
   * @param {Cesium.Rectangle | Cesium.PolygonHierarchy} bounds The bounding box or polygon.
   * @param {number|null} [fixedPointsPerSide=null] If provided, creates a grid of this size (e.g., 3 for a 3x3 grid).
   * @returns {Array<{lon: number, lat: number}>} An array of longitude/latitude points.
   */
  function createPointGrid(bounds, fixedPointsPerSide = null) {
    let minPointsPerSide = 5;
    const maxPointsPerSide = 16; // For large boxes (> 1000 sq mi)

    // Area thresholds in square miles
    const minAreaThreshold = 1000;
    const maxAreaThreshold = 100000;

    // Calculate the approximate area of the rectangle in square miles
    const R = Cesium.Ellipsoid.WGS84.maximumRadius; // Earth radius in meters
    const metersPerMile = 1609.34;
    const sqMetersPerSqMile = metersPerMile * metersPerMile;

    const boundingRectangle = (bounds instanceof Cesium.Rectangle) ?
      bounds :
      Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);

    const areaMeters2 = (boundingRectangle.east - boundingRectangle.west) * (R * R) * Math.abs(Math.sin(boundingRectangle.north) - Math.sin(boundingRectangle.south));
    const areaMiles2 = areaMeters2 / sqMetersPerSqMile;

    // If it's a polygon, we might want a denser grid to capture its shape.
    if (!(bounds instanceof Cesium.Rectangle)) {
        minPointsPerSide = 8;
    }

    let pointsPerSide = fixedPointsPerSide;

    if (pointsPerSide === null) {
    if (areaMiles2 <= minAreaThreshold) {
      pointsPerSide = minPointsPerSide;
    } else if (areaMiles2 >= maxAreaThreshold) {
      pointsPerSide = maxPointsPerSide;
    } else {
      // Linearly interpolate the number of points between the thresholds
      const t = (areaMiles2 - minAreaThreshold) / (maxAreaThreshold - minAreaThreshold);
      pointsPerSide = Math.round(Cesium.Math.lerp(minPointsPerSide, maxPointsPerSide, t));
    }
    }

    const { west, south, east, north } = boundingRectangle;
    const points = [];
    const lonStep = pointsPerSide > 1 ? (east - west) / (pointsPerSide - 1) : 0;
    const latStep = pointsPerSide > 1 ? (north - south) / (pointsPerSide - 1) : 0;

    const isPolygon = !(bounds instanceof Cesium.Rectangle);
    const cartographicPoints = isPolygon ? bounds.positions.map(p => Cesium.Cartographic.fromCartesian(p)) : [];

    for (let i = 0; i < pointsPerSide; i++) {
      for (let j = 0; j < pointsPerSide; j++) {
        const lon = Cesium.Math.toDegrees(west + (j * lonStep));
        const lat = Cesium.Math.toDegrees(south + (i * latStep));

        if (isPolygon) {
            // Check if the point is inside the polygon
            const pointCartographic = Cesium.Cartographic.fromDegrees(lon, lat);
            if (isPointInPolygon(pointCartographic, cartographicPoints)) {
                points.push({ lon, lat });
            }
        } else {
            points.push({ lon, lat });
        }
      }
    }
    return points;
  }

  function clearTemperatureGrid() {
    if (temperatureHeatmapEntity) {
      viewer.entities.remove(temperatureHeatmapEntity);
      temperatureHeatmapEntity = null;
    }
  }
  
  function clearWeatherAlerts() {
    weatherAlertEntities.forEach(entity => {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    });
    weatherAlertEntities = [];
  }

  function clearSensorEntities() {
    sensorEntities.forEach(entity => viewer.entities.remove(entity));
    sensorEntities = [];
  }
  function clearRiverGauges() {
    gaugeEntities.forEach(entity => {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    });
    gaugeEntities = [];
  }
  
  function clearFloodLevelEntities() {
    floodLevelEntities.forEach(entity => {
      viewer.entities.remove(entity);
    });
    floodLevelEntities = [];
  }

  /**
   * Fetches the latest CO2 sensor reading and displays it on the map if it's within the bounding box.
   * @param {Cesium.Rectangle | Cesium.PolygonHierarchy} bounds The bounding box for the analysis.
   * @returns {Promise<object>} An object containing the sensor data or an error message.
   */
  async function fetchCo2Sensor(bounds) {
    clearSensorEntities();

    try {
      const response = await fetch('/sensor-data');
      if (!response.ok) {
        const errorData = await response.json();
        return { message: `Sensor API Error: ${errorData.error || response.status}` };
      }
      const data = await response.json();

      if (!data.events || data.events.length === 0) {
        return { message: 'No sensor events found.' };
      }

      const latestEvent = data.events[0];
      const readings = latestEvent.body?.readings;

      if (!readings || readings.length === 0) {
        return { message: 'No sensor readings in the latest event.' };
      }

      // Assuming we only care about the first reading in the array for now.
      const sensorData = readings[0];
      const { lat, lon } = sensorData;

      if (lat === undefined || lon === undefined) {
        return { message: 'Sensor data is missing location.' };
      }

      // Check if the sensor is within the bounding box
      const sensorCartographic = Cesium.Cartographic.fromDegrees(lon, lat);
      const analysisBounds = (bounds instanceof Cesium.Rectangle) ?
        bounds :
        Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);

      if (!Cesium.Rectangle.contains(analysisBounds, sensorCartographic)) {
        return { message: 'Sensor is outside the selected area.' };
      }

      // --- FIX: Create a pin from a Font Awesome icon using a canvas ---
      const iconSize = 48;
      const canvas = document.createElement('canvas');
      canvas.width = iconSize;
      canvas.height = iconSize;
      const context = canvas.getContext('2d');

      // Wait for the Font Awesome font to be ready before drawing
      // This ensures the icon renders correctly on first load
      await document.fonts.load('900 48px "Font Awesome 6 Free"');

      context.font = `900 ${iconSize}px "Font Awesome 6 Free"`;
      context.fillStyle = Cesium.Color.DEEPSKYBLUE.toCssColorString();
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      // Unicode for 'fa-broadcast-tower' is \uf519
      context.fillText('\uf519', iconSize / 2, iconSize / 2);

      const sensorPinUrl = canvas.toDataURL();
      // --- End of Fix ---

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        billboard: {
          image: sensorPinUrl,
          width: iconSize,
          height: iconSize,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          isCo2Sensor: true,
          sensorData: sensorData
        }
      });
      sensorEntities.push(entity);

      return { sensorData: sensorData };

    } catch (error) {
      console.error('Failed to fetch sensor data:', error);
      return { message: 'Error fetching sensor data.' };
    }
  }

  function showSensorInfoBox(sensorData) {
    const container = document.getElementById("gaugeInfoBox"); // Re-using the gauge container
    const { co2, humidity, temperature, time } = sensorData;

    const html = `
      <div class="gauge-info-box sensor-info-box">
        <button class="gauge-info-close">&times;</button>
        <h4>CO₂ Digital Twin</h4>
        <div class="gauge-forecast-details">
          <div class="gauge-metric">
            <span class="gauge-label"><i class="fas fa-wind"></i> CO₂ Level</span>
            <span class="gauge-value">${co2.toFixed(0)} ppm</span>
          </div>
          <div class="gauge-metric">
            <span class="gauge-label"><i class="fas fa-thermometer-half"></i> Temperature</span>
            <span class="gauge-value">${temperature.toFixed(1)} °C</span>
          </div>
          <div class="gauge-metric">
            <span class="gauge-label"><i class="fas fa-tint"></i> Humidity</span>
            <span class="gauge-value">${humidity.toFixed(1)}%</span>
          </div>
        </div>
        <p class="gauge-timestamp">Last Reading: ${new Date(time * 1000).toLocaleString()}</p>
      </div>
    `;
    container.innerHTML = html;
    container.classList.remove('hidden');
    container.querySelector('.gauge-info-close').onclick = () => container.classList.add('hidden');
    activeSensorInfoBox = container;
  }

  async function fetchTemperatureData(bounds) {
    if (temperatureAnalysisRunning) {
      return { message: 'Analysis already in progress.' };
    }
    temperatureAnalysisRunning = true;
    clearTemperatureGrid();

    // Create a grid with density based on the bounding box size
    // Pass the original bounds (polygon or rect) to generate points *within* the shape
    const gridPoints = createPointGrid(bounds); // Pass the original bounds (polygon or rect) to generate points *within* the shape
    let pointsProcessed = 0;
    const temperatureDataPoints = [];

    const promises = gridPoints.map(async (point) => {
      try {
        // 1. Get the gridpoint URL from the NWS API for each point
        const pointsUrl = `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
        const pointsResponse = await fetchWithTimeout(pointsUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds@ucf.edu)' } }, 7000);
        if (!pointsResponse.ok) {
          console.warn(`NWS points API failed for ${point.lat},${point.lon}: ${pointsResponse.status}`);
          return; // Skip this point
        }
        const pointsData = await pointsResponse.json();
        const gridUrl = pointsData.properties.forecastGridData;

        if (!gridUrl) return;

        // 2. Get the grid data
        const gridResponse = await fetchWithTimeout(gridUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds@ucf.edu)' } }, 7000);
        if (!gridResponse.ok) return;
        const gridData = await gridResponse.json();

        // 3. Extract the current temperature
        const temperatureData = gridData.properties.temperature;
        const tempC = temperatureData.values[0].value;

        if (tempC !== null) {
          // Convert Celsius to Fahrenheit
          const tempF = tempC * 9 / 5 + 32;
          temperatureDataPoints.push({
            lon: point.lon,
            lat: point.lat,
            value: tempF
          });
        }
      } catch (error) {
        console.error(`Failed to fetch temp for point ${point.lat},${point.lon}:`, error);
      } finally {
        pointsProcessed++;
        // Update the UI with progress if needed
        const item = document.querySelector(`.bb-filter-item[data-filter-id="temperature"]`);
        if (item) {
          updateProgressBar(item.querySelector('.filter-display-result'), pointsProcessed, gridPoints.length);
        }
      }
    });

    await Promise.all(promises);
    temperatureAnalysisRunning = false;

    if (temperatureDataPoints.length > 0) {
      renderTemperatureHeatmap(bounds, temperatureDataPoints);

      const temps = temperatureDataPoints.map(p => p.value);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      const totalTemp = temperatureDataPoints.reduce((sum, p) => sum + p.value, 0);
      const avgTemp = totalTemp / temperatureDataPoints.length;
      return {
        message: `Avg Temp: ${avgTemp.toFixed(1)}°F`,
        value: avgTemp,
        minTemp: minTemp,
        maxTemp: maxTemp
      };
    } else {
      return { message: 'Error: No temperature data found for this area.' };
    }
  }

  /**
   * Fetches active weather alerts from the NWS API for the center of the bounding box.
   * @param {Cesium.Rectangle} bounds The bounding box for the analysis.
   * @returns {Promise<object>} An object containing the list of alerts or an error message.
   */
  async function fetchWeatherAlerts(bounds) {
    clearWeatherAlerts(); // Clear previous alerts

    // The analysis functions need a Rectangle, so we compute it here if we have a polygon.
    const analysisBounds = (bounds instanceof Cesium.Rectangle) ?
      bounds :
      Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);
    const center = Cesium.Rectangle.center(analysisBounds);
    const centerLat = Cesium.Math.toDegrees(center.latitude);
    const centerLon = Cesium.Math.toDegrees(center.longitude);

    const url = `https://api.weather.gov/alerts/active?point=${centerLat.toFixed(4)},${centerLon.toFixed(4)}`;

    try {
      const response = await fetchWithTimeout(url, { headers: { 'User-Agent': '(my-cesium-app, hynds@ucf.edu)' } }, 10000);
      if (!response.ok) {
        return { message: `NWS Alerts API Error: ${response.status}` };
      }
      const data = await response.json();
      const alerts = data.features || [];

      if (alerts.length === 0) {
        return { message: 'No active weather alerts for this area.', alerts: [] };
      }

      // Process and return alerts
      const processedAlerts = alerts.map(alert => {
        const props = alert.properties;
        return {
          id: props.id,
          event: props.event,
          headline: props.headline,
          severity: props.severity,
          areaDesc: props.areaDesc,
          geometry: alert.geometry // Keep geometry for plotting
        };
      });

      return { alerts: processedAlerts };

    } catch (error) {
      console.error('Failed to fetch weather alerts:', error);
      return { message: 'Error fetching weather alerts.' };
    }
  }

  /**
   * Renders weather alert points on the map.
   * @param {Array<object>} alerts The array of processed alert objects.
   */
  function renderWeatherAlerts(alerts) {
    if (!alerts || alerts.length === 0) return;

    alerts.forEach(alert => {
      if (!alert.geometry || !alert.geometry.coordinates) return;

      // Use the first coordinate of the first polygon as the point location.
      // This is a simplification; a centroid would be more accurate for complex shapes.
      const firstCoord = alert.geometry.coordinates[0][0];
      const lon = firstCoord[0];
      const lat = firstCoord[1];

      let color;
      switch (alert.severity?.toLowerCase()) {
        case 'extreme':
        case 'severe':
          color = Cesium.Color.RED;
          break;
        case 'moderate':
          color = Cesium.Color.ORANGE;
          break;
        case 'minor':
          color = Cesium.Color.YELLOW;
          break;
        default:
          color = Cesium.Color.LIGHTGRAY;
      }

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 100), // Elevate slightly
        point: {
          pixelSize: 12,
          color: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          isWeatherAlert: true,
          ...alert
        }
      });
      weatherAlertEntities.push(entity);
    });
  }

  function getAlertColor(severity) {
    switch (severity?.toLowerCase()) {
      case 'extreme': case 'severe': return '#ff4d4d'; // Red
      case 'moderate': return '#ffa500'; // Orange
      case 'minor': return '#ffc107'; // Yellow
      default: return '#cccccc'; // Gray
    }
  }

  /**
   * Updates the opacity of the temperature heatmap entity.
   * @param {number} opacity The new opacity value (0.0 to 1.0).
   * @param {boolean} [updateSlider=false] Whether to also update the slider's visual position.
   */
  function updateHeatmapOpacity(opacity, updateSlider = false, fromSlider = false) {
    heatmapOpacity = opacity;

    // Update the Cesium entity, checking for both rectangle and polygon
    if (temperatureHeatmapEntity) {
      const entityGraphics = temperatureHeatmapEntity.rectangle || temperatureHeatmapEntity.polygon;
      if (entityGraphics && entityGraphics.material && entityGraphics.material.color) {
        entityGraphics.material.color.setValue(
          new Cesium.Color(1.0, 1.0, 1.0, opacity)
        );
      }
    }

    // Update the UI elements
    const icon = document.getElementById('heatmap-visibility-toggle-icon');
    const slider = document.getElementById('heatmap-opacity-slider');

    if (slider) {
      if (updateSlider) {
        slider.value = opacity;
      }
      slider.disabled = false; // Per request, slider is never locked.
    }

    if (icon) {
      icon.className = opacity === 0 ? 'fas fa-eye-slash' : 'fas fa-eye';
    }
  }

  /**
   * Toggles the visibility of the heatmap when the eye icon is clicked.
   */
  function toggleHeatmapVisibility() {
    if (heatmapOpacity > 0) {
      // If it's visible, hide it. Store the current opacity first.
      lastVisibleOpacity = heatmapOpacity;
      updateHeatmapOpacity(0.0, true, false);
    } else {
      // If it's hidden, restore it.
      // If lastVisibleOpacity is 0, it means the user manually slid to 0.
      // In this case, we restore to the default. Otherwise, restore to the last saved value.
      const restoreValue = lastVisibleOpacity > 0 ? lastVisibleOpacity : 0.7;
      updateHeatmapOpacity(restoreValue, true, false);
    }
  }

  /**
   * Fetches aviation-related weather data (visibility, wind, sky cover) from the NWS API.
   * @param {Cesium.Rectangle} bounds The bounding box for the analysis.
   * @returns {Promise<object>} An object containing the aggregated aviation data or an error message.
   */
  async function fetchAviationData(bounds) {
    // The analysis functions need a Rectangle, so we compute it here if we have a polygon.
    const analysisBounds = (bounds instanceof Cesium.Rectangle) ?
      bounds :
      Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);
      
    const gridPoints = createPointGrid(analysisBounds, 3); // Use a fixed 3x3 grid for faster, sparse sampling
    let pointsProcessed = 0;
    const aviationData = {
      visibility: [],
      windSpeed: [],
      windDirection: [],
      skyCover: [],
      precipitationChance: []
    };

    const promises = gridPoints.map(async (point) => {
      try {
        const pointsUrl = `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
        const pointsResponse = await fetchWithTimeout(pointsUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds@ucf.edu)' } }, 7000);
        if (!pointsResponse.ok) return;

        const pointsData = await pointsResponse.json();
        const gridUrl = pointsData.properties.forecastGridData;
        if (!gridUrl) return;

        const gridResponse = await fetchWithTimeout(gridUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds@ucf.edu)' } }, 7000);
        if (!gridResponse.ok) return;
        const gridData = await gridResponse.json();

        // Extract relevant properties
        const props = gridData.properties;
        if (props.visibility?.values?.[0]?.value != null) {
          const visibilityMeters = props.visibility.values[0].value;
          aviationData.visibility.push(visibilityMeters / 1609.34); // Convert meters to miles
        }
        if (props.windSpeed?.values?.[0]?.value != null) {
          const windSpeedKmh = props.windSpeed.values[0].value;
          aviationData.windSpeed.push(windSpeedKmh * 0.54); // Convert km/h to knots
        }
        if (props.windDirection?.values?.[0]?.value != null) {
          aviationData.windDirection.push(props.windDirection.values[0].value);
        }
        if (props.skyCover?.values?.[0]?.value != null) {
          aviationData.skyCover.push(props.skyCover.values[0].value);
        }
        if (props.probabilityOfPrecipitation?.values?.[0]?.value != null) {
          aviationData.precipitationChance.push(props.probabilityOfPrecipitation.values[0].value);
        }

      } catch (error) {
        console.warn(`Could not process aviation data for point ${point.lat},${point.lon}:`, error.message);
      } finally {
        pointsProcessed++;
        const item = document.querySelector(`.bb-filter-item[data-filter-id="aviation"]`);
        if (item) {
          updateProgressBar(item.querySelector('.filter-display-result'), pointsProcessed, gridPoints.length);
        }
      }
    });

    await Promise.all(promises);

    if (aviationData.visibility.length > 0) {
      const calcAverage = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      
      // For wind direction, we need to calculate the vector average
      let avgWindSin = 0;
      let avgWindCos = 0;
      aviationData.windDirection.forEach(deg => {
        const rad = deg * (Math.PI / 180);
        avgWindSin += Math.sin(rad);
        avgWindCos += Math.cos(rad);
      });
      const avgWindDir = (Math.atan2(avgWindSin, avgWindCos) * (180 / Math.PI) + 360) % 360;

      return {
        message: 'Aviation Data Summary',
        avgVisibility: calcAverage(aviationData.visibility),
        avgWindSpeed: calcAverage(aviationData.windSpeed),
        avgWindDirection: avgWindDir,
        avgSkyCover: calcAverage(aviationData.skyCover),
        avgPrecipitationChance: calcAverage(aviationData.precipitationChance),
      };
    } else {
      return { message: 'Error: No aviation data found for this area.' };
    }
  }

  /**
   * Fetches river gauge data from the NWPS API for the given bounds.
   * @param {Cesium.Rectangle | Cesium.PolygonHierarchy} bounds The bounding box for the analysis.
   * @returns {Promise<object>} An object containing the list of gauges or an error message.
   */
  async function fetchRiverGauges(bounds) {
    clearRiverGauges();

    const analysisBounds = (bounds instanceof Cesium.Rectangle) ?
      bounds :
      Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);

    // Ensure north > south and east > west, as required by the API.
    const northDeg = Cesium.Math.toDegrees(analysisBounds.north);
    const southDeg = Cesium.Math.toDegrees(analysisBounds.south);
    const eastDeg = Cesium.Math.toDegrees(analysisBounds.east);
    const westDeg = Cesium.Math.toDegrees(analysisBounds.west);

    const north = Math.max(northDeg, southDeg);
    const south = Math.min(northDeg, southDeg);
    const east = Math.max(eastDeg, westDeg);
    const west = Math.min(eastDeg, westDeg);

    // --- FINAL FIX ---
    // The API documentation shows that the bounding box should be passed as four separate
    // parameters (bbox.xmin, bbox.ymin, etc.) rather than a single string.
    // This is a more robust method that avoids the server-side parsing errors.
    const baseUrl = 'https://api.water.noaa.gov/nwps/v1/gauges';
    const params = new URLSearchParams({
      'bbox.xmin': west.toFixed(4),  // Corresponds to west longitude
      'bbox.ymin': south.toFixed(4), // Corresponds to south latitude
      'bbox.xmax': east.toFixed(4),   // Corresponds to east longitude
      'bbox.ymax': north.toFixed(4),  // Corresponds to north latitude
      'srid': 'EPSG_4326',             // Specify coordinates are in WGS84 (lat/lon)
      'include': 'observed,flood'      // Request observed and flood level data
    });
    const url = `${baseUrl}?${params.toString()}`;

    console.log('Requesting NWPS Gauges with URL:', url); // Log the exact URL for debugging

    try {
      // Add 'Accept' header for robustness with API gateways.
      const response = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 10000);
      if (!response.ok) {
        // Try to get a more detailed error message from the API response body
        let errorDetail = `Status: ${response.status}`;
        const responseText = await response.text(); // Get raw response text
        console.error("NWPS Gauges API Raw Error Response:", responseText); // Log raw text
        try {
          // Try to parse it as JSON, but use the raw text if that fails
          const errorData = JSON.parse(responseText);
          errorDetail = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorDetail = responseText || `Status: ${response.status}`; // Fallback to raw text or status
        }
        return { message: `NWPS Gauges API Error: ${errorDetail}` };
      }
      const data = await response.json();
      let gauges = data.gauges || [];

      if (gauges.length === 0) {
        return { message: 'No river gauges found in this area.', gauges: [] };
      }

      // --- FIX: If the original selection was a polygon, filter the results ---
      // The API is queried with a rectangle, so we need to check which gauges
      // are actually inside the user-drawn polygon.
      if (!(bounds instanceof Cesium.Rectangle)) {
        const polygonCartographicPoints = bounds.positions.map(p => Cesium.Cartographic.fromCartesian(p));
        
        gauges = gauges.filter(gauge => {
          const gaugePoint = Cesium.Cartographic.fromDegrees(gauge.longitude, gauge.latitude);
          return isPointInPolygon(gaugePoint, polygonCartographicPoints);
        });
      }

      return {
        gauges: gauges
      };
      // --- End of Fix ---

    } catch (error) {
      console.error('Failed to fetch river gauges:', error);
      return { message: 'Error fetching river gauges.' };
    }
  }

  /**
   * Renders river gauge entities on the map.
   * @param {Array<object>} gauges The array of gauge GeoJSON features.
   */
  function renderRiverGauges(gauges) {
    if (!gauges || gauges.length === 0) return;

    const pinBuilder = new Cesium.PinBuilder();

    gauges.forEach(gauge => {
      const lat = gauge.latitude;
      const lon = gauge.longitude;

      // Determine pin color based on current status
      const currentLevel = gauge.observed?.data?.[gauge.observed.data.length - 1]?.primary;
      const floodLevels = gauge.flood?.levels;
      let status = { color: Cesium.Color.DODGERBLUE }; // Default color
      if (currentLevel !== undefined && floodLevels) {
        status = getGaugeStatus(currentLevel, floodLevels);
      }
      const gaugePin = pinBuilder.fromColor(status.color, 24).toDataURL();

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        billboard: {
          image: gaugePin,
          width: 24,
          height: 24,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          isRiverGauge: true,
          ...gauge
        }
      });
      gaugeEntities.push(entity);
    });
  }

  /**
   * Converts wind direction in degrees to a cardinal direction.
   * @param {number} degree The wind direction in degrees.
   * @returns {string} The cardinal direction (e.g., N, NE, E).
   */
  function degreeToCardinal(degree) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degree / 22.5) % 16;
    return directions[index];
  }

  function getFlightCategory(visibility, ceiling) {
    if (visibility < 1 || ceiling < 500) return { name: 'LIFR', color: '#ff4d4d' }; // Low IFR
    if (visibility < 3 || ceiling < 1000) return { name: 'IFR', color: '#ff9a4d' }; // IFR
    if (visibility < 5 || ceiling < 3000) return { name: 'MVFR', color: '#ffc107' }; // Marginal VFR
    return { name: 'VFR', color: '#4caf50' }; // VFR
  }


  // --- Dynamic Filter Definitions (Updated) ---
  const filterDefinitions = [
    {
      id: 'temperature',
      label: 'Temperature Heatmap',
      description: "Fetches surface temperature data from NOAA's NWS API and displays a heatmap.",
      analysisFn: async (bounds) => {
        // This wrapper ensures we can pass min/max to the display function
        const result = await fetchTemperatureData(bounds); // This is correct
        return result;
      },
      displayFn: (result, el) => {
        if (result.value !== undefined && result.minTemp !== undefined && result.maxTemp !== undefined) {
          const avgTemp = result.value;
          const minTemp = result.minTemp;
          const maxTemp = result.maxTemp;

          // --- Define the fixed scale for the legend labels ---
          const legendLabels = [
            HEATMAP_MIN_TEMP_F,
            HEATMAP_MIN_TEMP_F + HEATMAP_TEMP_RANGE_F * 0.25,
            HEATMAP_MIN_TEMP_F + HEATMAP_TEMP_RANGE_F * 0.5,
            HEATMAP_MIN_TEMP_F + HEATMAP_TEMP_RANGE_F * 0.75,
            HEATMAP_MAX_TEMP_F
          ];
          
          // Calculate the positions of all markers and the range (0% to 100%)
          const avgPosition = ((avgTemp - HEATMAP_MIN_TEMP_F) / HEATMAP_TEMP_RANGE_F) * 100;
          const minPosition = ((minTemp - HEATMAP_MIN_TEMP_F) / HEATMAP_TEMP_RANGE_F) * 100;
          const maxPosition = ((maxTemp - HEATMAP_MIN_TEMP_F) / HEATMAP_TEMP_RANGE_F) * 100;

          const clampedAvgPosition = Math.max(0, Math.min(100, avgPosition));
          const clampedMinPosition = Math.max(0, Math.min(100, minPosition));
          const clampedMaxPosition = Math.max(0, Math.min(100, maxPosition));

          const avgColor = getColorForTemperature(avgTemp);
          const rangeWidth = clampedMaxPosition - clampedMinPosition;

          const legendHtml = `
            <div class="heatmap-legend dynamic-legend">
              <div class="legend-top-labels">
                <span class="legend-min-label">Min: ${minTemp.toFixed(1)}°F</span>
                <span class="legend-avg-label">Avg: ${avgTemp.toFixed(1)}°F</span>
                <span class="legend-max-label">Max: ${maxTemp.toFixed(1)}°F</span>
              </div>
              <div class="legend-gradient-container">
                <div class="legend-gradient"></div>
                <div class="legend-out-of-range-fill" style="left: 0%; width: ${clampedMinPosition}%;"></div>
                <div class="legend-range-fill" style="left: ${clampedMinPosition}%; width: ${rangeWidth}%;"></div>
                <div class="legend-out-of-range-fill" style="left: ${clampedMaxPosition}%; width: ${100 - clampedMaxPosition}%;"></div>
                <div class="legend-marker-bar min-marker" style="left: ${clampedMinPosition}%;"></div>
                <div class="legend-marker-bar avg-marker" style="left: ${clampedAvgPosition}%; background-color: ${avgColor};"></div>
                <div class="legend-marker-bar max-marker" style="left: ${clampedMaxPosition}%;"></div>
              </div>
              <div class="legend-labels">
                <span>${legendLabels[0]}°F</span>
                <span>${legendLabels[1].toFixed(0)}°</span>
                <span>${legendLabels[2].toFixed(0)}°</span>
                <span>${legendLabels[3].toFixed(0)}°</span>
                <span>${legendLabels[4]}°F</span>
              </div>
            </div>
            <div class="heatmap-controls">
              <button id="heatmap-visibility-toggle" class="heatmap-control-btn" title="Toggle Visibility">
                <i id="heatmap-visibility-toggle-icon" class="fas fa-eye"></i>
              </button>
              <div class="heatmap-slider-container">
                <i class="fas fa-circle" style="font-size: 8px; opacity: 0.3;"></i>
                <input type="range" id="heatmap-opacity-slider" min="0" max="1" step="0.05" value="${heatmapOpacity}" class="heatmap-opacity-slider" title="Adjust Opacity" />
                <i class="fas fa-circle" style="font-size: 12px;"></i>
              </div>
            </div>
          `;
          el.innerHTML = legendHtml;
        } else {
          el.textContent = result.message;
        }
        el.classList.add('map-display');
      },
      postRenderFn: () => {
        // Attach event listeners after the HTML is in the DOM
        const slider = document.getElementById('heatmap-opacity-slider');
        const toggleBtn = document.getElementById('heatmap-visibility-toggle');

        if (slider) {
          slider.addEventListener('input', (e) => {
            const newOpacity = parseFloat(e.target.value);
            updateHeatmapOpacity(newOpacity, false, true);
            if (newOpacity === 0) {
              lastVisibleOpacity = 0; // Mark that user manually slid to 0
            }
          });
        }
        if (toggleBtn) {
          toggleBtn.addEventListener('click', toggleHeatmapVisibility);
        }
      },
      metadata: `
        <h5>Surface Temperature Heatmap</h5>
        <p>Gridded temperature data provided by the National Weather Service (NWS) API. This is not satellite LST, but forecast grid data.</p>
        <p><strong>Source:</strong> <a href="https://www.weather.gov/documentation/services-web-api" target="_blank">NOAA NWS API</a></p>
      `
    },
    {
      id: 'weather-alerts',
      label: 'Weather Alerts',
      description: "Fetches active weather watches and warnings from the NWS API for the selected area.",
      analysisFn: fetchWeatherAlerts,
      displayFn: (result, el) => {
        if (result.alerts && result.alerts.length > 0) {
          const alertsHtml = result.alerts.map(alert => `
            <div class="weather-alert-item">
              <span class="weather-alert-dot" style="background-color: ${getAlertColor(alert.severity)};"></span>
              <div class="weather-alert-text">
                <strong class="weather-alert-event">${alert.event}</strong>
                <p class="weather-alert-headline">${alert.headline}</p>
              </div>
            </div>
          `).join('');
          el.innerHTML = `<div class="weather-alert-list">${alertsHtml}</div>`;
          renderWeatherAlerts(result.alerts); // Render points on the map
        } else {
          el.textContent = result.message || 'No alerts found.';
        }
        el.classList.add('map-display');
      },
      postRenderFn: () => {
        // No post-render actions needed for this filter yet
      },
      metadata: `
        <h5>Active Weather Alerts</h5>
        <p>
          Displays active weather alerts (watches, warnings, advisories) issued by the National Weather Service.
          Data is queried for the center point of the bounding box. A colored dot is placed on the map for each alert.
        </p>
        <p><strong>Source:</strong> <a href="https://www.weather.gov/documentation/services-web-api" target="_blank">NOAA NWS API</a></p>
      `
    },
    {
      id: 'aviation',
      label: 'Aviation Conditions',
      description: "Provides key atmospheric conditions relevant to aviation from the NWS API.",
      analysisFn: fetchAviationData,
      displayFn: (result, el) => {
        if (result.avgVisibility !== undefined) {
          const cardinalWind = degreeToCardinal(result.avgWindDirection);
          // A simple heuristic for ceiling: assume ceiling is where cloud cover > 50%
          // This is a major simplification. Real ceiling data is more complex.
          // For this demo, we'll just use visibility to determine a flight category.
          // A more accurate approach would need `quantitativePrecipitation` or similar.
          // Let's assume a high ceiling for now if not directly available.
          const pseudoCeiling = result.avgSkyCover > 50 ? 5000 : 20000; // feet
          const flightCategory = getFlightCategory(result.avgVisibility, pseudoCeiling);
          const summaryText = `Conditions are ${flightCategory.name} with winds from the ${cardinalWind} at ${result.avgWindSpeed.toFixed(0)} knots.`;

          const html = `
            <p class="aviation-text-summary">${summaryText}</p>
            <div class="aviation-grid">
              <div class="aviation-metric flight-category" style="border-color: ${flightCategory.color};">
                <span class="aviation-label">Flight Category</span>
                <span class="aviation-value" style="color: ${flightCategory.color};">${flightCategory.name}</span>
              </div>
              <div class="aviation-metric">
                <span class="aviation-label"><i class="fas fa-eye"></i> Visibility</span>
                <span class="aviation-value">${result.avgVisibility.toFixed(1)} mi</span>
              </div>
              <div class="aviation-metric">
                <span class="aviation-label"><i class="fas fa-wind"></i> Wind</span>
                <span class="aviation-value">${cardinalWind} @ ${result.avgWindSpeed.toFixed(0)} kts</span>
              </div>
              <div class="aviation-metric">
                <span class="aviation-label"><i class="fas fa-cloud-showers-heavy"></i> Precip Chance</span>
                <span class="aviation-value">${result.avgPrecipitationChance.toFixed(0)}%</span>
              </div>
              <div class="aviation-metric">
                <span class="aviation-label"><i class="fas fa-cloud"></i> Sky Cover</span>
                <span class="aviation-value">${result.avgSkyCover.toFixed(0)}%</span>
              </div>
            </div>
          `;
          el.innerHTML = html;
        } else {
          el.textContent = result.message;
        }
        el.classList.add('map-display');
      },
      metadata: `
        <h5>Aviation Atmospheric Conditions</h5>
        <p>Displays a summary of conditions relevant to aviation, derived from the NWS forecast grid data. Values are an average over the selected area.</p>
        <p><strong>Flight Category</strong> is an estimate based on visibility (VFR, MVFR, IFR, LIFR). <strong>Wind</strong> is shown in cardinal direction and knots. <strong>Visibility</strong> is in statute miles.</p>
        <p><strong>Source:</strong> <a href="https://www.weather.gov/documentation/services-web-api" target="_blank">NOAA NWS API</a></p>
      `
    }
    , {
        id: 'svi',
        label: 'Social Vulnerability Index (SVI)',
        description: 'Calculates the average CDC Social Vulnerability Index for counties within the bounding box.',
        analysisFn: async (bounds) => {
            if (sviData.size === 0) {
                return { message: 'SVI data not loaded or is empty.' };
            }

            const intersectingCountiesSVI = [];
            const boundingRectangle = (bounds instanceof Cesium.Rectangle) ?
                bounds :
                Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);

            const promises = usCountiesData.map(async (countyFeature) => {
                const countySvi = sviData.get(countyFeature.id); // Use the feature's top-level 'id' for FIPS

                if (countySvi && countySvi.overall !== -1) {
                    // This is a fast approximation. For perfect accuracy, a polygon-polygon intersection test would be needed.
                    const entity = await Cesium.GeoJsonDataSource.load(countyFeature).then(ds => ds.entities.values[0]);
                    if (entity && entity.polygon) {
                        const hierarchy = entity.polygon.hierarchy.getValue();
                        if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
                            const countyBoundingRect = Cesium.Rectangle.fromCartesianArray(hierarchy.positions, Cesium.Ellipsoid.WGS84);
                            if (Cesium.Rectangle.intersection(boundingRectangle, countyBoundingRect)) {
                                intersectingCountiesSVI.push(countySvi.overall);
                            }
                        }
                    }
                }
            });

            await Promise.all(promises);

            if (intersectingCountiesSVI.length > 0) {
                const sum = intersectingCountiesSVI.reduce((a, b) => a + b, 0);
                const avg = sum / intersectingCountiesSVI.length;
                return {
                    message: `Avg. SVI: ${avg.toFixed(3)}`,
                    value: avg,
                    count: intersectingCountiesSVI.length
                };
            } else {
                return { message: 'No counties with SVI data found in this area.' };
            }
        },
        displayFn: (result, el) => { // Make the SVI result more readable
            if (result.value !== undefined) {
                const svi = result.value;
                let level = '';
                let color = '';

                // Corrected SVI thresholds for more intuitive labeling
                if (svi >= 0.80) {
                    level = 'High';
                    color = '#d32f2f'; // Red
                } else if (svi >= 0.60) {
                    level = 'Moderate-High';
                    color = '#ffa000'; // Orange
                } else if (svi >= 0.40) {
                    level = 'Moderate';
                    color = '#fbc02d'; // Yellow
                } else if (svi >= 0.20) {
                    level = 'Low-Moderate';
                    color = '#9ccc65'; // Light Green
                } else {
                    level = 'Low';
                    color = '#4caf50'; // Green
                }

                const html = `
                    <div class="svi-result">
                        <div class="svi-header">
                            <span class="svi-level" style="background-color: ${color};">${level}</span>
                            <span class="svi-value">Avg. SVI: <strong>${svi.toFixed(3)}</strong></span>
                        </div>
                        <p class="svi-explanation">
                            On average, the ${result.count} counties in this area are more socially vulnerable than
                            <strong>${(svi * 100).toFixed(0)}%</strong> of U.S. counties.
                        </p>
                    </div>
                `;
                el.innerHTML = html;
            } else {
                el.textContent = result.message;
            }
        },
        metadata: `
        <h5>CDC/ATSDR Social Vulnerability Index (SVI)</h5>
        <p>The SVI uses U.S. Census data to determine the social vulnerability of every county. This filter shows the average overall percentile ranking (RPL_THEMES) for intersected counties. Higher values indicate greater vulnerability.</p>
        <p><strong>Source:</strong> Centers for Disease Control and Prevention/ Agency for Toxic Substances and Disease Registry/ Geospatial Research, Analysis, and Services Program. CDC/ATSDR Social Vulnerability Index 2022 Database U.S.</p>`
    }, {
      id: 'river-gauges',
      label: 'River Gauges',
      description: "Finds river gauges from NOAA's National Water Prediction Service within the area.",
      analysisFn: fetchRiverGauges,
      displayFn: (result, el) => {
        if (result.gauges) {
          const count = result.gauges.length;
          if (count > 0) {
            el.innerHTML = `
              <div class="gauge-result">
                <span class="gauge-count">${count}</span>
                <span class="gauge-count-label">River Gauge${count > 1 ? 's' : ''} Found</span>
              </div>
              <p class="gauge-instructions">Click a gauge icon <i class="fas fa-tint" style="color: #1e90ff;"></i> on the map for forecast details.</p>
            `;
            renderRiverGauges(result.gauges);
          } else {
            el.textContent = 'No river gauges found in this area.';
          }
        } else {
          el.textContent = result.message || 'Could not retrieve gauge data.';
        }
        el.classList.add('map-display');
      },
      metadata: `
        <h5>NOAA River Gauges</h5>
        <p>
          Displays river gauge locations provided by the NOAA National Water Prediction Service (NWPS).
          Clicking on a gauge icon on the map will fetch and display the latest analysis and assimilation forecast for that location, including river stage and flow.
        </p>
        <p><strong>Source:</strong> <a href="https://api.water.noaa.gov/nwps/v1/docs" target="_blank">NOAA NWPS API</a></p>
      `
    }, {
      id: 'co2-sensor',
      label: 'CO2 Digital Twin',
      description: 'Shows the latest reading from a custom CO2 sensor if it is within the selected area.',
      analysisFn: fetchCo2Sensor,
      displayFn: (result, el) => {
        if (result.sensorData) {
          const { co2, temperature, humidity } = result.sensorData;
          el.innerHTML = `
            <div class="sensor-result">
              <div class="sensor-metric">
                <span class="sensor-label">CO₂:</span>
                <span class="sensor-value">${co2.toFixed(0)} ppm</span>
              </div>
              <div class="sensor-metric">
                <span class="sensor-label">Temp:</span>
                <span class="sensor-value">${temperature.toFixed(1)}°C</span>
              </div>
              <div class="sensor-metric">
                <span class="sensor-label">Humidity:</span>
                <span class="sensor-value">${humidity.toFixed(1)}%</span>
              </div>
            </div>
            <p class="gauge-instructions">Click the sensor icon <i class="fas fa-broadcast-tower" style="color: #00BFFF;"></i> on the map for details.</p>
          `;
        } else {
          el.textContent = result.message || 'Could not retrieve sensor data.';
        }
      },
      metadata: `
        <h5>CO₂ Digital Twin Sensor</h5>
        <p>
          Fetches the most recent data point from a custom environmental sensor via the Blues Notehub API.
          The sensor will only be displayed if its last known coordinates fall within the active bounding box.
        </p>
        <p><strong>Source:</strong> Blues Notehub API</p>
      `
    },
    {
      id: 'flood-level',
      label: 'Flood Level Analysis',
      description: 'Analyzes mock flood level points within the selected area to determine risk levels.',
      analysisFn: async (bounds) => {
        clearFloodLevelEntities();
    
        /**
         * Maps a flood depth value to a color on a green-to-red gradient.
         * @param {number} depth The flood depth in feet.
         * @param {number} minDepth The minimum depth for the start of the gradient (e.g., 0).
         * @param {number} maxDepth The maximum depth for the end of the gradient (e.g., 4.5).
         * @returns {Cesium.Color} The calculated color.
         */
        function getColorForFloodDepth(depth, minDepth = 0, maxDepth = 4.5) {
          const ratio = Math.min(Math.max((depth - minDepth) / (maxDepth - minDepth), 0), 1);
    
          let r, g;
          if (ratio < 0.5) {
            // Green to Yellow
            r = 2 * ratio;
            g = 1;
          } else {
            // Yellow to Red
            r = 1;
            g = 1 - 2 * (ratio - 0.5);
          }
          return new Cesium.Color(r, g, 0, 1.0);
        }
    
        const response = await fetch('/data/mock_flood_data_snapped.csv');
        const csvText = await response.text();
        const lines = csvText.split('\n').slice(1); // Skip header
    
        const pointsInBounds = [];
        const analysisBounds = (bounds instanceof Cesium.Rectangle) ?
          bounds :
          Cesium.Rectangle.fromCartesianArray(bounds.positions, Cesium.Ellipsoid.WGS84);
    
        lines.forEach(line => {
          const columns = line.split(',');
          if (columns.length < 10) return;
    
          const depth = parseFloat(columns[5]);
          const lat = parseFloat(columns[8]); // Snapped Latitude is in the 9th column (index 8)
          const lon = parseFloat(columns[9]); // Snapped Longitude is in the 10th column (index 9)
    
          if (!isNaN(lat) && !isNaN(lon) && !isNaN(depth)) {
            const pointCartographic = Cesium.Cartographic.fromDegrees(lon, lat);
            if (Cesium.Rectangle.contains(analysisBounds, pointCartographic)) {
              pointsInBounds.push({ lat, lon, depth });
            }
          }
        });
    
        if (pointsInBounds.length === 0) {
          return { overallRisk: 'none', stats: null };
        }
    
        pointsInBounds.forEach(point => {
          const color = getColorForFloodDepth(point.depth);
    
          const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
            point: {
              pixelSize: 10,
              color: color,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              isFloodPoint: true,
              depth: point.depth,
            }
          });
          floodLevelEntities.push(entity);
        });
    
        // Enhanced Risk Analysis
        const totalDepth = pointsInBounds.reduce((sum, p) => sum + p.depth, 0);
        const averageDepth = totalDepth / pointsInBounds.length;
        const maxDepth = Math.max(...pointsInBounds.map(p => p.depth));
        const highRiskThreshold = 2.5; // ft
        const highRiskPoints = pointsInBounds.filter(p => p.depth >= highRiskThreshold).length;
    
        // Scoring system for risk assessment
        let riskScore = 0;
        // Score based on average depth
        if (averageDepth > 0.5) riskScore += 1;
        if (averageDepth > 1.5) riskScore += 2;
        if (averageDepth > 2.5) riskScore += 2;
    
        // Score based on high-risk points
        if (highRiskPoints > 0) riskScore += 2;
        if (highRiskPoints / pointsInBounds.length > 0.25) riskScore += 2; // If >25% of points are high risk
    
        let overallRisk;
        if (riskScore <= 2) {
          overallRisk = 'Low';
        } else if (riskScore <= 5) {
          overallRisk = 'Moderate';
        } else {
          overallRisk = 'High';
        }
    
        return {
          overallRisk,
          stats: {
            averageDepth: averageDepth,
            maxDepth: maxDepth,
            highRiskPoints: highRiskPoints,
            totalPoints: pointsInBounds.length
          }
        };
      },
      displayFn: (result, el) => {
        if (result.overallRisk && result.overallRisk !== 'none') {
          el.innerHTML = `
            <div class="flood-level-result">
              <div class="flood-cluster-label">Overall Area Risk</div>
              <div class="flood-cluster-value risk-${result.overallRisk.toLowerCase()}">${result.overallRisk}</div>
              <div class="flood-stats-grid">
                <div class="flood-stat-item"><span class="sensor-label">Avg. Depth</span><span class="sensor-value">${result.stats.averageDepth.toFixed(2)} ft</span></div>
                <div class="flood-stat-item"><span class="sensor-label">Max Depth</span><span class="sensor-value">${result.stats.maxDepth.toFixed(2)} ft</span></div>
                <div class="flood-stat-item" style="grid-column: 1 / -1;"><span class="sensor-label">High Risk Points (>2.5ft)</span><span class="sensor-value">${result.stats.highRiskPoints} / ${result.stats.totalPoints}</span></div>
              </div>
            </div>
          `;
        } else if (result.overallRisk === 'none') {
          el.textContent = 'No flood data points found in this area.';
        } else {
          el.textContent = result.message || 'No flood data in this area.';
        }
        el.classList.add('map-display');
      },
      metadata: `
        <h5>Flood Level Risk Analysis</h5>
        <p>
          This algorithm assesses flood risk by analyzing the statistical distribution of flood depth points within the selected area. It calculates the average depth, maximum depth, and the percentage of points exceeding a high-risk threshold (2.5 ft).
        </p>
        <p>
          A risk score is computed based on these statistics to classify the area as 'Low', 'Moderate', or 'High' risk. This provides a more nuanced assessment than a simple average.
        </p>
        <p>
          The methodology is conceptually similar to unsupervised clustering techniques used in data science to group data points and identify areas of interest.
        </p>
        <p><strong>Conceptual Source:</strong> <a href="https://scikit-learn.org/stable/modules/clustering.html" target="_blank">Scikit-learn Clustering</a></p>
      `
    }
  ];

  /**
   * Resets all filter UI elements in the bounding box dialog to their default, non-activated state.
   * This is a centralized function to ensure consistent UI cleanup.
   */
  function resetAllFiltersUI() {
    const filterItems = document.querySelectorAll('.bb-filter-item');
    filterItems.forEach(item => {
      const checkbox = item.querySelector('.filter-checkbox');
      const display = item.querySelector('.filter-display-result');
      const control = item.querySelector('.bb-filter-control');
      const description = item.querySelector('.bb-filter-item-desc');
      const infoBtn = item.querySelector('.bb-filter-info-btn');

      // Remove all state-related classes
      item.classList.remove('locked', 'inactive-while-locked');

      // Reset display elements
      if (display) {
        display.classList.add('hidden');
        display.classList.remove('map-display');
        display.textContent = ''; // Clear old results
      }

      // Restore controls
      if (control) control.classList.remove('hidden');
      if (checkbox) {
        checkbox.classList.remove('hidden');
        checkbox.disabled = false;
      }
      if (description) description.style.display = '';
      if (infoBtn) infoBtn.style.display = '';
    });
  }
  // Main analysis runner
  async function runBoundingBoxAnalysis() {
    if (!currentBoundingBox) return;
    let bounds;
    if (currentBoundingBox.rectangle) {
        bounds = currentBoundingBox.rectangle.coordinates.getValue();
    } else if (currentBoundingBox.polygon) {
        bounds = currentBoundingBox.polygon.hierarchy.getValue();
    }

    for (const filterId in filterState) {
      if (filterState[filterId]) { // If filter is checked
        const def = filterDefinitions.find(d => d.id === filterId);
        if (!def || !def.analysisFn) continue;

        const item = document.querySelector(`.bb-filter-item[data-filter-id="${filterId}"]`);
        const display = item.querySelector('.filter-display-result');
        
        updateProgressBar(display, 0, 1, 'Loading...');
        try {
          const result = await def.analysisFn(bounds);
          def.displayFn(result, display);
          if (def.postRenderFn) {
            def.postRenderFn();
          }
        } catch (error) {
          // Display the error message in the UI and log the full error to the console.
          const errorMessage = error.message || 'An unexpected error occurred.';
          display.innerHTML = `<span style="color: #ff5252;">Error: ${errorMessage}</span>`;
          display.classList.remove('hidden');
          console.error(`Analysis failed for ${filterId}:`, error);
        }
      }
    }
  }

  async function handleActivateBoundingBox() {
    if (!currentBoundingBox) return;

    // Toggle the activation state
    isBoundingBoxActivated = !isBoundingBoxActivated;

    const filterItems = document.querySelectorAll('.bb-filter-item');
    filterItems.forEach(item => {
      const checkbox = item.querySelector('.filter-checkbox');
      const filterId = item.dataset.filterId;
      const isSelected = filterState[filterId];

      if (isBoundingBoxActivated) {
        item.classList.add('locked');
        checkbox.disabled = true;
        const display = item.querySelector('.filter-display-result');
        const control = item.querySelector('.bb-filter-control');
        const description = item.querySelector('.bb-filter-item-desc');
        const infoBtn = item.querySelector('.bb-filter-info-btn');

        if (isSelected) {
          item.classList.remove('inactive-while-locked');
          if (control) control.classList.add('hidden');
          display.classList.remove('hidden');
          display.textContent = 'Pending...';
          if (description) description.style.display = '';
          if (infoBtn) infoBtn.style.display = '';
        } else {
          item.classList.add('inactive-while-locked');
          if (control) control.classList.add('hidden');
          if (description) description.style.display = 'none';
          if (infoBtn) infoBtn.style.display = 'none';
        }
      } else {
        // Deactivating the box, reset all filters to their default state
        resetAllFiltersUI();
      }
    });


    if (isBoundingBoxActivated) {
      // Change appearance to "activated"
      // --- FIX: Disable controls during activation/loading ---
      bbEditBtn.disabled = true;
      bbDeleteBtn.disabled = true;
      bbActivateBtn.textContent = 'Loading...';
      bbActivateBtn.disabled = true;
      
      if (currentBoundingBox.rectangle) {
        currentBoundingBox.rectangle.material = colorActive;
        currentBoundingBox.rectangle.outlineColor = colorActive.withAlpha(1.0);
      } else if (currentBoundingBox.polygon) {
        currentBoundingBox.polygon.material = colorActive;
        currentBoundingBox.polygon.outlineColor = colorActive.withAlpha(1.0);
      }

      console.log('Bounding box activated.');
      await runBoundingBoxAnalysis(); // Run the (dummy) API calls

      // --- FIX: Re-enable controls after loading ---
      // Disable edit for polygons
      bbEditBtn.disabled = !!currentBoundingBox.polygon;
      bbEditBtn.disabled = false;
      bbDeleteBtn.disabled = false;
      bbActivateBtn.disabled = false;
    } else {
      // Change appearance back to default "active" but not "activated"
      currentBoundingBox.rectangle.material = colorInactive;
      currentBoundingBox.rectangle.outlineColor = colorInactive.withAlpha(1.0);
      console.log('Bounding box deactivated.');
      clearWeatherAlerts();
      clearTemperatureGrid();
    }
    updateBoundingBoxUI('active'); // Refresh the UI to update the button text
  }

  function handleDeleteBoundingBox() {
    bbFilterDialog.classList.add('hidden'); // Hide the filter dialog
    if (currentBoundingBox) {
      viewer.entities.remove(currentBoundingBox);
      currentBoundingBox = null;
      isBoundingBoxActivated = false;
      clearTemperatureGrid();
      resetAllFiltersUI();
      clearWeatherAlerts();
      bbStatsPopup.classList.remove('visible');
      clearRiverGauges();
      clearSensorEntities();
      clearFloodLevelEntities();
    }
    updateBoundingBoxUI('initial');
    console.log('Bounding box deleted.');
  }

  /**
   * Calculates and displays statistics (area, perimeter, center) for the current bounding box.
   */
  function calculateAndShowBoundingBoxStats() {
    if (!currentBoundingBox) return;

    let area = 0;
    let perimeter = 0;
    let centerCartographic = null;

    // Helper to format large numbers with commas
    const formatNumber = (num) => num.toLocaleString(undefined, { maximumFractionDigits: 2 });

    if (currentBoundingBox.rectangle) {
      const rect = currentBoundingBox.rectangle.coordinates.getValue();
      const ellipsoid = viewer.scene.globe.ellipsoid;      
      const cartographicCorners = [
          Cesium.Cartographic.fromRadians(rect.west, rect.north),
          Cesium.Cartographic.fromRadians(rect.east, rect.north),
          Cesium.Cartographic.fromRadians(rect.east, rect.south),
          Cesium.Cartographic.fromRadians(rect.west, rect.south)
        ];
      const cartesianCorners = ellipsoid.cartographicArrayToCartesianArray(cartographicCorners);

      // Calculate Area
      // A robust way to calculate area for a rectangle on the ellipsoid.
      // This is a geometric approximation for a spherical rectangle.
      area =
        (rect.east - rect.west) *
        (ellipsoid.maximumRadius * ellipsoid.maximumRadius) *
        Math.abs(Math.sin(rect.south) - Math.sin(rect.north));

      // Calculate Perimeter
      for (let i = 0; i < cartographicCorners.length; i++) {
        const p1 = cartographicCorners[i];
        const p2 = cartographicCorners[(i + 1) % cartographicCorners.length];
        perimeter += new Cesium.EllipsoidGeodesic(p1, p2, ellipsoid).surfaceDistance;
      }

      centerCartographic = Cesium.Rectangle.center(rect);
    } else if (currentBoundingBox.polygon) {
      const hierarchy = currentBoundingBox.polygon.hierarchy.getValue();
      const positions = hierarchy.positions;

      if (positions.length >= 3) {
        // Calculate Area
        // --- NEW ROBUST APPROACH ---
        // This self-contained function calculates the area of a spherical polygon
        // without relying on potentially missing Cesium API functions.
        try {
          const ellipsoid = viewer.scene.globe.ellipsoid;
          const radius = ellipsoid.maximumRadius; // Use average radius for spherical approximation
          const cartographics = positions.map(p => Cesium.Cartographic.fromCartesian(p));

          let totalArea = 0;
          for (let i = 0; i < cartographics.length; i++) {
            const p1 = cartographics[i];
            const p2 = cartographics[(i + 1) % cartographics.length];

            // Spherical excess calculation for each segment
            const lon1 = p1.longitude;
            const lat1 = p1.latitude;
            const lon2 = p2.longitude;
            const lat2 = p2.latitude;

            // This is an adaptation of the shoelace formula for spherical polygons.
            // It calculates the signed area of the trapezoid formed by the segment and the equator.
            let segmentArea = (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
            totalArea += segmentArea;
          }

          // The final area is half the absolute value of the total, scaled by the radius squared.
          area = Math.abs(totalArea / 2) * radius * radius;

        } catch (e) { console.error("Area calculation failed:", e); area = 0; }

        // Calculate Perimeter
        const cartographics = positions.map(p => Cesium.Cartographic.fromCartesian(p));
        for (let i = 0; i < positions.length; i++) {
          const p1 = cartographics[i];
          const p2 = cartographics[(i + 1) % positions.length];
          perimeter += new Cesium.EllipsoidGeodesic(p1, p2, viewer.scene.globe.ellipsoid).surfaceDistance;
        }

        // Get Center (approximated by the center of the bounding sphere)
        const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
        centerCartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
      }
    }

    // Update the UI
    if (bbStatsArea && bbStatsPerimeter && bbStatsCenter) {
      // Convert to km² and km for readability
      const areaKm2 = area / 1e6;
      const perimeterKm = perimeter / 1e3;

      // Convert to sq miles and miles
      const areaMi2 = areaKm2 * 0.386102;
      const perimeterMi = perimeterKm * 0.621371;

      // Store raw values for the copy-to-clipboard functionality
      currentStats = {
        areaKm2,
        areaMi2,
        perimeterKm,
        perimeterMi,
        lat: centerCartographic ? Cesium.Math.toDegrees(centerCartographic.latitude) : 0,
        lon: centerCartographic ? Cesium.Math.toDegrees(centerCartographic.longitude) : 0,
      };

      bbStatsArea.innerHTML = `${formatNumber(areaKm2)} km² <br> (${formatNumber(areaMi2)} mi²)`;
      bbStatsPerimeter.innerHTML = `${formatNumber(perimeterKm)} km <br> (${formatNumber(perimeterMi)} mi)`;

      if (centerCartographic) {
        // Increased precision to 6 decimal places
        bbStatsCenter.textContent = `${currentStats.lat.toFixed(6)}, ${currentStats.lon.toFixed(6)}`;
      } else {
        bbStatsCenter.textContent = 'N/A';
      }
    }
  }

  // --- Bounding Box Info Popup Logic ---
  const bbInfoBtn = document.getElementById('bbInfoBtn');
  const bbInfoPopup = document.getElementById('bbInfoPopup');
  const bbInfoCloseBtn = document.getElementById('bbInfoCloseBtn');

  if (bbInfoBtn && bbInfoPopup && bbInfoCloseBtn) {
    bbInfoBtn.onclick = function() {
      bbInfoPopup.classList.toggle('visible');
    };
    bbInfoCloseBtn.onclick = function() {
      bbInfoPopup.classList.remove('visible');
    };
  }

  function showFilterMetadataPopup(filterId) {
    // Remove any existing popups first to avoid duplicates
    const existingPopup = document.getElementById('filterMetadataPopup');
    // If a popup for the same filter is already open, close it and return.
    if (existingPopup && existingPopup.dataset.filterId === filterId) {
      existingPopup.remove();
      return;
    }
    // If any other popup is open, remove it before showing the new one.
    if (existingPopup) {
      existingPopup.remove();
    }
  
    const filterDefinition = filterDefinitions.find(def => def.id === filterId);
    if (!filterDefinition) return;
  
    const infoBtnElement = document.querySelector(`.bb-filter-item[data-filter-id="${filterId}"] .bb-filter-info-btn`);
    if (!infoBtnElement) return;
  
    // Create the popup dynamically
    const popup = document.createElement('div');
    popup.id = 'filterMetadataPopup';
    popup.dataset.filterId = filterId; // Tag popup with its filter ID
    popup.className = 'bb-info-popup visible';
  
    popup.innerHTML = `
      <button class="bb-info-close-btn" onclick="this.parentElement.remove()">&times;</button>
      <div class="bb-info-section">${filterDefinition.metadata}</div>
    `;
    
    document.body.appendChild(popup);
  
    // Position the popup relative to the button, ensuring it stays in the viewport
    const btnRect = infoBtnElement.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const margin = 10; // 10px margin from screen edges
  
    let top = btnRect.top - popupRect.height - margin;
    // If not enough space above, show below
    if (top < margin) {
      top = btnRect.bottom + margin;
    }
  
    popup.style.top = `${top}px`;
    popup.style.left = `${btnRect.left}px`;
  }
  function initializeFilterDialog() {
    const filterContent = document.getElementById('bbFilterContent');
    if (!filterContent) return;
    filterContent.innerHTML = ''; // Clear any hardcoded content

    filterDefinitions.forEach(def => {
      const item = document.createElement('div');
      item.className = 'bb-filter-item';
      item.dataset.filterId = def.id;

      item.innerHTML = `
        <div class="bb-filter-control">
          <input type="checkbox" id="filter-${def.id}-checkbox" class="filter-checkbox" />
        </div>
        <div class="bb-filter-item-text-content">
          <div class="bb-filter-item-header">
            <label for="filter-${def.id}-checkbox">${def.label}</label>
            <button class="bb-filter-info-btn" title="Show metadata for ${def.label}">i</button>
          </div>
          <p class="bb-filter-item-desc">${def.description}</p>
          <div class="filter-display-result hidden"></div>
        </div>
      `;
      filterContent.appendChild(item);

      const checkbox = item.querySelector('.filter-checkbox');
      filterState[def.id] = checkbox.checked;
      checkbox.addEventListener('change', (e) => {
        filterState[def.id] = e.target.checked;
        item.classList.toggle('selected', e.target.checked);
        updateBoundingBoxUI(boundingBoxState); // Re-evaluate button states
      });

      // Make the whole item clickable to toggle the checkbox
      item.addEventListener('click', (e) => {
        // Do nothing if the click was on the info button or the checkbox itself
        if (e.target.closest('.bb-filter-info-btn') || e.target.matches('.filter-checkbox')) {
          return;
        }
        // Do nothing if the filters are locked
        if (item.classList.contains('locked')) {
          return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change')); // Trigger the change event to update state
      });

      const infoBtn = item.querySelector('.bb-filter-info-btn');
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent other click events
        showFilterMetadataPopup(def.id);
      });
    });
  }

  if (bbFilterToggleBtn) {
    bbFilterToggleBtn.onclick = function() {
      const isMinimized = bbFilterDialog.classList.toggle('minimized');
      this.textContent = isMinimized ? '+' : '-';
      this.title = isMinimized ? 'Restore' : 'Minimize';
    };
  }

  // Initial setup calls
  initializeFilterDialog();
  updateBoundingBoxUI('initial');
  fetchBoundaryData();
  // fetchSviData is now correctly called here
  fetchSviData();

  // Populate SVI source info in the sidebar
  const sviSourceInfo = document.getElementById('svi-source-info');
  if (sviSourceInfo) {
    sviSourceInfo.innerHTML = `
      <h6>Social Vulnerability Index</h6>
      <p>Centers for Disease Control and Prevention/ Agency for Toxic Substances and Disease Registry/ Geospatial Research, Analysis, and Services Program. CDC/ATSDR Social Vulnerability Index 2022 Database U.S.</p>
    `;
  }

};