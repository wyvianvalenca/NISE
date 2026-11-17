from pydantic import BaseModel


class CityOut(BaseModel):
    # Código IBGE como texto, no formato que o front já espera (City.id: string).
    id: str
    # "Nome, UF", ex.: "Maceió, AL".
    name: str
