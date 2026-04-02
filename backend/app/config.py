import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://aitask:aitask@localhost:5432/aitaskqueue"

    # App
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173"]

    # Orchestrator
    orchestrator_enabled: bool = True
    max_concurrent_agents: int = 4
    task_timeout_seconds: int = 600
    orchestrator_poll_interval: float = 5.0
    stale_threshold_seconds: int = 300  # task with no activity for this long is stale

    # Claude CLI subprocess configuration.
    # The CLI reads ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY from shell env.
    claude_cli_path: str = "claude"  # path to claude binary
    claude_model: str = ""  # empty = use CLI default
    claude_max_turns: int = 25
    claude_permission_mode: str = "acceptEdits"
    claude_working_dir: str = ""  # project dir for agent to work in
    claude_max_budget_usd: float = 0.0  # 0 = no per-task budget limit

    model_config = {"env_file": "../.env", "env_prefix": "AITASK_", "extra": "ignore"}

    @property
    def effective_working_dir(self) -> str:
        return self.claude_working_dir or os.getcwd()


settings = Settings()
