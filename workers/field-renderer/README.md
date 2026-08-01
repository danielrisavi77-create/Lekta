# Lekta LibreOffice Field Renderer

Ovo je zaseban produkcijski worker za završno osvježavanje Word polja. Nije
Supabase Edge Function i ne smije biti javno izložen pregledniku. Preglednik
poziva samo `field-render` Edge Function, koja provjerava JWT i prosljeđuje
DOCX workeru kroz tajni `x-lekta-worker-token` header.

## Lokalno pokretanje

```bash
docker build -t lekta-field-renderer ./workers/field-renderer
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --network=none -p 8080:8080 \
  -e LEKTA_FIELD_RENDER_TOKEN="local-development-secret" \
  lekta-field-renderer
```

Health je `GET /v1/health`. Render je `POST /v1/render`, raw DOCX body,
`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`x-lekta-worker-token` i opcionalni `x-request-id`. Rezultat je ugovoreni JSON
`renderedDocxBase64`, `fieldsUpdated`, `unresolvedFields` i `warnings`.

## Produkcijski deploy, Cloud Run primjer

```bash
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/lekta/field-renderer:VERSION workers/field-renderer
gcloud run deploy lekta-field-renderer \
  --image REGION-docker.pkg.dev/PROJECT/lekta/field-renderer:VERSION \
  --region REGION --platform managed \
  --allow-unauthenticated --ingress all \
  --memory 2Gi --cpu 1 --timeout 240 --concurrency 1 --max-instances 4 \
  --set-env-vars LEKTA_FIELD_RENDER_MAX_BYTES=20971520 \
  --set-secrets LEKTA_FIELD_RENDER_TOKEN=lekta-field-render-token:latest
```

Supabase Edge Function treba moći dohvatiti Cloud Run URL, zato je u ovom
primjeru Cloud Run mrežno dostupan, ali worker odbija svaki zahtjev bez tajnog
headera. Edge Function dobiva samo worker URL i token kroz
`FIELD_RENDER_WORKER_URL` i `FIELD_RENDER_WORKER_TOKEN`. Za strože mrežno
izoliranje koristi se privatni gateway koji provjerava isti token i prosljeđuje
zahtjev samo iz Edge funkcije. Worker se ni u jednoj varijanti ne konfigurira
kao browser endpoint i ne uključuje CORS.

```bash
supabase secrets set FIELD_RENDER_WORKER_URL=https://WORKER-URL/v1/render
supabase secrets set FIELD_RENDER_WORKER_TOKEN="<najmanje-32-znamenkasta-tajna>"
supabase functions deploy field-render
```

Klijentski `fieldRenderEndpoint` treba biti:
`https://PROJECT.supabase.co/functions/v1/field-render`.

Deploy je namjerno odvojen: LibreOffice nije moguće pouzdano pokretati unutar
Supabase Edge runtimea. Originalni dokument se ne mijenja, a worker ne zapisuje
datoteke ni korisničke metapodatke izvan privremenog direktorija.
