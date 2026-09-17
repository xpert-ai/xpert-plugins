FROM python:3.12-slim

WORKDIR /app

COPY python/ ./python/
COPY server.py login.html workbench.html preview.html ./

RUN pip install --no-cache-dir -r python/requirements.txt && \
    mkdir -p /app/data

ENV GEO_STATIC_DIR=/app
ENV PYTHONPATH=/app/python
ENV PYTHONUNBUFFERED=1

EXPOSE 8767

CMD ["python", "server.py"]
