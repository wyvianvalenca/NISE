"""A declaração de ingresso que ela faz: a regra da pergunta 3 (RF-F6.02).

Serve ao questionário (A18, #294) e ao perfil (A10b, #298): os dois pedem o
nível, o curso e, se quiser, onde. A regra mora aqui, ao lado do `Enrollment`
e de `add_self_declared_enrollment`, para as duas telas valerem igual.
"""

from typing import Annotated

from pydantic import StringConstraints

from app.modules.admissions.models import CourseLevel
from app.modules.followup.models import CourseCode, CourseStatus
from app.modules.followup.utils import COURSE_LABELS

# Texto livre da pergunta 3 (nome do curso, "Onde?"): o mesmo limite do campo
# na tela. Nunca vai para logs, LLM nem exportações (RN-11).
FreeText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=120),
]


def blank_is_none(text: str | None) -> str | None:
    """Só espaços vale como campo vazio."""
    return text or None


def level_of(status: CourseStatus | None) -> CourseLevel | None:
    """O nível do curso, se ela entrou (técnico ou graduação)."""
    if status in (CourseStatus.TECNICO, CourseStatus.GRADUACAO):
        return CourseLevel(status.value)
    return None


def check_course_fields(
    level: CourseLevel | None,
    course: CourseCode | None,
    other_course: str | None,
    institution: str | None,
) -> None:
    """Confere os campos do curso; levanta ValueError se não valem (RNF-G.03).

    Com nível, o curso é obrigatório, e o nome digitado vale só para "Outro
    curso" (e é obrigatório nele). Sem nível ("Tô tentando entrar", "Ainda
    não"), nenhum campo de curso vem.
    """
    if level is None:
        if course or other_course or institution:
            raise ValueError("Esta resposta não leva dados de curso")
        return

    if course is None:
        raise ValueError("Diga qual curso")

    if (course is CourseCode.OUTRO) != (other_course is not None):
        raise ValueError('O nome do curso vale só para "Outro curso", e é obrigatório')


def course_name(course: CourseCode, other_course: str | None) -> str:
    """O nome que fica no ingresso: o da lista, ou o que ela digitou em "Outro".

    Texto livre quando ela digita: não vai para logs (RN-11).
    """
    if course is CourseCode.OUTRO and other_course:
        return other_course
    return COURSE_LABELS[course]
