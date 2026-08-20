"""Privremeni pomocnik: ispis teksta PDF-a po stranicama, za pilot s agentima."""
import io
import os
import sys

import fitz

src = sys.argv[1]
out = sys.argv[2]
doc = fitz.open(src)
parts = []
for index, page in enumerate(doc):
    text = page.get_text().strip()
    if text:
        parts.append("===== STRANICA " + str(index + 1) + " =====\n" + text)
doc.close()
io.open(out, "w", encoding="utf-8", newline="\n").write("\n\n".join(parts))
print("zapisano:", out, os.path.getsize(out), "bajtova")
