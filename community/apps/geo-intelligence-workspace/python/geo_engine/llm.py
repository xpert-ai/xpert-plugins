from __future__ import annotations

import os
import time
from typing import Protocol, Callable

import httpx

from .domain import ModelResponse
from .errors import ModelNotConfigured, ProviderUnavailable


class ChatClient(Protocol):
    def complete(self, messages: list[dict[str, str]]) -> ModelResponse: ...


class IncompleteModelResponse(RuntimeError):
    """The provider returned no complete answer; it is not a successful run."""


class DeepSeekChatClient:
    """Small API adapter. Credentials remain in process memory and are never logged."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        model: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 30,
        transport: httpx.BaseTransport | None = None,
        temperature: float = 0.1,
        max_tokens: int = 900,
        max_attempts: int = 3,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.model = model or os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
        self.base_url = (base_url or os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")).rstrip("/")
        if not 1 <= max_attempts <= 5 or not 64 <= max_tokens <= 4096 or not 0 <= temperature <= 2:
            raise ValueError("Invalid model budget settings")
        self.client = httpx.Client(timeout=timeout_seconds, transport=transport)
        self.temperature, self.max_tokens = temperature, max_tokens
        self.max_attempts, self.sleep = max_attempts, sleep

    def complete(self, messages: list[dict[str, str]]) -> ModelResponse:
        if not self.api_key:
            raise ModelNotConfigured("DeepSeek credentials are not configured")
        if not messages:
            raise ValueError("At least one message is required")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        body = {
            "model": self.model, "messages": messages, "stream": False,
            "temperature": self.temperature, "max_tokens": self.max_tokens,
            "thinking": {"type": "disabled"},
        }
        for attempt in range(self.max_attempts):
            try:
                response = self.client.post(f"{self.base_url}/chat/completions", headers=headers, json=body)
            except httpx.TransportError:
                if attempt + 1 == self.max_attempts:
                    raise ProviderUnavailable("Provider transport failed") from None
                self.sleep(0.4 * (2**attempt))
                continue
            if response.status_code in (429, 502, 503, 504) and attempt + 1 < self.max_attempts:
                self.sleep(0.4 * (2**attempt))
                continue
            if not response.is_success:
                raise ProviderUnavailable(f"Provider HTTP status {response.status_code}")
            try:
                payload = response.json()
                choice = payload["choices"][0]
                if not isinstance(choice.get("message"), dict):
                    raise ValueError("Missing message")
            except (ValueError, KeyError, IndexError, TypeError):
                raise IncompleteModelResponse("Invalid provider response shape") from None
            content = choice["message"].get("content")
            if not isinstance(content, str):
                raise IncompleteModelResponse("Invalid provider content")
            content = content.strip()
            if not content or choice.get("finish_reason") == "length":
                raise IncompleteModelResponse("Model returned an empty or truncated answer")
            usage = payload.get("usage") or {}
            if not isinstance(usage, dict):
                usage = {}
            # Standard DeepSeek chat responses do not establish external citations.
            return ModelResponse(
                text=content,
                model=str(payload.get("model") or self.model),
                source_urls=(),
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
            )
        raise RuntimeError("Unreachable retry state")

    def close(self) -> None:
        self.client.close()
