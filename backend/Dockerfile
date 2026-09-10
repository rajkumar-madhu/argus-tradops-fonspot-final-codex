FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
# Numeric uid/gid: `runAsNonRoot: true` makes the kubelet verify the image user is
# not root, and it can only do that when USER is numeric. A named user fails the
# pod with CreateContainerConfigError.
RUN addgroup --system --gid 10001 tradeops \
 && adduser --system --uid 10001 --ingroup tradeops --home /app tradeops
COPY requirements.txt alembic.ini ./
RUN pip install --no-cache-dir -r requirements.txt
COPY alembic ./alembic
COPY app ./app
RUN chown -R 10001:10001 /app
USER 10001:10001
EXPOSE 8000
# --no-access-log: uvicorn's access log prints the raw query string, and SSE
# clients authenticate with ?access_token=<JWT>, so it would write bearer tokens
# into pod logs. The API middleware already emits a JSON line per request keyed by
# route template. --timeout-graceful-shutdown bounds the SIGTERM drain: open SSE
# streams never finish on their own and would otherwise hold the pod until SIGKILL.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--timeout-graceful-shutdown", "20"]
