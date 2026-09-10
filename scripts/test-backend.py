#!/usr/bin/env python3
"""Run non-package test files without colliding with dependency `tests` packages."""
import importlib.util
from pathlib import Path
import sys
import unittest
root=Path(__file__).resolve().parents[1]/'backend'
sys.path.insert(0,str(root))
suite=unittest.TestSuite()
for file in sorted((root/'tests').glob('test_*.py')):
    spec=importlib.util.spec_from_file_location(f'tradeops_{file.stem}',file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
result=unittest.TextTestRunner(verbosity=1).run(suite)
sys.exit(not result.wasSuccessful())
