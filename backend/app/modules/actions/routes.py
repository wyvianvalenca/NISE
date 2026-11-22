from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import (
    CoordinatorGroupIdDep,
    GroupActionDep,
    TodayDep,
)
from app.modules.actions.exceptions import AttendanceAlreadyRegisteredError
from app.modules.actions.models import ActionStatus
from app.modules.actions.schemas import (
    ActionIn,
    ActionListOut,
    ActionOut,
    ActionPageOut,
)
from app.modules.actions.service import (
    action_to_out,
    action_to_page_out,
    build_action_list,
    count_registered,
    create_action,
    delete_action,
    fetch_action_rows,
    today_in_maceio,
    update_action,
)
from app.modules.cities.models import City

router = APIRouter(prefix="/actions", tags=["Actions"])

INVALID_ACTION: dict[int | str, dict[str, Any]] = {
    status.HTTP_422_UNPROCESSABLE_CONTENT: {
        "description": (
            "A field breaks a rule of the form: detail[].loc and detail[].msg name "
            "the field and the message. A city outside the IBGE list answers "
            '{"error": "invalid_city"}.'
        )
    },
}


# The "Ações" page (K10, #215, RF-F30.10). The group is the coordinator's and never
# comes from the request. `status` narrows the items only; the chip counts ignore
# it and follow `search`. The order inside each status is "to be confirmed with
# design" (#215).
@router.get("", response_model=ActionListOut)
async def list_actions_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    action_status: Annotated[ActionStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> ActionListOut:
    rows = await fetch_action_rows(session, group_id)

    return build_action_list(rows, today_in_maceio(), action_status, search)


# The action page (K11, #233, RF-F1.14). An action of another group is a 404, the
# same as a missing one (RNF-G.03).
@router.get(
    "/{action_id}",
    response_model=ActionPageOut,
    responses={status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"}},
)
async def get_action_page_route(
    action: GroupActionDep, session: AsyncSessionDep, today: TodayDep
) -> ActionPageOut:
    city = (
        await session.get(City, action.city_ibge_code)
        if action.city_ibge_code is not None
        else None
    )
    registered = await count_registered(session, action.id)

    return action_to_page_out(action, city, registered, today)


# "Salvar" in the K02 form (#211, RF-F30.01). The group is the signed-in
# coordinator's and is never read from the request: a `group_id` in the body is
# ignored (RN-14). With several groups the answer is 409 until a story lets her
# choose one. `city_label` carries the text of the notice "Já aparece nas
# sugestões das meninas de <cidade>".
@router.post(
    "",
    response_model=ActionOut,
    status_code=status.HTTP_201_CREATED,
    responses=INVALID_ACTION,
)
async def create_action_route(
    data: ActionIn, group_id: CoordinatorGroupIdDep, session: AsyncSessionDep
) -> ActionOut:
    action, city = await create_action(session, group_id, data)

    return action_to_out(action, city, registered_count=0, today=today_in_maceio())


# "Salvar" in the same form, filled in (#221, RF-F30.11). Every field is sent
# again, so it replaces the action. The group is the action's own and a
# `group_id` in the body is ignored; an action of another group is a 404, the same
# as a missing one (RNF-G.03). The girls already registered stay (RF-F30.03).
@router.put(
    "/{action_id}",
    response_model=ActionOut,
    responses={
        **INVALID_ACTION,
        status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"},
    },
)
async def update_action_route(
    data: ActionIn, action: GroupActionDep, session: AsyncSessionDep
) -> ActionOut:
    city = await update_action(session, action, data)
    registered = await count_registered(session, action.id)

    return action_to_out(action, city, registered, today_in_maceio())


# "Excluir ação" in the modal (#225, RF-F30.12). It takes the registrations with it
# and keeps the girls' records (RN-15). After the attendance is saved it is
# refused with 409 even on a direct request. An action of another group is a 404
# (RNF-G.03).
@router.delete(
    "/{action_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"},
        status.HTTP_409_CONFLICT: {
            "description": "A presença já foi registrada, a ação não pode ser excluída"
        },
    },
)
async def delete_action_route(action: GroupActionDep, session: AsyncSessionDep) -> None:
    try:
        await delete_action(session, action)
    except AttendanceAlreadyRegisteredError:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A presença já foi registrada, então a ação não pode ser excluída",
        ) from None
