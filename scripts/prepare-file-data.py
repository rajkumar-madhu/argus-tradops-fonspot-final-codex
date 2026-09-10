#!/usr/bin/env python3
"""Copy only approved CSV filenames to a Compose mount; never modify originals."""
import shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
target=root/'.local/csv-input';target.mkdir(parents=True,exist_ok=True)
count=0
for pattern in ('ORDERLATENCY*.csv','L_ORDERLATENCY*.csv','QueSize_*.csv'):
    for path in sorted(root.glob(pattern)):
        if path.is_file() and not path.is_symlink():
            shutil.copy2(path,target/path.name);count+=1
print(f'Prepared {count} source files in .local/csv-input')
