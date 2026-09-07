var prometheusdata;
var firstrow = [{ "label": "type", "type": "string" }, { "label": "count", "type": "number" }]
var hardwaretitle = 'Hardware';
var softwaretitle = 'Software';
var applicationtitle = 'Application';
var eodSitesData = [];
var adpSitesData = [];
var bodSitesData = [];
var selected_sitename = ''
var selected_leurl = ''
var selected_websocurl = ''
var ledColorsTimeout = null;
var colors_called = 1;

$(document).ready(function () { //rohinth added start
    // Logic moved to sitepage.js to avoid duplication on site pages

    let buttonToBeClicked = sessionStorage.getItem('click-this-button-after-page-loads');
    if (buttonToBeClicked != null) {
        // Click the button here
        document.getElementById(buttonToBeClicked).click();

        // Remove the key from session storage
        sessionStorage.removeItem('click-this-button-after-page-loads');
    }

    google.charts.load('current', { 'packages': ['corechart'] });

});

var timeline;
var data;
var nodeid;
statuses = [];

var getLEDCOLOR = async function (url, nameofsite) {
    return await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('get', url, true);
        xhr.responseType = 'json';
        xhr.timeout = 5000; // time in milliseconds
        xhr.onload = function () {
            var status = xhr.status;
            if (status == 200) {
                resolve(xhr.response);
            } else {
                (reject(status));
            }
        };
        xhr.ontimeout = () => {
            reject({
                site: nameofsite,
                status: xhr.status,
                statusText: xhr.statusText
            });
        };
        xhr.onerror = function () {
            reject({
                site: nameofsite,
                status: xhr.status,
                statusText: xhr.statusText
            });
        };
        xhr.send();
    });
};
function colorSwitch(status) {
    var color = ''
    switch (status) {
        case 0:
            color = '#ff3d57'
            break;
        case 1:
            color = '#e59105'
            break;
        case 2:
            color = '#16d39a'
            break;
        default:
            color = '#ffffff'
    }
    return color
}
function connectDashboardWebSockets(websoc_url, sitename, wsKey) {
    if (typeof connectEodWebSocket === 'function') {
        connectEodWebSocket(websoc_url, sitename, 0, wsKey);
    } else if (typeof connectsiteEodWebSocket === 'function') {
        connectsiteEodWebSocket(websoc_url, sitename, 0, wsKey);
    }
    if (typeof connectAdpWebSocket === 'function') {
        connectAdpWebSocket(websoc_url, sitename, 0, wsKey);
    } else if (typeof connectsiteAdpWebSocket === 'function') {
        connectsiteAdpWebSocket(websoc_url, sitename, 0, wsKey);
    }
    if (typeof connectWebSocket === 'function') {
        connectWebSocket(websoc_url, sitename, 0, wsKey);
    } else if (typeof connectbodWebSocket === 'function') {
        connectbodWebSocket(websoc_url, sitename, 0, wsKey);
    }
}
function ledColors(sitename, le_url, websoc_url) {
    if (ledColorsTimeout) {
        clearTimeout(ledColorsTimeout);
    }

    ledColorsTimeout = setTimeout(function() {
        if (!le_url || (!le_url.startsWith('http://') && !le_url.startsWith('https://'))) {
            le_url = window.location.origin + '/';
        }
        if (!le_url.endsWith('/')) {
            le_url += '/';
        }

        const target = new URL('sitehealth/overall', le_url);
        const params = new URLSearchParams();
        params.set('sitename', sitename);
        target.search = params.toString();

        getLEDCOLOR(target, sitename).then(function (data) {
            if (data && data['data']) {
                if (document.getElementById('bodLED'))
                    document.getElementById('bodLED').style.color = colorSwitch(data['data']['bod']);
                if (document.getElementById('eodLED'))
                    document.getElementById('eodLED').style.color = colorSwitch(data['data']['eod']);
                if (document.getElementById('adpLED'))
                    document.getElementById('adpLED').style.color = colorSwitch(data['data']['adp']);
                if (document.getElementById('entityLED'))
                    document.getElementById('entityLED').style.color = colorSwitch(data['data']['entity']);
                
                var chart_data = data['data']['chart'] && data['data']['chart']['data'] ? data['data']['chart']['data'] : null;
                if (chart_data) {
                    var chartresponse = { "hardware": { "CRITICAL": chart_data['hardware'][0], "OK": chart_data['hardware'][2], "WARNING": chart_data['hardware'][1], "UNKNOWN": chart_data['hardware'][3] }, "software": { "CRITICAL": chart_data['software'][0], "OK": chart_data['software'][2], "WARNING": chart_data['software'][1], "UNKNOWN": chart_data['software'][3] }, "application": { "CRITICAL": chart_data['application'][0], "OK": chart_data['application'][2], "WARNING": chart_data['application'][1], "UNKNOWN": chart_data['application'][3] } };
                    fillHostServiceCount(chartresponse);
                } else {
                    $.get('/dashboard/getoverallchartdetails', {sitename: sitename, allsite: 'true'}, function(res) {
                        if (res && res.data) {
                            fillHostServiceCount(res.data);
                        } else {
                            ['containerpie-hardwares', 'containerpie-softwares', 'containerpie-applications'].forEach(function(id) { stopLoader(id); });
                        }
                    }, 'json').fail(function() {
                        ['containerpie-hardwares', 'containerpie-softwares', 'containerpie-applications'].forEach(function(id) { stopLoader(id); });
                    });
                }
            }

            // Clear to prevent memory leaks and ensure fresh state
            eodSitesData = [];
            adpSitesData = [];
            bodSitesData = [];

            // Helper to create state object
            function createStateObj(name, status) {
                return {
                    site: name,
                    isSuccess: status == 2, // 2 is Green/Success
                    isWSConnected: false
                };
            }

            if (data && data['data']) {
                eodSitesData.push(createStateObj(sitename, data['data']['eod']));
                adpSitesData.push(createStateObj(sitename, data['data']['adp']));
                bodSitesData.push(createStateObj(sitename, data['data']['bod']));
            }

            if (colors_called) {
                colors_called = 0;
                connectDashboardWebSockets(
                    websoc_url,
                    sitename,
                    Math.random().toString(36).substring(2, 5)
                );
            }
        }).catch(function (err) {
            console.error('ledColors ERROR for ' + sitename + ':', err);
            var hwContainer = document.getElementById('containerpie-hardwares');
            if (!hwContainer || hwContainer.innerHTML.includes('loading-gif') || hwContainer.innerHTML.trim() === '') {
                document.getElementById('hardware-heading').style.display = 'flex';
            }
            
            var swContainer = document.getElementById('containerpie-softwares');
            if (!swContainer || swContainer.innerHTML.includes('loading-gif') || swContainer.innerHTML.trim() === '') {
                document.getElementById('software-heading').style.display = 'flex';
            }
            
            var appContainer = document.getElementById('containerpie-applications');
            if (!appContainer || appContainer.innerHTML.includes('loading-gif') || appContainer.innerHTML.trim() === '') {
                document.getElementById('application-heading').style.display = 'flex';
            }
            stopLoader('containerpie-hardwares')
            stopLoader('containerpie-softwares')
            stopLoader('containerpie-applications')
        });
    }, 400); // 400ms debounce
}
function sortObjectByKeys(o) {
    return Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
}
function displayChart() {

}
var pieServiceChart;
var pieHostChart;
var hostStatus = { "CRITICAL": 0, "WARNING": 0, "PENDING": 0, "UNKNOWN": 0, "OK": 0 };
var serviceStatus = { "CRITICAL": 0, "WARNING": 0, "PENDING": 0, "UNKNOWN": 0, "OK": 0 };
function fillHostServiceCount(response) {
    var hardwarePie = Object(response['hardware']);
    var hardwarepies = ([]);
    hardwarepies.push(firstrow)
    var hardwaresecondrow = [["Critical(" + hardwarePie.CRITICAL + ")", hardwarePie.CRITICAL],
    ["OK(" + hardwarePie.OK + ")", hardwarePie.OK],
    ["WARNING(" + hardwarePie.WARNING + ")", hardwarePie.WARNING],
    ["UNKNOWN(" + hardwarePie.UNKNOWN + ")", hardwarePie.UNKNOWN]]
    var hardware_tot = hardwarePie.CRITICAL + hardwarePie.OK + hardwarePie.WARNING + hardwarePie.UNKNOWN;

    if (hardware_tot) {
        document.getElementById('hardware-heading').style.display = 'none'
        for (var i in hardwaresecondrow) {
            hardwarepies.push(hardwaresecondrow[i])
        }
        drawpiechart(hardwarepies, hardwaretitle, 'containerpie-hardwares');
        stopLoader('containerpie-hardwares')
    } else {
        document.getElementById('containerpie-hardwares').innerHTML = "";
        document.getElementById('hardware-heading').style.display = 'flex'
        stopLoader('containerpie-hardwares')
    }
    var softwarePie = Object(response['software']);
    var softwarepies = ([]);
    softwarepies.push(firstrow)
    var softwaresecondrow = [["Critical(" + softwarePie.CRITICAL + ")", softwarePie.CRITICAL],
    ["OK(" + softwarePie.OK + ")", softwarePie.OK],
    ["WARNING(" + softwarePie.WARNING + ")", softwarePie.WARNING],
    ["UNKNOWN(" + softwarePie.UNKNOWN + ")", softwarePie.UNKNOWN]]
    var software_tot = softwarePie.CRITICAL + softwarePie.OK + softwarePie.WARNING + softwarePie.UNKNOWN;

    if (software_tot) {
        document.getElementById('software-heading').style.display = 'none'
        for (var i in softwaresecondrow) {
            softwarepies.push(softwaresecondrow[i])
        }
        drawpiechart(softwarepies, softwaretitle, 'containerpie-softwares');
        stopLoader('containerpie-softwares')
    } else {
        document.getElementById('containerpie-softwares').innerHTML = "";
        document.getElementById('software-heading').style.display = 'flex'
        stopLoader('containerpie-softwares')
    }
    var applicationPie = Object(response['application']);
    var applicationpies = ([]);
    applicationpies.push(firstrow)
    var applicationsecondrow = [["Critical(" + applicationPie.CRITICAL + ")", applicationPie.CRITICAL],
    ["OK(" + applicationPie.OK + ")", applicationPie.OK],
    ["WARNING(" + applicationPie.WARNING + ")", applicationPie.WARNING],
    ["UNKNOWN(" + applicationPie.UNKNOWN + ")", applicationPie.UNKNOWN]]
    var application_tot = applicationPie.CRITICAL + applicationPie.OK + applicationPie.WARNING + applicationPie.UNKNOWN;
    updatetime()
    if (application_tot) {
        document.getElementById('application-heading').style.display = 'none'
        for (var i in applicationsecondrow) {
            applicationpies.push(applicationsecondrow[i])
        }
        drawpiechart(applicationpies, applicationtitle, 'containerpie-applications');
        stopLoader('containerpie-applications')
    } else {
        document.getElementById('containerpie-applications').innerHTML = "";
        document.getElementById('application-heading').style.display = 'flex'
        stopLoader('containerpie-applications')
    }
}
function updatetime() {

    var timing = {}
    var d = new Date();
    timing['hour'] = (d.getHours() < 10 ? '0' : '') + d.getHours(),
        timing['minute'] = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    timing['second'] = (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
    document.getElementById('last-update').innerHTML = "Last update:- [ " + timing['hour'] + ':' + timing['minute'] + ':' + timing['second'] + ' ]';
}
function statusCount(res, tempArray) {
    totalCount = 0;
    res.forEach(function (row) {
        if (row[0])
            var state = row[0].toUpperCase()
        else
            var state = row[0]
        if (state === "CRITICAL" || state === "DOWN" || state === "UNREACHABLE" || state === "FALSE" || state === "WAITING") {
            tempArray["CRITICAL"] = tempArray["CRITICAL"] + row[1];
        }
        if (state == "" || state === "RUNNING" || state === "TRUE" || state === "OK" || state === "UP") {
            tempArray["OK"] = tempArray["OK"] + row[1];
        }
        if (state === "PENDING") {
            tempArray["PENDING"] = tempArray["PENDING"] + row[1];
        }
        if (state === "WARNING") {
            tempArray["WARNING"] = tempArray["WARNING"] + row[1];
        }
        if (state === "UNKNOWN" || state === "DELETED" || state === "TERMINATED") {
            tempArray["UNKNOWN"] = tempArray["UNKNOWN"] + row[1];
        }
        totalCount = totalCount + row[1]
    });
    return totalCount;
}
function readyHandler() {
}
function updateHostServiceValues(json) {
    var tempHostArray = [];
    var hostCount = 0;
    if (Object.keys(json.host).length > 0) {
        objToArray = Object.keys(json.host).map((key) => [key, Number(json.host[key])]);
        hostStatus = { "CRITICAL": 0, "WARNING": 0, "PENDING": 0, "UNKNOWN": 0, "OK": 0 };
        hostCount = statusCount(objToArray, hostStatus)
        $("#total-host").html(hostCount);
        tempHostArray.push(['Totoal Server', 'Server Health']);
        $.each(hostStatus, function (key, val) {
            tempHostArray.push([key, val]);
            if (key === "CRITICAL" && val > 0) {
                $("#H-" + key).html("<span class='beat p-0'>" + val + "</span>");
            }
            else {
                $("#H-" + key).html(val);
            }
        });
    }
    if (pieHostChart !== undefined) {
        var hostdata = google.visualization.arrayToDataTable(tempHostArray);
        options.colors = [criticalColor, warningColor, pendingColor, unkownColor, okColor];
        pieHostChart.clearChart();
        pieHostChart.draw(hostdata, options);
    }

    var tempServiceArray = [];
    var serviceCount = 0;
    if (Object.keys(json.service).length > 0) {
        tempServiceArray.push(['Total Service', 'Service Health']);
        objToArray = Object.keys(json.service).map((key) => [key, Number(json.service[key])]);
        serviceStatus = { "CRITICAL": 0, "WARNING": 0, "PENDING": 0, "UNKNOWN": 0, "OK": 0 };
        serviceCount = statusCount(objToArray, serviceStatus)
        $("#total-service").html(serviceCount);
        $.each(serviceStatus, function (key, val) {
            tempServiceArray.push([key, val]);
            if (key === "CRITICAL" && val > 0) {
                $("#S-" + key).html("<span class='beat p-0'>" + val + "</span>");
            }
            else {
                $("#S-" + key).html(val);
            }
        });
    }
    if (pieServiceChart !== undefined) {
        var servicedata = google.visualization.arrayToDataTable(tempServiceArray);
        options.colors = [criticalColor, warningColor, pendingColor, unkownColor, okColor];
        pieServiceChart.clearChart();
        pieServiceChart.draw(servicedata, options);
    }
    var totalNode = serviceCount + hostCount;
    $("#total-nodes").html("Nodes (" + totalNode + ")");
    criticalStatusCount = hostStatus['CRITICAL'] + serviceStatus['CRITICAL']
    if (criticalStatusCount == 0) {
        $('#pills-critical-tab').attr('onclick', ' ');
        $("#pills-critical-tab").html("Critical (" + criticalStatusCount + ")");
    }
    else
        $("#pills-critical-tab").html('<span class="bold-text red">Critical(' + criticalStatusCount + ')</span>');
    okStatusCount = hostStatus['OK'] + serviceStatus['OK']
    if (okStatusCount == 0) {
        $('#pills-ok-tab').attr('onclick', ' ');
        $("#pills-ok-tab").html("Ok (" + okStatusCount + ")");
    }
    else
        $("#pills-ok-tab").html('<span class="bold-text green">Ok(' + okStatusCount + ')</span>');
    pendingStatusCount = hostStatus['PENDING'] + serviceStatus['PENDING']
    if (pendingStatusCount == 0) {
        $('#pills-pending-tab').attr('onclick', ' ');
        $("#pills-pending-tab").html("Pending (" + pendingStatusCount + ")");
    }
    else
        $("#pills-pending-tab").html('<span class="bold-text pending-text">Pending(' + pendingStatusCount + ')</span>');
    warningStatusCount = hostStatus['WARNING'] + serviceStatus['WARNING']
    if (warningStatusCount == 0) {
        $('#pills-warning-tab').attr('onclick', ' ');
        $("#pills-warning-tab").html("Warning (" + warningStatusCount + ")");
    }
    else
        $("#pills-warning-tab").html('<span class="bold-text warning">Warning(' + warningStatusCount + ')</span>');
    unknownStatusCount = hostStatus['UNKNOWN'] + serviceStatus['UNKNOWN']
    if (unknownStatusCount == 0) {
        $('#pills-unknown-tab').attr('onclick', ' ');
        $("#pills-unknown-tab").html("Unknown (" + unknownStatusCount + ")");
    }
    else
        $("#pills-unknown-tab").html('<span class="bold-text unknown">Unknown(' + unknownStatusCount + ')</span>');
}
function updateValues(json) {
    var criticalCount = 0;
    var okCount = 0;
    var pendingCount = 0;
    var warningCount = 0;
    var unknownCount = 0;
    var hostStatus = json.host;
    var serviceStatus = json.service;
    var totalNode = 0;

    criticalCount = hostStatus['criticalCount'] + serviceStatus['criticalCount']
    totalNode = totalNode + criticalCount;
    if (criticalCount == 0) {
        $('#pills-critical-tab').attr('onclick', ' ');
        $("#pills-critical-tab").html("Critical (" + criticalCount + ")");
    }
    else
        $("#pills-critical-tab").html('<span class="bold-text red">Critical(' + criticalCount + ')</span>');
    okCount = hostStatus['okCount'] + serviceStatus['okCount']
    totalNode = totalNode + okCount;
    if (okCount == 0) {
        $('#pills-ok-tab').attr('onclick', ' ');
        $("#pills-ok-tab").html("Ok (" + okCount + ")");
    }
    else
        $("#pills-ok-tab").html('<span class="bold-text green">Ok(' + okCount + ')</span>');
    pendingCount = hostStatus['pendingCount'] + serviceStatus['pendingCount']
    totalNode = totalNode + pendingCount;
    if (pendingCount == 0) {
        $('#pills-pending-tab').attr('onclick', ' ');
        $("#pills-pending-tab").html("Pending (" + pendingCount + ")");
    }
    else
        $("#pills-pending-tab").html('<span class="bold-text pending-text">Pending(' + pendingStatusCount + ')</span>');
    warningCount = hostStatus['warningCount'] + serviceStatus['warningCount']
    totalNode = totalNode + warningCount;
    if (warningCount == 0) {
        $('#pills-warning-tab').attr('onclick', ' ');
        $("#pills-warning-tab").html("Warning (" + warningCount + ")");
    }
    else
        $("#pills-warning-tab").html('<span class="bold-text warning">Warning(' + warningCount + ')</span>');
    unknownCount = hostStatus['unknownCount'] + serviceStatus['unknownCount']
    totalNode = totalNode + unknownCount;
    if (unknownCount == 0) {
        $('#pills-unknown-tab').attr('onclick', ' ');
        $("#pills-unknown-tab").html("Unknown (" + unknownCount + ")");
    }
    else
        $("#pills-unknown-tab").html('<span class="bold-text unknown">Unknown(' + unknownCount + ')</span>');
    $("#total-nodes").html("Nodes (" + totalNode + ")");
}
function getjsondata(response) {
    var jsondata = JSON.parse(response)
    prometheusarray(prometheusdata, jsondata)
}
function nodespecificdetialsresponse(response) {
    prometheusdata = response;
    var query_ip = (response.nodedetails.data[0].ip).replaceAll('.', '_')
    if (!response.nodedetails.data[0].product_model) {
        var nodeName = (response.nodedetails.data[0].name || '');
        var tech = (response.nodedetails.data[0].tech || '').toLowerCase();
        if (nodeName.includes(':SW_')) {
            if (tech === 'linux') {
                response.nodedetails.data[0].product_model = 'linux';
            } else if (tech === 'windows') {
                response.nodedetails.data[0].product_model = 'windows';
            } else {
                response.nodedetails.data[0].product_model = 'Server';
            }
        } else {
            response.nodedetails.data[0].product_model = 'Server';
        }
    } else {
        response.nodedetails.data[0].product_model = response.nodedetails.data[0].product_model.toLowerCase();
    }
    $('#nagiosgraph').empty()
    try {
        // console.log("nodespecificdetialsresponse--->" + JSON.stringify(prometheusdata))
        if (!(response.nodedetails.data[0].product_model).includes('fortigate') && (response.nodedetails.data[0].image == 'port')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('s_sw')) {
            requestDataFromServer('/getfilecontent', { filename: 'prometheus-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':CPU') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-cpu-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Memory') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-memory-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':fan') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-fan-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':temperature') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-temperature-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Uptime') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-uptime-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Info') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-info-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':CPU')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-cpu-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':CPU')) {
            requestDataFromServer('/getfilecontent', { filename: 'cpu-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':Info')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-info-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':Memory')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-memory-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Info')) {
            requestDataFromServer('/getfilecontent', { filename: 'info-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Memory')) {
            requestDataFromServer('/getfilecontent', { filename: 'memory-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Disk')) {
            requestDataFromServer('/getfilecontent', { filename: 'disk-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':NIC')) {
            requestDataFromServer('/getfilecontent', { filename: 'nic-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':fan')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-fan-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':fan')) {
            requestDataFromServer('/getfilecontent', { filename: 'fan-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':battery')) {
            requestDataFromServer('/getfilecontent', { filename: 'battery-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':Power-Supply')) {
            requestDataFromServer('/getfilecontent', { filename: 'power-supply-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':temperature')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-temperature-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':temperature')) {
            requestDataFromServer('/getfilecontent', { filename: 'temperature-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].product_model).includes('fortigate')) {
            requestDataFromServer('/getfilecontent', { filename: 'firewall-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].layer).includes('swi') && (response.nodedetails.data[0].name).includes(':Uptime')) {
            requestDataFromServer('/getfilecontent', { filename: 'switch-uptime-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_Uptime')) {
            requestDataFromServer('/getfilecontent', { filename: 'uptime-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_LoadAvg')) {
            requestDataFromServer('/getfilecontent', { filename: 'server-load-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_Login')) {
            requestDataFromServer('/getfilecontent', { filename: 'login-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_NIC')) {
            requestDataFromServer('/getfilecontent', { filename: 'sw_nic-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_Disk')) {
            requestDataFromServer('/getfilecontent', { filename: 'sw_disk-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_Memory')) {
            requestDataFromServer('/getfilecontent', { filename: 'sw_memory-query.json' }, "GET").done(getjsondata);
        } else if ((response.nodedetails.data[0].name).includes(':SW_CPU')) {
            requestDataFromServer('/getfilecontent', { filename: 'sw_cpu-query.json' }, "GET").done(getjsondata);
        }
    }
    catch (err) {
        swal(err + ' error occurred while getting queries!', ' ', "error");
    }
    //---------------------------------------------------
    stopLoader("node-detail")
    $("#node-keys").empty();
    $("#node-values").empty();
    $("#node-name").empty();
    if (response == undefined)
        return;
    if (response["nodedetails"].status == 200) {
        var nodedetails = response["nodedetails"].data;
        var json = nodedetails[0];
        var html = "";
        var name = json["name"].replace(':Info', '');
        $("#node-name").append(name);
        $("#node-name").attr('title', name)
        $("#nodeimage").attr("src", image_path + json["icon"]);
        $("#nodename").html("<span>" + json["title"] + "</span>");

        if (json["title"] !== json["hostIp"])
            $("#nodeipaddress").html("<span>" + json["hostIp"] + "</span>");
        if (json["monitor_status"] !== undefined) {
            var nodecolor = getColorForNodeState(json["monitor_status"]);
            var indicatorCircle = '<span class="indicator-circle ml-2"  style="background:' + nodecolor + '"></span>';
            $("#node-name").append(indicatorCircle);
            $("#nodestatus").html("<span class='white-text py-1 px-2 size12 radius-8' style='background:" + nodecolor + "'>" + 'yhyhyy' + "</span>");
        }
        var datetime = json["epoch"] / 1000;
        if (datetime !== 0) {
            var dayString = getFormatedDate(datetime);
            $("#nodelastupdated").html("<span>" + dayString + "</span>");
        }

        if (json["monitor_message"] !== undefined)
            $("#nodemonmessage").html("<span>" + json["monitor_message"] + "</span>");

        if (json["contact_email"] !== undefined)
            $("#nodecontactemail").html("<span>" + json["contact_email"] + "</span>");

        if (json["automation_isEnabled"] === undefined)
            $("#nodehasautomation").html("<span>" + json["automation_isEnabled"] + "</span>");

        var url = new URL("cgi-bin/showgraph.cgi?period=day&amp;rrdopts=-w+200+-j&amp;", monitorurl);
        if (json["type"] === "Host")
            url += "host=" + json["title"] + ";";
        else {
            url += "host=" + json["title"].split(":")[0] + "&amp;";
            url += "service=" + json["title"] + ";"
        }

        document.getElementById("node-detail");
        var nodeNameHtml = "";
        var nodeDataHtml = "";
        for (var key in json) {
            if (json.hasOwnProperty(key)) {
                var value = json[key];

                if (value !== "") {
                    if (value.length !== 0) {
                        if (key !== "Nics_list") {

                            // ✅ Convert epoch to IST formatted date/time
                            if (key.toLowerCase().includes("epoch")) {
                                let epochValue = Number(value);
                                if (epochValue < 10000000000) {
                                    epochValue *= 1000; // convert seconds → ms
                                }

                                // Convert to IST
                                let dateIST = new Date(epochValue).toLocaleString("en-US", {
                                    timeZone: "Asia/Kolkata"
                                });

                                let date = new Date(dateIST);

                                // Format manually to DD-MM-YYYY HH:mm:ss
                                let day = String(date.getDate()).padStart(2, '0');
                                let month = String(date.getMonth() + 1).padStart(2, '0');
                                let year = date.getFullYear();
                                let hours = String(date.getHours()).padStart(2, '0');
                                let minutes = String(date.getMinutes()).padStart(2, '0');
                                let seconds = String(date.getSeconds()).padStart(2, '0');

                                value = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
                            }

                            nodeNameHtml += "<p style='margin-left:5%'>" + key + "</p>";
                            nodeDataHtml += "<p>" + value + "</p>";
                        }
                    } else {
                        nodeNameHtml += "<p>" + key + "</p>";
                        nodeDataHtml += "<p>''</p>";
                    }
                }
            }
        }
        /*for (var key in json) {
            if (json.hasOwnProperty(key)) {
                var value = json[key];
                if (value !== "") {
                    if (value.length !== 0) {
                        if (key !== "Nics_list") {
                            nodeNameHtml += "<p style='margin-left:5%'>" + key + "</p>";
                            nodeDataHtml += "<p>" + value + "</p>";
                            console.log("nodeNameHtml---->"+key)
                            console.log("nodeDataHtml---->" + value)
                        }
                    }
                    else {
                        nodeNameHtml += "<p>" + key + "</p>";
                        nodeDataHtml += "<p>''</p>";
                    }
                }
            }
        }*/
        $("#node-keys").append(nodeNameHtml);
        $("#node-values").append(nodeDataHtml);
    }
    else {
        swal('Not able to show node details', ' ', 'error')
    }
    requestDataFromServer('/bod-eodstatus/getbodeodkeys', { sitename: params.get("site"), mode: 'VER', ip: query_ip }, "GET").done(function (response) {
        if (response.responseData[0].site_data.length) {
            document.getElementById('scripts_heading').style.display = 'flex'
            document.getElementById('no-versions').style.display = 'none'
            var key_data = response.responseData[0].site_data[0].key_data.data;
            var scriptnameHtml = '<p class="size14 mb-3 header" style="margin-left:5%">Scripts</p>';
            var scriptversionHtml = '<p class="size14 mb-3 header">Version</p>';
            // Iterate over the array of objects
            key_data.forEach(function (item) {
                // Extract 'name' and 'version' directly from each item
                if (item.hasOwnProperty("name") && item.hasOwnProperty("version")) {
                    var name = item["name"];
                    var version = item["version"];
                    // Apply styling to 'name' and 'version' as in your example
                    scriptnameHtml += "<p style='margin-left:5%'>" + name + "</p>";
                    scriptversionHtml += "<p>" + version + "</p>";
                }
            });
            // Append the generated HTML to the respective divs
            $("#ver-keys").html('');
            $("#ver-values").html('');
            $("#ver-keys").append(scriptnameHtml);
            $("#ver-values").append(scriptversionHtml);

        } else {
            document.getElementById('scripts_heading').style.display = 'none'
            document.getElementById('no-versions').style.display = 'flex'
        }

    })
}
function opendashboarsuperset(nodeid, dashboardurl) {
    if (dashboardurl !== null) {
        $("#analuticsurl").attr("href", ("../analytics/dashboard?jsonname=") + dashboardurl);
        $("#analuticsurl")[0].click();
    }
    else {
        alert("No Dashboard!!");
    }
}
function openNagiosGraph(nodeid, servicename) {
    $("#servicedata").val(servicename);
    $("#nagiosform").submit();
}
function monitorresponse(res) {

}
function openNav(nodeid, site, ip = "") {
    $('.nav-tabs a[href="#' + 'nav-info' + '"]').tab('show');  //this is for directly opening the info tab 
    $("#node-detail").show();
    requestDataFromServer("../dashboard/getnodespecificdetails", { "nodeid": nodeid, "mode": '', csrfmiddlewaretoken: csfr_token, selectedSite: site, ip: ip }, type = "POST").done(nodespecificdetialsresponse);

}
function openNavs(nodeid, site, ip = "") {
    $('#nagiosgraph').empty()
    $('.nav-tabs a[href="#' + 'nav-health' + '"]').tab('show'); //this is for directly opening the HEALTH tab
    $("#node-detail").show();
    document.getElementById("expand").checked = false
    document.getElementById("bod-eodstatus-expand").scrollIntoView({ block: "center", behavior: "smooth" })
    requestDataFromServer("../dashboard/getnodespecificdetails", { "nodeid": nodeid, "mode": '', csrfmiddlewaretoken: csfr_token, selectedSite: site, ip: ip }, type = "POST").done(nodespecificdetialsresponse);
}
function openhelp(nodeid, site, ip = "") {
    $('.nav-tabs a[href="#' + 'nav-help' + '"]').tab('show'); //this is for directly opening the HEALTH tab
    $("#node-detail").show();
    requestDataFromServer("../dashboard/getnodespecificdetails", { "nodeid": nodeid, "mode": '', csrfmiddlewaretoken: csfr_token, selectedSite: site, ip: ip }, type = "POST").done(nodespecificdetialsresponse);
}
function closeNav() {
    $("#node-detail").hide();
    hideGraphPopup();
}
function ticketInfo() {
    window.location.href = window.location.origin + '/incidents/?isInfopage=true'
}
// Site-specific chart logic moved to sitepage.js

var currentEmailNotificationTitle = "";

function openmail(nodeid, site, ip = "", title = "") {
    //console.log("openmail title arg:", title);
    currentEmailNotificationTitle = title;

    // Fetch current status
    fetch('/notification/toggle_email_notification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            title: title,
            action: 'get'
        })
    })
        .then(response => response.json())
        .then(data => {
            var statusMsg = "";
            var buttonsHtml = "";

            var pauseBtn = "<button class='swal-pause-btn' " +
                "style='background:transparent; border:2px solid #ff3d57; color:#ff3d57; " +
                "padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Pause</button>";

            var resumeBtn = "<button class='swal-resume-btn' " +
                "style='background:transparent; border:2px solid #16d39a; color:#16d39a; " +
                "padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Resume</button>";

            var cancelBtn = "<button class='swal-cancel-btn' " +
                "style='background:transparent; border:2px solid #f5a623; color:#f5a623; " +
                "padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Cancel</button>";


            if (data.status === 200) {
                var currentStatus = data.current_status; // 1 for Resume (Active), 0 for Pause (Inactive)

                if (currentStatus === 1) {
                    // Currently Active (Resumed) -> Show Pause Option
                    statusMsg = "<p style='color:#16d39a; font-weight:bold; margin-bottom:10px;'>Email-Notifications: Active</p>";
                    buttonsHtml = pauseBtn + cancelBtn;
                } else if (currentStatus === 0) {
                    // Currently Paused -> Show Resume Option
                    statusMsg = "<p style='color:#ff3d57; font-weight:bold; margin-bottom:10px;'>Email-Notifications: Paused</p>";
                    buttonsHtml = resumeBtn + cancelBtn;
                } else {
                    statusMsg = "<p style='color:grey; font-weight:bold; margin-bottom:10px;'>Email-Notifications: Unknown</p>";
                    buttonsHtml = pauseBtn + resumeBtn + cancelBtn; // Fallback show all?
                }
            }
            else if (data.status === 404) {
                statusMsg = "<p style='color:orange; font-weight:bold; margin-bottom:10px;'>Event not available</p>";
                buttonsHtml = cancelBtn; // Can't pause/resume if not found
            }
            else {
                statusMsg = "<p style='color:red; font-weight:bold; margin-bottom:10px;'>Error fetching status</p>";
                buttonsHtml = pauseBtn + resumeBtn + cancelBtn; // Fallback
            }

            var content =
                "<div style='display:flex; flex-direction:column; align-items:center;'>" +
                statusMsg +
                "<div style='display:flex; justify-content:center; gap:15px; margin-top:15px;'>" +
                buttonsHtml +
                "</div></div>";

            swal({
                title: (title && title !== "undefined") ? title : "Email-Notifications",
                text: content,
                html: true,
                showConfirmButton: false,
                showCancelButton: false,
                type: "warning"
            });
        })
        .catch(error => {
            console.error("Error fetching status:", error);
            // Fallback
            var content =
                "<div style='display:flex; justify-content:center; gap:15px; margin-top:25px;'>" +
                "<button class='swal-pause-btn' style='background:transparent; border:2px solid #ff3d57; color:#ff3d57; padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Pause</button>" +
                "<button class='swal-resume-btn' style='background:transparent; border:2px solid #16d39a; color:#16d39a; padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Resume</button>" +
                "<button class='swal-cancel-btn' style='background:transparent; border:2px solid #f5a623; color:#f5a623; padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Cancel</button>" +
                "</div>";

            swal({
                title: (title && title !== "undefined") ? title : "Email-Notifications",
                text: content,
                html: true,
                showConfirmButton: false,
                showCancelButton: false,
                type: "warning"
            });
        });
}

// Event Delegation for SweetAlert Buttons (Fix for inline onclick issues)
$(document).ready(function () {
    $(document).on('click', '.swal-pause-btn', function () {
        //console.log("Pause clicked via delegation");
        triggerPause();
    });

    $(document).on('click', '.swal-resume-btn', function () {
        //console.log("Resume clicked via delegation");
        triggerResume();
    });

    $(document).on('click', '.swal-cancel-btn', function () {
        //console.log("Cancel clicked via delegation");
        triggerCancel();
    });
});


// Global scope functions
window.triggerPause = function () {
    //console.log("triggerPause called");
    swal.close();
    updateEmailNotificationStatus(0, currentEmailNotificationTitle);
};

window.triggerResume = function () {
    //console.log("triggerResume called");
    swal.close();
    updateEmailNotificationStatus(1, currentEmailNotificationTitle);
};

window.triggerCancel = function () {
    //console.log("triggerCancel called");
    swal.close();
};

function updateEmailNotificationStatus(status, title) {
    var statusText = status === 1 ? "Resume" : "Pause";
    //console.log("updateEmailNotificationStatus status:", status, "title:", title);

    if (!title) {
        console.warn("Title is missing in updateEmailNotificationStatus");
        title = "Email-Notifications"; // Fallback
    }

    fetch('/notification/toggle_email_notification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken') // Ensure CSRF token is sent
        },
        body: JSON.stringify({
            status: status,
            title: title
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 200) {
                swal(`${statusText} Successful!`, data.msg, "success");
            } else {
                swal("Error", "Failed to update status: " + data.msg, "error");
            }
        })
        .catch(error => {
            console.error('Error:', error);
            swal("Error", "An unexpected error occurred", "error");
        });
}
// Helper to get cookie if not already defined (common in Django)
function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

var currentSnoozeTitle = "";
var currentSnoozeSite = "";
var currentSnoozeIP = "";
var currentSnoozeNodeId = "";

function opensnooze(nodeid, site, ip = "", title = "") {
    //console.log("opensnooze args:", nodeid, site, ip, title);
    currentSnoozeTitle = title;
    currentSnoozeSite = site;
    currentSnoozeIP = title;
    currentSnoozeNodeId = nodeid;

    var content =
        "<div style='display:flex; flex-direction:column; align-items:center;'>" +
        "<p style='margin-bottom:15px; font-weight:bold;'>Snooze Email Notifications</p>" +
        "<div style='margin-bottom:15px; display:flex; gap:10px; align-items:center;'>" +
        "<input type='number' id='snooze-duration' min='1' value='30' style='padding:5px; width:80px; border:1px solid #ccc; border-radius:3px;' />" +
        "<select id='snooze-unit' style='padding:5px; border:1px solid #ccc; border-radius:3px;'>" +
        "<option value='minutes'>Minutes</option>" +
        "<option value='hours'>Hours</option>" +
        "<option value='days'>Days</option>" +
        "</select>" +
        "</div>" +
        "<div style='display:flex; justify-content:center; gap:15px;'>" +
        "<button class='swal-snooze-confirm-btn' style='background:transparent; border:2px solid #16d39a; color:#16d39a; padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Snooze</button>" +
        "<button class='swal-snooze-cancel-btn' style='background:transparent; border:2px solid #f5a623; color:#f5a623; padding:10px 25px; font-weight:bold; border-radius:5px; cursor:pointer; font-size:14px;'>Cancel</button>" +
        "</div>" +
        "</div>";

    swal({
        title: (title && title !== "undefined") ? title : "Email-Notifications",
        text: content,
        html: true,
        showConfirmButton: false,
        showCancelButton: false,
        type: "warning"
    });
}

$(document).ready(function () {
    $(document).on('click', '.swal-snooze-confirm-btn', function () {
        var duration = $('#snooze-duration').val();
        var unit = $('#snooze-unit').val();
        triggerSnooze(duration, unit);
    });

    $(document).on('click', '.swal-snooze-cancel-btn', function () {
        swal.close();
    });
});

window.triggerSnooze = function (duration, unit) {
    swal.close();
    setSnoozeNotification(duration, unit, currentSnoozeTitle);
};

function setSnoozeNotification(duration, unit, title) {
    if (!title) {
        title = "Email-Notifications";
    }

    fetch('/notification/snooze_email_notification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            duration: duration,
            unit: unit,
            title: title,
            site: currentSnoozeSite,
            ip: currentSnoozeIP,
            nodeid: currentSnoozeNodeId
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 200) {
                swal("Snooze Successful!", data.msg, "success");
            } else {
                swal("Error", "Failed to snooze: " + data.msg, "error");
            }
        })
        .catch(error => {
            console.error('Error:', error);
            swal("Error", "An unexpected error occurred", "error");
        });
}
