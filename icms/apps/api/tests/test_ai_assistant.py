import asyncio
import uuid
from datetime import date
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app import main
from app.ai_crypto import encrypt_api_key
from app import ai_service
from app.ai_service import CompletionResult, ProviderCallError, ensure_public_dns, request_completion, validate_provider_url
from app.database import get_db
from app.models import AIProviderConfig, AuditEvent, Base, Control, ControlObjective, Department, Finding, Inspection, InspectionTest, Issue, Organization, OrganizationMembership, Process, RCM, RemediationPlan, Risk, User
from app.security import issue_token


class FakeRedis:
    def get(self, key):
        return None


def test_ai_config_is_company_scoped_encrypted_and_never_returned(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    encryption_key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(main.settings, "ai_encryption_key", encryption_key)
    with Session(engine) as db:
        manager = User(email="ai-manager@example.test", full_name="AI Manager", password_hash="unused")
        viewer = User(email="ai-viewer@example.test", full_name="AI Viewer", password_hash="unused")
        org = Organization(name="Tea Company", code="AI-TEA", industry="food-beverage")
        db.add_all([manager, viewer, org]); db.flush()
        db.add_all([
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role="manager"),
            OrganizationMembership(organization_id=org.id, user_id=viewer.id, role="viewer"),
        ])
        db.commit()
        organization_id = str(org.id)
        manager_token = issue_token(manager)[0]
        viewer_token = issue_token(viewer)[0]

    def override_db():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    try:
        with TestClient(main.app) as client:
            headers = {"Authorization": f"Bearer {manager_token}"}
            saved = client.post(f"/api/ai/settings?organization_id={organization_id}", headers=headers, json={
                "provider": "deepseek", "protocol": "openai-compatible", "base_url": "https://api.deepseek.com",
                "model": "deepseek-flash", "api_key": "secret-company-token-value",
            })
            read = client.get(f"/api/ai/settings?organization_id={organization_id}", headers=headers)
            denied = client.post(f"/api/ai/settings?organization_id={organization_id}", headers={"Authorization": f"Bearer {viewer_token}"}, json={
                "provider": "deepseek", "protocol": "openai-compatible", "base_url": "https://api.deepseek.com",
                "model": "deepseek-flash", "api_key": "another-secret-token-value",
            })
        assert saved.status_code == 200, saved.text
        assert "api_key" not in saved.json()
        assert "secret-company-token-value" not in saved.text
        assert read.json()["configured"] is True
        assert read.json()["api_key_masked"] == "••••••••"
        assert denied.status_code == 403
        with Session(engine) as db:
            config = db.get(AIProviderConfig, uuid.UUID(organization_id))
            assert config.encrypted_api_key != "secret-company-token-value"
            assert AuditEvent.__tablename__
            assert db.scalar(select(AuditEvent).where(AuditEvent.action == "configure_ai_provider")).changes == {
                "provider": "deepseek", "protocol": "openai-compatible", "model": "deepseek-flash"
            }
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()


def test_process_guidance_sends_selected_company_context_only_after_consent(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    encryption_key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(main.settings, "ai_encryption_key", encryption_key)
    with Session(engine) as db:
        manager = User(email="ai-flow@example.test", full_name="Flow Manager", password_hash="unused")
        org = Organization(name="Tea Company", code="AI-FLOW", industry="food-beverage")
        db.add_all([manager, org]); db.flush()
        department = Department(organization_id=org.id, code="OPS", name="Operations")
        db.add(department); db.flush()
        process = Process(organization_id=org.id, department_id=department.id, code="TEA-PO", name="茶叶采购验收", description="采购、验收、入库")
        db.add(process); db.flush()
        risk = Risk(organization_id=org.id, process_id=process.id, code="RISK-01", name="来料质量风险", description="供应商交付不合格茶叶", likelihood=3, impact=4)
        objective = ControlObjective(organization_id=org.id, process_id=process.id, code="OBJ-01", name="验收完整", description="确保采购货物符合标准")
        db.add_all([
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role="manager"),
            risk,
            objective,
            AIProviderConfig(organization_id=org.id, provider="custom", protocol="openai-compatible", base_url="https://ai.example.test/v1", model="internal-model", encrypted_api_key=encrypt_api_key("secret-token-value")),
        ])
        db.flush()
        control = Control(organization_id=org.id, process_id=process.id, objective_id=objective.id, code="CTRL-01", name="双人验收", description="采购和质检分岗验收", frequency="daily", execution_mode="manual")
        db.add(control); db.flush()
        rcm = RCM(organization_id=org.id, process_id=process.id, risk_id=risk.id, control_id=control.id, assertion="到货符合标准", test_procedure="抽样核对订单、验收及批次")
        inspection = Inspection(organization_id=org.id, process_id=process.id, code="INSP-01", name="来料验收检查", period_start=date(2026, 1, 1), period_end=date(2026, 1, 31), lead_user_id=manager.id)
        db.add_all([control, rcm, inspection]); db.flush()
        inspection_test = InspectionTest(organization_id=org.id, inspection_id=inspection.id, rcm_id=rcm.id, tester_user_id=manager.id, procedure="检查供应商资质与温度", result="fail", sample_description="抽查 10 笔收货", notes="有一笔温度记录缺失")
        db.add(inspection_test); db.flush()
        finding = Finding(organization_id=org.id, inspection_test_id=inspection_test.id, title="收货温度记录缺失", condition="一笔鲜奶收货没有实测温度", criteria="收货时记录并核验规定温度", root_cause="待进一步分析", impact="无法证明冷链连续", recommendation="补强强制记录和异常处置", severity="high")
        db.add(finding); db.flush()
        issue = Issue(organization_id=org.id, finding_id=finding.id, code="ISS-01", title="完善冷链收货记录", priority="high", status="in_progress")
        db.add(issue); db.flush()
        db.add(RemediationPlan(organization_id=org.id, issue_id=issue.id, owner_user_id=manager.id, root_cause="验收表没有温度必填项", action_plan="上线温度必填和店长复核", due_date=date(2026, 2, 28)))
        db.commit()
        organization_id, process_id = str(org.id), str(process.id)
        token = issue_token(manager)[0]

    def override_db():
        with Session(engine) as db:
            yield db

    calls = []

    async def fake_completion(**kwargs):
        calls.append(kwargs)
        return "流程草案：完善来料抽检和不合格隔离。"

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    monkeypatch.setattr(main, "request_completion", fake_completion)
    try:
        with TestClient(main.app) as client:
            headers = {"Authorization": f"Bearer {token}"}
            body = {"task": "process_guidance", "process_id": process_id, "question": "请给出抽样和复核方案", "conversation": [
                {"role": "user", "content": "发现温度记录不完整。"},
                {"role": "assistant", "content": "请先核对未关闭问题和整改计划。"},
            ], "confirm_external_transfer": False}
            denied = client.post(f"/api/ai/assist?organization_id={organization_id}", headers=headers, json=body)
            body["confirm_external_transfer"] = True
            result = client.post(f"/api/ai/assist?organization_id={organization_id}", headers=headers, json=body)
        assert denied.status_code == 422
        assert result.status_code == 200, result.text
        assert result.json()["review_required"] is True
        assert result.json()["live_web_research_performed"] is False
        assert "茶叶采购验收" in calls[0]["user_prompt"]
        assert "来料质量风险" in calls[0]["user_prompt"]
        assert "收货温度记录缺失" in calls[0]["user_prompt"]
        assert "完善冷链收货记录" in calls[0]["user_prompt"]
        assert "上线温度必填和店长复核" in calls[0]["user_prompt"]
        assert "发现温度记录不完整。" in calls[0]["user_prompt"]
        assert calls[0]["api_key"] == "secret-token-value"
        assert "secret-token-value" not in result.text
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()


def test_provider_endpoint_policy_and_protocol_paths():
    assert validate_provider_url("openai-compatible", "https://api.example.test/v1") == "https://api.example.test/v1/chat/completions"
    assert validate_provider_url("anthropic", "https://api.anthropic.com") == "https://api.anthropic.com/v1/messages"
    assert validate_provider_url("openai-responses", "https://api.openai.com/v1") == "https://api.openai.com/v1/responses"
    assert validate_provider_url(
        "google-gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash"
    ) == "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    assert validate_provider_url("openai-compatible", "http://localhost:11434/v1") == "http://localhost:11434/v1/chat/completions"
    for url in ("http://api.example.test/v1", "https://127.0.0.1/v1", "https://localhost/v1", "https://user:pass@example.test/v1", "ftp://api.example.test"):
        try:
            validate_provider_url("openai-compatible", url)
        except ValueError:
            continue
        raise AssertionError(f"endpoint should have been rejected: {url}")


def test_openai_responses_adapter_uses_bearer_auth_and_non_stored_request(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"output_text": "分析草案"}

    class FakeClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return None
        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="openai-responses", base_url="https://api.openai.com/v1", model="gpt-test",
        api_key="company-token", system_prompt="system", user_prompt="user data",
    ))
    assert result == "分析草案"
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["headers"]["Authorization"] == "Bearer company-token"
    assert captured["body"]["store"] is False
    assert captured["body"]["input"] == "user data"


@pytest.mark.parametrize("content", [
    {"type": "text", "text": "兼容网关分析草案"},
    [{"type": "text", "text": "兼容网关分析草案"}],
])
def test_openai_compatible_adapter_reads_structured_message_content(monkeypatch, content):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"role": "assistant", "content": content}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="openai-compatible", base_url="https://provider.example.test/v1", model="chat-model",
        api_key="company-token", system_prompt="system", user_prompt="user data",
    ))
    assert result == "兼容网关分析草案"


def test_openai_compatible_adapter_falls_back_to_completion_text(monkeypatch):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {"choices": [{"text": "兼容网关返回的文本"}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="openai-compatible", base_url="https://provider.example.test/v1", model="chat-model",
        api_key="company-token", system_prompt="system", user_prompt="user data",
    ))
    assert result == "兼容网关返回的文本"


def test_gemini_adapter_uses_native_generate_content_contract(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self):
            return {
                "candidates": [{"content": {"parts": [{"text": "Gemini 分析草案"}]}}],
                "usageMetadata": {"promptTokenCount": 31, "candidatesTokenCount": 12},
            }

    class FakeClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return None
        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="google-gemini", base_url="https://generativelanguage.googleapis.com/v1beta", model="gemini-2.5-flash",
        api_key="company-token", system_prompt="system", user_prompt="user data", with_usage=True,
    ))
    assert isinstance(result, CompletionResult)
    assert result.answer == "Gemini 分析草案"
    assert (result.input_tokens, result.output_tokens, result.total_tokens) == (31, 12, 43)
    assert captured["url"].endswith("/models/gemini-2.5-flash:generateContent")
    assert captured["headers"]["x-goog-api-key"] == "company-token"
    assert captured["body"]["contents"] == [{"role": "user", "parts": [{"text": "user data"}]}]


def test_gemini_adapter_ignores_thought_parts_and_reads_visible_text(monkeypatch):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "candidates": [{"content": {"parts": [
                    {"thought": True, "text": "内部思考"},
                    {"text": "Gemini 可显示回答"},
                ]}}],
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="google-gemini", base_url="https://generativelanguage.googleapis.com/v1beta", model="gemini-2.5-flash",
        api_key="company-token", system_prompt="system", user_prompt="user data",
    ))
    assert result == "Gemini 可显示回答"


def test_provider_usage_metadata_is_returned_for_quota_accounting(monkeypatch):
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"output_text": "法规影响分析草案", "usage": {"input_tokens": 83, "output_tokens": 21}}

    class FakeClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return None
        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    async def allow_public_dns(*_):
        return None

    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **_: FakeClient())
    monkeypatch.setattr(ai_service, "ensure_public_dns", allow_public_dns)
    result = asyncio.run(request_completion(
        protocol="openai-responses", base_url="https://api.openai.com/v1", model="gpt-test",
        api_key="company-token", system_prompt="system", user_prompt="user data", with_usage=True,
    ))
    assert isinstance(result, CompletionResult)
    assert result.answer == "法规影响分析草案"
    assert (result.input_tokens, result.output_tokens, result.total_tokens) == (83, 21, 104)
    assert result.usage_estimated is False


def test_custom_provider_dns_cannot_target_private_network(monkeypatch):
    class PrivateDns:
        async def getaddrinfo(self, *_args, **_kwargs):
            return [(None, None, None, None, ("10.0.0.9", 443))]

    monkeypatch.setattr(ai_service.asyncio, "get_running_loop", lambda: PrivateDns())
    with pytest.raises(ProviderCallError, match="内网"):
        asyncio.run(ensure_public_dns("provider.example.com", 443, "https"))
