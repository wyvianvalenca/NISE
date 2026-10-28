from pydantic import Field
from pydantic_settings import BaseSettings

class AppSettings(BaseSettings):
    # pyrefly: ignore[no-matching-overload]
    database_url: str = Field(..., env="DATABASE_URL")
    debug_mode: bool = False
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = AppSettings()
