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
    # LangSmith tracing (optional — set to enable)
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = "ekonlabs-ai-core"
    # WhatsApp Provider Selection
    WHATSAPP_PROVIDER: str = "meta"          # "meta" | "evolution"
    # Evolution API (required only when WHATSAPP_PROVIDER=evolution)
    EVOLUTION_API_URL: str = ""              # e.g. "https://evolution.miserv.io"
    EVOLUTION_API_KEY: str = ""              # global apikey from AUTHENTICATION_API_KEY
    EVOLUTION_INSTANCE: str = ""             # instance name (e.g. "clinic-isadi")
    EVOLUTION_DISPLAY_PHONE: str = ""        # clinic's WA number for tenant resolution

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
