# Lekta Training Pipeline

Batch pipeline za izradu sigurnog dataseta iz vlastitih i licenciranih akademskih dokumenata.

## Namjena

Pipeline pronalazi PDF/DOCX datoteke u lokalnim klonovima repozitorija, izdvaja metapodatke, anonimizira osobne podatke i zapisuje strukturirani manifest za kasniju analizu postojećim Lekta analizatorom.

Studentski radovi nisu izvor službenih fakultetskih pravila. Službena pravila ostaju u data/**.

## Pokretanje

    python training-pipeline/scripts/discover_documents.py --roots /putanja/do/klonova --out training-pipeline/output/documents.jsonl
    python training-pipeline/scripts/redact_text.py --input training-pipeline/output/documents.jsonl --output training-pipeline/output/documents.redacted.jsonl

Za PDF ekstrakciju koristi se PyMuPDF ako je instaliran. Skenirani PDF-ovi se šalju postojećoj OCR skripti scripts/ocr_pdf.py u zasebnom koraku.

## Pravila sigurnosti

- ne commitati PDF, DOCX, OCR tekst ni osobne podatke;
- prije obrade provjeriti pravo korištenja svakog izvora;
- sirovi dokumenti ostaju lokalno ili u privatnom storageu;
- anonimizacija nije savršena i dataset mora proći ljudsku provjeru;
- model ne smije sam određivati službena pravila fakulteta.

output/ je predviđen za lokalne rezultate i treba biti u .gitignore.
