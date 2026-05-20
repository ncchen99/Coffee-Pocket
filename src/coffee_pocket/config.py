from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str = ""

    google_places_api_key: str = ""

    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-3-flash-preview"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Cloudflare R2 (S3-compatible) — cafe hero images
    r2_endpoint: str = ""
    r2_bucket: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_public_base: str = ""  # public worker URL or custom domain


settings = Settings()
