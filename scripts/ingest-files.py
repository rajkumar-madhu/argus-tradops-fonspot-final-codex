#!/usr/bin/env python3
"""Build the read-only source cache; prints counts, never trading rows."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.file_analytics import FileAnalytics
p=argparse.ArgumentParser()
p.add_argument('--source-dir',required=True)
p.add_argument('--cache',required=True)
p.add_argument('--unit',choices=['unknown','us','ms','s'],default='unknown')
a=p.parse_args()
report=FileAnalytics(a.cache,a.source_dir,unit=a.unit).ingest()
print(json.dumps(report,indent=2))
