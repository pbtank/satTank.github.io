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

function setup() {
  createCanvas(canWidth, canHeight);
  
  // Initialize with the default group
  loadSatellites(selectedGroup);
  
  // Update time every second
  setInterval(() => { d = new Date(); }, 1000);
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
  const satTable = document.getElementById('satTable');
  satTable.innerHTML = ''; // Clear existing table rows

  for (let satData of data) {
    const sat = new Satellite(satData);
    const row = document.createElement('tr');
    const idCell = document.createElement('td');
    const nameCell = document.createElement('td');

    idCell.textContent = sat.noradId;
    nameCell.textContent = sat.satID;

    row.appendChild(idCell);
    row.appendChild(nameCell);
    satTable.appendChild(row);
  }
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
  constructor(_satJson) { // Changed parameter name to _satJson
    if (typeof _satJson === 'object' && _satJson !== null) {
      // Process Celestrak format
      this.satID = _satJson.OBJECT_NAME;
      this.noradId = _satJson.NORAD_CAT_ID;

      // Generate TLE data using CelestrakAPI
      const tle = celestrakAPI.jsonToTLE(_satJson);
      this.tleLines = tle;

      // Extract orbital parameters from TLE data
      const orbitalParameters = CelestrakAPI.extractOrbitalParameters(this.tleLines[0], this.tleLines[1]);

      this.epoch = orbitalParameters.epoch;
      this.eccen = orbitalParameters.eccen;
      this.incli = orbitalParameters.incli;
      this.node = orbitalParameters.node;
      this.aop = orbitalParameters.omega;
      this.mnMotn = orbitalParameters.mnMotion;
      this.mnAnom = orbitalParameters.mnAnomaly;
      this.revNum = orbitalParameters.revNum;
      this.satrec = orbitalParameters.satrec;

      // Generate path using satellite.js library
      this.generatePath();
    }
  }

  generatePath() {
    // Generate path points for 24 hours (1440 minutes) with 1-minute intervals
    this.path = [];

    const now = new Date();
    for (let i = 0; i < 1440; i++) {
      // Calculate position at each minute
      const time = new Date(now.getTime() + i * 60000);

      // Get position data
      const positionAndVelocity = satellite.propagate(this.satrec, time);
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