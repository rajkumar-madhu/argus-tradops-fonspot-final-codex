var okColor = "#00D2A1";
var unkownColor = "#D2D2D2";
var warningColor = "#FDB278";
var criticalColor = "#FF6060";
var pendingColor = "#4CB5DB";
var relationshipColor = "#7B7B7B";
var networkStatus = ''

function requestDataFromServer(url, data, type="POST")
{
	return $.ajax({
		url: url,
		type: type,
		data: data
	});
}


function registerInputFieldEvents()
{
	$(".input_effect").focus(function () 
    {
        $(this).parent().find("label").addClass("move_label");
        $(this).parent().addClass("bg_input");
    });
    $('.input_effect').focusout(function (e) 
    {
        if ($(this).val().trim() == '') 
        {
            $(this).css('border-color', '#FF6060');
			$(this).parent().find("label").css('color','#FF6060');
            $(this).parent().find("label").removeClass("move_label");
            $(this).parent().removeClass("bg_input");
        }
        else 
        {
			$(this).parent().find("label").css('color','#404E67');
            $(this).css('border-color', '#BABFC7'); 
        }
    });
}

function fieldValidation()
{
    $('.inputvalidation').keypress(function(event)
    {
		var text_attribute = $(this).data('attribute');
		if(text_attribute === "alphanumeric")
		{
			var ch = String.fromCharCode(event.which);
			if(!(/^[a-zA-Z0-9-_\s]*$/.test(ch)))
			{
				event.preventDefault();
			}
		}
		else if(text_attribute === "IPADDRESS" || text_attribute === "IP")
		{
			var ch = String.fromCharCode(event.which);
			if(!(/[0-9.]/.test(ch)))
			{
				event.preventDefault();
			}
        }
        else if(text_attribute === "PORT")
		{
			var ch = String.fromCharCode(event.which);
			if(!(/[0-9]/.test(ch)))
			{
				event.preventDefault();
			}
        }
        else if(text_attribute === "URL")
		{
            var specials=/^(http|https)?:\/\/[a-zA-Z0-9-\.]+\.[a-z]{2,4}/;
            var ch = String.fromCharCode(!event.charCode ? event.which : event.charCode);
			if(specials.test(ch))
			{
				event.preventDefault();
				return false;
			}
		}
		else if(text_attribute === "EMAIL")
		{
			var specials=/[~`!#$%^&()={}[\]:;,<>+\/?'"*]/;
			var ch = String.fromCharCode(!event.charCode ? event.which : event.charCode);
			if(specials.test(ch))
			{
				event.preventDefault();
				return false;
			}
		}
    });
}

function chunkArray(myArray, chunk_size)
{
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];
	for (index = 0; index < arrayLength; index += chunk_size) 
	{
        myChunk = myArray.slice(index, index+chunk_size);
        tempArray.push(myChunk);
    }
    return tempArray;
}

$(document).ready(function(){
	// Auto-logout timer removed - no longer needed
	
//	button-ripple-effect
	/*$.ripple(".btn, .menu-link", {
	debug: false,
	on: 'mousedown',

	opacity: 0.4,
	color: "auto",
	multi: false,

	duration: 0.5,

	rate: function(pxPerSecond) {
        return pxPerSecond;
    },

	easing: 'linear'
    });*/
	
//------
	
//custom-select
	//$(".boot-select").selectpicker();
	
//-----
	$('.info-float-btn').click(
		function()
		{
		$('.infonav').toggleClass('info-expand');
	    },
		
	)
});

//SERVER HW / SW ICONS DEFALUT COLOR CHANGE WITH OPACITY BASED ON DATE
function getIcons_clr(state, datetime, epoch) {
	/*console.log("status----->" + state);
	console.log("datetime----->" + datetime);
	console.log("epoch----->" + epoch);*/

	let datePart = null;

	// Handle datetime or epoch
	if (typeof datetime === 'string' && datetime.trim() !== '') {
		// Extract date from datetime. Accept both "DD-MM-YYYY" and
		// "YYYY-MM-DD HH:mm:ss" style values without throwing.
		datePart = datetime.split(' ')[0];
		if (datePart.indexOf('-') === 4) {
			var parts = datePart.split('-');
			datePart = [parts[2], parts[1], parts[0]].join('-');
		}
	} else if (datetime instanceof Date && !isNaN(datetime.getTime())) {
		datePart = datetime.toLocaleDateString('en-GB', {
			timeZone: 'Asia/Kolkata'
		}).replace(/\//g, '-');
	} else if (epoch !== null && epoch !== undefined && epoch !== '' && !isNaN(epoch)) {
		// If datetime is null/empty, use epoch timestamp and convert to IST
		console.warn("Using epoch timestamp for date calculation");
		const epochTimestamp = parseInt(epoch, 10);

		// Convert epoch (milliseconds) to IST date
		if (!isNaN(epochTimestamp)) {
			const dateFromEpoch = new Date(epochTimestamp);
			if (!isNaN(dateFromEpoch.getTime())) {
				datePart = dateFromEpoch.toLocaleDateString('en-GB', {
					timeZone: 'Asia/Kolkata'
				}).replace(/\//g, '-'); // Convert to DD-MM-YYYY format
			}
		}

		//console.log("Converted epoch to date: " + datePart);
	} else {
		// Fallback to current datetime in IST
		console.warn("Datetime and epoch are missing or invalid. Using current date.");
		datePart = new Date().toLocaleDateString('en-GB', {
			timeZone: 'Asia/Kolkata'
		}).replace(/\//g, '-');
	}

	// Determine color based on state
	let color;
	if (state == '0' || state == 'red') {
		color = criticalColor;
	} else if (state == '1' || state == 'orange') {
		color = warningColor;
	} else if (state == '2' || state == 'green') {
		color = okColor;
	} else if (state == '3' || state == 'white') {
		color = '#ffffff';
	} else if (state == '4' || state == 'black') {
		color = '#000000';
	}

	// Get current date in IST in DD-MM-YYYY format
	const currentDate = new Date().toLocaleDateString('en-GB', {
		timeZone: 'Asia/Kolkata'
	}).replace(/\//g, '-');

	//console.log("datePart----->" + datePart);
	//console.log("currentDate----->" + currentDate);

	// Apply opacity if not the current date
	if (datePart && datePart !== currentDate) {
		color = addOpacity(color, 0.2);
	}

	return color;
}
// Helper function to add opacity to a hex color
function addOpacity(hexColor, opacity) {
	// Convert hex to RGBA
	const hex = hexColor.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
function getColorForNodeState(nodeState)
{
	if (typeof (nodeState) == "string") {
		if (nodeState)
			var state = nodeState.toUpperCase()
		else
			var state = nodeState
		var color = okColor;
		if (state === "WARNING") {
			color = warningColor;
		}
		else if (state === "UNKNOWN" || state === "DELETED" || state === "TERMINATED") {
			color = unkownColor;
		}
		else if (state === "PENDING") {
			color = pendingColor;
		}
		else if (state === "CRITICAL" || state === "DOWN" || state === "UNREACHABLE" || state === "FALSE" || state === "WAITING") {
			color = criticalColor;
		}
	} else {
		var state = nodeState
		if (state == '0') {
			color = criticalColor;
		} else if (state == '1') {
			color = warningColor;
		} else if (state == '2') {
			color = okColor;
		} else if (state == '3') {
			color = unkownColor;
        }
    }
	return color;
}


var month = new Array();
month[0] = "Jan";
month[1] = "Feb";
month[2] = "Mar";
month[3] = "Apr";
month[4] = "May";
month[5] = "Jun";
month[6] = "Jul";
month[7] = "Aug";
month[8] = "Sep";
month[9] = "Oct";
month[10] = "Nov";
month[11] = "Dec";

function getFormatedDate(epoch)
{	
	if(epoch > 0)
	{
		var date = new Date(epoch * 1000);
		var year = date.getFullYear();
		var monthnum = date.getMonth();
		var day = date.getDate();
		var hours = date.getHours();
		var minutes = date.getMinutes();
		var seconds = date.getSeconds();
		return day+" "+month[monthnum]+", "+year+" "+hours+":"+minutes+":"+seconds;
	}
	else
	{
		return "--";
	}
}

// $(document).ready(function(){
// 	if(Cookies.get('theme')) {
// 		$('body').removeClass().addClass( $.cookie('theme') );

// 	};


// 	$("#theme-toggler").click(function(){
// 		currentClass = $('body').attr("class");

// 		if (currentClass == 'light-mode')
// 			newClass = 'dark-mode';
// 		else newClass = 'light-mode';

// 		$('body').removeClass().addClass(newClass);

// 	   Cookies.set('theme', newClass);

// 	});
// });


$(document).ready(function(){
	$('#snackbar').text('Online..');
	snackbar.className = "sucess_show";
	$("#snackbar").fadeOut();
	// Guard against duplicate bindings when script is re-executed.
	window.removeEventListener('online', initNetworkEvents);
	window.removeEventListener('offline', initNetworkEvents);
	window.addEventListener('online', initNetworkEvents)
	window.addEventListener('offline', initNetworkEvents)
	let darkMode=localStorage.getItem("darkMode");
	const darkModeToggle=$("#dark-mode-toggle");

	const enableDarkMode = () => {
		$('body').addClass('darkmode');
		localStorage.setItem('darkMode','enabled');

	};
	const disableDarkMode = () => {
		$('body').removeClass('darkmode');
		localStorage.setItem('darkMode',null);

	};

	if(darkMode == 'enabled'){
		enableDarkMode();
		$('#dark-mode-toggle').find('.text').text("Light Mode");
	}

	$("#dark-mode-toggle").off('click').on('click', function(){
		darkMode = localStorage.getItem("darkMode");

		if(darkMode !== 'enabled'){
			enableDarkMode();
			$('#dark-mode-toggle').find('.text').text("Light Mode");
		}
		else{
			disableDarkMode();
			$('#dark-mode-toggle').find('.text').text("Dark Mode");
		}
	});
	$('.chpassword_input').off('focusout').on('focusout', function (e) {
		if($(this).val() == '' || $(this).val() == null ) {
            $(this).parent().find("label").css('color','#ff9eac');
			$(this).parent().find(".error-msg").text('Field cannot be empty');
		}
		else{
          //  $(this).parent().find("label").css('color','#404E67');
			$(this).parent().find(".error-msg").text('');
		}
	});
	profilesimages()
});

function initNetworkEvents() {
	if (navigator.onLine) {
		networkStatus = 'online'
		$("#snackbar").fadeIn("slow");
		$('#snackbar').text('Online:Please Refresh Your Page..');
		snackbar.className = "sucess_show";
	}
	else {
		networkStatus = 'offline'
		$("#snackbar").fadeIn("slow");
		$('#snackbar').text('Offline:Please Check your Network Connections..');
		snackbar.className = "error_show";
	}
}


initNetworkEvents()

$('.select-link').click(function(){
		$('.select-input-link').html($(this).text());
	});

	function inputFocusOut(element)
	{
		// $('.'+className).focusout(function (e) {
			if (element.val() == '') {
				element.parent().find("label").css('color','#ff9eac');
				element.parent().find(".error-msg").text('Field cannot be empty');
			}
			else {
				element.parent().find("label").css('color','#404E67');
				element.parent().find(".error-msg").text('');
			}
		// });
	}
	function inputFocusIn(element)
	{
			//element.parent().find("label").css('color','#404E67');
			element.parent().find(".error-msg").text('');
	}
	function checkAllfeildsfilled(className)
	{
		var allFeildValid = true;
		$('.'+className).each(function (e)
		{
			if ($(this).val() == '' || $(this).val() == null)
			{
				$(this).css('border-color', '#FF7588');
				$(this).parent().find("label").css('color','#ff9eac');
				$(this).parent().find(".error-msg").text('Field cannot be empty');
				allFeildValid = false;
			}
			else
			{
				$(this).css('border-color', '#BABFC7');
				//$(this).parent().find("label").css('color','#404E67');
				$(this).parent().find(".error-msg").text(' ');
			}
		});
		return allFeildValid;
	}
	$(".toggle-password").click(function (event) 
	{
		id = event.target.id;
		values = id.split('_')
		$(this).toggleClass("icon-show");
		if ($('#'+values[0] + ' #'+values[1]).attr("type") == "password") 
		{
			$('#'+values[0] + ' #'+values[1]).attr("type", "text");
		} 
		else 
		{
			$('#'+values[0] + ' #'+values[1]).attr("type", "password");
		}
	});
function  getSizeForNode(type){
	var size = 25
	if (type == null)
		return size;
	if(type == "Host" || type.startsWith('Node'))
	{
		size = 50;
	}
	return size;
}
function showLoader(divId) {
	//console.log('SHOWLOADER DIVID--->' + divId)
	$("#"+divId+" #loader").fadeIn()
	$("#"+divId).addClass('showloader')
}
function stopLoader(divId) {
	//console.log('STOPLOADER DIVID--->' + divId)
	$("#"+divId+" #loader").fadeOut(200)
	$("#"+divId).removeClass('showloader')
}
function onchangePassword() {
	$('.chpassword_input').each(function (e) {
		id = $(this).attr('id')
		//console.log("onchange-->"+JSON.stringify(id))
		$("#dialog-for-changepassword #" + id).val('')
		//$(this).parent().find("label").css('color','#404E67');
		$(this).parent().find(".error-msg").text(' ');
	});
	requestDataFromServer('/notificationsettings/getallservices', {}, "GET").done(function (response) {
		res = JSON.parse(response);
		if (res.status == 200) {
			usernameobject = res.userobj
			//document.getElementById('ch-username').val = usernameobject.first_name
			$("#dialog-for-changepassword #ch-username").val(usernameobject.username)
			$("#dialog-for-changepassword #ch-username").prop('disabled', true);
		}

	});
	$('#dialog-for-changepassword #addbtn').attr('data-dismiss', " ");
}
function savePassword() {
	requestData = {};
    data = {};
    data['username'] = $('#dialog-for-changepassword #ch-username').val();
    data['currentpsw'] = $('#dialog-for-changepassword #ch-password').val();
    data['newpsw'] = $('#dialog-for-changepassword #ch-nwpassword').val();
	data['confirmpsw'] = $('#dialog-for-changepassword #ch-cpassword').val();
	var isAllInputsFilled = checkAllfeildsfilled('chpassword_input')
	var regpassword = new RegExp("^[a-zA-Z0-9@#$%^&*]{8,}$");
	if(isAllInputsFilled == false)
		$('#dialog-for-changepassword #addbtn').attr('data-dismiss', " ");
	else if(!regpassword.test($('#ch-nwpassword').val()))
    {
		$('#dialog-for-changepassword #addbtn').attr('data-dismiss', " ");
		$('#ch-nwpassword-error-msg').text("Password too short (Minimum 8 characters)");
		$('#ch-nwpassword-label').css('color', '#ff9eac');
	}
	else if(data['newpsw'] !== data['confirmpsw'])
	{
		$('#dialog-for-changepassword #addbtn').attr('data-dismiss', " ");
		$('#ch-cpassword-error-msg').text('New Password and Confirm Password are not same');
		$('#ch-cpassword-label').css('color', '#ff9eac');
	}	
	else
	{
		requestData["data"] = data;
		$('#dialog-for-changepassword #addbtn').attr('data-dismiss', "modal");
		requestDataFromServer('/useronboard/changePassword', {'clientData': JSON.stringify(requestData), csrfmiddlewaretoken: csfr_token }, "POST").done(function(response){
			if(response.status == 200)
			{
				swal(response.msg, ' ', "success"); 
			}
			else
				swal(response.msg, ' ', "error");	
		});
	}
}

// Guard: only run the profile image lookup once per page load.
var _profileImageLoaded = false;

function profilesimages() {
	if (_profileImageLoaded) return;
	_profileImageLoaded = true;
	requestDataFromServer('/notificationsettings/getallservices', {}, "GET").done(profilesupload);
}

function profilesupload(response) {
	res = JSON.parse(response);
	// Get the username of the currently logged-in user
	if (res.status == 200) {
		serviceLists = res.data;
		userobject = res.userobj

		let parsedResponse = typeof res === "string" ? JSON.parse(res) : res;
		const currentEmail = parsedResponse.userobj.email;
		// Get role and show/hide admin
		getrolelists(currentEmail);

		const username = (userobject.first_name || '').replace(/\s+/g, "");
		const profileImg = document.getElementById("image_showing");
		const fallbackImg = document.getElementById("image_show");

		function showFallbackImage() {
			if (fallbackImg) fallbackImg.style.display = "block";
			if (profileImg) profileImg.style.display = "none";
		}

		if (!username || !profileImg) {
			showFallbackImage();
		} else {
			const profileUrl = '/notification/profile_images/' + encodeURIComponent(username) + '/';
			fetch(profileUrl, { method: 'HEAD', cache: 'no-store' }).then(function (result) {
				if (!result.ok) {
					showFallbackImage();
					return;
				}
				profileImg.onload = function () {
					if (fallbackImg) fallbackImg.style.display = "none";
					profileImg.style.display = "block";
				};
				profileImg.onerror = showFallbackImage;
				profileImg.src = profileUrl;
			}).catch(showFallbackImage);
		}
	}
}

function getrolelists(currentEmail) {
	//console.log("getrolelist ----> " + currentEmail);

	requestDataFromServer('/useronboard/getuserlist', {}, "GET").done(function (response) {

		const parsed = typeof response === "string" ? JSON.parse(response) : response;
		const currentUser = parsed.data.find(user => user.email === currentEmail);

		if (!currentUser) {
			return console.warn("User not found in list.");
		}

		const adminBlock = document.getElementById('admin-role');
		if (!adminBlock) return;

		adminBlock.style.display = (currentUser.role === "Admin") ? 'block' : 'none';
	});
}
function closeAllsiteTooltips(excludeElements) {
	//console.log("close web---->")
	// Close all tooltips by removing 'shown' and 'showns' classes
	document.querySelectorAll('.shown, .showns').forEach(element => {
		if (element !== excludeElements) {
			element.classList.remove('shown');
			element.classList.remove('showns');
		}
	});

	// Remove border highlight classes
	document.querySelectorAll('.border-clr, .border-clrs').forEach(element => {
		if (element !== excludeElements) {
			element.classList.remove('border-clr');
			element.classList.remove('border-clrs');
		}
	});
}

function closeAllTooltips(excludeElement) {
	// Close all tooltips by removing 'shown' class
	//console.log("close-dash-web---->")
	document.querySelectorAll('.shown').forEach(element => {
		if (element !== excludeElement) {
			element.classList.remove('shown');
		}
	});

	// Remove border highlight class
	document.querySelectorAll('.border-clr').forEach(element => {
		if (element !== excludeElement) {
			element.classList.remove('border-clr');
		}
	});
}

function closeAllTooltipsdom(excludeElementing) {
	//console.log("close-dom-web---->");
	// Close all tooltips by removing 'shown' and 'showns' classes
	document.querySelectorAll('.entityshown, .switshown').forEach(element => {
		if (element !== excludeElementing) {
			element.classList.remove('entityshown');
			element.classList.remove('switshown');
		}
	});

	// Remove border highlight classes
	document.querySelectorAll('.entityborder-clr, .switborder-clr').forEach(element => {
		if (element !== excludeElementing) {
			element.classList.remove('entityborder-clr');
			element.classList.remove('switborder-clr');
		}
	});
}
