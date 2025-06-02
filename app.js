window.onload = function() {
    // 1. Replace with your Cesium Ion access token
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0ZWNiODBjMi1mNDAxLTQ3MDQtOGIzNy05N2RkOWM0NDgzMzIiLCJpZCI6MjM0MzgyLCJpYXQiOjE3NDgyOTAxNjd9.nKR5kopwes1ofc6Vrny6iX0nBjGn8xQaMN8VyzRxg6o';
  
    // 2. Initialize the Cesium Viewer with specific options
    const imageryProviderViewModels = [
      ...Cesium.createDefaultImageryProviderViewModels()
    ];
    const viewer = new Cesium.Viewer('cesiumContainer', {
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
        url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=AIzaSyBxVOS_tR1Wmt9WQNxowI-8JhW1HvRzJ8Y',
        credit: '© Google'
      })
    });
  
    let csvData = [];
    let tileset = null;
    const GOOGLE_3D_TILESET_ASSET_ID = 2275207;
  
    // 3. Load Google Photorealistic 3D Tiles
    async function loadTileset() {
      try {
        tileset = await Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_3D_TILESET_ASSET_ID);
        viewer.scene.primitives.add(tileset);
  
        // Load and plot GPS points
        const response = await fetch('syncronized_df_with_class (1).csv');
        const csvText = await response.text();
        const lines = csvText.split('\n');
  
        csvData = lines.slice(1).map(line => {
          const values = line.split(',');
          return {
            date: values[0],
            time: values[1],
            lat: parseFloat(values[2]),
            lon: parseFloat(values[3]),
            alt: parseFloat(values[4]),
            image: values[9],
            class: values[10] || 'unknown'
          };
        });
  
        const positions = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].split(',');
          if (line.length >= 11) {
            const lat = parseFloat(line[2]);
            const lon = parseFloat(line[3]);
            const alt = parseFloat(line[4]);
            const classType = line[10] || 'unknown';
  
            positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
  
            const color = classType.trim().toUpperCase() === 'ASPHALT' ? Cesium.Color.BLUE :
                          classType.trim().toUpperCase() === 'UNPAVED' ? Cesium.Color.RED :
                          Cesium.Color.YELLOW;
  
            viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
              point: {
                pixelSize: 4,
                color: color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1
              },
              properties: {
                index: i - 1
              }
            });
          }
        }
  
        viewer.entities.add({
          polyline: {
            positions: positions,
            width: 3,
            material: Cesium.Color.RED
          }
        });
  
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(-81.1889236, 28.59092656991317, 100),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0
          }
        });
      } catch (error) {
        console.error('Error:', error);
      }
    }
  
    loadTileset();
  
    // --- Live Traffic Layer Logic ---
    let trafficLayer = null;
    const tomtomApiKey = 'yQWgvqceUQoSR7g3MySgTGirgroZtMMc';
    function addTrafficLayer() {
      const ts = Date.now();
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=${tomtomApiKey}&ts=${ts}`,
        credit: 'Traffic data © TomTom',
        maximumLevel: 20
      });
      trafficLayer = viewer.imageryLayers.addImageryProvider(provider, viewer.imageryLayers.length);
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
  
    // --- Sidebar and Hamburger Logic ---
    const sidebar = document.getElementById('sidebar');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebarRestoreBtn = document.getElementById('sidebarRestoreBtn');
    const sidebarTrafficBtn = document.getElementById('sidebarTrafficBtn');
    const appFlexContainer = document.getElementById('appFlexContainer');
    const maximizeMapBtn = document.getElementById('maximizeMapBtn');
  
    let maximized = true;
    appFlexContainer.classList.add('maximized');
    sidebar.classList.remove('open');
    hamburgerBtn.style.display = 'flex';
    sidebarRestoreBtn.style.display = 'none';
  
    hamburgerBtn.onclick = function() {
      sidebar.classList.add('open');
      appFlexContainer.classList.remove('maximized');
      hamburgerBtn.style.display = 'none';
      sidebarRestoreBtn.style.display = 'none';
      maximized = false;
    };
    sidebarCloseBtn.onclick = function() {
      sidebar.classList.remove('open');
      hamburgerBtn.style.display = 'flex';
      sidebarRestoreBtn.style.display = 'none';
      appFlexContainer.classList.add('maximized');
      maximized = true;
    };
    sidebarRestoreBtn.onclick = function() {
      sidebar.classList.add('open');
      appFlexContainer.classList.remove('maximized');
      hamburgerBtn.style.display = 'none';
      sidebarRestoreBtn.style.display = 'none';
      maximized = false;
    };
  
    sidebarTrafficBtn.onclick = async function() {
      if (trafficLayer) {
        removeTrafficLayer();
        await addTileset();
        sidebarTrafficBtn.classList.remove('active');
        sidebarTrafficBtn.textContent = 'Show Live Traffic';
        stopTrafficAnimation();
      } else {
        removeTileset();
        setBaseLayerToBing();
        addTrafficLayer();
        sidebarTrafficBtn.classList.add('active');
        sidebarTrafficBtn.textContent = 'Hide Live Traffic';
        startTrafficAnimation();
      }
    };
  
    const sidebarTilesetBtn = document.getElementById('sidebarTilesetBtn');
    sidebarTilesetBtn.onclick = async function() {
      if (tileset && viewer.scene.primitives.contains(tileset)) {
        removeTileset();
        sidebarTilesetBtn.classList.remove('active');
      } else {
        await addTileset();
        sidebarTilesetBtn.classList.add('active');
      }
    };
  
    sidebar.classList.remove('open');
    hamburgerBtn.style.display = 'flex';
    sidebarRestoreBtn.style.display = 'none';
    sidebarTrafficBtn.classList.remove('active');
    sidebarTrafficBtn.textContent = 'Show Live Traffic';
    sidebarTilesetBtn.classList.remove('active');
  
    if (viewer.baseLayerPickerViewModel) {
      viewer.baseLayerPickerViewModel.selectedImageryChanged.addEventListener(function() {
        if (tileset && viewer.scene.primitives.contains(tileset)) {
          removeTileset();
          sidebarTilesetBtn.classList.remove('active');
        }
      });
    }
  
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    const infoPanel = document.getElementById('infoPanel');
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      console.log('Picked:', picked);
      if (
        Cesium.defined(picked) &&
        picked.id &&
        picked.id.properties &&
        Cesium.defined(picked.id.properties.index)
      ) {
        const index = picked.id.properties.index.getValue();
        console.log('Picked index:', index);
        const data = csvData[index];
        console.log('Picked data:', data);
        if (data) {
          infoPanel.innerHTML = `
            <button id="closeInfoPanel" class="close-btn">&times;</button>
            <div style="display: flex; align-items: flex-start;">
              <div style="flex: 1; min-width: 0;">
                <h3>Meta Data</h3>
                <p><strong>Class:</strong> ${data.class}</p>
                <p><strong>Date:</strong> ${data.date}</p>
                <p><strong>Time:</strong> ${data.time}</p>
                <p><strong>Location:</strong><br>
                   Lat: ${data.lat.toFixed(6)}<br>
                   Lon: ${data.lon.toFixed(6)}<br>
                   Alt: ${data.alt.toFixed(2)}m</p>
              </div>
              ${data.image ? `<div style="margin-left: 32px; margin-top: 24px;"><img src="camera/${data.image}" alt="Point Image" style="max-width:300px; max-height:200px; border-radius:4px;"></div>` : ''}
            </div>
          `;
          infoPanel.style.display = 'block';
          document.getElementById('closeInfoPanel').onclick = () => {
            infoPanel.style.display = 'none';
          };
        }
      } else {
        infoPanel.style.display = 'none';
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
    const sidebarAqiBtn = document.getElementById('sidebarAqiBtn');
    const aqiList = document.getElementById('aqiList');
    let aqiPanelOpen = false;
  
    sidebarAqiBtn.onclick = async function() {
      aqiPanelOpen = !aqiPanelOpen;
      if (aqiPanelOpen) {
        aqiList.style.display = 'block';
        sidebarAqiBtn.classList.add('active');
        sidebarAqiBtn.textContent = 'Hide Air Quality';
        // Fetch and display AQI data
        sidebarAqiBtn.textContent = 'Loading...';
        aqiList.innerHTML = '';
        const center = getCameraCenter(viewer);
        const zipCode = await getZipCodeFromLatLon(center.lat, center.lon);
        if (!zipCode) {
          aqiList.innerHTML = '<li style="color:#e53935;">Unable to determine zip code for this area.</li>';
          sidebarAqiBtn.textContent = 'Hide Air Quality';
          return;
        }
        const apiKey = 'F28CB47B-1174-4881-8A62-E7ECDAC9B6E3';
        const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${apiKey}`;
        const proxyUrl = `http://localhost:3001/airnow?url=${encodeURIComponent(url)}`;
        try {
          const response = await fetch(proxyUrl);
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const stationsByArea = {};
            data.forEach(station => {
              const key = `${station.ReportingArea}-${station.StateCode}`;
              if (!stationsByArea[key] || station.AQI > stationsByArea[key].AQI) {
                stationsByArea[key] = station;
              }
            });
            const sortedStations = Object.values(stationsByArea).sort((a, b) => b.AQI - a.AQI);
            aqiList.innerHTML = sortedStations.map(station => {
              const category = station.Category ? station.Category.Name : 'Unknown';
              const categoryClass = category.toLowerCase().replace(/\s+/g, '-');
              return `
                <li class="aqi-station">
                  <div class="aqi-station-header">
                    <div class="aqi-station-name">${station.ReportingArea || 'Unknown Location'}</div>
                    <div class="aqi-station-state">${station.StateCode || ''}</div>
                  </div>
                  <div class="aqi-station-details">
                    <span class="aqi-station-label">Parameter:</span>
                    <span class="aqi-station-value">${station.ParameterName || 'N/A'}</span>
                    <span class="aqi-station-label">AQI Value:</span>
                    <span class="aqi-station-value">${station.AQI || 'N/A'}</span>
                    <span class="aqi-station-label">Category:</span>
                    <span class="aqi-station-value">
                      <span class="aqi-category aqi-category-${categoryClass}">${category}</span>
                    </span>
                    <span class="aqi-station-label">Last Updated:</span>
                    <span class="aqi-station-value">${new Date(station.DateObserved + 'T' + station.HourObserved + ':00').toLocaleString()}</span>
                  </div>
                </li>
              `;
            }).join('');
          } else {
            aqiList.innerHTML = '<li style="color:#e53935;">No AQI data found for this zip code.</li>';
          }
        } catch (e) {
          console.error('AQI fetch error:', e);
          aqiList.innerHTML = '<li style="color:#e53935;">Error fetching AQI data. Please try again.</li>';
        }
        sidebarAqiBtn.textContent = 'Hide Air Quality';
      } else {
        aqiList.style.display = 'none';
        aqiList.innerHTML = '';
        sidebarAqiBtn.classList.remove('active');
        sidebarAqiBtn.textContent = 'Show Air Quality';
      }
    };
  
    const sidebarWeatherBtn = document.getElementById('sidebarWeatherBtn');
    const weatherDropdown = document.getElementById('weatherDropdown');
    const weatherPanelSidebar = document.getElementById('weatherPanelSidebar');
    let weatherDropdownOpen = false;
  
    sidebarWeatherBtn.onclick = async function() {
      weatherDropdownOpen = !weatherDropdownOpen;
      if (weatherDropdownOpen) {
        weatherDropdown.style.display = 'block';
        sidebarWeatherBtn.classList.add('active');
        sidebarWeatherBtn.textContent = 'Hide Weather';
        const center = getCameraCenter(viewer);
        await updateWeatherPanel(center.lat, center.lon, true);
      } else {
        weatherDropdown.style.display = 'none';
        weatherPanelSidebar.innerHTML = 'Loading weather...';
        sidebarWeatherBtn.classList.remove('active');
        sidebarWeatherBtn.textContent = 'Show Weather';
      }
    };
  
    async function updateWeatherPanel(lat, lon, sidebarMode = false) {
      const apiKey = '667758377b3d240c37f2328bc7e02743';
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        const panel = sidebarMode ? weatherPanelSidebar : document.getElementById('weatherPanel');
        if (data && data.weather && data.weather.length > 0) {
          const icon = data.weather[0].icon;
          const desc = data.weather[0].description;
          const temp = data.main.temp;
          const feelsLike = data.main.feels_like;
          const wind = data.wind.speed;
          const windDeg = data.wind.deg;
          const clouds = data.clouds ? data.clouds.all : null;
          const humidity = data.main.humidity;
          const sunrise = data.sys.sunrise ? new Date(data.sys.sunrise * 1000).toLocaleTimeString() : null;
          const sunset = data.sys.sunset ? new Date(data.sys.sunset * 1000).toLocaleTimeString() : null;
          panel.innerHTML = `
            <ul style="padding:0;list-style:none;margin:0;">
              <li class="aqi-station">
                <div style="display:flex;align-items:center;gap:12px;">
                  <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="Weather icon">
                  <div>
                    <div style='font-weight:bold; font-size:16px; margin-bottom:2px; color:#1976d2;'>${desc.charAt(0).toUpperCase() + desc.slice(1)}</div>
                    <div><strong>Temp:</strong> ${temp}&deg;C</div>
                    <div><strong>Feels like:</strong> ${feelsLike}&deg;C</div>
                    <div><strong>Wind:</strong> ${wind} m/s (${windDeg}&deg;)</div>
                    <div><strong>Cloudiness:</strong> ${clouds !== null ? clouds + '%' : 'N/A'}</div>
                    <div><strong>Humidity:</strong> ${humidity}%</div>
                    <div><strong>Sunrise:</strong> ${sunrise || 'N/A'}</div>
                    <div><strong>Sunset:</strong> ${sunset || 'N/A'}</div>
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
        (sidebarMode ? weatherPanelSidebar : document.getElementById('weatherPanel')).innerHTML = `
          <ul style="padding:0;list-style:none;margin:0;">
            <li class="aqi-station">Weather error</li>
          </ul>
        `;
      }
    }
  
    function getCameraCenter(viewer) {
      const scene = viewer.scene;
      const camera = scene.camera;
      const ray = camera.getPickRay(new Cesium.Cartesian2(scene.canvas.width / 2, scene.canvas.height / 2));
      const globe = scene.globe;
      const intersection = globe.pick(ray, scene);
      if (intersection) {
        const cartographic = Cesium.Cartographic.fromCartesian(intersection);
        return {
          lat: Cesium.Math.toDegrees(cartographic.latitude),
          lon: Cesium.Math.toDegrees(cartographic.longitude)
        };
      }
      const carto = Cesium.Cartographic.fromCartesian(camera.positionWC);
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude)
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
        bingProvider = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find(
          vm => vm.name === 'Bing Maps Aerial' || vm.name === 'Bing Maps Roads'
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
        tileset = await Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_3D_TILESET_ASSET_ID);
        viewer.scene.primitives.add(tileset);
      } else if (!viewer.scene.primitives.contains(tileset)) {
        viewer.scene.primitives.add(tileset);
      }
    }
  
    maximizeMapBtn.onclick = function() {
      appFlexContainer.classList.add('maximized');
      sidebar.classList.remove('open');
      hamburgerBtn.style.display = 'flex';
      sidebarRestoreBtn.style.display = 'none';
      maximized = true;
      setTimeout(() => viewer.resize(), 350);
    };
  
    const observer = new MutationObserver(() => {
      setTimeout(() => viewer.resize(), 350);
    });
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  
    // Helper: Get zip code from lat/lon using Nominatim
    async function getZipCodeFromLatLon(lat, lon) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        return data.address && data.address.postcode ? data.address.postcode : null;
      } catch (e) {
        return null;
      }
    }
  
    // Inject message into Cesium base layer picker dropdown
    setTimeout(() => {
      const baseLayerPickerDropdown = document.querySelector('.cesium-baseLayerPicker-dropDown, .cesium-baseLayerPicker-dropDown-visible');
      if (baseLayerPickerDropdown && !document.getElementById('tileset-warning-message')) {
        const msg = document.createElement('div');
        msg.id = 'tileset-warning-message';
        msg.style.cssText = 'background:#fff3cd;color:#856404;border:1px solid #ffeeba;border-radius:4px;font-size:14px;padding:10px 14px;margin-bottom:12px;';
        msg.innerHTML = '<strong>Note:</strong> To apply filters, please turn off the 3D tileset.';
        baseLayerPickerDropdown.insertBefore(msg, baseLayerPickerDropdown.firstChild);
      }
    }, 1200);
  };