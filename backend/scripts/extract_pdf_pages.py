#!/usr/bin/env python3

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import fitz


DEFAULT_TESSERACT_PATHS = (
    "/Users/wangzhuo/.miniforge3/bin/tesseract",
    "/opt/homebrew/bin/tesseract",
)


def meaningful_count(text: str) -> int:
    return len(re.findall(r"[\w\u4e00-\u9fff]", text, flags=re.UNICODE))


def find_tesseract() -> str | None:
    configured = os.getenv("TESSERACT_BIN")
    if configured and os.path.exists(configured):
        return configured
    discovered = shutil.which("tesseract")
    if discovered:
        return discovered
    for candidate in DEFAULT_TESSERACT_PATHS:
        if os.path.exists(candidate):
            return candidate
    return None


def available_languages(tesseract_bin: str) -> set[str]:
    result = subprocess.run(
        [tesseract_bin, "--list-langs"],
        check=False,
        capture_output=True,
        text=True,
    )
    return {
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip() and not line.startswith("List of available")
    }


def select_language(tesseract_bin: str) -> str:
    requested = os.getenv("TESSERACT_LANG")
    if requested:
        return requested
    languages = available_languages(tesseract_bin)
    if "chi_sim" in languages and "eng" in languages:
        return "chi_sim+eng"
    if "chi_sim" in languages:
        return "chi_sim"
    return "eng"


def normalize_ocr_text(text: str) -> str:
    lines = []
    for line in text.splitlines():
        line = re.sub(
            r"^\s*[8sS]\s*(\d+(?:\.\d+)+)(\s+[\u4e00-\u9fff])",
            r"§\1\2",
            line,
        )
        lines.append(line)
    return "\n".join(lines).strip()


def ocr_page(page: fitz.Page, tesseract_bin: str, language: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png") as image:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2.6, 2.6), alpha=False)
        pixmap.save(image.name)
        result = subprocess.run(
            [tesseract_bin, image.name, "stdout", "-l", language, "--psm", "6"],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "tesseract failed")
        return normalize_ocr_text(result.stdout)


def extract_pdf(pdf_path: str) -> dict:
    document = fitz.open(pdf_path)
    tesseract_bin = find_tesseract()
    language = select_language(tesseract_bin) if tesseract_bin else ""
    pages = []
    text_pages = 0
    ocr_pages = 0
    blank_pages = 0
    warnings = []

    try:
        for page_number, page in enumerate(document, start=1):
            direct_text = page.get_text("text").strip()
            mode = "text"
            text = direct_text

            if meaningful_count(direct_text) < 3:
                if not tesseract_bin:
                    text = ""
                    mode = "blank"
                else:
                    try:
                        text = ocr_page(page, tesseract_bin, language)
                        mode = "ocr"
                    except RuntimeError as error:
                        warnings.append(f"p.{page_number} OCR failed: {error}")
                        text = ""
                        mode = "blank"

            if meaningful_count(text) < 3:
                blank_pages += 1
            elif mode == "ocr":
                ocr_pages += 1
            else:
                text_pages += 1

            pages.append({"page": page_number, "text": text})
    finally:
        document.close()

    if text_pages == 0 and ocr_pages == 0:
        if not tesseract_bin:
            raise RuntimeError("PDF has no readable text layer and no OCR engine is configured")
        raise RuntimeError("PDF text and OCR extraction produced no readable pages")

    if ocr_pages and text_pages:
        mode = "hybrid"
    elif ocr_pages:
        mode = "ocr"
    else:
        mode = "text"

    return {
        "pages": pages,
        "summary": {
            "extractor": "pymupdf+tesseract" if ocr_pages else "pymupdf",
            "mode": mode,
            "pageCount": len(pages),
            "textPages": text_pages,
            "ocrPages": ocr_pages,
            "blankPages": blank_pages,
            "ocrLanguage": language if ocr_pages else "",
            "warnings": warnings,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()

    try:
        print(json.dumps(extract_pdf(args.pdf), ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
