from typing import Any

from fastapi import APIRouter, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep
from app.modules.actions.schemas import ActionIn, ActionOut
from app.modules.actions.service import action_to_out, create_action, today_in_maceio

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
