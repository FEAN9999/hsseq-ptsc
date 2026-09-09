from pydantic_settings import BaseSettings, SettingsConfigDict

_MAC_DINH_CAM = {
    "",
    "change-me",
    "secret",
    "doi-chuoi-nay-bang-mot-chuoi-ngau-nhien-32-ky-tu",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    CORS_ORIGINS: str = "http://localhost:5173"
    APP_ENV: str = "local"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


def load_settings() -> Settings:
    s = Settings()
    if s.JWT_SECRET.strip() in _MAC_DINH_CAM or len(s.JWT_SECRET.strip()) < 32:
        raise RuntimeError(
            "JWT_SECRET thiếu hoặc còn là giá trị mặc định. "
            "Đặt một chuỗi ngẫu nhiên ít nhất 32 ký tự rồi khởi động lại."
        )
    return s


settings = load_settings()
