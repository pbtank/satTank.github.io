var canvas;
const canWidth = 1024;
const canHeight = 512;

var mapImg;

var zoom_level = 1;

var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/tle.json';

var satlist = [];
var satOption;
var satName = {
	"253381": "NOAA 15",
	"255441": "ISS (ZARYA)",
	"335911": "NOAA 19",
	"400691": "METEOR M2"
	}	

// //By default the text "loading..." will be displayed. To make your own
//              * loading page, include an HTML element with id "p5_loading" in your
//              * page.
function preload() {
	mapImg = loadImage('https://api.mapbox.com/styles/v1/mapbox/dark-v9/static/0,0,1,0,0/1024x512?access_token=pk.eyJ1IjoicGJ0YW5rIiwiYSI6ImNrajVqeGNlMjB5MGYyc2szZXRkcDhmdWUifQ.2HXgavnvmmbxWHKHgwkilA');

	loadJSON(url, (data) => {
	let i = 0;
	print(data);
	satOption = createRadio();
	for (let key in data) {
		print(data);
		satlist[i] = new Satellite(key, data[key]);
		// activeSat[i] = createCheckbox(key);
		satOption.option(i, key);
		i++;
	}
	satOption.parent('satOption');
	satOption.style('width', '80px');
	// print(satlist);
});
}

function setup() {
	// createCanvas(1024, 512);
	// translate(width/2, height/2);
	// imageMode(CENTER);
	// image(mapImg, 0, 0);

	// setInterval(askPosition, 4000);
	setInterval(() => {
		d = new Date();
		var hr = d.getUTCHours().toString();
		var min = d.getUTCMinutes().toString();
		var sec = d.getUTCSeconds().toString();
		document.getElementById("UTC").innerHTML = (hr + ':' + min + ':' + sec);
	}, 1000);
}

function draw() {
	canvas = createCanvas(canWidth, canHeight);
	canvas.parent('p5canvas');
	translate(width/2, height/2);
	imageMode(CENTER);
	image(mapImg, 0, 0);
	translate(-width/2, -height/2);

	var d = new Date();
	// for (let i = 0; i < satlist.length; i++) {
	// 	if (activeSat[i].checked()) {
	// 		satlist[i].groundTrace(d, 60);
	// 	}
	// }
	if (satOption.selected()) {
		// print(satOption.value());
		satlist[satOption.value()].groundTrace(d, 60);
		// document.getElementById("satName").innerHTML = satName[satlist[satOption.value()].satID];
		// document.getElementById("lat").innerHTML = satName[satlist[satOption.value()].path[]];
		// document.getElementById("long").innerHTML = satName[satlist[satOption.value()].satID];
		// document.getElementById("height").innerHTML = satName[satlist[satOption.value()].satID];
		// document.getElementById("xPos").innerHTML = satName[satlist[satOption.value()].satID];
		// document.getElementById("yPos").innerHTML = satName[satlist[satOption.value()].satID];
		// document.getElementById("zPos").innerHTML = satName[satlist[satOption.value()].satID];
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
		this.satName = satName[_id];
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

		let intLong, intLat, intHeight, intXpos, intYpos, intZpos;
		let d1 = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], this.epoch[3], this.epoch[4], this.epoch[5]);

		if (t<this.path.length-1) {
			intLong = interpolate(this.path[t].long, this.path[t+1].long, sec);
			intLat = interpolate(this.path[t].lat, this.path[t+1].lat, sec);
			intHeight = interpolate(this.path[t].height, this.path[t+1].height, sec);
			intXpos = interpolate(this.path[t].x, this.path[t+1].x, sec);
			intYpos = interpolate(this.path[t].y, this.path[t+1].y, sec);
			intZpos = interpolate(this.path[t].z, this.path[t+1].z, sec);
			fill(255, 255, 0);
			stroke(255, 0, 0);
			ellipse(proX(intLong), proY(intLat), 10, 10);
			text("lat:" + nfc(intLat, 3) + "lon:" + nfc(intLong, 3), proX(intLong), proY(intLat)+60);
		}
		translate(0, height/2);

		document.getElementById("satName").innerHTML = this.satName;
		document.getElementById("epochTime").innerHTML = d1.toUTCString();
		document.getElementById("lat").innerHTML = nfc(intLat, 3);
		document.getElementById("long").innerHTML = nfc(intLong, 3);
		document.getElementById("height").innerHTML = nfc(intHeight, 3);
		document.getElementById("xPos").innerHTML = nfc(intXpos, 3);
		document.getElementById("yPos").innerHTML = nfc(intYpos, 3);
		document.getElementById("zPos").innerHTML = nfc(intZpos, 3);
		document.getElementById("eccen").innerHTML = nfc(this.eccen, 6);
		// document.getElementById("per").innerHTML = nfc(this., 3);
		// document.getElementById("apg").innerHTML = nfc(this., 3);
		document.getElementById("node").innerHTML = nfc(this.node, 3);
		document.getElementById("aop").innerHTML = nfc(this.aop, 3);
		document.getElementById("mnm").innerHTML = nfc(this.mnMotn, 3);
		document.getElementById("mna").innerHTML = nfc(this.mnAnom, 3);
		document.getElementById("revNum").innerHTML = int(this.revNum);

	}

}

function interpolate(_to, _td, _sec) {
	let x = _to + ((_td - _to)/60) * _sec;
	return x;
}