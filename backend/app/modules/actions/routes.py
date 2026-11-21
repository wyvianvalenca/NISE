from typing import Any

from fastapi import APIRouter, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep, GroupActionDep
from app.modules.actions.schemas import ActionIn, ActionOut
from app.modules.actions.service import (
    action_to_out,
    count_registered,
    create_action,
    today_in_maceio,
    update_action,
)

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
