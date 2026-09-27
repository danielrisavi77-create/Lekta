# Intake fixture

`encrypted-synthetic.docx` je stvarno sifriran OOXML paket (ECMA-376 Agile Encryption, CFB
kontejner s tokovima `EncryptionInfo` i `EncryptedPackage`). Nastao je 2026-09-27 ovako:

1. `buildDocx` iz `tests/helpers/docx-builder.ts` izgradio je sinteticki dokument: naslov "Uvod"
   i 40 odlomaka generickog teksta, bez ikakvog studentskog sadrzaja.
2. `msoffcrypto-tool` (`OOXMLFile.encrypt`) sifrirao ga je lozinkom `lekta-test`.
3. Provjereno je da desifriranje istom lozinkom vraca ZIP (`PK`).

SHA-256: `856f53d0388302356537a06890b08ecf3da88e2db13191997cfdfb99be1a01ad`

Sluzi testu `tests/docx-intake-cfb.test.ts` (audit 22. 9., nalaz #16). Lozinka nije tajna.
