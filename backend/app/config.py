from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://aitask:aitask@localhost:5432/aitaskqueue"

    # App
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173"]

    # Orchestrator
    max_concurrent_agents: int = 4
    task_timeout_seconds: int = 600
    orchestrator_poll_interval: float = 3.0
    claude_cli_path: str = "claude"

    # Claude CLI
    claude_default_model: str = ""
    claude_max_turns: int = 10

    model_config = {"env_file": "../.env", "env_prefix": "AITASK_"}


settings = Settings()
