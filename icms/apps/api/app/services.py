from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def audit(db: Session, user: User, action: str, entity: str, entity_id=None, organization_id=None, changes=None) -> None:
    db.add(AuditEvent(
        actor_user_id=user.id,
        organization_id=organization_id,
        action=action,
        entity_type=entity,
        entity_id=entity_id,
        changes=changes,
    ))
