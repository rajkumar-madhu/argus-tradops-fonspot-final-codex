"""
Management Console URL Configuration
Dedicated URL patterns for the Management Console Analytics Dashboard
"""

from django.urls import path
from . import analytics_views

app_name = 'management_console'

urlpatterns = [
    # Main Management Console Dashboard
    path('dashboard/', analytics_views.dashboard, name='dashboard'),
    
    # Analytics API Endpoints
    path('getTableIndex/', analytics_views.getTableIndex, name='getTableIndex'),
    path('saveSettings/', analytics_views.saveSettings, name='saveSettings'),
    path('getprefixurlData/', analytics_views.getprefixurlData, name='getprefixurlData'),
    path('getpermalink/', analytics_views.getpermalink, name='getpermalink'),
    path('getaccesstoken/', analytics_views.getaccesstoken, name='getaccesstoken'),
    path('getUID/', analytics_views.getUID, name='getUID'),
    path('monitorgraph/', analytics_views.monitorgraph, name='monitorgraph'),
    
    # Elasticsearch Search
    path('search_elasticsearch/', analytics_views.search_elasticsearch, name='search_elasticsearch'),
    
    # Export Functions
    path('export_to_excel/', analytics_views.export_to_excel, name='export_to_excel'),
    path('export_to_pdf/', analytics_views.export_to_pdf, name='export_to_pdf'),
]