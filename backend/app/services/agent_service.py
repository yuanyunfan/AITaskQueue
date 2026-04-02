import uuid
from datetime import datetime, timezone

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import MainAgentState, SubAgent, DecisionLogEntry
from app.models.enums import AgentStatus


class AgentService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_main_agent(self) -> MainAgentState:
        result = await self.session.execute(select(MainAgentState).where(MainAgentState.id == 1))
        agent = result.scalar_one_or_none()
        if not agent:
            agent = MainAgentState(id=1)
            self.session.add(agent)
            await self.session.commit()
            await self.session.refresh(agent)
        return agent

    async def update_main_agent(self, **kwargs) -> MainAgentState:
        agent = await self.get_main_agent()
        for key, value in kwargs.items():
            if hasattr(agent, key):
                setattr(agent, key, value)
        await self.session.commit()
        await self.session.refresh(agent)
        return agent

    async def increment_dispatched(self) -> None:
        agent = await self.get_main_agent()
        agent.tasks_dispatched += 1
        await self.session.commit()

    async def list_sub_agents(self) -> list[SubAgent]:
        result = await self.session.execute(select(SubAgent).order_by(SubAgent.id))
        return list(result.scalars().all())

    async def get_sub_agent(self, agent_id: str) -> SubAgent | None:
        result = await self.session.execute(select(SubAgent).where(SubAgent.id == agent_id))
        return result.scalar_one_or_none()

    async def get_or_create_idle_agent(self, max_agents: int = 4) -> SubAgent | None:
        # Try to find an idle agent
        result = await self.session.execute(
            select(SubAgent).where(SubAgent.status == AgentStatus.IDLE).limit(1)
        )
        agent = result.scalar_one_or_none()
        if agent:
            return agent

        # Check if we can create a new one
        all_agents = await self.list_sub_agents()
        if len(all_agents) >= max_agents:
            return None

        # Create new sub-agent
        agent_num = len(all_agents) + 1
        agent = SubAgent(id=f"sub-{agent_num:02d}")
        self.session.add(agent)
        await self.session.commit()
        await self.session.refresh(agent)
        return agent

    async def update_sub_agent(self, agent_id: str, **kwargs) -> SubAgent | None:
        agent = await self.get_sub_agent(agent_id)
        if not agent:
            return None
        for key, value in kwargs.items():
            if hasattr(agent, key):
                setattr(agent, key, value)
        await self.session.commit()
        await self.session.refresh(agent)
        return agent

    async def free_agent(self, agent_id: str) -> None:
        agent = await self.get_sub_agent(agent_id)
        if agent:
            agent.status = AgentStatus.IDLE
            agent.current_task_id = None
            agent.current_task_title = None
            agent.progress = 0
            agent.completed_count += 1
            agent.pid = None
            agent.running_since = None
            await self.session.commit()

    async def delete_sub_agent(self, agent_id: str) -> bool:
        agent = await self.get_sub_agent(agent_id)
        if not agent:
            return False
        await self.session.delete(agent)
        await self.session.commit()
        return True

    async def add_decision(self, message: str) -> DecisionLogEntry:
        entry = DecisionLogEntry(
            id=str(uuid.uuid4())[:8],
            message=message,
        )
        self.session.add(entry)
        await self.session.commit()
        await self.session.refresh(entry)
        return entry

    async def get_decisions(self, limit: int = 50) -> list[DecisionLogEntry]:
        result = await self.session.execute(
            select(DecisionLogEntry).order_by(desc(DecisionLogEntry.timestamp)).limit(limit)
        )
        return list(result.scalars().all())
