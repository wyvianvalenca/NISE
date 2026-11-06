from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# O .env fica na raiz do repositório, junto do .env.example.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class AppSettings(BaseSettings):
    # extra="ignore": o .env da raiz também tem variáveis do Docker (POSTGRES_*)
    # que o back não usa.
    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore"
    )

    # Lido da variável de ambiente DATABASE_URL.
    database_url: str
    debug_mode: bool = False

    jwt_secret: str
    jwt_expire_minutes: int = 60 * 24 * 7
    # True em produção, False em desenvolvimento.
    cookie_secure: bool = True

    password_reset_expire_minutes: int = 60

    google_client_id: str = ""
    google_client_secret: str = ""
    # Tem que ser idêntico ao cadastrado no console do Google:
    google_redirect_uri: str = "http://localhost:3000/api/auth/google/callback"

    pending_signup_expire_minutes: int = 30


settings = AppSettings()
