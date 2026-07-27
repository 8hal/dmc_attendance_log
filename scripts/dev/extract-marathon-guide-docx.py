#!/usr/bin/env python3
"""Extract marathon guide DOCX → JSON (stdout). Not a runtime dependency."""
from __future__ import annotations

import json
import os
import sys

DEFAULT_DOCX = (
    "/tmp/marathon-guide-handoff/마라톤_100일_가이드_handoff/final/"
    "2026_마라톤_100일_수준별_훈련_가이드.docx"
)


def main() -> int:
    path = os.environ.get("GUIDE_DOCX", DEFAULT_DOCX)
    if not os.path.isfile(path):
        print(f"DOCX not found: {path}", file=sys.stderr)
        return 1

    try:
        from docx import Document
    except ImportError:
        print("python-docx is required: pip install python-docx", file=sys.stderr)
        return 1

    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(path)

    paragraphs = []
    headings = []
    tables = []
    blocks = []
    table_i = -1

    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            p = Paragraph(child, doc)
            text = (p.text or "").strip()
            if not text:
                continue
            style = p.style.name if p.style is not None else ""
            entry = {"style": style, "text": p.text or ""}
            paragraphs.append(entry)
            blocks.append({"type": "paragraph", **entry})
            if style.startswith("Heading"):
                level = 1
                parts = style.split()
                if len(parts) >= 2 and parts[-1].isdigit():
                    level = int(parts[-1])
                headings.append({"level": level, "style": style, "text": p.text or ""})
        elif child.tag == qn("w:tbl"):
            table = Table(child, doc)
            table_i += 1
            rows = [[cell.text or "" for cell in row.cells] for row in table.rows]
            tables.append({"i": table_i, "rows": rows})
            blocks.append({"type": "table", "i": table_i, "rows": rows})

    payload = {
        "source": path,
        "headings": headings,
        "paragraphs": paragraphs,
        "paras": paragraphs,  # alias for earlier dump consumers
        "tables": tables,
        "blocks": blocks,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        # Allow `... | head` without a traceback.
        try:
            sys.stdout.close()
        except Exception:
            pass
        raise SystemExit(0)
