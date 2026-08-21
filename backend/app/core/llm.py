from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Provider-agnostic LLM abstraction
# ---------------------------------------------------------------------------
# Each provider implements the same interface so agents never import a
# provider SDK directly.  Swap providers by changing LLM_PROVIDER in .env.
# ---------------------------------------------------------------------------


class LLMMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class LLMResponse:
    def __init__(self, content: str, model: str, usage: dict | None = None):
        self.content = content
        self.model = model
        self.usage = usage or {}


class BaseLLMProvider:
    """Interface every provider must implement."""

    async def complete(
        self,
        messages: list[LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        **kwargs,
    ) -> LLMResponse:
        raise NotImplementedError

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------

class OpenAIProvider(BaseLLMProvider):
    def __init__(self):
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.OPENAI_MODEL
        self._embed_model = settings.EMBEDDING_MODEL

    async def complete(
        self,
        messages: list[LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        **kwargs,
    ) -> LLMResponse:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[m.to_dict() for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        choice = response.choices[0]
        return LLMResponse(
            content=choice.message.content or "",
            model=response.model,
            usage=dict(response.usage) if response.usage else {},
        )

    async def embed(self, text: str) -> list[float]:
        response = await self._client.embeddings.create(
            model=self._embed_model,
            input=text,
        )
        return response.data[0].embedding


# ---------------------------------------------------------------------------
# Anthropic provider (stub — ready for implementation)
# ---------------------------------------------------------------------------

class AnthropicProvider(BaseLLMProvider):
    def __init__(self):
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._model = settings.ANTHROPIC_MODEL

    async def complete(
        self,
        messages: list[LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        **kwargs,
    ) -> LLMResponse:
        system = next((m.content for m in messages if m.role == "system"), None)
        user_messages = [m.to_dict() for m in messages if m.role != "system"]
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=user_messages,
        )
        return LLMResponse(
            content=response.content[0].text,
            model=response.model,
            usage={"input": response.usage.input_tokens, "output": response.usage.output_tokens},
        )

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError("Anthropic embedding not yet configured")


# ---------------------------------------------------------------------------
# Ollama provider (stub)
# ---------------------------------------------------------------------------

class OllamaProvider(BaseLLMProvider):
    def __init__(self):
        import httpx
        self._base = settings.OLLAMA_BASE_URL
        self._model = settings.OLLAMA_MODEL
        self._http = httpx.AsyncClient(base_url=self._base, timeout=120)

    async def complete(
        self,
        messages: list[LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        **kwargs,
    ) -> LLMResponse:
        payload = {
            "model": self._model,
            "messages": [m.to_dict() for m in messages],
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        r = await self._http.post("/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        return LLMResponse(content=data["message"]["content"], model=self._model)

    async def embed(self, text: str) -> list[float]:
        r = await self._http.post("/api/embeddings", json={"model": self._model, "prompt": text})
        r.raise_for_status()
        return r.json()["embedding"]


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_llm_provider() -> BaseLLMProvider:
    provider = settings.LLM_PROVIDER
    logger.info("LLM provider: %s", provider)
    if provider == "openai":
        return OpenAIProvider()
    if provider == "anthropic":
        return AnthropicProvider()
    if provider == "ollama":
        return OllamaProvider()
    raise ValueError(f"Unsupported LLM provider: {provider}")
