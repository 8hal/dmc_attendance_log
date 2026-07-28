#!/usr/bin/env python3
"""
One-shot DOCX → chunbaek/guide/index.html body migrator (dev only).
Applies v2 table rules: collapse 4-level columns; skip DOCX diary callouts
(replaced later/alongside with Kakao raw quotes).
"""
from __future__ import annotations

import html
import os
import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

DEFAULT_DOCX = (
    "/tmp/marathon-guide-handoff/마라톤_100일_가이드_handoff/final/"
    "2026_마라톤_100일_수준별_훈련_가이드.docx"
)
KAKAO_DEFAULT = (
    "/tmp/marathon-guide-handoff/마라톤_100일_가이드_handoff/source/"
    "KakaoTalk_Chat_2026-07-26-11-55-31.txt"
)
OUT = Path("/workspace/chunbaek/guide/index.html")

LEVELS = ("완주형", "향상형", "기록형", "상급형")

H1_TO_ID = [
    ("이 가이드의 사용법", "intro-usage"),
    ("일지 사례를 읽는 방법", None),  # H2 under usage in DOCX; handled specially
    ("목차", None),
    ("1. 이 가이드의 대상과 목표", "ch-1"),
    ("2. 시작 전 현재 상태 진단", "ch-2"),
    ("3. 나만의 훈련 페이스 정하기", "ch-3"),
    ("4. 100일 전체 훈련 구조", "ch-4"),
    ("5. 일주일 훈련 구성법", "ch-5"),
    ("6. 핵심 훈련 사용설명서", "ch-6"),
    ("7. 장거리 훈련을 완성하는 과정", "ch-7"),
    ("8. 여름철 100일 훈련 운영법", "ch-8"),
    ("9. 통증·피로·부상에 대응하는 법", "ch-9"),
    ("10. 실패한 훈련을 다루는 방법", "ch-10"),
    ("11. 체중과 영양 관리", "ch-11"),
    ("12. 기록과 컨디션을 해석하는 법", "ch-12"),
    ("13. 중간 점검 대회의 활용", "ch-13"),
    ("14. 마지막 3주와 테이퍼링", "ch-14"),
    ("15. 레이스 전략", "ch-15"),
    ("16. 대회 후 평가와 다음 목표", "ch-16"),
    ("부록 A. 수준별 14주 예시", "app-a"),
    ("부록 B. 훈련 변경 의사결정표", "app-b"),
    ("부록 C. 주간 계획표", "app-c"),
    ("대회 준비 체크리스트", "checklist"),
    ("참고 자료", "refs"),
]

SECTION_TITLES = {
    "intro-usage": "이 가이드의 사용법",
    "intro-diary": "일지 사례를 읽는 방법",
    "ch-1": "1. 이 가이드의 대상과 목표",
    "ch-2": "2. 시작 전 현재 상태 진단",
    "ch-3": "3. 나만의 훈련 페이스 정하기",
    "ch-4": "4. 100일 전체 훈련 구조",
    "ch-5": "5. 일주일 훈련 구성법",
    "ch-6": "6. 핵심 훈련 사용설명서",
    "ch-7": "7. 장거리 훈련을 완성하는 과정",
    "ch-8": "8. 여름철 100일 훈련 운영법",
    "ch-9": "9. 통증·피로·부상에 대응하는 법",
    "ch-10": "10. 실패한 훈련을 다루는 방법",
    "ch-11": "11. 체중과 영양 관리",
    "ch-12": "12. 기록과 컨디션을 해석하는 법",
    "ch-13": "13. 중간 점검 대회의 활용",
    "ch-14": "14. 마지막 3주와 테이퍼링",
    "ch-15": "15. 레이스 전략",
    "ch-16": "16. 대회 후 평가와 다음 목표",
    "app-a": "부록 A. 수준별 14주 예시",
    "app-b": "부록 B. 훈련 변경 의사결정표",
    "app-c": "부록 C. 주간 계획표",
    "checklist": "대회 준비 체크리스트",
    "refs": "참고 자료",
}

BODY_ORDER = [
    "intro-usage",
    "intro-diary",
    "toc",
    "ch-1",
    "ch-2",
    "ch-3",
    "ch-4",
    "ch-5",
    "ch-6",
    "ch-7",
    "ch-8",
    "ch-9",
    "ch-10",
    "ch-11",
    "ch-12",
    "ch-13",
    "ch-14",
    "ch-15",
    "ch-16",
    "app-a",
    "app-b",
    "app-c",
    "checklist",
    "refs",
]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def iter_blocks(document: Document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield ("p", Paragraph(child, document))
        elif child.tag == qn("w:tbl"):
            yield ("t", Table(child, document))


def table_rows(table: Table) -> list[list[str]]:
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            cells.append((cell.text or "").strip())
        # dedupe merged repeated cells in a row by collapsing consecutive equals? keep as-is
        rows.append(cells)
    return rows


def is_diary_or_boundary_callout(rows: list[list[str]]) -> bool:
    if len(rows) == 1 and len(rows[0]) == 1:
        t = rows[0][0]
        return t.startswith("일지 사례") or t.startswith("경계 사례") or t.startswith("보상 동작")
    return False


def is_single_callout(rows: list[list[str]]) -> bool:
    return len(rows) == 1 and len(rows[0]) == 1 and bool(rows[0][0])


def header_has_four_levels(header: list[str]) -> bool:
    joined = " ".join(header)
    return all(L in joined for L in LEVELS)


def collapse_level_columns(rows: list[list[str]]) -> list[list[str]]:
    """Collapse 완주형…상급형 columns into one '공통 범위' column."""
    if not rows:
        return rows
    header = rows[0]
    level_idxs = [i for i, h in enumerate(header) if any(L in h for L in LEVELS)]
    if len(level_idxs) < 2:
        return rows
    keep = [i for i in range(len(header)) if i not in level_idxs]
    new_header = [header[i] for i in keep] + ["공통 범위"]
    out = [new_header]
    for row in rows[1:]:
        vals = []
        for i in level_idxs:
            v = row[i] if i < len(row) else ""
            if v and v not in vals:
                vals.append(v)
        if len(vals) == 1:
            common = vals[0]
        elif not vals:
            common = "—"
        else:
            common = " ~ ".join(vals[:2]) if len(vals) <= 3 else f"{vals[0]} ~ {vals[-1]}"
            if len(set(vals)) > 1:
                common = f"{vals[0]} … {vals[-1]} (현재 장거리·회복에 맞게)"
        out.append([row[i] if i < len(row) else "" for i in keep] + [common])
    return out


def collapse_level_rows(rows: list[list[str]]) -> tuple[list[list[str]] | None, str | None]:
    """If first col is 수준 with level names as rows, return common summary table + note."""
    if not rows or not rows[0]:
        return rows, None
    if rows[0][0].strip() != "수준":
        return rows, None
    level_row_count = sum(
        1 for r in rows[1:] if r and any(L in r[0] for L in LEVELS)
    )
    if level_row_count < 2:
        return rows, None
    # Build common table: drop 수준 col, use column headers + range-of-values
    headers = rows[0][1:]
    cols = []
    for ci, h in enumerate(headers):
        vals = []
        for r in rows[1:]:
            if ci + 1 < len(r):
                v = r[ci + 1].strip()
                if v and v not in vals:
                    vals.append(v)
        if not vals:
            cell = "—"
        elif len(vals) == 1:
            cell = vals[0]
        else:
            cell = f"{vals[0]} … {vals[-1]} (목표·준비도에 맞게)"
        cols.append((h, cell))
    new = [["항목", "공통 범위"]] + [[h, c] for h, c in cols]
    note = (
        "기존 수준별 행 표는 웹에서 공통 범위로 합쳤다. "
        "최근 장거리·회복 상태를 함께 본다."
    )
    return new, note


def render_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    parts = ['<div class="guide-table-wrap"><table class="guide-table"><thead><tr>']
    for h in rows[0]:
        parts.append(f"<th>{esc(h)}</th>")
    parts.append("</tr></thead><tbody>")
    for row in rows[1:]:
        parts.append("<tr>")
        for c in row:
            parts.append(f"<td>{esc(c)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></div>")
    return "".join(parts)


def render_callout(text: str) -> str:
    # First line often title
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return ""
    title = lines[0]
    body = " ".join(lines[1:]) if len(lines) > 1 else ""
    # If title is long prose without separate body, put all in body
    if len(lines) == 1 and len(title) > 40:
        # split first short clause
        m = re.match(r"^(.{2,40}?)\s+(.+)$", title)
        if m and not m.group(1).endswith("다"):
            title, body = m.group(1), m.group(2)
        else:
            body = title
            title = "참고"
    inner = f"<p><strong>{esc(title)}</strong></p>"
    if body:
        inner += f"<p>{esc(body)}</p>"
    return f'<div class="guide-callout">{inner}</div>'


def band_notes_default() -> str:
    return ""  # v3: no band grouping



def svg_timeline() -> str:
    return """
<svg class="guide-diagram" id="diagram-100day-timeline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 100" role="img" aria-label="100일 5단계 타임라인">
  <title>100일 5단계 타임라인</title>
  <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#666"/></marker></defs>
  <line x1="20" y1="40" x2="340" y2="40" stroke="#ccc" stroke-width="2" marker-end="url(#arrow)"/>
  <g font-size="10" fill="#333" text-anchor="middle">
    <circle cx="40" cy="40" r="6" fill="#ff3214"/><text x="40" y="68">적응·진단</text>
    <circle cx="110" cy="40" r="6" fill="#ff3214"/><text x="110" y="68">기초 확장</text>
    <circle cx="180" cy="40" r="6" fill="#ff3214"/><text x="180" y="68">특이성</text>
    <circle cx="250" cy="40" r="6" fill="#ff3214"/><text x="250" y="68">최고</text>
    <circle cx="320" cy="40" r="6" fill="#ff3214"/><text x="320" y="68">테이퍼</text>
  </g>
</svg>
""".strip()


def svg_week() -> str:
    return """
<svg class="guide-diagram" id="diagram-week-framework" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 110" role="img" aria-label="주간 틀 화·목·토 공통 목적">
  <title>주간 틀 — 화·목·토</title>
  <rect x="10" y="20" width="100" height="60" rx="8" fill="#fff" stroke="#ff3214"/>
  <text x="60" y="45" text-anchor="middle" font-size="12" font-weight="700">화</text>
  <text x="60" y="65" text-anchor="middle" font-size="10">품질·자극</text>
  <rect x="130" y="20" width="100" height="60" rx="8" fill="#fff" stroke="#ff3214"/>
  <text x="180" y="45" text-anchor="middle" font-size="12" font-weight="700">목</text>
  <text x="180" y="65" text-anchor="middle" font-size="10">M/템포</text>
  <rect x="250" y="20" width="100" height="60" rx="8" fill="#fff" stroke="#ff3214"/>
  <text x="300" y="45" text-anchor="middle" font-size="12" font-weight="700">토·일</text>
  <text x="300" y="65" text-anchor="middle" font-size="10">장거리</text>
</svg>
""".strip()


def svg_decision() -> str:
    return """
<svg class="guide-diagram" id="diagram-decision-flow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 160" role="img" aria-label="통증·실패 의사결정">
  <title>통증·실패 의사결정</title>
  <rect x="110" y="8" width="140" height="28" rx="6" fill="#fff7ed" stroke="#ff3214"/>
  <text x="180" y="26" text-anchor="middle" font-size="11">통증·실패 신호</text>
  <path d="M180 36 v16" stroke="#999"/>
  <rect x="20" y="60" width="100" height="40" rx="6" fill="#fff" stroke="#999"/>
  <text x="70" y="78" text-anchor="middle" font-size="10">녹색: 관찰</text>
  <text x="70" y="92" text-anchor="middle" font-size="9">계획 유지·기록</text>
  <rect x="130" y="60" width="100" height="40" rx="6" fill="#fff" stroke="#999"/>
  <text x="180" y="78" text-anchor="middle" font-size="10">노랑: 줄이기</text>
  <text x="180" y="92" text-anchor="middle" font-size="9">강도·거리 축소</text>
  <rect x="240" y="60" width="100" height="40" rx="6" fill="#fff" stroke="#999"/>
  <text x="290" y="78" text-anchor="middle" font-size="10">빨강: 중단</text>
  <text x="290" y="92" text-anchor="middle" font-size="9">휴식·평가</text>
  <path d="M180 100 v16" stroke="#999"/>
  <rect x="100" y="120" width="160" height="28" rx="6" fill="#f3f4f6" stroke="#999"/>
  <text x="180" y="138" text-anchor="middle" font-size="10">복귀: 걷뛰기 → 이지 → 품질</text>
</svg>
""".strip()


def svg_race() -> str:
    return """
<svg class="guide-diagram" id="diagram-race-abc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 100" role="img" aria-label="레이스 A B C 목표">
  <title>레이스 A·B·C</title>
  <rect x="15" y="20" width="100" height="55" rx="8" fill="#fff" stroke="#ff3214"/>
  <text x="65" y="45" text-anchor="middle" font-size="14" font-weight="700">A</text>
  <text x="65" y="62" text-anchor="middle" font-size="10">최선 도전</text>
  <rect x="130" y="20" width="100" height="55" rx="8" fill="#fff" stroke="#f59e0b"/>
  <text x="180" y="45" text-anchor="middle" font-size="14" font-weight="700">B</text>
  <text x="180" y="62" text-anchor="middle" font-size="10">현실 목표</text>
  <rect x="245" y="20" width="100" height="55" rx="8" fill="#fff" stroke="#6b7280"/>
  <text x="295" y="45" text-anchor="middle" font-size="14" font-weight="700">C</text>
  <text x="295" y="62" text-anchor="middle" font-size="10">바닥선 완주</text>
</svg>
""".strip()


def find_kakao_blocks(kakao_text: str) -> dict[str, tuple[str, str]]:
    """Return theme → (raw excerpt, note)."""
    lines = kakao_text.splitlines()

    def window(pred, before=2, after=6):
        for i, L in enumerate(lines):
            if pred(L):
                chunk = "\n".join(lines[max(0, i - before) : i + after + 1]).strip()
                if "ㅡ" in chunk or "ㅋㅋ" in chunk or "ㅠ" in chunk:
                    return chunk
        return None

    specs = [
        (
            "heat_buildup",
            lambda L: ("습도" in L or "더위" in L or "체온" in L)
            and ("빌드업" in L or "중단" in L or "실패" in L),
            "더위·습도에서 품질 훈련을 줄이거나 중단한 장면이다. 실패로만 읽지 말고 환경에 맞춘 종료로 본다.",
        ),
        (
            "30_22",
            lambda L: "30km" in L.replace(" ", "") and ("22" in L or "퍼져" in L or "실패" in L),
            "계획 거리를 중간에 바꾼 판단이다. 세션 실패와 장거리 시간 확보를 구분한다.",
        ),
        (
            "hamstring",
            lambda L: "햄스트링" in L,
            "통증이 있는데 거리를 채운 경계 사례다. 권장안이 아니다. 신호 무시와 강행을 구분하는 연습으로만 읽는다.",
        ),
        (
            "pace_pain",
            lambda L: ("4분" in L or "4:" in L) and ("통증" in L or "아파" in L),
            "속도 경계가 통증으로 드러난 기록이다. 숫자를 맞추기보다 경계를 먼저 본다.",
        ),
        (
            "fail_chain",
            lambda L: "인터벌" in L and ("실패" in L or "중단" in L) and ("세트" in L or "회만" in L),
            "연속된 실패는 하루의 문제가 아니라 부하 누적의 신호일 수 있다.",
        ),
        (
            "race_early",
            lambda L: ("맞바람" in L) or ("업힐" in L and ("걸" in L or "털" in L)),
            "초반에 번 시간은 저축이 아니다. A가 흔들리면 B·C로 전환하는 연습으로 읽는다.",
        ),
        (
            "short_cut",
            lambda L: "짧게 마무리" in L or ("몸이 무거" in L and "빌드업" in L),
            "계획이 무거우면 짧게 마무리한 기록이다. 따라 할 거리표가 아니다.",
        ),
    ]
    out: dict[str, tuple[str, str]] = {}
    for key, pred, note in specs:
        chunk = window(pred)
        if chunk:
            out[key] = (chunk, note)
    return out


def raw_story(raw: str, note: str) -> str:
    return (
        f'<details class="guide-story guide-story--raw" open>'
        f"<summary>일지 원문</summary>"
        f'<pre class="guide-story__body">{esc(raw)}</pre>'
        f"</details>"
        f'<p class="guide-note">{esc(note)}</p>'
    )


def map_h1(text: str) -> str | None:
    t = text.strip()
    for title, sid in H1_TO_ID:
        if t == title or t.startswith(title):
            return sid
    if t.startswith("일지 사례를 읽는"):
        return "intro-diary"
    return None


def transform_table(rows: list[list[str]]) -> str:
    if is_diary_or_boundary_callout(rows):
        return (
            ""  # v3: skip notice at most once via inject_extras
        )
    if is_single_callout(rows):
        return render_callout(rows[0][0])

    rows2, note = collapse_level_rows(rows)
    if note:
        html_parts = [render_table(rows2), f'<p class="muted">{esc(note)}</p>', band_notes_default()]
        return "\n".join(html_parts)

    if header_has_four_levels(rows[0]) or any(
        any(L in h for L in LEVELS) for h in rows[0]
    ):
        # also catch "완주형 장거리" header style in T58
        if any(any(L in (h or "") for L in LEVELS) for h in rows[0]):
            rows = collapse_level_columns(rows)
            return render_table(rows) + "\n" + band_notes_default()

    return render_table(rows)


def collapse_level_prose(parts: list[str]) -> list[str]:
    """Merge consecutive <p>완주형:…</p>…상급형:…</p> into common prose + band-notes."""
    out: list[str] = []
    i = 0
    while i < len(parts):
        chunk = []
        j = i
        while j < len(parts):
            m = re.match(r"^<p>(완주형|향상형|기록형|상급형):\s*(.*?)</p>$", parts[j])
            if not m:
                break
            chunk.append((m.group(1), m.group(2)))
            j += 1
        if len(chunk) >= 3 and {c[0] for c in chunk} >= set(LEVELS[:3]):
            vals = [c[1] for c in chunk]
            common = (
                f"<p>수준별 처방 문장은 웹에서 공통 범위로 합친다. "
                f"대략 {esc(vals[0])} … {esc(vals[-1])} 사이에서 "
                f"최근 장거리·회복·목표 구간에 맞게 고른다.</p>"
            )
            out.append(common)
            out.append(band_notes_default())
            i = j
            continue
        out.append(parts[i])
        i += 1
    return out


def collect_sections(doc: Document) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {k: [] for k in SECTION_TITLES}
    current: str | None = None
    skip_toc = False

    for kind, obj in iter_blocks(doc):
        if kind == "p":
            text = (obj.text or "").strip()
            if not text:
                continue
            style = obj.style.name if obj.style is not None else ""
            if style == "Heading 1" or (
                style.startswith("Heading") and map_h1(text) and text in dict(H1_TO_ID)
            ):
                sid = map_h1(text)
                if text.strip() == "목차":
                    current = None
                    skip_toc = True
                    continue
                skip_toc = False
                if sid:
                    current = sid
                    continue
            if style == "Heading 2" and text.startswith("일지 사례를 읽는"):
                current = "intro-diary"
                continue
            if skip_toc or current is None:
                continue
            if style.startswith("Heading"):
                sections[current].append(f"<h3>{esc(text)}</h3>")
            else:
                sections[current].append(f"<p>{esc(text)}</p>")
        else:
            if skip_toc or current is None:
                continue
            rows = table_rows(obj)
            sections[current].append(transform_table(rows))

    for sid in sections:
        sections[sid] = collapse_level_prose(sections[sid])
    return sections


def inject_extras(sections: dict[str, list[str]], kakao_blocks: dict) -> None:
    # SVGs
    sections["ch-4"].append(svg_timeline())
    sections["ch-5"].append(svg_week())
    sections["ch-9"].append(svg_decision())
    sections["ch-10"].append(
        '<p><a href="#diagram-decision-flow">통증·실패 의사결정 그림</a>을 함께 본다.</p>'
    )
    sections["ch-15"].append(svg_race())

    # Kakao placements
    mapping = [
        ("intro-diary", "short_cut"),
        ("ch-8", "heat_buildup"),
        ("ch-7", "30_22"),
        ("ch-9", "hamstring"),
        ("ch-9", "pace_pain"),
        ("ch-10", "fail_chain"),
        ("ch-15", "race_early"),
    ]
    used = set()
    for sid, key in mapping:
        if key in kakao_blocks and key not in used:
            raw, note = kakao_blocks[key]
            sections[sid].append(raw_story(raw, note))
            used.add(key)
    if not any("guide-story--raw" in x for x in sections["intro-diary"]):
        # last resort: first available block
        for key, (raw, note) in kakao_blocks.items():
            sections["intro-diary"].append(raw_story(raw, note))
            break
    if not any("guide-story--raw" in x for x in sections.get("intro-diary", [])):
        raise SystemExit("no kakao raw story available for intro-diary")
    if not any("DOCX 윤문" in x for xs in sections.values() for x in xs):
        sections["intro-diary"].insert(0, '<p class="muted">DOCX 윤문 사례는 웹에서 생략한다. 같은 장면은 관련 장의 카톡 원문으로 읽는다.</p>')
    
    # v3: story-first within story chapters
    for sid in ("intro-diary", "ch-7", "ch-8", "ch-9", "ch-10", "ch-15"):
        parts = sections.get(sid) or []
        stories = [p for p in parts if "guide-story--raw" in p or (p.startswith('<p class="guide-note">') and False)]
        # keep story+following note together already in same string via raw_story()
        stories = [p for p in parts if "guide-story--raw" in p]
        rest = [p for p in parts if p not in stories]
        # intro paras that are plain <p> without class stay after h2 in build; here only list body parts
        # pull leading plain <p> from rest
        intro = []
        while rest and rest[0].startswith("<p>") and "guide-note" not in rest[0]:
            intro.append(rest.pop(0))
            if len(intro) >= 2:
                break
        sections[sid] = intro + stories + rest

    sections["intro-diary"].append(
        '<figure class="figure-slot" data-figure="optional">'
        '<div class="figure-slot__placeholder">이미지 자리 — figures/에 파일을 넣으세요</div>'
        "<figcaption>추가 그림 슬롯</figcaption></figure>"
    )

    # app-a note
    sections["app-a"].insert(
        0,
        '<p class="muted">부록 A의 수준별 거리 열은 웹에서 공통 14주 골격으로만 옮긴다. '
        "실제 장거리 상한은 최근 장거리 경험과 회복을 따른다.</p>",
    )


def nav_hooks(is_intro: bool) -> tuple[str, str]:
    return "", ""  # v3: no chapter chrome



def render_toc() -> str:
    links = []
    for sid in BODY_ORDER:
        if sid in ("intro-usage", "intro-diary", "toc"):
            continue
        links.append(f'        <a href="#{sid}">{esc(SECTION_TITLES[sid])}</a>')
    return (
        '      <section class="section" id="toc">\n'
        "        <h2>목차</h2>\n"
        + "\n".join(links)
        + "\n      </section>"
    )


def build_html(sections: dict[str, list[str]]) -> str:
    parts = [
        """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#ff3214" />
  <meta name="description" content="춘백 S3 100일 훈련 가이드 — 같은 일정, 다른 강도" />
  <title>100일 훈련 가이드 — 춘백 S3</title>
  <link rel="stylesheet" href="../css/tokens.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="guide.css" />
</head>
<body data-guide-page="index.html">
  <div class="page">
    <header class="header">
      <p class="header-eyebrow">춘백 S3</p>
      <h1>100일 훈련 가이드</h1>
      <p>같은 일정, 다른 강도.<br />계획을 지키는 것보다 몸에 맞게 조정하는 능력이 더 중요하다.</p>
    </header>

    <div class="kakao-banner" id="kakao-banner">
      <p class="kakao-banner-title">카카오톡 안에서 보시는 경우</p>
      <p class="kakao-banner-body">오른쪽 아래 <strong>⋯</strong> → <strong>다른 브라우저로 열기</strong>를 누르면 앱 사용이 더 편합니다.</p>
    </div>

    <main>
"""
    ]
    for sid in BODY_ORDER:
        if sid == "toc":
            parts.append(render_toc())
            continue
        is_intro = sid in ("intro-usage", "intro-diary")
        top, bottom = nav_hooks(is_intro)
        body = "\n".join(sections.get(sid, [])) or '<p class="muted">내용이 비어 있다.</p>'
        parts.append(
            f'      <section class="guide-prose section" id="{sid}" data-guide-section="{sid}">\n'
            f"{top}\n"
            f"        <h2>{esc(SECTION_TITLES[sid])}</h2>\n"
            f"{body}\n"
            f"{bottom}\n"
            f"      </section>"
        )
    parts.append(
        """
    </main>

    <div class="cta">
      <a class="btn btn-primary" href="/chunbaek/#/today">춘백 앱으로</a>
    </div>
    <p class="foot">동마클 · 춘백 S3</p>
  </div>

  <script src="guide-nav.js" defer></script>
  <script>
    if (/KAKAOTALK/i.test(navigator.userAgent || "")) {
      document.getElementById("kakao-banner").classList.add("visible");
    }
  </script>
</body>
</html>
"""
    )
    return "\n".join(parts)


def main() -> int:
    docx_path = os.environ.get("GUIDE_DOCX", DEFAULT_DOCX)
    kakao_path = os.environ.get("GUIDE_KAKAO", KAKAO_DEFAULT)
    if not os.path.isfile(docx_path):
        print(f"DOCX not found: {docx_path}", file=sys.stderr)
        return 1
    if not os.path.isfile(kakao_path):
        print(f"Kakao not found: {kakao_path}", file=sys.stderr)
        return 1

    doc = Document(docx_path)
    sections = collect_sections(doc)
    kakao = Path(kakao_path).read_text(encoding="utf-8")
    blocks = find_kakao_blocks(kakao)
    inject_extras(sections, blocks)
    html_out = build_html(sections)
    OUT.write_text(html_out, encoding="utf-8")
    print(f"wrote {OUT} ({len(html_out)} bytes)")
    print("kakao themes:", ", ".join(blocks.keys()) or "(none)")
    # sanity: forbidden headers
    if re.search(
        r"<th[^>]*>\s*완주형[\s\S]*?<th[^>]*>\s*향상형[\s\S]*?<th[^>]*>\s*기록형[\s\S]*?<th[^>]*>\s*상급형",
        html_out,
    ):
        print("WARNING: forbidden 4-level headers still present", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
