#!/usr/bin/env python3
"""preprocess-members-excel.py 단위 테스트 (openpyxl 불필요)."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "preprocess_members_excel", ROOT / "preprocess-members-excel.py"
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class StripPrefixTest(unittest.TestCase):
    def test_family_and_sister_prefixes(self):
        cases = {
            "♥가족1_블랙스왈로": "블랙스왈로",
            "♥가족2_Josh": "Josh",
            "♥가족3_동동": "동동",
            "♥가족4_초초긍정": "초초긍정",
            "♥가족4_Clint": "Clint",
            "★자매_하니": "하니",
            "♥동동♥": "동동",
            "♥다빈♥": "다빈",
            "제영아빠": "제영아빠",
            "Siho": "Siho",
        }
        for raw, want in cases.items():
            self.assertEqual(MOD.strip_prefix(raw), want, raw)

    def test_normalize_trims_trailing_space(self):
        self.assertEqual(MOD.normalize_nick("제영아빠 "), "제영아빠")
        self.assertEqual(MOD.normalize_nick("6스타 "), "6스타")


class ParseCsvTest(unittest.TestCase):
    def test_parses_family_rows_and_skips_header(self):
        raw = (
            ",2026 동탄마라톤클럽 정회원 현황,,,,,,\n"
            ',순 번,구분I,닉 네 임,실 명,전화번호,회비,"비고\n(안내)"\n'
            ",1,정회원,♥가족3_동동,신동택,,25/12/27,부부회원\n"
            ",2,정회원,제영아빠 ,이승호,,26/07/07,7월 신입회원\n"
            ",3,준회원,스킵닉,스킵실명,,,,\n"
        )
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write(raw)
            path = Path(f.name)
        try:
            members = MOD.parse_csv(path)
        finally:
            path.unlink()
        self.assertEqual(len(members), 2)
        self.assertEqual(members[0]["nickname"], "동동")
        self.assertEqual(members[0]["realName"], "신동택")
        self.assertEqual(members[0]["원본닉네임"], "♥가족3_동동")
        self.assertEqual(members[1]["nickname"], "제영아빠")
        self.assertEqual(members[1]["realName"], "이승호")


if __name__ == "__main__":
    unittest.main()
