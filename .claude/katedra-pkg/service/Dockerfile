# katedra-verifier: isti obrazac kao Lekta workers/field-renderer.
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp/katedra-home TMPDIR=/tmp \
    KATEDRA_PKG_HOME=/app/pkg
RUN apt-get update && apt-get install -y --no-install-recommends \
      pandoc poppler-utils libreoffice-writer libreoffice-core fonts-liberation fonts-noto-core pspp ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /tmp/katedra-home katedra
WORKDIR /app
COPY service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# cijeli paket: sateliti (rad-audit, rad-docx, ...) se pronalaze kao susjedi katedra-lite (vjestine.py)
COPY katedra-lite pkg/katedra-lite
COPY rad-audit pkg/rad-audit
COPY rad-docx pkg/rad-docx
COPY fpzg-diplomski pkg/fpzg-diplomski
COPY replikacija-pspp pkg/replikacija-pspp
COPY bin pkg/bin
COPY VERSION pkg/VERSION
COPY service ./service
RUN chown -R katedra:katedra /app /tmp/katedra-home
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=10s CMD python3 -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/v1/health')"
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
