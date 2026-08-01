FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    HOME=/tmp/lekta-home \
    TMPDIR=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-writer \
       libreoffice-core \
       fonts-liberation \
       fonts-noto-core \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /tmp/lekta-home lekta

WORKDIR /app
COPY pyproject.toml ./
COPY app.py ./
RUN pip install --no-cache-dir . \
    && chown -R lekta:lekta /app /tmp/lekta-home

USER 10001:10001
EXPOSE 8080

# Deployment must additionally set --network=none (or the platform equivalent).
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
