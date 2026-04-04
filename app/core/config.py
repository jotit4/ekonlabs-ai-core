from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    META_VERIFY_TOKEN: str
    META_APP_SECRET: str
    META_ACCESS_TOKEN: str
    OPENAI_API_KEY: str
    ADMIN_API_KEY: str
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 30
    RATE_LIMIT_BURST: int = 50
    # Google Calendar (Epic 3)
    GOOGLE_CALENDAR_CREDENTIALS_PATH: str = ""
    DEFAULT_SLOT_DURATION_MINUTES: int = 60
    SCHEDULING_LOOKAHEAD_HOURS: int = 72

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
