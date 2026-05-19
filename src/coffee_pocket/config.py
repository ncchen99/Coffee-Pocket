from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str = ""

    google_places_api_key: str = ""

    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-3-flash-preview"


settings = Settings()
