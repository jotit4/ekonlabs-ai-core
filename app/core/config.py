from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    META_VERIFY_TOKEN: str = ""
    META_APP_SECRET: str = ""
    OPENAI_API_KEY: str = ""
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 30
    RATE_LIMIT_BURST: int = 50

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
