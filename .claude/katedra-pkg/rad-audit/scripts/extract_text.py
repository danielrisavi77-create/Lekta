#!/usr/bin/env python3
"""Čist tekst iz .docx (python-docx, bez XML-markup smeća).

Uporaba:
  python3 extract_text.py rad.docx            # proza + tablice
  python3 extract_text.py rad.docx --no-tables
  python3 extract_text.py rad.docx --tables-only
"""
import sys
from common import load_docx_text


def main(path, mode):
    body, cells, _ = load_docx_text(path, include_tables=True)
    if mode == "--tables-only":
        print("\n".join(cells))
    elif mode == "--no-tables":
        print(body)
    else:
        print(body)
        if cells:
            print("\n\n===== TABLICE =====\n")
            print("\n".join(cells))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    mode = sys.argv[2] if len(sys.argv) > 2 else ""
    sys.exit(main(sys.argv[1], mode))
