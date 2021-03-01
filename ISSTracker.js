const canWidth = 1024;
const canHeight = 512;

var mapImg;

var zoom_level = 1;

var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/tle.json';

var satlist = [];	

// //By default the text "loading..." will be displayed. To make your own
//              * loading page, include an HTML element with id "p5_loading" in your
//              * page.
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

function setup() {
	// createCanvas(1024, 512);
	// translate(width/2, height/2);
	// imageMode(CENTER);
	// image(mapImg, 0, 0);

	// setInterval(askPosition, 4000);
	setInterval(() => {d = new Date();}, 1000);
}

function draw() {
	createCanvas(canWidth, canHeight);
	translate(width/2, height/2);
	imageMode(CENTER);
	image(mapImg, 0, 0);
	translate(-width/2, -height/2);
	// image(mapImg, 0, 0);

	var d = new Date();
	satlist[0].groundTrace(d, 60);

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
		this.satID = _satJson.satID;		//satellite id
		this.epoch = _satJson.epoch;		//array of epoch [year, mon, day, hr,min, sec]
		this.eccen = _satJson.eccen;		//eccentricity
		this.incli = _satJson.incli;		//inclination
		this.node = _satJson.node;			//RA of ascending node
		this.aop = _satJson.omega;			//AOP
		this.mnMotn = _satJson.mnMotion;	//rev/day
		this.mnAnom = _satJson.mnAnomaly;	//mean anomaly
		this.revNum = _satJson.revNum;		//rev num at epoch
		this.path = _satJson.path;			//array containing jsonObject of path info at each epoch
	}

	groundTrace(_currentUTC, _span) {		//_span in int min
		// var d = new Date();
		let hr = _currentUTC.getUTCHours();
		let min = _currentUTC.getUTCMinutes();
		let sec = _currentUTC.getUTCSeconds();
		let t = ((hr*60) + min) - ((this.epoch[3]*60) + this.epoch[4]);
		// print(t);
		translate(0, -height/2);
		noStroke();

		let start = max((t-_span), 0);
		let stop = Math.min((t+_span), (this.path.length-1));

		// beginShape();
		for (let i = start; i <= stop; i++) {
			noFill();
			stroke(0, 255, 255);
			ellipse(proX(this.path[i].long), proY(this.path[i].lat), 4, 4);
			// vertex(proX(this.path[i].long), proY(this.path[i].lat));
			// if (i != this.path.length) {
			// 	if ((this.path[i+1].long - this.path[i].long) <= 0) {
			// 		vertex(proX(this.path[i].long)+20, proY(this.path[i+1].lat));
			// 		vertex(proX(this.path[i].long)+20, (canHeight*1.5)+20);
			// 		vertex(-20, (canHeight*1.5)+20);
			// 		vertex(-20, proY(this.path[i].lat));
			// 	}
			// }
		}
		// endShape();
		// noStroke();
		// fill(255,255,0);
		// ellipse(proX(this.path[t].long), proY(this.path[t].lat), 10, 10);
		// fill(255);
		// text("lat:" + this.path[t].lat + "lon:" + this.path[t].long, proX(this.path[t].long), proY(this.path[t].lat)+60);

		if (t<this.path.length-1) {
			let intLong = this.path[t].long + ((this.path[t+1].long - this.path[t].long)/60) * sec;
			let intLat = this.path[t].lat + ((this.path[t+1].lat - this.path[t].lat)/60) * sec;
			fill(255, 255, 0);
			stroke(255, 0, 0);
			ellipse(proX(intLong), proY(intLat), 10, 10);
			text("lat:" + nfc(intLat, 3) + "lon:" + nfc(intLong, 3), proX(intLong), proY(intLat)+60);
		}
		translate(0, height/2);
	}
}

//ISS position
//https://api.wheretheiss.at/v1/satellites/25544
//http://api.open-notify.org/iss-now.json

// NWSY5G-PCPUQG-TEUUT9-4K9E
//https://api.n2yo.com/rest/v1/satellite/positions/25544/41.702/-76.014/0/2/&apiKey=NWSY5G-PCPUQG-TEUUT9-4K9E