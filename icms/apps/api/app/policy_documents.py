"""Safe, in-memory text extraction for company policy uploads."""

from __future__ import annotations

import io
import re
import zipfile
from pathlib import PurePath
from xml.etree import ElementTree

from pypdf import PdfReader


MAX_POLICY_CHARS = 60_000
MAX_DOCX_XML_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class PolicyDocumentError(ValueError):
    """A user-facing validation or extraction error for a policy file."""


def policy_content_type(file_name: str) -> str:
    extension = PurePath(file_name).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
    }.get(extension, "application/octet-stream")


def extract_policy_text(file_name: str, content: bytes) -> str:
    """Extract searchable text without writing the uploaded file to disk."""
    extension = PurePath(file_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise PolicyDocumentError("仅支持 PDF、DOCX、TXT 或 Markdown 制度文件")
    if not content:
        raise PolicyDocumentError("文件内容为空")

    try:
        if extension == ".pdf":
            text = _extract_pdf(content)
        elif extension == ".docx":
            text = _extract_docx(content)
        else:
            text = _extract_text_file(content)
    except PolicyDocumentError:
        raise
    except Exception as exc:
        raise PolicyDocumentError("文件无法解析，请确认文件格式完整且未损坏") from exc

    text = _normalize(text)
    if not text:
        raise PolicyDocumentError("未能从文件中提取到文字。扫描版 PDF 暂不支持 OCR，请上传可复制文字的 PDF 或 DOCX")
    if len(text) > MAX_POLICY_CHARS:
        raise PolicyDocumentError(
            f"制度正文超过 {MAX_POLICY_CHARS:,} 字符。请按制度或章节拆分文件，确保每份制度都能完整分析"
        )
    return text


def _extract_pdf(content: bytes) -> str:
    if not content.startswith(b"%PDF-"):
        raise PolicyDocumentError("文件扩展名为 PDF，但文件内容不是有效 PDF")
    reader = PdfReader(io.BytesIO(content), strict=False)
    if reader.is_encrypted:
        raise PolicyDocumentError("暂不支持加密 PDF，请上传已解密的制度文件")
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _extract_docx(content: bytes) -> str:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise PolicyDocumentError("文件扩展名为 DOCX，但文件内容不是有效 Word 文档") from exc
    with archive:
        try:
            info = archive.getinfo("word/document.xml")
        except KeyError as exc:
            raise PolicyDocumentError("Word 文档缺少正文内容") from exc
        if info.file_size > MAX_DOCX_XML_BYTES:
            raise PolicyDocumentError("Word 正文过大，无法安全解析")
        xml = archive.read(info)
    root = ElementTree.fromstring(xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for paragraph in root.findall(".//w:p", namespace):
        value = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace))
        if value.strip():
            paragraphs.append(value)
    return "\n".join(paragraphs)


def _extract_text_file(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise PolicyDocumentError("文本文件编码无法识别，请另存为 UTF-8 后重试")


def _normalize(value: str) -> str:
    value = value.replace("\x00", "")
    value = re.sub(r"[\u0001-\u0008\u000b\u000c\u000e-\u001f]", "", value)
    value = re.sub(r"[ \t\u00a0]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()
