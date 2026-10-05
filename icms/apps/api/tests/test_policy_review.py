import io
import json
import uuid
import zipfile

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.ai_crypto import encrypt_api_key
from app.ai_service import CompletionResult
from app.database import get_db
from app.models import AIProviderConfig, AITokenUsage, AuditEvent, Base, Organization, OrganizationMembership, PolicyAnalysis, PolicyDocument, User
from app.policy_documents import PolicyDocumentError, extract_policy_text
from app.policy_review import normalize_policy_analysis, select_review_regulations
from app.compliance_library import get_compliance_library
from app.security import issue_token


class FakeRedis:
    def get(self, key):
        return None


class FakeObject:
    def __init__(self, content: bytes):
        self.content = content

    def read(self):
        return self.content

    def close(self):
        pass

    def release_conn(self):
        pass


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, bucket, key, stream, length, content_type=None):
        self.objects[key] = stream.read()

    def get_object(self, bucket, key):
        return FakeObject(self.objects[key])

    def remove_object(self, bucket, key):
        self.objects.pop(key, None)


def test_policy_text_extractors_validate_file_types_and_keep_complete_text():
    source = "第一章 采购制度。\n第二章 验收与异常处理。"
    assert extract_policy_text("采购制度.txt", source.encode("utf-8")) == source
    assert "第一章" in extract_policy_text("采购制度.txt", source.encode("gb18030"))

    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as archive:
        archive.writestr("word/document.xml", """<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>第一条 供应商准入</w:t></w:r></w:p>
        <w:p><w:r><w:t>第二条 采购验收</w:t></w:r></w:p>
        </w:body></w:document>""")
    parsed_docx = extract_policy_text("制度.docx", docx.getvalue())
    assert parsed_docx == "第一条 供应商准入\n第二条 采购验收"

    try:
        extract_policy_text("扫描件.pdf", b"not a pdf")
    except PolicyDocumentError as exc:
        assert "不是有效 PDF" in str(exc)
    else:
        raise AssertionError("invalid PDF should be rejected")


def test_policy_review_resolves_only_known_law_links_and_removes_unverifiable_quotes():
    library = get_compliance_library("food-beverage", [])
    text = "公司依据中华人民共和国食品安全法建立供应商准入和食品批次追溯制度。"
    laws = select_review_regulations(library, text)
    law_ids = {law["id"] for law in laws}
    assert "food-safety-law" in law_ids

    report = normalize_policy_analysis(json.dumps({
        "summary": "需要补充审批和追溯要求。", "overall_severity": "high", "findings": [{
            "title": "缺少批次追溯", "severity": "high", "policy_excerpt": "制度没有写的虚构原文",
            "risk": "无法定位问题原料", "regulatory_gap": "建议对照索引和现行原文核验",
            "recommendation": "要求验收时记录批次并由门店经理复核", "law_ids": ["food-safety-law", "made-up-law"],
            "confidence": "medium",
        }], "positive_controls": [], "open_questions": [],
    }, ensure_ascii=False), laws, text)
    finding = report["findings"][0]
    assert finding["policy_excerpt"] == ""
    assert [law["id"] for law in finding["law_references"]] == ["food-safety-law"]
    assert finding["law_references"][0]["source_url"].startswith("https://")


def test_policy_upload_and_analysis_require_consent_and_persist_results(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(main.settings, "ai_encryption_key", Fernet.generate_key().decode("ascii"))
    storage = FakeStorage()
    monkeypatch.setattr(main, "storage", storage)
    with Session(engine) as db:
        manager = User(email="policy-manager@example.test", full_name="Policy Manager", password_hash="unused")
        viewer = User(email="policy-viewer@example.test", full_name="Policy Viewer", password_hash="unused")
        org = Organization(name="Tea Company", code="POLICY-TEA", industry="food-beverage")
        db.add_all([manager, viewer, org]); db.flush()
        db.add_all([
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role="manager"),
            OrganizationMembership(organization_id=org.id, user_id=viewer.id, role="viewer"),
            AIProviderConfig(organization_id=org.id, provider="custom", protocol="openai-compatible",
                             base_url="https://ai.example.test/v1", model="internal-model",
                             encrypted_api_key=encrypt_api_key("company-secret-token")),
        ])
        db.commit()
        organization_id, manager_id = str(org.id), manager.id
        manager_token, viewer_token = issue_token(manager)[0], issue_token(viewer)[0]

    def override_db():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    calls = []
    policy_text = "依据中华人民共和国食品安全法建立食品批次追溯，供应商须经资质核验后准入。"

    async def fake_completion(**kwargs):
        calls.append(kwargs)
        return CompletionResult(
            answer=json.dumps({
                "summary": "建议补强批次留痕。", "overall_severity": "medium",
                "findings": [{
                    "title": "供应商准入缺少周期复核", "severity": "medium",
                    "policy_excerpt": "供应商须经资质核验后准入", "risk": "资质失效后仍可能持续采购。",
                    "regulatory_gap": "制度未明确复核周期。", "recommendation": "明确复核责任人和频率。",
                    "law_ids": ["food-safety-law"], "confidence": "high",
                }], "positive_controls": ["已要求供应商准入"], "open_questions": [],
            }, ensure_ascii=False),
            input_tokens=180, output_tokens=100, total_tokens=280, usage_estimated=False,
        )

    monkeypatch.setattr(main, "request_completion", fake_completion)
    try:
        with TestClient(main.app) as client:
            headers = {"Authorization": f"Bearer {manager_token}"}
            viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
            uploaded = client.post(
                f"/api/policies/upload?organization_id={organization_id}", headers=headers,
                files={"file": ("供应商采购制度.txt", policy_text.encode("utf-8"), "text/plain")},
            )
            assert uploaded.status_code == 201, uploaded.text
            document_id = uploaded.json()["id"]
            assert uploaded.json()["extracted_char_count"] == len(policy_text)
            assert "object_key" not in uploaded.json()
            assert len(storage.objects) == 1

            denied_viewer = client.get(f"/api/policies?organization_id={organization_id}", headers=viewer_headers)
            denied_consent = client.post(
                f"/api/policies/{document_id}/analyze?organization_id={organization_id}",
                headers=headers, json={"confirm_external_transfer": False},
            )
            denied_untrusted_source = client.post(
                f"/api/policies/{document_id}/analyze?organization_id={organization_id}", headers=headers,
                json={"confirm_external_transfer": True, "regulation_source_url": "https://example.com/law"},
            )
            assert denied_viewer.status_code == 403
            assert denied_consent.status_code == 422
            assert denied_untrusted_source.status_code == 422
            assert calls == []

            analyzed = client.post(
                f"/api/policies/{document_id}/analyze?organization_id={organization_id}",
                headers=headers, json={
                    "confirm_external_transfer": True,
                    "regulation_material": "从市场监管总局官方页面复制的食品安全法相关摘录。",
                    "regulation_source_url": "https://www.samr.gov.cn/zw/zfxxgk/fgs/index.html",
                },
            )
            assert analyzed.status_code == 200, analyzed.text
            report = analyzed.json()["result"]
            assert report["findings"][0]["policy_excerpt"] in policy_text
            assert report["findings"][0]["law_references"][0]["id"] == "food-safety-law"
            assert report["findings"][0]["law_references"][0]["source_url"].startswith("https://")
            assert report["regulation_index_only"] is True
            assert report["official_text_fetched"] is False
            assert report["supplementary_law_source"]["verified_by_system"] is False
            assert report["supplementary_law_source"]["url"].startswith("https://www.samr.gov.cn/")
            assert "供应商采购制度" in calls[0]["user_prompt"]
            assert policy_text in calls[0]["user_prompt"]
            assert "食品安全法相关摘录" in calls[0]["user_prompt"]
            assert "source_url_not_fetched" in calls[0]["user_prompt"]
            assert "company-secret-token" not in analyzed.text

            listed = client.get(f"/api/policies?organization_id={organization_id}", headers=headers)
            assert listed.status_code == 200
            assert listed.json()[0]["latest_analysis"]["id"] == analyzed.json()["id"]
            history = client.get(f"/api/policies/{document_id}/analyses?organization_id={organization_id}", headers=headers)
            assert len(history.json()) == 1

        with Session(engine) as db:
            assert db.scalar(select(PolicyDocument).where(PolicyDocument.id == uuid.UUID(document_id)))
            analysis = db.scalar(select(PolicyAnalysis).where(PolicyAnalysis.document_id == uuid.UUID(document_id)))
            usage = db.scalar(select(AITokenUsage).where(AITokenUsage.task == "policy_analysis"))
            assert analysis.analyzed_by == manager_id
            assert analysis.token_usage == 280
            assert usage.status == "completed" and usage.total_tokens == 280
            assert db.scalar(select(AuditEvent).where(AuditEvent.action == "analyze_policy_document"))
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
