from datetime import UTC, date, datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.exceptions import ActionValidationError
from app.modules.actions.models import (
    Action,
    ActionAudience,
    ActionFormat,
    ActionStatus,
    ActionTopic,
    ActionVisibility,
)
from app.modules.actions.schemas import ActionIn, ActionOut
from app.modules.cities.models import City
from app.modules.cities.service import ensure_city_exists
from app.modules.cities.utils import city_label

# "The day of the event has come" is decided in Maceió time, as in the age rule
# (RN-03), so an action does not change status at 21:00 local time because the
# server runs in UTC.
ACTION_TIMEZONE = ZoneInfo("America/Maceio")


def today_in_maceio(now: datetime | None = None) -> date:
    """Today's date in `ACTION_TIMEZONE`; `now` is a parameter so tests can fix it."""
    current = now if now is not None else datetime.now(UTC)
    return current.astimezone(ACTION_TIMEZONE).date()


def compute_status(action: Action, registered_count: int, today: date) -> ActionStatus:
    """The status of an action, by the first rule that applies (RN-37).

    It is pure on purpose: the registered count and "today" come as arguments, so
    every route uses this one function and the rules are tested without a
    database. The day that counts is `starts_on`, also for actions of several days.

    Whether registrations are open does not enter here: it is a separate matter
    and closing them never changes the status.
    """
    event_day_has_come = today >= action.starts_on

    if event_day_has_come and action.attendance_registered_at is not None:
        return ActionStatus.CONCLUDED
    if event_day_has_come:
        return ActionStatus.AWAITING_ATTENDANCE
    if registered_count == 0:
        return ActionStatus.AWAITING_REGISTRATIONS
    return ActionStatus.AWAITING_EVENT


def _is_https_link(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme.lower() == "https" and bool(parts.netloc)


async def validate_action_data(session: AsyncSession, data: ActionIn) -> City | None:
    """Check the rules of the form that one field alone cannot (RF-F30.05).

    The creation and the edit both call it, so an action can never be saved by
    one route in a state the other would refuse. It collects every broken field
    before raising, so the form shows all the messages at once, and it runs
    before anything is written: a refused edit changes nothing. The city, the
    only rule that needs the database, is checked last (RN-17).

    Returns the city of an in-person action, or None for an online one (D-45).
    """
    errors: dict[str, str] = {}

    if data.ends_on is not None and data.ends_on < data.starts_on:
        errors["ends_on"] = "A data de fim não pode ser antes da data de início"

    if data.registration_url is not None:
        if not _is_https_link(data.registration_url):
            errors["registration_url"] = "O link precisa começar com https://"
    elif data.visibility is ActionVisibility.OPEN:
        errors["registration_url"] = "Obrigatório pra ações abertas"

    if data.format is ActionFormat.ONLINE and data.city_ibge_code is not None:
        errors["city_ibge_code"] = "Ação online não tem cidade"
    elif data.format is ActionFormat.IN_PERSON and data.city_ibge_code is None:
        errors["city_ibge_code"] = "Escolha a cidade da ação presencial"

    if errors:
        raise ActionValidationError(errors)

    if data.city_ibge_code is None:
        return None

    return await ensure_city_exists(session, data.city_ibge_code)


def _apply_fields(action: Action, data: ActionIn) -> None:
    """Copy the form onto the action; the group and the registrations stay."""
    action.name = data.name
    action.type = data.type
    action.starts_on = data.starts_on
    action.ends_on = data.ends_on if data.ends_on is not None else data.starts_on
    action.format = data.format
    action.city_ibge_code = data.city_ibge_code
    action.visibility = data.visibility
    action.registration_url = data.registration_url
    action.starts_at_time = data.starts_at_time
    action.ends_at_time = data.ends_at_time
    action.address = data.address
    action.description = data.description

    # Keep the rows that stay and add only the new ones: swapping the whole
    # list makes SQLAlchemy insert before it deletes, which hits the unique
    # constraint when a tag is chosen again.
    chosen_topics = set(data.topics)
    action.topics = [row for row in action.topics if row.topic in chosen_topics]
    kept_topics = {row.topic for row in action.topics}
    action.topics.extend(
        ActionTopic(topic=topic) for topic in data.topics if topic not in kept_topics
    )

    chosen_stages = set(data.audiences)
    action.audiences = [row for row in action.audiences if row.stage in chosen_stages]
    kept_stages = {row.stage for row in action.audiences}
    action.audiences.extend(
        ActionAudience(stage=stage)
        for stage in data.audiences
        if stage not in kept_stages
    )


def action_to_out(
    action: Action, city: City | None, registered_count: int, today: date
) -> ActionOut:
    """Build the answer of the action routes; the status is computed, never read."""
    return ActionOut(
        id=action.id,
        name=action.name,
        type=action.type,
        starts_on=action.starts_on,
        ends_on=action.ends_on,
        format=action.format,
        city_ibge_code=action.city_ibge_code,
        city_label=city_label(city.name, city.state) if city is not None else None,
        visibility=action.visibility,
        registration_url=action.registration_url,
        starts_at_time=action.starts_at_time,
        ends_at_time=action.ends_at_time,
        address=action.address,
        description=action.description,
        registrations_open=action.registrations_open,
        topics=[row.topic for row in action.topics],
        audiences=[row.stage for row in action.audiences],
        status=compute_status(action, registered_count, today),
    )


async def create_action(
    session: AsyncSession, group_id: int, data: ActionIn
) -> tuple[Action, City | None]:
    """Save a new action in the group of the coordinator (RF-F30.01, RN-14).

    `group_id` comes from her membership, never from the request. A new action has
    no registrations, so it is born "awaiting registrations" (RN-37).
    """
    city = await validate_action_data(session, data)

    action = Action(group_id=group_id, registrations_open=True)
    _apply_fields(action, data)
    session.add(action)
    await session.commit()

    return action, city
