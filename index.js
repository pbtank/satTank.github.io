var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/satInfo.json';
var satInfo;

function preload(argument) {
	loadJSON(url, (data) => {
		satTable(data, 'satTable');
		print(data);
	});
}

function setup() {
	// body...
}

function draw() {

}

function satTable(data, parent) {
	var table = document.getElementById(parent);
	// var i = 0;
	// for (let key in data) {
	// 	var row = table.insertRow(i);
	// 	// var cell1 = row.insertCell(0);
	// 	// var cell2 = row.insertCell(1);
	// 	// cell1.innerHTML = key;
	// 	// cell2.innerHTML = satName[key];
	// 	// i++;
	// }

	for (var i = 0; i < data.length; i++) {
		var row = table.insertRow(i);
		var cell1 = row.insertCell(0);
		var cell2 = row.insertCell(1);
		cell1.innerHTML = data[i].norad_cat_id;
		cell2.innerHTML = data[i].name;
	}
	makeTable();

}

function makeTable() {
	var resPerPage = $('#resPerPage').val();
	var inputType = $('#inputType').val();
	var cols = $('#table thead td').length;
	var exCols = [];
	for (var i = 0; i<cols; i++) {
		if((inputType != -1) && (i != inputType)) {
			exCols.push(i+1);
		}
	}
	var sortType = $('#sortType').val();
	var sortOrder = $('#sortOrder').val();
	console.log(exCols);
	$('#table').fancyTable({
		sortColumn: sortType,
		sortOrder: sortOrder,
		pagination: true,
		perPage:resPerPage,
		globalSearch:true,
		globalSearchExcludeColumns: exCols,
		paginationClass: 'btn btn-light',
		paginationClassActive:'btn btn-active',
		inputPlaceholder: 'Search Sat!',
		onUpdate:function () {
			// $('#satTable tr:nth-child(odd)').css("background color", "white");
			// $('#satTable tr:nth-child(even)').css("background color", "lightgrey");
			var isOdd = true;
			var i = 1;
			$("#satTable tr").each(function() {
				var dis = $(this).css("display");
				if (dis !== "none"){
					if (isOdd) {
						isOdd = false;
						$(this).css("background-color", "white").hover(function() {
							$(this).css("background-color", "lightblue");
						}, function() {
							$(this).css("background-color", "white");
						});
					} else {
						isOdd = true;
						$(this).css("background-color", "lightgrey").hover(function() {
							$(this).css("background-color", "lightblue");
						}, function() {
							$(this).css("background-color", "lightgrey");
						});
					}
					$(this).on("click", function() {
						$(this).css({"background-color": "blue", "color":"white"});	
					})
				}
				i++;
			});
			// console.log(i);
		}
	});
	$('#search').empty();
	$('#table').find('input').prependTo('#search').css("width", "60%");
	$('#table thead tr:nth-child(2)').remove();

	// $('#pagination').empty();
	// $('#table').find('td.pag').clone().prependTo('#pagination');
	// $('td.pag').on('click', function() {
	// 	$('#pagination').empty();
	// 	$('#table').find('td.pag').clone().prependTo('#pagination');
	// });
	
	// $('#table tbody tr:last').remove();
}