"""Encryption helpers for provider credentials stored in PostgreSQL."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    if not settings.ai_encryption_key:
        raise RuntimeError("本地缺少 AI_ENCRYPTION_KEY，请运行 make init-local 并重启 API")
    try:
        return Fernet(settings.ai_encryption_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("AI_ENCRYPTION_KEY 格式无效，请运行 make init-local 并重启 API") from exc


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("ascii")


def decrypt_api_key(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("AI Token 无法解密；请使用保存该 Token 时的本地 .env 配置") from exc
