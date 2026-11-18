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

    # Endereço público do app, para os links dos e-mails.
    app_url: str = "http://localhost:3000"

    # Busca em listas oficiais (F31, #273). O endereço muda a cada edição do
    # Sisu: é configuração, não código (RF-F31.08).
    copeve_report_url: str = (
        "https://copeve.ufal.br/concursos/sisu_2026/resultado_curso.php"
    )
    # Página pública do relatório, para o "Ver lista oficial" da A19.
    copeve_public_url: str = (
        "https://copeve.ufal.br/concursos/sisu_2026_acompanhamento.php"
    )
    copeve_selection_process: str = "Sisu 2026"
    # Intervalo mínimo entre duas requisições do robô (RNF-F31.05).
    list_search_interval_seconds: float = 2.0
    # Segredo das rotas chamadas pelo agendador da hospedagem. Vazio recusa tudo.
    cron_secret: str = ""


settings = AppSettings()
