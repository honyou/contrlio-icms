from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    frontend_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    database_url: str = "postgresql+psycopg://icms:CHANGE_ME@localhost:5432/icms"
    redis_url: str = "redis://localhost:6379/0"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "icms-app"
    minio_secret_key: str = "CHANGE_ME"
    minio_bucket: str = "icms-evidence"
    jwt_secret: str = "CHANGE_ME"
    admin_email: str = "admin@icms.dev"
    admin_password: str = "CHANGE_ME"
    ai_encryption_key: str = ""
    evidence_max_bytes: int = 20 * 1024 * 1024
    billing_enabled: bool = False
    alipay_receiver_account: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
