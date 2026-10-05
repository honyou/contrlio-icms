import uuid
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.ai_crypto import encrypt_api_key
from app.ai_service import CompletionResult
from app.database import get_db
from app.models import AIProviderConfig, AITokenUsage, Base, Organization, OrganizationMembership, User
from app.security import issue_token


class FakeRedis:
    def get(self, _key):
        return None


def test_ai_user_quota_request_approval_and_token_accounting(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(main.settings, "ai_encryption_key", Fernet.generate_key().decode("ascii"))
    with Session(engine) as db:
        manager = User(email="quota-manager@example.test", full_name="Quota Manager", password_hash="unused")
        auditor = User(email="quota-auditor@example.test", full_name="Quota Auditor", password_hash="unused")
        viewer = User(email="quota-viewer@example.test", full_name="Quota Viewer", password_hash="unused")
        org = Organization(name="Quota Company", code="AI-QUOTA", industry="food-beverage")
        db.add_all([manager, auditor, viewer, org]); db.flush()
        db.add_all([
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role="manager"),
            OrganizationMembership(organization_id=org.id, user_id=auditor.id, role="auditor"),
            OrganizationMembership(organization_id=org.id, user_id=viewer.id, role="viewer"),
            AIProviderConfig(organization_id=org.id, provider="custom", protocol="openai-compatible",
                             base_url="https://ai.example.test/v1", model="internal-model",
                             encrypted_api_key=encrypt_api_key("test-provider-secret")),
        ])
        db.commit()
        organization_id = str(org.id)
        auditor_id = str(auditor.id)
        manager_token = issue_token(manager)[0]
        auditor_token = issue_token(auditor)[0]
        viewer_token = issue_token(viewer)[0]

    def override_db():
        with Session(engine) as db:
            yield db

    calls = []

    async def fake_completion(**kwargs):
        calls.append(kwargs)
        return CompletionResult("额度批准后的内控草案", 12, 8, 20, False)

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    monkeypatch.setattr(main, "request_completion", fake_completion)
    try:
        with TestClient(main.app) as client:
            manager_headers = {"Authorization": f"Bearer {manager_token}"}
            auditor_headers = {"Authorization": f"Bearer {auditor_token}"}
            viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

            member_id = auditor_id
            limited = client.put(f"/api/ai/quotas/{member_id}?organization_id={organization_id}", headers=manager_headers,
                                 json={"monthly_limit_tokens": 10})

            snapshot = client.get(f"/api/ai/quota?organization_id={organization_id}", headers=auditor_headers)
            body = {"task": "regulatory_update", "question": "请分析流程影响", "confirm_external_transfer": True}
            over_limit = client.post(f"/api/ai/assist?organization_id={organization_id}", headers=auditor_headers, json=body)
            calls_after_denial = len(calls)
            quota_request = client.post(f"/api/ai/quota-requests?organization_id={organization_id}", headers=auditor_headers,
                                        json={"requested_tokens": 50000, "reason": "本月需要完成行业法规影响分析工作。"})
            requests = client.get(f"/api/ai/quota-requests?organization_id={organization_id}", headers=manager_headers)
            request_id = requests.json()[0]["id"]
            approval = client.patch(f"/api/ai/quota-requests/{request_id}?organization_id={organization_id}", headers=manager_headers,
                                    json={"approved": True, "approved_tokens": 50000, "review_note": "批准本月专项分析"})
            completed = client.post(f"/api/ai/assist?organization_id={organization_id}", headers=auditor_headers, json=body)
            after = client.get(f"/api/ai/quota?organization_id={organization_id}", headers=auditor_headers)
            forbidden = client.get(f"/api/ai/quotas?organization_id={organization_id}", headers=viewer_headers)

        assert limited.status_code == 200, limited.text
        assert snapshot.json()["monthly_limit_tokens"] == 10
        assert over_limit.status_code == 429
        assert calls_after_denial == 0
        assert quota_request.status_code == 201, quota_request.text
        assert approval.status_code == 200, approval.text
        assert completed.status_code == 200, completed.text
        assert completed.json()["token_usage"]["total_tokens"] == 20
        assert completed.json()["token_usage"]["estimated"] is False
        assert after.json()["used_tokens"] == 20
        assert after.json()["approved_extra_tokens"] == 50000
        assert forbidden.status_code == 403
        with Session(engine) as db:
            usage = db.query(AITokenUsage).one()
            assert usage.status == "completed"
            assert usage.total_tokens == 20
            assert usage.user_id == uuid.UUID(member_id)
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
