from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# O .env fica na raiz do repositório, junto do .env.example.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8")

    # Lido da variável de ambiente DATABASE_URL.
    database_url: str
    debug_mode: bool = False


settings = AppSettings()  # type: ignore[call-arg]
