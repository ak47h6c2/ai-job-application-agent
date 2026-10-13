import io
import zipfile

import pytest

from backend.app.services.resume_parser import ResumeParseError, extract_text, parse_resume_text

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def docx(body: str) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", f"<w:document {W}><w:body>{body}</w:body></w:document>")
    return stream.getvalue()


def paragraph(text: str) -> str:
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def test_docx_resume_text_keeps_paragraphs_and_table_rows() -> None:
    table = "<w:tbl><w:tr><w:tc>" + paragraph("学校") + "</w:tc><w:tc>" + paragraph("测试大学") + "</w:tc></w:tr></w:tbl>"
    text = extract_text("简历.docx", docx(paragraph("姓名：测试姓名") + paragraph("邮箱：test@example.com") + table))
    assert text.splitlines() == ["姓名：测试姓名", "邮箱：test@example.com", "学校\t测试大学"]
    draft = parse_resume_text(text)
    assert draft["basic"]["name"] == {"zh": "测试姓名"}
    assert draft["basic"]["email"] == "test@example.com"


def test_old_doc_and_broken_docx_explain_what_to_do() -> None:
    with pytest.raises(ResumeParseError, match=r"\.docx or PDF"):
        extract_text("简历.doc", b"\xd0\xcf\x11\xe0 old word file")
    with pytest.raises(ResumeParseError, match="Could not read DOCX"):
        extract_text("简历.docx", b"not a zip")
