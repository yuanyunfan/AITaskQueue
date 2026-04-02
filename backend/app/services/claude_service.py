"""
DEPRECATED -- claude_agent_sdk wrapper replaced by orchestrator.subprocess_runner.

This module re-exports AgentEventType and AgentEvent for backward compatibility.
The actual implementation now lives in app.orchestrator.subprocess_runner and uses
Claude CLI subprocesses (asyncio.create_subprocess_exec) instead of the SDK.
"""

# Re-export from new location
from app.orchestrator.subprocess_runner import (
    AgentEventType,
    AgentEvent,
    ClaudeCodeRunner,
)

# Backward-compatible alias
ClaudeAgentRunner = ClaudeCodeRunner

__all__ = [
    "AgentEventType",
    "AgentEvent",
    "ClaudeAgentRunner",
    "ClaudeCodeRunner",
]
