// JavaScript source code
var params = new URLSearchParams(document.location.search);
sites = []
selectedsite = ' '
sites.push(params.get("site"));
var selectedsite = params.get("site");
var iframeIntervalValues = [];
isSave = false;
isEdit = false;
var prefix_url = "";
var access_key = ''
var analytics_Prefix_URL = ''
var grid = '';
var start_time = moment().startOf('day');
var end_time = moment()
var not_first_time = 0
var elastic_host = ''
var elastic_port = ''
var current_start_page = 0;

$(document).ready(function () {

    getSiteName();
    // Initialize default start and end times
    start_time = moment().startOf('day');
    end_time = moment();
    let defaultLabel = 'Today';
    function cb(start_time, end_time, label = defaultLabel) {
        // Update the label and value in the HTML
        if (label === 'Custom Range') {
            // Show actual time range only for custom ranges
            $('#reportrange .value').html(
                start_time.format('D MMMM, YYYY, hh:mm A') +
                ' - ' +
                end_time.format('D MMMM, YYYY, hh:mm A')
            );
        } else {
            // Show predefined label for preset ranges
            $('#reportrange .value').html(label);
        }
        // Handle logic for specific ranges
        switch (label) {
            case 'Last hour':
                start_time = moment().subtract(1, 'hour');
                end_time = moment();
                break;
            case 'Today':
                start_time = moment().startOf('day');
                end_time = moment();
                break;
            case 'Yesterday':
                start_time = moment().startOf('day').subtract(1, 'days');
                end_time = moment().startOf('day');
                break;
            case 'Last 7 Days':
                start_time = moment().startOf('day').subtract(6, 'days');
                end_time = moment();
                break;
            case 'Last 30 Days':
                start_time = moment().startOf('day').subtract(29, 'days');
                end_time = moment();
                break;
            case 'This Month':
                start_time = moment().startOf('month');
                end_time = moment();
                break;
            case 'Last Month':
                start_time = moment().subtract(1, 'month').startOf('month');
                end_time = moment().subtract(1, 'month').endOf('month');
                break;
            default:
                // Custom range
                break;
        }

        // Update logic based on the selected range
        const activeGridStackId = getActiveTabChildIdWithGridStack();
        if (activeGridStackId === 'Dealergridstackdiv') {
            not_first_time = 1;
            report_type = 'login_report';

            if ($.fn.DataTable.isDataTable('#esTable')) {
                showLoader("gridstackdiv");
                showLoader("esTable_wrapper");
                const table = $('#esTable').DataTable();
                const params = table.ajax.params();
                params.start_time = moment(start_time).toISOString();
                params.end_time = moment(end_time).toISOString();
                table.ajax.reload(null, false);
            } else {
                showLoader("gridstackdiv");
                if (report_type != '')
                    elastic_search(report_type);
            }
        } else //if (activeGridStackId === 'OMSgridstackdiv') 
        {
            const child_count = document.getElementById(activeGridStackId).getElementsByClassName('stack-item');
            Array.from(child_count).forEach((child) => {
                const iframe_elem_url = child.getElementsByClassName('iframe-elem')[0].src;
                const updatedUrl = updateUrlTimings(iframe_elem_url, start_time, end_time);
                child.getElementsByClassName('iframe-elem')[0].src = updatedUrl;
            });
        }
    }
    // Initialize Date Range Picker
    $('#reportrange').daterangepicker(
        {
            startDate: start_time,
            endDate: end_time,
            autoApply: true,
            linkedCalendars: false,
            timePicker: true,
            ranges: {
                'Last hour': [moment().subtract(1, 'hour'), moment()],
                'Today': [moment().startOf('day'), moment()],
                'Yesterday': [moment().startOf('day').subtract(1, 'days'), moment().startOf('day')],
                'Last 7 Days': [moment().startOf('day').subtract(6, 'days'), moment()],
                'Last 30 Days': [moment().startOf('day').subtract(29, 'days'), moment()],
                'This Month': [moment().startOf('month'), moment()],
                'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
            },
            locale: {
                format: 'D MMMM, YYYY hh:mm A'
            }
        },
        cb
    );
    // Trigger the callback to set the default value
    cb(start_time, end_time);

    $('#reportrange').on('apply.daterangepicker', function (ev, picker) {
        const label = ev.target.textContent.trim();
        if (!Object.keys(picker.ranges).includes(label)) {
            cb(picker.startDate, picker.endDate, 'Custom Range');
        } else {
            cb(picker.startDate, picker.endDate, label);
        }
    });
    // 🔥 Main tab handler - OUTSIDE getPrefixurl
    $('#nav-tab a').on('click', function (e) {
        e.preventDefault();
        const activeTab = $(this).attr('id');
        const targetId = $(this).attr('href');
        // 🔥 Remove active from all tabs
        $('#nav-tab a').removeClass('active');
        $(this).addClass('active');
        // 🔥 Hide ALL tab panes first
        $('.tab-content > .tab-pane').removeClass('show active');
        // 🔥 Show only the clicked tab's content
        $(targetId).addClass('show active');
        // Show/Hide date range picker based on tab
        if (activeTab === 'dealer-tab') {
            $('#analyticsTabContent').hide();
            $('#analyticsTabs').hide();
            $('#reportrange').show();
            $('.dropdown-container').show();
        } else if ((activeTab === 'oms-tab') || (activeTab === 'latency-tab')) {
            $('#analyticsTabContent').show();
            $('#analyticsTabs').show();
            $('#reportrange').hide();
            $('#elasticTabs').hide();
            $('.dropdown-container').hide();
        }
    });
    // Trigger click on default active tab to initialize UI
    $('#nav-tab a.active').trigger('click');
});
function updateUrlTimings(url, start, end) {
    // Regex to match 'from' and 'to' query parameters
    const fromRegex = /from=[^&]*/; // Matches 'from=' and everything after it until the next '&'
    const toRegex = /to=[^&]*/;     // Matches 'to=' and everything after it until the next '&'
    start = (new Date(start.toString())).getTime();
    end = (new Date(end.toString())).getTime();
    const updatedUrl = url
        .replace(fromRegex, `from=${start}`)
        .replace(toRegex, `to=${end}`);
    return updatedUrl;
}
function getActiveTabChildIdWithGridStack() {
    // Find the active tab element
    const activeTab = document.querySelector('.tab-pane.active.show');
    if (activeTab) {
        // Find the child element with the class 'grid-stack'
        const gridStackChild = activeTab.querySelector('.grid-stack');

        // Return the 'id' of the child element if found
        if (gridStackChild) {
            return gridStackChild.id;
        } else {
            console.warn('No child with class "grid-stack" found in the active tab.');
            return null;
        }
    } else {
        console.warn('No active tab found.');
        return null;
    }
}
function getSiteName() {
    requestDataFromServer('/lesites/getallsitenames', { type: 'clicksite', site: params.get("site") }, "GET").done(getPrefixurl);
}
function elastic_search(report) {
    let userId;
    let prefixSiteId;
    // STEP 1: GET CURRENT USER
    requestDataFromServer('/useronboard/getcurrentuser', {}, "GET").done(function (userResponse) {
        let userRes = JSON.parse(userResponse);
        if (userRes.status !== 200) {
            window.location.href = '/login';
            return;
        }
        userId = userRes.data.id;
        // STEP 2: GET CURRENT SITE
        requestDataFromServer('/lesites/getallsitenames', { type: 'clicksite', site: params.get("site") }, "GET").done(function (siteResponse) {
            let siteRes = JSON.parse(siteResponse);
            if (!siteRes.data || siteRes.data.length === 0) {
                createElasticSubsiteTabs(["dealer"], report);
                return;
            }
            prefixSiteId = siteRes.data[0].id;
            // STEP 3: GET SUBSITE DATA
            requestDataFromServer('/useronboard/getsubsitedata', { mode: "user_site", userId: userId, siteId: prefixSiteId, csrfmiddlewaretoken: csfr_token }, "POST").done(function (subsiteRes) {
                if (subsiteRes.status !== 200 || !subsiteRes.data ||
                    Object.keys(subsiteRes.data).length === 0) {
                    createElasticSubsiteTabs(["dealer"], report);
                    return;
                }
                let subsites = [];
                Object.values(subsiteRes.data).forEach(arr => {
                    arr.forEach(s => {
                        if (!subsites.includes(s)) subsites.push(s);
                    });
                });
                if (subsites.length === 0) {
                    createElasticSubsiteTabs(["dealer"], report);
                    return;
                }
                createElasticSubsiteTabs(subsites, report);
            })
                .fail(function () {
                    createElasticSubsiteTabs(["dealer"], report);
                });
        })
            .fail(function () {
                createElasticSubsiteTabs(["dealer"], report);
            });
    })
        .fail(function () {
            createElasticSubsiteTabs(["dealer"], report);
        });
    // CREATE SUBSITE TABS
    function createElasticSubsiteTabs(subsites, report) {
        $('#Dealergridstackdiv').empty();
        $('#Dealergridstackdiv').append(`
            <style>
                /* Remove all default padding/margins */
                #Dealergridstackdiv {
                    padding: 0 !important;
                    margin: 0 !important;
                }
                
                .tab-content {
                    padding: 0 !important;
                    margin: 0 !important;
                }
                
                .tab-pane {
                    padding: 0 !important;
                    margin: 0 !important;
                }
                
                /* DataTables wrapper - remove padding */
                .dataTables_wrapper {
                    padding: 0 !important;
                    margin: 0 !important;
                }
                
                /* Table styling with borders */
                table.dataTable {
                    border-collapse: collapse !important;
                    width: 100% !important;
                    border: 1px solid #444 !important;
                    margin: 0 !important;
                }
                
                /* Header styling with proper arrow positioning */
                table.dataTable thead th {
                    border: 1px solid #444 !important;
                    background: #1a1a1a !important;
                    color: #fff !important;
                    padding: 12px 30px 12px 8px !important;
                    font-weight: 600 !important;
                    text-align: left !important;
                    position: relative !important;
                    vertical-align: middle !important;
                }
                
                /* Remove default DataTables background images and ensure cursor */
                table.dataTable thead th.sorting,
                table.dataTable thead th.sorting_asc,
                table.dataTable thead th.sorting_desc {
                    background-image: none !important;
                    background-repeat: no-repeat !important;
                    background-position: center right !important;
                    cursor: pointer !important;
                    padding-right: 30px !important;
                    background: #1a1a1a !important;
                }
                
                /* Up arrow - all sortable columns */
                table.dataTable thead th.sorting:before,
                table.dataTable thead th.sorting_asc:before,
                table.dataTable thead th.sorting_desc:before {
                    content: "" !important;
                    position: absolute !important;
                    right: 10px !important;
                    top: 50% !important;
                    transform: translateY(-8px) !important;
                    border-bottom: 5px solid #fff !important;
                    border-left: 4px solid transparent !important;
                    border-right: 4px solid transparent !important;
                    opacity: 0.3 !important;
                }
                
                /* Down arrow - all sortable columns */
                table.dataTable thead th.sorting:after,
                table.dataTable thead th.sorting_asc:after,
                table.dataTable thead th.sorting_desc:after {
                    content: "" !important;
                    position: absolute !important;
                    right: 10px !important;
                    top: 50% !important;
                    transform: translateY(2px) !important;
                    border-top: 5px solid #fff !important;
                    border-left: 4px solid transparent !important;
                    border-right: 4px solid transparent !important;
                    opacity: 0.3 !important;
                }
                
                /* When sorted ascending - highlight up arrow */
                table.dataTable thead th.sorting_asc:before {
                    opacity: 1 !important;
                    border-bottom-color: #e99123 !important;
                }
                
                table.dataTable thead th.sorting_asc:after {
                    opacity: 0.3 !important;
                }
                
                /* When sorted descending - highlight down arrow */
                table.dataTable thead th.sorting_desc:before {
                    opacity: 0.3 !important;
                }
                
                table.dataTable thead th.sorting_desc:after {
                    opacity: 1 !important;
                    border-top-color: #e99123 !important;
                }
                
                table.dataTable thead tr.filter-row th {
                    border: 1px solid #444 !important;
                    background: #1a1a1a !important;
                    padding: 5px !important;
                }
                
                table.dataTable tbody td {
                    border: 1px solid #444 !important;
                    padding: 12px 8px !important;
                    background: #0a0a0a !important;
                    color: #fff !important;
                }
                
                table.dataTable tbody tr:hover td {
                    background: #1a1a1a !important;
                }
                
                /* Filter input styling */
                table.dataTable thead tr.filter-row th input {
                    width: 100% !important;
                    box-sizing: border-box !important;
                    padding: 6px 8px !important;
                    border: 2px solid #e99123 !important;
                    background: #2a2a2a !important;
                    color: #fff !important;
                    border-radius: 3px !important;
                    font-size: 13px !important;
                }
                
                table.dataTable thead tr.filter-row th input::placeholder {
                    color: #888 !important;
                }
                
                table.dataTable thead tr.filter-row th input:focus {
                    outline: none !important;
                    border-color: #fb923c !important;
                    background: #333 !important;
                }
                
                /* Scroll container */
                .dataTables_scroll {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                .dataTables_scrollHead {
                    overflow: visible !important;
                    border-bottom: none !important;
                }
                
                .dataTables_scrollBody {
                    overflow: auto !important;
                    border: none !important;
                }
                
                .dataTables_scrollBody table {
                    border-top: none !important;
                }
                
                /* Pagination container */
                .dataTables_wrapper .bottom {
                    padding: 15px 10px !important;
                    background: #0a0a0a !important;
                    border-top: 2px solid #444 !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                    margin: 0 !important;
                }
                
                .dataTables_info {
                    color: #fff !important;
                    font-size: 14px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                .dataTables_paginate {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* Pagination buttons */
                .dataTables_paginate .paginate_button {
                    display: inline-block !important;
                    padding: 8px 12px !important;
                    margin: 0 2px !important;
                    border: 1px solid #555 !important;
                    background: #2a2a2a !important;
                    color: #fff !important;
                    cursor: pointer !important;
                    border-radius: 3px !important;
                    min-width: 35px !important;
                    text-align: center !important;
                }
                
                .dataTables_paginate .paginate_button.current {
                    background: #666 !important;
                    border-color: #666 !important;
                    font-weight: bold !important;
                }
                
                .dataTables_paginate .paginate_button:hover:not(.disabled):not(.current) {
                    background: #3a3a3a !important;
                    border-color: #777 !important;
                }
                
                .dataTables_paginate .paginate_button.disabled {
                    opacity: 0.4 !important;
                    cursor: not-allowed !important;
                }
                
                .dataTables_paginate .ellipsis {
                    padding: 8px 4px !important;
                    color: #fff !important;
                }
                
                /* PDF Button */
                .dt-buttons {
                    margin: 0 0 10px 0 !important;
                    padding: 0 !important;
                }
                
                .dt-button {
                    background: #2a2a2a !important;
                    border: 1px solid #555 !important;
                    color: #fff !important;
                    padding: 8px 16px !important;
                    border-radius: 4px !important;
                }
                
                .dt-button:hover {
                    background: #3a3a3a !important;
                }
            </style>
            <ul class="nav nav-tabs" id="elasticTabs"></ul>
            <div class="tab-content" id="elasticTabContent"></div>
        `);
        let tabList = $('#elasticTabs');
        let tabContent = $('#elasticTabContent');
        subsites.forEach((realSubsite, index) => {
            let safeId = realSubsite.replace(/[^a-zA-Z0-9]/g, "_");
            tabList.append(`
                <li class="nav-item">
                    <a class="nav-link ${index === 0 ? 'active' : ''}" 
                       id="tab-${safeId}-tab" 
                       data-real="${realSubsite}" 
                       data-safe="${safeId}" 
                       data-bs-toggle="tab" 
                       href="#tab-${safeId}" 
                       role="tab" 
                       aria-controls="tab-${safeId}" 
                       aria-selected="${index === 0}">
                        ${realSubsite.toUpperCase()}
                    </a>
                </li>
            `);
            tabContent.append(`
                <div class="tab-pane fade ${index === 0 ? 'show active' : ''}" id="tab-${safeId}">
                    <div class="snackbar" id="snackbar-${safeId}"></div>
                    <table id="esTable-${safeId}" class="display">
                        <thead>
                            <tr>
                                <th>Client Id</th>
                                <th>UserName</th>
                                <th>Brk Id</th>
                                <th>Login time</th>
                                <th>Login attempt</th>
                                <th>Platform</th>
                                <th>IP Address</th>
                                <th>MAC Address</th>
                            </tr>
                            <tr class="filter-row">
                                <th></th>
                                <th></th>
                                <th></th>
                                <th></th>
                                <th></th>
                                <th></th>
                                <th></th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="loader" id="loader-${safeId}" style="display:none">
                        <img src="../../static/app/images/loading-gif.gif" />
                    </div>
                </div>
            `);
        });
        // Load first tab
        setTimeout(() => {
            let firstReal = subsites[0];
            let firstSafe = subsites[0].replace(/[^a-zA-Z0-9]/g, "_");
            loadElasticTable(firstReal, firstSafe, report);
        }, 100);
        // Tab click event
        $('#elasticTabs a.nav-link').on('click', function (e) {
            e.preventDefault();
            $(this).tab('show');
            let real = $(this).data("real");
            let safe = $(this).data("safe");
            loadElasticTable(real, safe, report);
        });
    }
    // LOAD DATATABLE FOR SUBSITE
    function loadElasticTable(realSubsite, safeId, report) {
        let tableId = `esTable-${safeId}`;
        let loaderId = `#loader-${safeId}`;
        if ($(`#${tableId}`).length === 0) {
            console.error("Table element not found:", tableId);
            return;
        }
        if ($.fn.DataTable.isDataTable(`#${tableId}`)) {
            return;
        }
        if (report !== 'login_report') {
            return;
        }
        $(loaderId).show();
        // BUILD CORRECT INDEX NAME
        let index_name = "";
        if (!realSubsite || realSubsite === "dealer") {
            index_name = "noren-login-history";
        } else {
            index_name = realSubsite.toLowerCase() + "-login-history";
        }
        const finalIndexName = index_name;
        try {
            const table = $(`#${tableId}`).DataTable({
                serverSide: true,
                processing: true,
                pageLength: 50,
                scrollX: true,
                scrollY: '400px',
                scrollCollapse: true,
                ajax: {
                    url: '/analytics/search_elasticsearch',
                    type: 'GET',
                    data: function (d) {
                        let params = {
                            start: d.start,
                            length: d.length,
                            draw: d.draw,
                            elastic_host: elastic_host,
                            elastic_port: elastic_port,
                            start_time: moment(start_time).toISOString(),
                            end_time: moment(end_time).toISOString(),
                            subsite: realSubsite,
                            index_name: finalIndexName
                        };
                        d.columns.forEach((col, index) => {
                            params[`columns[${index}][data]`] = col.data;
                            params[`columns[${index}][search]`] = col.search.value || '';
                        });
                        d.order.forEach((ord, index) => {
                            params[`order[${index}][column]`] = ord.column;
                            params[`order[${index}][dir]`] = ord.dir;
                        });
                        return params;
                    },
                    dataSrc: function (json) {
                        $(loaderId).hide();
                        return json.results;
                    },
                    error: function (xhr, status, error) {
                        console.error("AJAX Error:", error);
                        console.error("Response:", xhr.responseText);
                        $(loaderId).hide();
                    }
                },
                columns: [
                    { data: 'UserId' },
                    { data: 'UserName' },
                    { data: 'BrokerId' },
                    { data: '@timestamp' },
                    { data: 'ReqStatus' },
                    { data: 'AccessType' },
                    { data: 'LastLoginIp' },
                    { data: 'LastLoginMac' }
                ],
                dom: '<"top"B>rt<"bottom"ip><"clear">',
                buttons: [
                    {
                        text: 'PDF',
                        action: function () {
                            exportElasticPDF(realSubsite, table);
                        }
                    }
                ],
                initComplete: function () {
                    let api = this.api();
                    api.columns().every(function (index) {
                        let column = this;
                        let filterCell = $(`#${tableId} thead tr.filter-row th`).eq(index);

                        if (filterCell.find('input').length > 0) {
                            return;
                        }

                        let input = $('<input type="text" placeholder="Search" />')
                            .appendTo(filterCell)
                            .on('keyup change clear', function () {
                                if (column.search() !== this.value) {
                                    column.search(this.value).draw();
                                }
                            });
                    });

                    // Force add sorting classes if not present
                    $(`#${tableId} thead tr:first th`).each(function () {
                        if (!$(this).hasClass('sorting') &&
                            !$(this).hasClass('sorting_asc') &&
                            !$(this).hasClass('sorting_desc')) {
                            $(this).addClass('sorting');
                        }
                    });

                    $(loaderId).hide();
                },
                drawCallback: function () {
                    let api = this.api();

                    api.columns().every(function (index) {
                        let column = this;
                        let filterCell = $(`#${tableId} thead tr.filter-row th`).eq(index);
                        if (filterCell.find('input').length === 0) {
                            let currentSearch = column.search();
                            let input = $('<input type="text" placeholder="Search" />')
                                .val(currentSearch)
                                .appendTo(filterCell)
                                .on('keyup change clear', function () {
                                    if (column.search() !== this.value) {
                                        column.search(this.value).draw();
                                    }
                                });
                        }
                    });

                    // Re-apply sorting classes after each draw
                    $(`#${tableId} thead tr:first th`).each(function () {
                        if (!$(this).hasClass('sorting') &&
                            !$(this).hasClass('sorting_asc') &&
                            !$(this).hasClass('sorting_desc')) {
                            $(this).addClass('sorting');
                        }
                    });
                }
            });

        } catch (error) {
            console.error("Error initializing DataTable:", error);
            $(loaderId).hide();
        }
    }
    // PDF EXPORT
    function exportElasticPDF(realSubsite, table) {
        let filters = {};
        table.columns().every(function () {
            if (this.search()) filters[this.dataSrc()] = this.search();
        });
        let sorting = table.order().map(o => ({
            column: table.column(o[0]).dataSrc(),
            dir: o[1]
        }));
        let requestData = {
            filters,
            sorting,
            subsite: realSubsite,
            elastic_host,
            elastic_port,
            start_time: moment(start_time).toISOString(),
            end_time: moment(end_time).toISOString(),
        };
        $.ajax({
            url: '/analytics/export_to_pdf',
            type: 'POST',
            headers: { 'X-CSRFToken': csfr_token },
            data: {
                req: JSON.stringify(requestData),
                csrfmiddlewaretoken: csfr_token
            },
            success: function (resp) {
                const blob = new Blob([resp], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `user_data_${realSubsite}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        });
    }
}
function changePageHeader(title, titles) {
    $("#page-title").text(title);
    $("#page-titles").text(titles);
}

async function drawChart() {
    //console.log('INSIDE DRAWCHART')
    showLoader("gridstackdiv")
    document.getElementById('gridstackdiv').innerHTML = ""
    //$("#gridstackdiv").innerHTML=''
    if (jsonObject == undefined) {
        return;
    }

    var iframecount = jsonObject['graphs'].length;
    //var dashboard = ' ' + selectedsite + ' ' + ' > ' + jsonObject['dashboard']  ;
    var dashboard = ' ' + selectedsite + '  ';
    var dash = ' ' + jsonObject['dashboard'];
    changePageHeader(dashboard, dash)
    //var graphs = jsonObject['graphs'];
    var html = "";
    var has_error = 0
    //var has_errors = 0
    var error_mes = ''
    iframeIntervalValues = [];
    var graphs = changeMetadata(jsonObject)
    var graphsSettings = [];
    if (Object.keys(settingJsonObject).length > 0) {
        settingsObject = JSON.parse(settingJsonObject)
        var graphsSettings = settingsObject['graphs']
    }
    for (i in graphs) {
        IframeData = {};
        IframeData["id"] = "iframe_url_" + i;
        graphs[i].refresh ? IframeData["refreshtime"] = graphs[i].refresh : IframeData["refreshtime"] = 120;
        iframeIntervalValues.push(IframeData)
        //console.log(JSON.stringify(graphs[i].metadata))
        var form_data = JSON.stringify(graphs[i].metadata)
        var iframe_url = ''
        const apiKey = ""; // Grafana API key must be supplied via backend /analytics/getUID — never hardcode in client JS
        //console.log('ACCESS KEY GRAPHS--->' + access_key)

        await $.ajax({
            type: "POST",
            url: '/analytics/getpermalink',
            data: { url: analytics_Prefix_URL, accesstoken: access_key, formdata: form_data, urlparams: [], csrfmiddlewaretoken: csfr_token },   /* Passing the text data */
            success: function (response) {
                //console.log(response)
                has_error = 0
                //console.log(response.error + 'type->' + typeof (response.error) + ' -edited string->' + response.error.slice(2, -2).replace(/\\/g, ""))
                if (response.hasOwnProperty('error') || response.status == 400) {
                    has_error++;
                    //has_errors++;
                    error_mes = response.error.slice(2, -2).replace(/\\/g, "")
                    //console.log('error_mes--->' + error_mes);
                    iframe_url = ''
                    msg = response.msg
                    access_key = ''
                    swal({
                        title: 'FAILURE!',
                        text: response['msg'],
                        type: "warning",
                        confirmButtonClass: "btn-danger",
                        closeOnConfirm: true
                    })
                    //swal(msg, ' ', 'error')
                } else {
                    
                    iframe_url = analytics_Prefix_URL + (response['url'].split('None/'))[1] + "?standalone=true"
                }

            }
        });
        var iframe_height = graphsSettings.length ? graphsSettings[i].height : graphs[i].height;
        var iframe_width = graphsSettings.length ? graphsSettings[i].width : graphs[i].width;
        var iframe_x = graphsSettings.length ? graphsSettings[i].x : graphs[i].x;
        var iframe_y = graphsSettings.length ? graphsSettings[i].y : graphs[i].y;
        var id = graphs[i].id;
        html += '<div class="grid-stack-item" gs-x="' + iframe_x + '"gs-y="' + iframe_y + '" gs-w="' + iframe_width + '" gs-h="' + iframe_height + '"id="' + id + '" >';
        html += '<div class="card grid-stack-item-content">';
        html += '<div class="card-header heading">';
        html += '<h6 class="card-title d-inline-block">' + graphs[i].name + '</h6>';
        html += '</div>';
        html += '<div class="card-body iframe-parent" data-count="' + i + '" id="graphdiv_' + i + '">';
        if (has_error) {
            // Create a Swal
            var err_text = "Error in getting Frames \"" + (JSON.parse(error_mes))['message'] + "\" Please check once!."
            var swalHTML = "<script src='https://cdn.jsdelivr.net/npm/sweetalert2@11'></script>" +
                "<script>" +
                "Swal.fire({" +
                "  title: 'ERROR!'," +
                "  text:" + err_text + "," +
                "  icon: 'failure'" +
                "  showCancelButton: false," +
                "  closeOnConfirm: true," +
                "  confirmButtonClass: 'red-bg'," +
                "  confirmButtonText: 'OK'," +
                "});" +
                "</script>";
            html += "<iframe id='iframe_url_" + i + "' src='' frameBorder='0' style='width:100%;background-color:#ffffff' allow='websocket' ><div class='row col-12' style='text-align:center'><div class='col-2'></div><div class='col-8 ' id='print-error'><h3 style='background-color:#a33219;color:white;border-radius:3px;font-size:14px;width:100%'>" + error_mes + "</h3></div><div class='col-2'></div></div>" + swalHTML + "</div></iframe>"
        } else {
            html += "<iframe id='iframe_url_" + i + "' src='" + iframe_url + "' frameBorder='0' style='width:100%;background-color:#ffffff' allow='websocket'></iframe>"
        }
        
        html += '</div>';
        html += '</div>';
        html += '</div>';
    };
    $("#gridstackdiv").append(html);
    stopLoader("gridstackdiv")
    //resizeIframe();
    setIframeinterval()
    grid = GridStack.init(
        {
            alwaysShowResizeHandle: true
        });
    resizeIframe();
}
function resizeIframe() {
    var frame_dict = {}
    $('.iframe-parent').each(function (e) {
        var count = $(this).data("count");
        //  console.log('<---RESIZE--->')
        frame_dict['iframe_element' + count] = $(this)
        var iframe_height = (parseInt($(this).height()) - 20).toString();
        var iframe_width = $(this).width();
        var gridelem = document.getElementById(count)
        // console.log('countELEM--->' + document.getElementById(count)+' count--->' + count)
        grid.on('resizestop', function (event, gridelem) {
            var count_num = gridelem.id;
            //    console.log('gridelem.id--->' + gridelem.id+' count--->' + count)
            let width = parseInt(gridelem.getAttribute('gs-w')) || 0;
            let height = parseInt(gridelem.getAttribute('gs-h')) || 0;
            //   console.log('GRID WIDTH--->' + width + ', GRID HEIGHT--->' + height)
            var new_frame_height = parseInt((($("#" + count_num).css("height"))).split('px')[0]) - 100
            var new_frame_width = parseInt((($("#" + count_num).css("width"))).split('px')[0]) - 100
            var iframe_elements = frame_dict['iframe_element' + count]
            $("#iframe_url_" + count_num).attr("height", new_frame_height);
            $("#iframe_url_" + count_num).attr("width", new_frame_width)
        });
        ///////////////////////////////TESTING STARTS/////////////////////////////////////////
        var frame_css = '<style>.superset-legacy-chart-big-number {background: #121212!important;color: #ffffff!important;}</style>';
        ////////////////////////////////TESTING ENDS///////////////////////////////////////////
        $("#iframe_url_" + count).attr("height", iframe_height);
        $("#iframe_url_" + count).attr("width", iframe_width);
    });

}
function setIframeinterval() {
    iframeIntervalValues.forEach(function (value) {
        window.setInterval(function () {
            var iframe = document.getElementById(value.id);
            iframe.src = iframe.src;
        }, value.refreshtime * 1000);
    });
}
function changeMetadata(jsonObject) {
    //console.log('JSONOBJECT----->' + JSON.stringify(jsonObject))
    var graphs = jsonObject["graphs"]
    var table = jsonObject["table"]
    //console.log('TABLE--->' + JSON.stringify(table))
    isSave ? dataSource = table['history'] : dataSource = table['intraday']
    var dateRange = document.getElementsByClassName("value").item(0)
    stime_etime = (dateRange.innerHTML).split('-')
    starttime = moment(stime_etime[0]).format('yyyy-MM-DD') + 'T' + '00:00:00';
    endtime = moment(stime_etime[1]).format('yyyy-MM-DD') + 'T' + '23:59:59';
    var time_range = starttime + " : " + endtime;
    for (i in graphs) {
        isSave ? dataSource = graphs[i].table['history'] : dataSource = graphs[i].table['intraday']
        graphs[i].metadata.datasource = dataSource;
        graphs[i].metadata.time_range = time_range
        //console.log('GRAPHS[i]---->' + JSON.stringify(graphs[i]))
    }
    return graphs;
}

async function saveGrid() {
    if (isEdit) {
        settings = {}
        settings["id"] = jsonObject["uid"]
        newGrapData = []
        $(".grid-stack-item").each(function (e) {
            data = {};
            element = $(this)[0]
            elementId = element.id
            dataset = element.dataset
            // grapvalue = graphs.filter(x => x.id == elementId);
            data["id"] = elementId;
            data["x"] = dataset.gsX;
            data["y"] = dataset.gsY;
            data["height"] = dataset.gsHeight;
            data["width"] = dataset.gsWidth;
            data["refresh"] = iframeIntervalValues.filter(x => x.id == 'iframe_url_' + elementId)[0].refreshtime;
            newGrapData.push(data);
        });
        settings["graphs"] = newGrapData;
        requestDataFromServer('saveSettings', { 'settingsData': JSON.stringify(settings), csrfmiddlewaretoken: csfr_token }, "POST");
    }
    else {

        isSave = true;
        // drawChart()
        graphs = changeMetadata(jsonObject)
        for (i in graphs) {
            var form_data = JSON.stringify(graphs[i].metadata)
            var iframe_url = ''
            await $.ajax({
                type: "POST",
                url: '/analytics/getpermalink',
                data: { url: analytics_Prefix_URL, accesstoken: access_key, formdata: form_data, urlparams: [], csrfmiddlewaretoken: csfr_token },   /* Passing the text data */
                success: function (response) {
                    iframe_url = analytics_Prefix_URL + (response['url'].split('None/'))[1] + "?standalone=true"
                }
            });
            iframe = document.getElementById("iframe_url_" + i)
            iframe.setAttribute("src", iframe_url)
            iframe.src = iframe.src;
        }
    }
}
function onEdit() {
    isEdit = true;
}
function onRefresh() {
    location.reload();
}
async function getPrefixurl(response) {
    res = JSON.parse(response);
    let prefixSiteName = res.data[0].sitename;
    let prefixSiteId = res.data[0].id;
    let userId;

    analytics_Prefix_URL = res.data[0].analytics_Prefix_URL;
    var svc_token = res.data[0].grafana_api;
    elastic_host = res.data[0].elastic_host;
    elastic_port = res.data[0].elastic_port;
    // ✅ Get current logged-in user
    requestDataFromServer('/useronboard/getcurrentuser', {}, "GET").done(function (userResponse) {
        let userRes = JSON.parse(userResponse);
        if (userRes.status == 200) {
            userId = userRes.data.id;
            // ✅ Fetch subsite data for THIS USER + THIS SITE
            requestDataFromServer('/useronboard/getsubsitedata', { mode: "user_site", userId: userId, siteId: prefixSiteId, csrfmiddlewaretoken: csfr_token }, "POST").done(function (subsiteRes) {
                // Check if user has subsites for THIS site
                if (subsiteRes.status !== 200 ||
                    !subsiteRes.data ||
                    Object.keys(subsiteRes.data).length === 0) {
                    loadDashboard('oms');
                    return;
                }
                let data = subsiteRes.data;
                let allSubsites = [];
                // Collect unique subsites for THIS site
                Object.keys(data).forEach(function (siteName) {
                    data[siteName].forEach(function (subSite) {
                        if (!allSubsites.includes(subSite)) {
                            allSubsites.push(subSite);
                        }
                    });
                });

                // If no subsites after processing
                if (allSubsites.length === 0) {
                    loadDashboard('oms');
                    return;
                }
                createSubsiteTabs(allSubsites);
            }).fail(function (error) {
                loadDashboard('oms');
            });
        } else if (userRes.status == 401) {
            console.error("User not authenticated");
            window.location.href = '/login';
        }
    }).fail(function (error) {
        console.error("Error fetching current user:", error);
        loadDashboard('oms');
    });
    function createSubsiteTabs(subsites) {
        let tabList = $('#analyticsTabs');
        let tabContent = $('#analyticsTabContent');
        tabList.empty();
        tabContent.empty();

        subsites.forEach(function (subsite, index) {
            let isActive = index === 0 ? 'active' : '';
            let isShow = index === 0 ? 'show active' : '';
            let subsiteUpper = subsite.toUpperCase();
            let subsiteId = subsite.toLowerCase().replace(/\s+/g, '-');

            tabList.append(`
                <li class="nav-item" role="presentation">
                    <a class="nav-link ${isActive}" 
                       id="${subsiteId}-tab" 
                       data-bs-toggle="tab"
                       data-toggle="tab"
                       href="#${subsiteId}" 
                       role="tab" 
                       aria-controls="${subsiteId}" 
                       aria-selected="${index === 0}">
                        ${subsiteUpper}
                    </a>
                </li>
            `);

            tabContent.append(`
                <div class="tab-pane fade ${isShow}" 
                     id="${subsiteId}" 
                     role="tabpanel" 
                     aria-labelledby="${subsiteId}-tab">
                    <div class="snackbar" id="snackbar-${subsiteId}"></div>
                    <div class="grid-stack" data-gs-animate="yes" id="${subsiteUpper}gridstackdiv">
                        <div class="loader" id="loader-${subsiteId}" style="display:none">
                            <img src="../../static/app/images/loading-gif.gif" />
                        </div>
                    </div>
                </div>
            `);
        });

        // Load first subsite dashboard
        if (subsites.length > 0) {
            loadDashboard(subsites[0]);
        }

        // Tab click handler
        $('#analyticsTabs a.nav-link').off('click').on('click', function (e) {
            e.preventDefault();
            let targetId = $(this).attr('href').replace('#', '');
            // Remove active from all tabs and panes
            $('#analyticsTabs a.nav-link').removeClass('active');
            $('#analyticsTabContent .tab-pane').removeClass('show active');
            // Add active to clicked tab and target pane
            $(this).addClass('active');
            $('#' + targetId).addClass('show active');
            // Load dashboard if not loaded
            let gridDiv = $('#' + targetId.toUpperCase() + 'gridstackdiv');
            if (gridDiv.find('iframe').length === 0) {
                loadDashboard(targetId);
            }
        });
    }
    function loadDashboard(db_name) {
        // Fetch the dashboard UID from Grafana via Django backend (Basic Auth server-side)
        $.ajax({
            type: "GET",
            url: '/analytics/getUID',
            data: {
                url: analytics_Prefix_URL,
                dbname: db_name,
                svctoken: svc_token,
                csrfmiddlewaretoken: csfr_token
            },
            success: function (response) {
                if (!response.token_json || !response.token_json[0]) {
                    console.error('Grafana getUID returned no data:', response);
                    return;
                }

                var dashboard_uid = response.token_json[0].uid;
                var slug_name = response.db_json.meta.slug;

                // Point the iframe at our Django reverse proxy, NOT directly at Grafana.
                // The proxy adds Basic Auth server-side — browser never contacts Grafana directly.
                var iframe_url = '/grafana-proxy/d/' + dashboard_uid + '/' + slug_name
                    + '?_g=' + encodeURIComponent(analytics_Prefix_URL)
                    + '&from=' + start_time
                    + '&to=' + end_time
                    + '&timezone=browser&orgId=1&kiosk=1';

                var gridstack_div_id = db_name.toUpperCase() + "gridstackdiv";
                $("#" + gridstack_div_id).append(`
                    <div class="stack-item">
                        <div class="card grid-stack-item-content">
                            <div class="card-body iframe-parent">
                                <iframe class='iframe-elem' id='${db_name}_iframe'
                                    src='${iframe_url}' frameBorder='0'
                                    style='width:100%; height:100%; background-color:#ffffff'></iframe>
                            </div>
                        </div>
                    </div>
                `);
            },
            error: function (xhr, status, error) {
                console.error("Error loading Grafana dashboard UID:", error);
                swal(error + ' error occurred while fetching dashboard data!', ' ', "error");
            }
        });
    }
}

/*async function getPrefixurl(response) {
    //getaccesstoken(response)
    //console.log('<-----getPrefixurl response------>' + response)
    res = JSON.parse(response);
    analytics_Prefix_URL = res.data[0].analytics_Prefix_URL;
    var svc_token = res.data[0].grafana_api;
    elastic_host = res.data[0].elastic_host;
    elastic_port = res.data[0].elastic_port;
    //console.log('analytics_prefix_url---->' + analytics_Prefix_URL)
    //analytics_Prefix_URL = 'http://172.20.1.80:3000';
    var db_names = ['oms']
    //var db_names = ['oms','Latency','MessageQueue']
    // Grafana service account token is loaded from backend (res.data[0].grafana_api) — never commit tokens here
    //console.log('ANALYTICS URL --->' + analytics_Prefix_URL )
    //console.log('svc_token  --->' + svc_token )
    db_names.forEach(async function (db_name) {
        await $.ajax({
            type: "GET",
            url: '/analytics/getUID',
             // Passing the text data 
            data: { url: analytics_Prefix_URL, dbname: db_name, svctoken: svc_token, csrfmiddlewaretoken: csfr_token },  
            success: function (response) {
                //console.log('RESPONSE--->' + JSON.stringify(response))
                var dashboard_uid = response.token_json[0].uid
                var slug_name = response.db_json.meta.slug
                const now = end_time
                const sevenDaysAgo = start_time
                var iframe_url = analytics_Prefix_URL + 'd/' + dashboard_uid + '/' + slug_name + '?from=' + sevenDaysAgo + '&to=' + now + '&timezone=browser&orgId=1&kiosk=1'
                //var iframe_url = analytics_Prefix_URL + 'd-solo/' + dashboard_uid + '/' + slug_name + '?kiosk=1&from=' + sevenDaysAgo + '&to=' + now + '&refresh=5s&timezone=browser&orgId=1&panelId=' + id + '&__feature.dashboardSceneSolo'
                //console.log('IFRAMEURL --> ' + iframe_url)
                var gridstack_div_id = db_name.toUpperCase() + "gridstackdiv";
                //console.log('gridstack_div_id--->' + gridstack_div_id)
                // Append the iframe dynamically inside the correct gridstackdiv
                $("#" + gridstack_div_id).append(`
                    <div class="stack-item">
                        <div class="card grid-stack-item-content">
                            <div class="card-body iframe-parent">
                                <iframe class='ifram e-elem' id='${db_name}_iframe' 
                                    src='${iframe_url}' frameBorder='0' 
                                    style='width:100%; height:100%; background-color:#ffffff'></iframe>
                            </div>
                        </div>
                    </div>
                `);

            },
            error: function (xhr, status, error) {
                stopLoader("Dealergridstackdiv")
                stopLoader("gridstackdiv")
                swal(error + ' error occurred while fetching index data!', ' ', "error");
            }
        });
    })
    //requestDataFromServer('/analytics/getprefixurlData', { url: analytics_Prefix_URL }, "GET").done(getPrefixurlResponse);
}*/

/*function getaccesstoken(response) {
   // getPrefixurl(response)
    //console.log('<-----getACCESSTOKEN response------>' + response)
    res = JSON.parse(response);
    analytics_Prefix_URL = res.data[0].analytics_Prefix_URL;

    //return new Promise((resolve) => { }
    requestDataFromServer('/analytics/getaccesstoken', { url: analytics_Prefix_URL, csrfmiddlewaretoken: csfr_token }, "POST").done(testfunction);
}*/

function testfunction(response) {
    var resp_json = (response)
    //  var resp_json = JSON.parse(response)
    if (response.status != 400) {
        var urlkey = resp_json['url']
        access_key = resp_json['token_json']['access_token']
    } else {
        msg = response.msg
        access_key = ''
        swal({
            title: 'FAILURE!',
            text: response['msg'],
            type: "warning",
            confirmButtonClass: "btn-danger",
            closeOnConfirm: true
        })
        //swal(msg, ' ', 'error')
    }
}
/*function getpermalink(form_data) {
   // var resp_json = JSON.parse(response)
  //  var urlkey = analytics_Prefix_URL
   // var access_key = resp_json['token_json']['access_token']
    console.log('ACCESS KEY GETPERMALINK--->' + (access_key))
    console.log('getpermalink FORM_DATA--->' + (form_data))
   requestDataFromServer('/analytics/getpermalink', { url: analytics_Prefix_URL, accesstoken: access_key, formdata: form_data, urlparams: [], csrfmiddlewaretoken: csfr_token }, "POST").done(getPrefixurlResponse);
}*/
function getPrefixurlResponse(res) {
    response = JSON.parse(res)
    if (Object.keys(res).length > 0) {
        if (response.analysticsDashboardurl && response.user) {
            prefix_url = new URL("superset/explore/?username=" + (response.user).toString() + "&form_data=", (response.analysticsDashboardurl).toString());
        }
    }
    drawChart();
}
function toggleDropdown() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    dropdownMenu.classList.toggle('show');
}
function openService(serviceName) {
    alert(`${serviceName} selected.`);
}

document.addEventListener('click', function (event) {
    const dropdownMenu = document.getElementById('dropdownMenu');
    const dropdownButton = document.querySelector('.dropdown-button');
    if (!dropdownButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove('show');
    }
});
