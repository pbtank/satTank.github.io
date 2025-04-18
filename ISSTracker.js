// Satellite tracking and coordinate calculation
const canWidth = 1024;
const canHeight = 512;

var mapImg;
var zoom_level = 1;
var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/tle.json';
var satlist = [];
var d;

// Preload satellite data and map
function preload() {
    mapImg = loadImage('https://api.mapbox.com/styles/v1/mapbox/dark-v9/static/0,0,1,0,0/1024x512?access_token=pk.eyJ1IjoicGJ0YW5rIiwiYSI6ImNrajVqeGNlMjB5MGYyc2szZXRkcDhmdWUifQ.2HXgavnvmmbxWHKHgwkilA');
    
    loadJSON(url, (data) => {
        let i = 0;
        for (let key in data) {
            satlist[i] = new Satellite(key, data[key]);
            i++;
        }
        print(satlist);
    });
}

// Initialize canvas and setup timer
function setup() {
    // Setup canvas and initialize date timer
    setInterval(() => {
        d = new Date();
        document.getElementById("UTC").innerHTML = formatUTCTime(d);
    }, 1000);
}

// Format UTC time as HH:MM:SS
function formatUTCTime(date) {
    const hr = date.getUTCHours().toString().padStart(2, '0');
    const min = date.getUTCMinutes().toString().padStart(2, '0');
    const sec = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hr}:${min}:${sec}`;
}

// Draw map and satellite path
function draw() {
    createCanvas(canWidth, canHeight);
    translate(width/2, height/2);
    imageMode(CENTER);
    image(mapImg, 0, 0);
    translate(-width/2, -height/2);
    
    // Draw ground trace for selected satellite
    if (satlist.length > 0) {
        var d = new Date();
        satlist[0].groundTrace(d, 60);
    }
}

// Project longitude to x-coordinate
function proX(lon) {
    lon = radians(lon);
    var x = (512/(2*PI))*pow(2, zoom_level)*(lon + PI);
    return x;
}

// Project latitude to y-coordinate
function proY(lat) {
    lat = radians(lat);
    var a = (512/(2*PI))*pow(2, zoom_level);
    var b = tan(PI/4 + lat/2);
    var c = (PI - log(b));
    return a*c;
}

// Interpolate between two values based on seconds
function interpolate(startVal, endVal, seconds) {
    return startVal + ((endVal - startVal)/60) * seconds;
}

// Satellite class for storing and calculating satellite positions
class Satellite {
    constructor(_id, _satJson) {
        this.satID = _satJson.satID;        // satellite id
        this.l1 = _satJson.tle ? _satJson.tle[0] : null; // TLE line 1
        this.l2 = _satJson.tle ? _satJson.tle[1] : null; // TLE line 2
        this.epoch = _satJson.epoch;        // array of epoch [year, mon, day, hr,min, sec]
        this.eccen = _satJson.eccen;        // eccentricity
        this.incli = _satJson.incli;        // inclination
        this.node = _satJson.node;          // RA of ascending node
        this.aop = _satJson.omega;          // AOP
        this.mnMotn = _satJson.mnMotion;    // rev/day
        this.mnAnom = _satJson.mnAnomaly;   // mean anomaly
        this.revNum = _satJson.revNum;      // rev num at epoch
        this.path = _satJson.path;          // array containing jsonObject of path info at each epoch
    }

    // Calculate and display ground trace for satellite
    groundTrace(_currentUTC, _span) {       // _span in int min
        // Calculate time difference between current UTC and epoch
        let hr = _currentUTC.getUTCHours();
        let min = _currentUTC.getUTCMinutes();
        let sec = _currentUTC.getUTCSeconds();
        let t = ((hr*60) + min) - ((this.epoch[3]*60) + this.epoch[4]);
        
        translate(0, -height/2);
        noStroke();

        // Calculate start and stop indices for path drawing
        let start = max((t-_span), 0);
        let stop = Math.min((t+_span), (this.path.length-1));

        // Draw path points
        for (let i = start; i <= stop; i++) {
            noFill();
            stroke(0, 255, 255);
            ellipse(proX(this.path[i].long), proY(this.path[i].lat), 4, 4);
        }

        // Calculate interpolated current position
        if (t < this.path.length-1) {
            let intLong = interpolate(this.path[t].long, this.path[t+1].long, sec);
            let intLat = interpolate(this.path[t].lat, this.path[t+1].lat, sec);
            let intHeight = this.path[t].height ? 
                interpolate(this.path[t].height, this.path[t+1].height, sec) : 0;
            
            // Draw current satellite position
            fill(255, 255, 0);
            stroke(255, 0, 0);
            ellipse(proX(intLong), proY(intLat), 10, 10);
            
            // Display satellite coordinates
            fill(255);
            noStroke();
            text("lat: " + nfc(intLat, 3) + "° lon: " + nfc(intLong, 3) + "°", 
                 proX(intLong), proY(intLat)+60);
            text("alt: " + (intHeight ? nfc(intHeight, 3) + " km" : "N/A"), 
                 proX(intLong), proY(intLat)+80);
            
            // Update satellite information in HTML elements if they exist
            this.updateSatelliteInfo(intLat, intLong, intHeight, t);
        }
        
        translate(0, height/2);
    }
    
    // Update satellite information in HTML elements
    updateSatelliteInfo(lat, lon, height, timeIndex) {
        // Check if HTML elements exist before updating
        if (document.getElementById("lat")) {
            document.getElementById("lat").innerHTML = nfc(lat, 3);
        }
        if (document.getElementById("long")) {
            document.getElementById("long").innerHTML = nfc(lon, 3);
        }
        if (document.getElementById("height") && height) {
            document.getElementById("height").innerHTML = nfc(height, 3);
        }
        
        // Update additional satellite parameters if elements exist
        if (document.getElementById("eccen")) {
            document.getElementById("eccen").innerHTML = nfc(this.eccen, 6);
        }
        if (document.getElementById("node")) {
            document.getElementById("node").innerHTML = nfc(this.node, 3);
        }
        if (document.getElementById("aop")) {
            document.getElementById("aop").innerHTML = nfc(this.aop, 3);
        }
        if (document.getElementById("mnm")) {
            document.getElementById("mnm").innerHTML = nfc(this.mnMotn, 3);
        }
        if (document.getElementById("mna")) {
            document.getElementById("mna").innerHTML = nfc(this.mnAnom, 3);
        }
        if (document.getElementById("revNum")) {
            document.getElementById("revNum").innerHTML = int(this.revNum);
        }
        
        // Update TLE information if available
        if (this.l1 && document.getElementById("l1")) {
            document.getElementById("l1").innerHTML = this.l1;
        }
        if (this.l2 && document.getElementById("l2")) {
            document.getElementById("l2").innerHTML = this.l2;
        }
        
        // Update epoch time if available
        if (this.epoch && document.getElementById("epochTime")) {
            let d1 = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], 
                             this.epoch[3], this.epoch[4], this.epoch[5]);
            document.getElementById("epochTime").innerHTML = d1.toUTCString();
        }
    }
}