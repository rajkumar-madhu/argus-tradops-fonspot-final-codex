#!/usr/bin/env python3
"""Render deployment templates with supplied immutable images; never deploy."""
import argparse
import re
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--backend-image',required=True)
p.add_argument('--frontend-image',required=True)
p.add_argument('--output',required=True)
a=p.parse_args()
for image in (a.backend_image,a.frontend_image):
    if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}',image):p.error('Images must be registry references pinned to sha256 digests')
root=Path(__file__).resolve().parents[1]
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
for name in ('backend.yaml','frontend.yaml','workers.yaml','migrate-job.yaml'):
    source=(root/'k8s'/name).read_text()
    source=source.replace('your-registry/tradeops-backend:RELEASE_REQUIRED',a.backend_image).replace('your-registry/tradeops-frontend:RELEASE_REQUIRED',a.frontend_image)
    (out/name).write_text(source)
print('Rendered immutable workload manifests. Configure hosts, secrets, ingress and external egress before deployment.')
