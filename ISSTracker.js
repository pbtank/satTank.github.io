const canWidth = 1024;
const canHeight = 512;

var mapImg;
var celestrakAPI;
var satlist = [];
var activeSatellites = {}; // Track which satellites are active
var timeSpan = 60; // Default time span in minutes
var zoom_level = 1;
var mapStyle = 'dark-v9'; // Default map style

// Map styles available from Mapbox
const mapStyles = {
  'dark': 'dark-v9',
  'light': 'light-v9',
  'satellite': 'satellite-v9',
  'streets': 'streets-v11',
  'outdoors': 'outdoors-v11'
};

// Selected satellite group
var selectedGroup = 'stations';

function preload() {
  loadMapImage();
  celestrakAPI = new CelestrakAPI();
}

function loadMapImage() {
  mapImg = loadImage(`https://api.mapbox.com/styles/v1/mapbox/${mapStyle}/static/0,0,${zoom_level},0,0/1024x512?access_token=pk.eyJ1IjoicGJ0YW5rIiwiYSI6ImNrajVqeGNlMjB5MGYyc2szZXRkcDhmdWUifQ.2HXgavnvmmbxWHKHgwkilA`);
}

async function loadSatellites(group) {
  try {
    const data = await celestrakAPI.fetchSatellitesByGroup(group, 'json');
    processSatelliteData(data);
  } catch (error) {
    console.error('Failed to load satellites:', error);
  }
}

function processSatelliteData(data) {
  satlist = [];
  let i = 0;
  for (let key in data) {
    const sat = new Satellite(key, data[key]);
    satlist[i] = sat;
    activeSatellites[key] = true; // Default all satellites to active
    i++;
  }
  console.log('Loaded satellites:', satlist);
}

function setup() {
  createCanvas(canWidth, canHeight);
  
  // Initialize with the default group
  loadSatellites(selectedGroup);
  
  // Create UI controls
  createUI();
  
  // Update time every second
  setInterval(() => { d = new Date(); }, 1000);
}

function createUI() {
  // Create container for controls
  const controlsContainer = createDiv();
  controlsContainer.position(10, 10);
  controlsContainer.style('background-color', 'rgba(0,0,0,0.7)');
  controlsContainer.style('padding', '10px');
  controlsContainer.style('border-radius', '5px');
  controlsContainer.style('color', 'white');
  
  // Group selector
  createP('Select Satellite Group:').parent(controlsContainer);
  const groupSelect = createSelect();
  groupSelect.parent(controlsContainer);
  
  // Add all satellite groups from celestrakAPI
  for (const group in celestrakAPI.satelliteGroups) {
    groupSelect.option(group);
  }
  
  groupSelect.selected(selectedGroup);
  groupSelect.changed(() => {
    selectedGroup = groupSelect.value();
    loadSatellites(selectedGroup);
  });
  
  // Time span control
  createP('Time Span (minutes):').parent(controlsContainer);
  const timeSpanSlider = createSlider(10, 180, timeSpan, 10);
  timeSpanSlider.parent(controlsContainer);
  timeSpanSlider.style('width', '200px');
  timeSpanSlider.input(() => {
    timeSpan = timeSpanSlider.value();
  });
  
  // Map style selector
  createP('Map Style:').parent(controlsContainer);
  const styleSelect = createSelect();
  styleSelect.parent(controlsContainer);
  
  for (const style in mapStyles) {
    styleSelect.option(style);
  }
  
  styleSelect.changed(() => {
    mapStyle = mapStyles[styleSelect.value()];
    loadMapImage();
  });
  
  // Zoom level control
  createP('Zoom Level:').parent(controlsContainer);
  const zoomSlider = createSlider(1, 5, zoom_level, 0.5);
  zoomSlider.parent(controlsContainer);
  zoomSlider.style('width', '200px');
  zoomSlider.input(() => {
    zoom_level = zoomSlider.value();
    loadMapImage();
  });
  
  // Satellite list container (will be populated after satellites are loaded)
  const satListContainer = createDiv();
  satListContainer.id('satList');
  satListContainer.position(canWidth - 220, 10);
  satListContainer.style('background-color', 'rgba(0,0,0,0.7)');
  satListContainer.style('padding', '10px');
  satListContainer.style('border-radius', '5px');
  satListContainer.style('color', 'white');
  satListContainer.style('max-height', '400px');
  satListContainer.style('overflow-y', 'auto');
  
  createP('Active Satellites:').parent(satListContainer);
}

function updateSatelliteList() {
  // Remove existing checkboxes
  const satListDiv = select('#satList');
  // Keep the title but remove checkboxes
  while(satListDiv.child().length > 1) {
    satListDiv.child(1).remove();
  }
  
  // Add checkboxes for each satellite
  satlist.forEach((sat, i) => {
    const label = createDiv();
    label.parent(satListDiv);
    label.style('margin', '5px 0');
    
    const checkbox = createCheckbox(sat.satID, activeSatellites[sat.satID]);
    checkbox.parent(label);
    checkbox.changed(() => {
      activeSatellites[sat.satID] = checkbox.checked();
    });
  });
}

function draw() {
  // Draw the map
  createCanvas(canWidth, canHeight);
  translate(width/2, height/2);
  imageMode(CENTER);
  image(mapImg, 0, 0);
  translate(-width/2, -height/2);
  
  // Update satellite list if it exists but is empty
  const satListDiv = select('#satList');
  if (satListDiv && satlist.length > 0 && satListDiv.child().length <= 1) {
    updateSatelliteList();
  }
  
  // Draw active satellites
  var d = new Date();
  satlist.forEach(sat => {
    if (activeSatellites[sat.satID]) {
      sat.groundTrace(d, timeSpan);
    }
  });
}

function proX(lon) {
  lon = radians(lon);
  var x = (512/(2*PI))*pow(2, zoom_level)*(lon + PI);
  return x;
}

function proY(lat) {
  lat = radians(lat);
  var a = (512/(2*PI))*pow(2, zoom_level);
  var b = tan(PI/4 + lat/2);
  var c = (PI - log(b));
  return a*c;
}

class Satellite {
  constructor(_id, _satJson) {
    if (typeof _satJson === 'object' && _satJson !== null) {
      // Handle Celestrak JSON format which is different
      if (_satJson.OBJECT_NAME) {
        // Process Celestrak format
        this.satID = _satJson.OBJECT_NAME;
        this.noradId = _satJson.NORAD_CAT_ID;
        
        // Extract epoch information
        const epochDate = new Date(_satJson.EPOCH);
        this.epoch = [
          epochDate.getUTCFullYear(),
          epochDate.getUTCMonth() + 1,
          epochDate.getUTCDate(),
          epochDate.getUTCHours(),
          epochDate.getUTCMinutes(),
          epochDate.getUTCSeconds()
        ];
        
        this.eccen = _satJson.ECCENTRICITY;
        this.incli = _satJson.INCLINATION;
        this.node = _satJson.RA_OF_ASC_NODE;
        this.aop = _satJson.ARG_OF_PERICENTER;
        this.mnMotn = _satJson.MEAN_MOTION;
        this.mnAnom = _satJson.MEAN_ANOMALY;
        this.revNum = _satJson.REV_AT_EPOCH;
        
        // Generate path using satellite.js library
        this.generatePath();
      } else {
        // Handle legacy format
        this.satID = _satJson.satID;
        this.epoch = _satJson.epoch;
        this.eccen = _satJson.eccen;
        this.incli = _satJson.incli;
        this.node = _satJson.node;
        this.aop = _satJson.omega;
        this.mnMotn = _satJson.mnMotion;
        this.mnAnom = _satJson.mnAnomaly;
        this.revNum = _satJson.revNum;
        this.path = _satJson.path;
      }
    }
  }

  generatePath() {
    // Convert parameters to TLE format needed by satellite.js
    const tle = celestrakAPI.jsonToTLE({
      OBJECT_NAME: this.satID,
      OBJECT_ID: `${this.epoch[0]}-${this.noradId}`,
      EPOCH: `${this.epoch[0]}-${this.epoch[1].toString().padStart(2, '0')}-${this.epoch[2].toString().padStart(2, '0')}T${this.epoch[3].toString().padStart(2, '0')}:${this.epoch[4].toString().padStart(2, '0')}:${this.epoch[5].toFixed(3)}`,
      MEAN_MOTION: this.mnMotn,
      ECCENTRICITY: this.eccen,
      INCLINATION: this.incli,
      RA_OF_ASC_NODE: this.node,
      ARG_OF_PERICENTER: this.aop,
      MEAN_ANOMALY: this.mnAnom,
      EPHEMERIS_TYPE: '0',
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: this.noradId,
      ELEMENT_SET_NO: '999',
      REV_AT_EPOCH: this.revNum,
      BSTAR: '0.000',
      MEAN_MOTION_DOT: '0.00000000',
      MEAN_MOTION_DDOT: '0.00000-0'
    });

    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    
    // Generate path points for 24 hours (1440 minutes) with 1-minute intervals
    this.path = [];
    
    const now = new Date();
    for (let i = 0; i < 1440; i++) {
      // Calculate position at each minute
      const time = new Date(now.getTime() + i * 60000);
      
      // Get position data
      const positionAndVelocity = satellite.propagate(satrec, time);
      const gmst = satellite.gstime(time);
      const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
      
      // Convert to degrees and store
      const lat = satellite.degreesLat(position.latitude);
      const long = satellite.degreesLong(position.longitude);
      const height = position.height; // in km
      
      this.path.push({ lat, long, height });
    }
  }

  groundTrace(_currentUTC, _span) {
    let hr = _currentUTC.getUTCHours();
    let min = _currentUTC.getUTCMinutes();
    let sec = _currentUTC.getUTCSeconds();
    let t = ((hr*60) + min) - ((this.epoch[3]*60) + this.epoch[4]);
    
    // Handle negative time (if current time is before epoch)
    if (t < 0) t = 0;
    
    translate(0, -height/2);
    noStroke();

    let start = max((t-_span), 0);
    let stop = Math.min((t+_span), (this.path.length-1));

    // Draw path
    for (let i = start; i <= stop; i++) {
      if (i >= this.path.length) break;
      
      noFill();
      stroke(0, 255, 255);
      ellipse(proX(this.path[i].long), proY(this.path[i].lat), 4, 4);
    }

    // Draw current position
    if (t < this.path.length-1) {
      let intLong = this.path[t].long + ((this.path[t+1].long - this.path[t].long)/60) * sec;
      let intLat = this.path[t].lat + ((this.path[t+1].lat - this.path[t].lat)/60) * sec;
      
      // Draw satellite
      fill(255, 255, 0);
      stroke(255, 0, 0);
      ellipse(proX(intLong), proY(intLat), 10, 10);
      
      // Show position info
      fill(255);
      noStroke();
      textSize(12);
      text(`${this.satID}`, proX(intLong) + 15, proY(intLat));
      text(`Lat: ${nfc(intLat, 3)} | Lon: ${nfc(intLong, 3)}`, proX(intLong) + 15, proY(intLat) + 15);
      if (this.path[t].height) {
        text(`Alt: ${nfc(this.path[t].height, 1)} km`, proX(intLong) + 15, proY(intLat) + 30);
      }
    }
    
    translate(0, height/2);
  }
}