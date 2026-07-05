#!/usr/bin/env python3
"""
정회원 명단 엑셀 → cleaned JSON 전처리

지원 형식 (2026-06-30 명단):
  시트: 첫 시트 또는 --sheet 이름
  row2+: B=순번, C=구분, D=닉네임, E=실명

사용:
  python3 scripts/preprocess-members-excel.py path/to/명단.xlsx
  python3 scripts/preprocess-members-excel.py path/to/명단.xlsx --out scripts/data/members-2026-06-30-cleaned.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("openpyxl 없음. pip3 install openpyxl")
    sys.exit(1)


def normalize_nick(raw):
    if raw is None:
        return ""
    s = str(raw).strip()
    if re.match(r"^\d+\.0$", s):
        s = s[:-2]
    return s


def strip_prefix(nick):
    if nick == "♥동동♥":
        return "동동"
    if nick == "♥다빈♥":
        return "다빈"
    for p in ("♥가족1_", "♥가족2_", "★자매_"):
        if nick.startswith(p):
            return nick[len(p) :]
    return nick


def parse_workbook(wb, sheet_name=None):
    ws = wb[sheet_name] if sheet_name else wb[wb.sheetnames[0]]
    members = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        num = row[1] if len(row) > 1 else None
        if not isinstance(num, (int, float)):
            continue
        gubun = str(row[2]).strip() if len(row) > 2 and row[2] else ""
        if gubun and gubun != "정회원":
            continue
        raw_nick = normalize_nick(row[3] if len(row) > 3 else None)
        real = str(row[4]).strip() if len(row) > 4 and row[4] else ""
        if not raw_nick or not real:
            continue
        clean = strip_prefix(raw_nick)
        members.append(
            {
                "순번": int(num),
                "구분": "정회원",
                "nickname": clean,
                "realName": real,
                "원본닉네임": raw_nick,
            }
        )
    return members


def main():
    parser = argparse.ArgumentParser(description="정회원 명단 엑셀 → cleaned JSON")
    parser.add_argument("excel", type=Path, help="엑셀 파일 경로")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="출력 JSON (기본: scripts/data/members-<stem>-cleaned.json)",
    )
    parser.add_argument("--sheet", default=None, help="시트 이름 (기본: 첫 시트)")
    args = parser.parse_args()

    if not args.excel.exists():
        print(f"파일 없음: {args.excel}")
        sys.exit(1)

    out = args.out
    if out is None:
        stem = args.excel.stem.replace(" ", "_")
        out = Path(__file__).parent / "data" / f"{stem}-cleaned.json"

    out.parent.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(args.excel, data_only=True)
    members = parse_workbook(wb, args.sheet)

    with open(out, "w", encoding="utf-8") as f:
        json.dump(members, f, ensure_ascii=False, indent=2)

    print(f"시트: {args.sheet or wb.sheetnames[0]}")
    print(f"정회원: {len(members)}명")
    print(f"출력: {out}")
    if members:
        print(f"  첫: {members[0]['nickname']} ({members[0]['realName']})")
        print(f"  끝: {members[-1]['nickname']} ({members[-1]['realName']})")


if __name__ == "__main__":
    main()
