from pydantic import BaseModel, ConfigDict, Field


class InviteOut(BaseModel):
    """O que a rota pública do convite mostra, para a tela A01b.

    Só o nome do grupo, de propósito: a rota é pública, e devolver aqui algo
    da menina (como o e-mail de um registro importado) deixaria quem adivinha
    um código ler dados de menores. O vínculo com o registro importado
    acontece no cadastro, pelo e-mail que ela digita (RF-F2.02).
    """

    # O front lê em camelCase (Invite.groupName em frontend/lib/signup-api.ts).
    group_name: str = Field(serialization_alias="groupName")


class GroupOut(BaseModel):
    """A group as the signed-in coordinator's top menu needs it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
