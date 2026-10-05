from datetime import datetime, timedelta, timezone
import uuid

import jwt
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import OrganizationMembership, User

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except Exception:
        return False


def issue_token(user: User) -> tuple[str, str]:
    token_id = str(uuid.uuid4())
    expires = datetime.now(timezone.utc) + timedelta(hours=10)
    token = jwt.encode({"sub": str(user.id), "jti": token_id, "ver": user.auth_version, "exp": expires}, settings.jwt_secret, algorithm="HS256")
    return token, token_id


def parse_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def user_membership(db: Session, user: User, organization_id: uuid.UUID) -> OrganizationMembership | None:
    return db.scalar(select(OrganizationMembership).where(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.user_id == user.id,
    ))
