from sqlalchemy import select
from minio import Minio

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def main() -> None:
    if settings.admin_password == "CHANGE_ME" or len(settings.jwt_secret) < 32:
        raise SystemExit("请先运行根目录 `make init-local` 生成本地密钥。")
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == settings.admin_email.lower()))
        if user is None:
            user = User(email=settings.admin_email.lower(), full_name="系统管理员", password_hash=hash_password(settings.admin_password), is_system_admin=True)
            db.add(user)
            db.commit()
            print(f"已创建本地管理员：{user.email}")
        elif not user.is_system_admin or not user.is_active:
            user.is_system_admin = True
            if not user.is_active:
                user.is_active = True
                user.auth_version += 1
            db.commit()
            print(f"已确保配置的管理员账号启用且具有系统管理员权限：{user.email}")
        else:
            print(f"本地管理员已存在：{user.email}（未更改密码）")
    finally:
        db.close()

    storage = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=False,
    )
    if not storage.bucket_exists(settings.minio_bucket):
        storage.make_bucket(settings.minio_bucket)
    print(f"MinIO 证据桶已就绪：{settings.minio_bucket}")


if __name__ == "__main__":
    main()
