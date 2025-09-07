// Initialize app when window loads
window.onload = async function () {
  // 1. Fetch configuration from server including Cesium Ion access token
  try {
    const response = await fetch("/config");
    const config = await response.json();

    if (config.cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = config.cesiumIonToken;
    } else {
      console.error("No Cesium Ion token provided in server config");
    }
  } catch (error) {
    console.error("Failed to load configuration:", error);
  }

  // 511NY Camera API Configuration
  let cameraEntities = [];
  let activeCameraInfoBox = null;
  let camerasVisible = false; // Set to false by default

  // Emergency Management Configuration
  let emEventEntities = [];
  let emEventsVisible = false;

  // --- Bounding Box Variables ---
  let boundingBoxState = 'initial'; // States: 'initial', 'creating', 'active', 'editing'
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

  // Function to fetch and process camera data
  async function fetchAndProcessCameras() {
    try {
      console.log("Fetching camera data...");
      // Revert to using the local JSON file
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

      // Process each camera
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

  // Function to create camera info box HTML
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

  // Function to create emergency event info box HTML
  function createEmergencyEventInfoBox(event) {
    // Format timestamp if available
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
      // Create a unique ID for this carousel
      const carouselId = `carousel-${Date.now()}`;

      // Generate carousel slides
      const slides = event.images
        .map((img, index) => {
          return `
          <div class="carousel-slide ${
            index === 0 ? "active" : ""
          }" data-index="${index}">
            <img src="${img}" class="carousel-image" />
          </div>
        `;
        })
        .join("");

      // Generate carousel navigation dots
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

      // Add carousel navigation function if it doesn't exist
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

          // Calculate next index
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

  // 2. Initialize the Cesium Viewer with specific options
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

  // Set initial camera view to Florida coordinates
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      -81.20002771749041,
      28.60263460486482,
      100000
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0,
    },
  });

  // Add camera info box container to the DOM
  const cameraInfoContainer = document.createElement("div");
  cameraInfoContainer.id = "cameraInfoContainer";
  cameraInfoContainer.style.display = "none";
  document.body.appendChild(cameraInfoContainer);

  // Add click handler for camera entities and emergency events
  const cameraHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  cameraHandler.setInputAction((click) => {
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
      } else {
        if (activeCameraInfoBox) {
          activeCameraInfoBox.style.display = "none";
          activeCameraInfoBox = null;
        }
      }
    } else {
      if (activeCameraInfoBox) {
        activeCameraInfoBox.style.display = "none";
        activeCameraInfoBox = null;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Function to toggle camera visibility
  async function toggleCameras() {
    // fetch camera data if it does not exist
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
        : "Show NY Street Cameras";
      // Only fly to the specific NY point when cameras are shown
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

  // 3. Load Google Photorealistic 3D Tiles
  async function loadTileset() {
    try {
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
        GOOGLE_3D_TILESET_ASSET_ID
      );
      viewer.scene.primitives.add(tileset);

      // Load and plot GPS points
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
  // No need to define API key here as it's handled by the server proxy
  function addTrafficLayer() {
    try {
      console.log("Adding traffic layer...");
      const ts = Date.now();
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `/tomtom-traffic?z={z}&x={x}&y={y}&ts=${ts}`,
        credit: "Traffic data TomTom",
        maximumLevel: 20,
        // Add error handling for tile loading
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

  // Emergency Management functionality
  async function fetchEmergencyEvents() {
    try {
      // Show loading indicator
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

      // Create a point primitive collection for better performance with many points
      const pointPrimitives = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );

      // Process each event and add it to the map
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

        // Add point primitive for each event (visual display)
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

        // Add the entity with additional information for click events
        // Using a larger transparent hit area to make clicking easier
        const entity = viewer.entities.add({
          position: elevatedPosition,
          point: {
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

      // Fly to the first event if available
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

      // Reset button state
      if (sidebarEmergencyManageBtn) {
        sidebarEmergencyManageBtn.textContent = "Emergency Management";
        sidebarEmergencyManageBtn.disabled = false;
        sidebarEmergencyManageBtn.classList.remove("active");
      }
    }
  }

  // Function to clear emergency event entities from the map
  function clearEmergencyEvents() {
    // Remove entities
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

  // Function to toggle emergency events visibility
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
    } else {
      removeTileset();
      setBaseLayerToBing();
      addTrafficLayer();
      sidebarTrafficBtn.classList.add("active");
      sidebarTrafficBtn.textContent = "Hide Live Traffic";
      startTrafficAnimation();
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

  // Emergency Management button click handler
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
              ${
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
      return data.address && data.address.postcode
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
    // Remove any existing image popup
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
    // Remove any existing video popup
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

    // Create close button
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

  function setupModalClose() {
    const modal = document.getElementById("imageModal");
    const closeBtn = document.getElementById("modalCloseBtn");
    if (closeBtn) {
      closeBtn.onclick = function (e) {
        e.stopPropagation();
        modal.style.display = "none";
        document.getElementById("modalImg").src = "";
      };
    }
    if (modal) {
      modal.onclick = function (event) {
        if (event.target === modal) {
          modal.style.display = "none";
          document.getElementById("modalImg").src = "";
        }
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupModalClose);
  } else {
    setupModalClose();
  }

  // Add Camera Interoperability (Path Toggle) button logic
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
        stopTrafficAnimation();
      }
      // Toggle Traffic View layer
      if (trafficViewLayer) {
        viewer.imageryLayers.remove(trafficViewLayer, false);
        trafficViewLayer = null;
        this.classList.remove("active");
        this.textContent = "Traffic View";
      } else {
        // Example: Using MapTiler Traffic tiles (replace with your provider if different)
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
    // Add click handler for FDOT camera points
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
  const bbEditBtn = document.getElementById('bbEditBtn');
  const bbActivateBtn = document.getElementById('bbActivateBtn');
  const bbDeleteBtn = document.getElementById('bbDeleteBtn');
  const boundingBoxUI = document.getElementById('boundingBoxUI');
  const bbTitle = document.querySelector('.bounding-box-text');
  const bbDescription = document.querySelector('.bounding-box-description');

  // --- Bounding Box Filter Dialog Elements ---
  const bbFilterDialog = document.getElementById('bbFilterDialog');
  const bbFilterToggleBtn = document.getElementById('bbFilterToggleBtn');
  const filterState = {};

  // Define colors for different states
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
    bbEditBtn.disabled = true;
    bbActivateBtn.disabled = true;
    bbDeleteBtn.disabled = true;

    // Reset title attribute for activate button
    bbActivateBtn.removeAttribute('title');


    switch (boundingBoxState) {
      case 'initial':
        boundingBoxUI.classList.add('state-initial');
        break;
      case 'creating':
        bbCreateBtn.textContent = 'Cancel';
        bbTitle.textContent = 'Drawing Bounding Box...';
        bbDescription.textContent = 'Click and drag to draw. Right-click or press Esc to cancel.';
        boundingBoxUI.classList.add('state-creating');
        break;
      case 'active':
        bbCreateBtn.disabled = true;
        bbEditBtn.disabled = false;
        bbActivateBtn.disabled = false;
        bbDeleteBtn.disabled = false;

        // Check if any filter is selected
        const anyFilterSelected = Object.values(filterState).some(v => v);
        if (!anyFilterSelected) {
          bbActivateBtn.disabled = true;
          bbActivateBtn.title = 'Enable one or more filters to query';
        }

        if (isBoundingBoxActivated) {
          bbActivateBtn.textContent = 'Deactivate';
          bbTitle.textContent = 'Bounding Box Active';
          bbDescription.textContent = 'Box is active. Filtering or analysis can be performed.';
          boundingBoxUI.classList.add('state-active');
        } else {
          bbActivateBtn.textContent = 'Activate';
          bbTitle.textContent = 'Bounding Box Set';
          bbDescription.textContent = 'Box is ready. You can now edit, activate, or delete it.';
          boundingBoxUI.classList.add('state-inactive');
        }
        break;
      case 'editing':
        bbCreateBtn.textContent = 'Save';
        bbCreateBtn.disabled = false;
        bbEditBtn.textContent = 'Cancel';
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
    if (boundingBoxState === 'initial') handleCreateBoundingBox();
    else if (boundingBoxState === 'creating') handleCancelBoundingBox();
    else if (boundingBoxState === 'editing') handleSaveBoundingBox();
  };
  bbEditBtn.onclick = () => {
    if (boundingBoxState === 'active') handleEditBoundingBox();
    else if (boundingBoxState === 'editing') handleCancelEdit();
  };
  bbActivateBtn.onclick = handleActivateBoundingBox;
  bbDeleteBtn.onclick = handleDeleteBoundingBox;

  // Listener for the Escape key to cancel drawing
  const escapeKeyListener = (event) => {
    if (event.key === 'Escape') {
        handleCancelBoundingBox();
    }
  };

  function handleCreateBoundingBox() {
    updateBoundingBoxUI('creating');
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

    // Pad the rectangle slightly to zoom out a bit
    const zoomOutFactor = 0.2; // 20% padding
    const paddedRect = Cesium.Rectangle.clone(rect);
    paddedRect.west -= rect.width * zoomOutFactor;
    paddedRect.east += rect.width * zoomOutFactor;
    paddedRect.south -= rect.height * zoomOutFactor;
    paddedRect.north += rect.height * zoomOutFactor;

    // Animate camera to focus on the new bounding box
    viewer.camera.flyTo({
      // Use the padded rectangle for camera destination to zoom out slightly
      destination: paddedRect,
      duration: 1.5 // Animation duration in seconds
    });

    console.log('Bounding box finalized:', rect);
    updateBoundingBoxUI('active');
  }

  function handleCancelBoundingBox() {
    bbFilterDialog.classList.add('hidden'); // Hide the filter dialog
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
    if (!currentBoundingBox) return;

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
    if (!currentBoundingBox) return;
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
          // --- New Intuitive Drag Logic ---
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
    removeEditHandles();
    viewer.canvas.style.cursor = 'default';

    // Finalize the new coordinates
    if (currentBoundingBox) {
      const finalRect = currentBoundingBox.rectangle.coordinates.getValue();
      boundingBoxCoordinates = [
        Cesium.Cartesian3.fromRadians(finalRect.west, finalRect.south),
        Cesium.Cartesian3.fromRadians(finalRect.east, finalRect.north)
      ];
      // Revert to a static rectangle for performance
      currentBoundingBox.rectangle.coordinates = finalRect;

      // --- FIX: Restore the correct color after saving ---
      if (isBoundingBoxActivated) {
        currentBoundingBox.rectangle.material = colorActive;
        currentBoundingBox.rectangle.outlineColor = colorActive.withAlpha(1.0);
      } else {
        currentBoundingBox.rectangle.material = colorInactive;
        currentBoundingBox.rectangle.outlineColor = colorInactive.withAlpha(1.0);
      }
    }
    originalBoundingBoxCartesians = null;

    bbEditBtn.textContent = 'Edit';
    updateBoundingBoxUI('active');
    console.log('Saved bounding box edits.');
  }

  function handleCancelEdit() {
    if (editingHandler) {
      editingHandler.destroy();
      editingHandler = null;
    }
    removeEditHandles();
    viewer.canvas.style.cursor = 'default';

    // Revert to original coordinates
    if (currentBoundingBox && originalBoundingBoxCartesians) {
      // Revert to the static, original rectangle
      currentBoundingBox.rectangle.coordinates = originalBoundingBoxCartesians;
    }
    originalBoundingBoxCartesians = null;

    bbEditBtn.textContent = 'Edit';
    updateBoundingBoxUI('active');
    console.log('Canceled bounding box edits, reverting to previous state.');
  }
  
  // --- NOAA NWS API and Heatmap Functions ---
  let temperatureHeatmapEntity = null;
  let temperatureAnalysisRunning = false;

  // --- Fixed Temperature Scale for Heatmap (Fahrenheit) ---
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
      if (dataPoints.length === 0) return;
  
      // Get the number of points per side to calculate dynamic blur
      const pointsPerSide = Math.sqrt(dataPoints.length);
  
      // Normalize data and map to canvas coordinates
      const canvasWidth = 150;
      const canvasHeight = 150;
      const { west, south, east, north } = bounds;
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
      // A smaller grid (e.g., 2x2) gets a larger radius to appear more continuous.
      // A larger grid (e.g., 16x16) gets a smaller radius.
      // The radius is increased significantly to ensure a very smooth blend.
      const radius = 15 + (16 - pointsPerSide) * 5;
      const heatmapCanvas = createHeatmapCanvas(canvasWidth, canvasHeight, canvasPoints, radius);
  
      // Create Cesium entity
      if (temperatureHeatmapEntity) {
          viewer.entities.remove(temperatureHeatmapEntity);
      }

      temperatureHeatmapEntity = viewer.entities.add({
          rectangle: {
              coordinates: bounds,
              material: new Cesium.ImageMaterialProperty({
                  image: heatmapCanvas,
                  transparent: true
              }),
              height: new Cesium.CallbackProperty(getDynamicHeatmapHeight, false),
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              outline: true,
              outlineColor: Cesium.Color.WHITE.withAlpha(0.3)
          }
      });
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
   * Creates a grid of points within a given bounding box.
   * The density of the grid is determined dynamically by the size of the box.
   * @param {Cesium.Rectangle} bounds The bounding box.
   * @returns {Array<{lon: number, lat: number}>} An array of longitude/latitude points.
   */
  function createPointGrid(bounds) {
    const minPointsPerSide = 5;  // For small boxes (< 50 sq mi)
    const maxPointsPerSide = 16; // For large boxes (> 1000 sq mi)

    // Area thresholds in square miles
    const minAreaThreshold = 1000;
    const maxAreaThreshold = 100000;

    // Calculate the approximate area of the rectangle in square miles
    const R = Cesium.Ellipsoid.WGS84.maximumRadius; // Earth radius in meters
    const metersPerMile = 1609.34;
    const sqMetersPerSqMile = metersPerMile * metersPerMile;

    const areaMeters2 = (bounds.east - bounds.west) * (R * R) * Math.abs(Math.sin(bounds.north) - Math.sin(bounds.south));
    const areaMiles2 = areaMeters2 / sqMetersPerSqMile;

    let pointsPerSide;
    if (areaMiles2 <= minAreaThreshold) {
      pointsPerSide = minPointsPerSide;
    } else if (areaMiles2 >= maxAreaThreshold) {
      pointsPerSide = maxPointsPerSide;
    } else {
      // Linearly interpolate the number of points between the thresholds
      const t = (areaMiles2 - minAreaThreshold) / (maxAreaThreshold - minAreaThreshold);
      pointsPerSide = Math.round(Cesium.Math.lerp(minPointsPerSide, maxPointsPerSide, t));
    }

    const { west, south, east, north } = bounds;
    const points = [];
    const lonStep = pointsPerSide > 1 ? (east - west) / (pointsPerSide - 1) : 0;
    const latStep = pointsPerSide > 1 ? (north - south) / (pointsPerSide - 1) : 0;

    for (let i = 0; i < pointsPerSide; i++) {
      for (let j = 0; j < pointsPerSide; j++) {
        points.push({
          lon: Cesium.Math.toDegrees(west + (j * lonStep)),
          lat: Cesium.Math.toDegrees(south + (i * latStep))
        });
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

  async function fetchTemperatureData(bounds) {
    if (temperatureAnalysisRunning) {
      return { message: 'Analysis already in progress.' };
    }
    temperatureAnalysisRunning = true;
    clearTemperatureGrid();

    // Create a grid with density based on the bounding box size
    const gridPoints = createPointGrid(bounds);
    let pointsProcessed = 0;
    const temperatureDataPoints = [];

    const promises = gridPoints.map(async (point) => {
      try {
        // 1. Get the gridpoint URL from the NWS API for each point
        const pointsUrl = `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
        const pointsResponse = await fetchWithTimeout(pointsUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds.j@gmail.com)' } }, 7000);
        if (!pointsResponse.ok) {
          console.warn(`NWS points API failed for ${point.lat},${point.lon}: ${pointsResponse.status}`);
          return; // Skip this point
        }
        const pointsData = await pointsResponse.json();
        const gridUrl = pointsData.properties.forecastGridData;

        if (!gridUrl) return;

        // 2. Get the grid data
        const gridResponse = await fetchWithTimeout(gridUrl, { headers: { 'User-Agent': '(my-cesium-app, hynds.j@gmail.com)' } }, 7000);
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

  // --- Dynamic Filter Definitions (Updated) ---
  const filterDefinitions = [
    {
      id: 'temperature',
      label: 'Temperature Grid',
      description: "Fetches surface temperature data from NOAA's NWS API and displays a heatmap.",
      analysisFn: async (bounds) => {
        // This wrapper ensures we can pass min/max to the display function
        const result = await fetchTemperatureData(bounds);
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
          `;
          el.innerHTML = legendHtml;
        } else {
          el.textContent = result.message;
        }
        el.classList.add('map-display');
      },
      metadata: `
        <h5>Surface Temperature Grid</h5>
        <p>Gridded temperature data provided by the National Weather Service (NWS) API. This is not satellite LST, but forecast grid data.</p>
        <p><strong>Source:</strong> <a href="https://www.weather.gov/documentation/services-web-api" target="_blank">NOAA NWS API</a></p>
      `
    }
  ];

  // Main analysis runner
  async function runBoundingBoxAnalysis() {
    if (!currentBoundingBox) return;
    const bounds = currentBoundingBox.rectangle.coordinates.getValue();

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
        } catch (error) {
          display.textContent = 'Error';
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
      const display = item.querySelector('.filter-display-result');
      const control = item.querySelector('.bb-filter-control');
      const description = item.querySelector('.bb-filter-item-desc');
      const infoBtn = item.querySelector('.bb-filter-info-btn');
      const filterId = item.dataset.filterId;
      const isSelected = filterState[filterId];

      if (isBoundingBoxActivated) {
        item.classList.add('locked');
        checkbox.disabled = true;

        if (isSelected) {
          // This filter was selected, show its result area
          item.classList.remove('inactive-while-locked');
          checkbox.classList.add('hidden');
          display.classList.remove('hidden');
          display.textContent = 'Pending...';
          if (description) description.style.display = '';
          if (infoBtn) infoBtn.style.display = '';
        } else {
          // This filter was NOT selected, gray it out
          item.classList.add('inactive-while-locked');
          if (control) control.classList.add('hidden');
          if (description) description.style.display = 'none';
          if (infoBtn) infoBtn.style.display = 'none';
        }
      } else {
        // Deactivating the box, reset all filters to their default state
        item.classList.remove('locked');
        item.classList.remove('inactive-while-locked');
        if (control) control.classList.remove('hidden');
        checkbox.classList.remove('hidden');
        checkbox.disabled = false;
        display.classList.add('hidden');
        display.textContent = ''; // Clear old results
        if (description) description.style.display = '';
        if (infoBtn) infoBtn.style.display = '';
      }
    });


    if (isBoundingBoxActivated) {
      // Change appearance to "activated"
      currentBoundingBox.rectangle.material = colorActive;
      currentBoundingBox.rectangle.outlineColor = colorActive.withAlpha(1.0);
      console.log('Bounding box activated.');
      await runBoundingBoxAnalysis(); // Run the (dummy) API calls
    } else {
      // Change appearance back to default "active" but not "activated"
      currentBoundingBox.rectangle.material = colorInactive;
      currentBoundingBox.rectangle.outlineColor = colorInactive.withAlpha(1.0);
      console.log('Bounding box deactivated.');
      // Add logic to hide heatmap entity here if it was shown
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
    }
    updateBoundingBoxUI('initial');
    console.log('Bounding box deleted.');
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

  // Close popup when clicking outside of it
  document.addEventListener('click', function(event) {
    const popup = document.getElementById('filterMetadataPopup');
    if (popup && !popup.contains(event.target) && !event.target.matches('.bb-filter-info-btn')) {
      popup.remove();
    }
  });

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
        updateBoundingBoxUI(boundingBoxState); // Re-evaluate button states
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
};