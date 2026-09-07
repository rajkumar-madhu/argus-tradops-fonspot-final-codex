# Management Console - Analytics Dashboard

A dedicated directory containing all the frontend and backend code for the LinkedEye Management Console Analytics Dashboard (OMS).

## Directory Structure

```
management console/
├── README.md                               # This documentation file
├── templates/
│   └── analytics.html                      # Main analytics dashboard template
├── static/
│   ├── js/
│   │   ├── analytics.js                     # Main analytics JavaScript
│   │   ├── moment.js                        # Moment.js for date handling
│   │   ├── bootstrap.min.js                 # Bootstrap JavaScript
│   │   ├── gridstack.all.js                 # Gridstack library for dashboards
│   │   ├── ripple.min.js                    # Ripple effect library
│   │   ├── bootstrap-select.min.js          # Bootstrap select library
│   │   └── daterangepicker.js               # Date range picker
│   └── css/
│       ├── analytics.css                    # Analytics dashboard styling
│       ├── gridstack.min.css                # Gridstack CSS
│       ├── bootstrap-select.min.css          # Bootstrap select CSS
│       ├── daterangepicker.css               # Date range picker CSS
│       ├── ripple.min.css                    # Ripple effect CSS
│       └── bootstrap.min.css                 # Bootstrap CSS
└── python-backend/
    ├── analytics_views.py                  # Django views for analytics
    ├── analytics_models.py                 # Django models for analytics
    ├── analytics_urls.py                   # URL configuration
    └── management_console_urls.py          # Management console URL configuration
```

## Frontend Files

### 1. **Main Template** (`templates/analytics.html`)
- **Purpose**: Main HTML template for the Management Console Analytics Dashboard
- **Features**:
  - "Order/Trade analytics" and "Reports" tabs
  - OMS (Order Management System) section
  - Grid stack layout for dashboard widgets
  - Data tables for reports
  - Time range filtering
  - Dark theme design

### 2. **JavaScript Files** (`static/js/`)
- **analytics.js**: Main JavaScript for dashboard functionality
  - Tab switching between analytics and reports
  - Time range management
  - Dashboard grid management
  - API integration for data loading
  - Elasticsearch search integration

- **Supporting Libraries**:
  - `moment.js`: Date and time manipulation
  - `bootstrap.min.js`: Bootstrap framework
  - `gridstack.all.js`: Dashboard grid layout
  - `daterangepicker.js`: Date range selection
  - `bootstrap-select.min.js`: Enhanced select inputs

### 3. **CSS Files** (`static/css/`)
- **analytics.css**: Main dashboard styling
- **gridstack.min.css**: Grid layout styling
- **daterangepicker.css**: Date picker styling
- **bootstrap-select.min.css**: Enhanced select styling
- **ripple.min.css**: Material design ripple effects

## Backend Files

### 1. **Django Views** (`python-backend/analytics_views.py`)
- **Purpose**: Server-side logic for analytics dashboard
- **Key Functions**:
  - `dashboard()`: Main analytics dashboard view
  - `getTableIndex()`: Get table indices for analytics
  - `search_elasticsearch()`: Search Elasticsearch for reports
  - `saveSettings()`: Save user dashboard settings
  - `getaccesstoken()`: Get Superset access token
  - `getUID()`: Get Grafana dashboard UID
  - `export_to_excel()`: Export data to Excel
  - `export_to_pdf()`: Export data to PDF

### 2. **Django Models** (`python-backend/analytics_models.py`)
- **Purpose**: Database models for analytics
- **Key Models**:
  - `UserSettingsModel`: User-specific dashboard settings

### 3. **URL Configuration** (`python-backend/`)
- **analytics_urls.py**: Original analytics URL patterns
- **management_console_urls.py**: Dedicated management console URL patterns

## Integration Instructions

### 1. **Add to Main URL Configuration**
Add the following to your main `urls.py` file:

```python
# In LinkedEyeWebProject/urls.py
path('management-console/', include('management console.python-backend.management_console_urls')),
```

### 2. **Configure Static Files**
Ensure your Django settings include the management console static files:

```python
# In settings.py
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'management console/static'),
    # ... other static directories
]
```

### 3. **Template Configuration**
Ensure the management console templates are accessible:

```python
# In settings.py
TEMPLATES = [
    {
        'DIRS': [
            os.path.join(BASE_DIR, 'management console/templates'),
            # ... other template directories
        ],
    }
]
```

### 4. **Update Navigation**
Update navigation links to point to the new management console:

```html
<!-- In navigation file -->
<a href="{% url 'management_console:dashboard' %}">Management Console</a>
```

## API Endpoints

### Main Dashboard
- `GET /management-console/dashboard/` - Main analytics dashboard

### Analytics API
- `GET /management-console/getTableIndex/` - Get table indices
- `POST /management-console/saveSettings/` - Save user settings
- `POST /management-console/getprefixurlData/` - Get prefix URL data
- `POST /management-console/getpermalink/` - Get Superset permalink
- `POST /management-console/getaccesstoken/` - Get access token
- `GET /management-console/getUID/` - Get Grafana UID
- `POST /management-console/monitorgraph/` - Monitor graph data

### Elasticsearch
- `GET /management-console/search_elasticsearch/` - Search reports data

### Export Functions
- `POST /management-console/export_to_excel/` - Export to Excel
- `POST /management-console/export_to_pdf/` - Export to PDF

## Dependencies

### Required Django Applications
- `analytics` - Original analytics app (for models)
- `login` - Authentication and role management
- `lesites` - Site management (for site context)

### Python Libraries
- Django
- psycopg2 - PostgreSQL database connection
- Elasticsearch - Search functionality
- requests - HTTP requests
- openpyxl - Excel file generation
- reportlab - PDF generation

### JavaScript Libraries
- jQuery
- Moment.js
- Bootstrap
- Gridstack
- DataTables
- Chart.js (for charts)

## Features

### 1. **Order/Trade Analytics**
- Real-time OMS data visualization
- Customizable dashboard widgets
- Time range filtering
- Performance metrics

### 2. **Reports**
- Login history reports
- User activity reports
- Data export functionality
- Advanced search and filtering

### 3. **Dashboard Management**
- Drag-and-drop widget arrangement
- User-specific layout saving
- Responsive design
- Real-time data updates

## Access Control

The management console requires specific role access:
- **Admin**: Full access to all features
- **Management**: Analytics and reports access
- **ViewOnly**: Read-only access to dashboards
- **Onboard**: Limited access for onboarding users
- **Risk**: Risk management reports access

## File Path References

### Original → New Structure
- `app/templates/app/analytics.html` → `management console/templates/analytics.html`
- `app/static/app/js_src/analytics/analytics.js` → `management console/static/js/analytics.js`
- `app/static/app/css/analytics/analytics.css` → `management console/static/css/analytics.css`
- `analytics/views.py` → `management console/python-backend/analytics_views.py`
- `analytics/urls.py` → `management console/python-backend/analytics_urls.py`
- `analytics/models.py` → `management console/python-backend/analytics_models.py`

## Usage

### Accessing the Management Console
1. Navigate to `/management-console/dashboard/`
2. Select site from dropdown (if applicable)
3. Choose between "Order/Trade analytics" or "Reports" tabs
4. Customize dashboard layout as needed
5. Use time range filters for data analysis

### Customizing Dashboards
1. Drag widgets to rearrange layout
2. Click refresh icon to update data
3. Use export buttons to download reports
4. Save custom layouts for future use

## Troubleshooting

### Dashboard Not Loading
- Check that static files are properly configured
- Verify the analytics app is installed
- Check browser console for JavaScript errors
- Ensure user has proper role permissions

### Data Not Loading
- Verify Elasticsearch connection
- Check PostgreSQL database connection
- Ensure site configuration is correct
- Check Django logs for error messages

### Export Functions Not Working
- Verify openpyxl and reportlab are installed
- Check file permissions for export directory
- Ensure user has export permissions

## Performance Optimization

- **Caching**: Consider caching frequently accessed data
- **Lazy Loading**: Dashboard widgets load on-demand
- **Pagination**: Large datasets use pagination
- **Compression**: Enable static file compression in production

## Security Considerations

1. **Access Control**: Role-based access control implemented
2. **SQL Injection**: Parameterized queries used throughout
3. **CSRF Protection**: All API calls include CSRF tokens
4. **Input Validation**: All user inputs are validated
5. **Secure Connections**: HTTPS recommended for production

## Future Enhancements

- Real-time WebSocket data updates
- Additional chart types and visualizations
- Advanced reporting capabilities
- Mobile app integration
- API rate limiting
- Enhanced search functionality

## Support and Maintenance

For issues or questions:
1. Check Django logs for error messages
2. Verify file permissions and directory structure
3. Test API endpoints individually
4. Check browser console for JavaScript errors
5. Review the original analytics app for reference

This dedicated management console directory provides a clean, maintainable structure for the LinkedEye Analytics Dashboard, making it easier to develop, test, and maintain the OMS functionality.