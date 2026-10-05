"""Small, explicit HTTP adapters for supported model provider protocols."""

from __future__ import annotations

import asyncio
import ipaddress
import math
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

import httpx


class ProviderCallError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class CompletionResult:
    answer: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    usage_estimated: bool


def _extract_text(value: object, *, include_thoughts: bool = True) -> str:
    """Extract displayable text from common provider content-block shapes.

    Providers do not use one consistent representation for message content:
    some return a string, while others return a content block, a list of
    blocks, or a nested output object.  Keep this deliberately conservative so
    tool calls, images, and Gemini thinking blocks are not shown as an answer.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [_extract_text(item, include_thoughts=include_thoughts) for item in value]
        return "\n".join(part for part in parts if part)
    if not isinstance(value, dict):
        return ""
    if not include_thoughts and value.get("thought") is True:
        return ""
    text = value.get("text")
    if isinstance(text, str):
        return text
    for key in ("content", "output_text", "value"):
        nested = _extract_text(value.get(key), include_thoughts=include_thoughts)
        if nested:
            return nested
    return ""


def estimate_tokens(text: str) -> int:
    """Conservatively estimate tokens when a provider omits usage metadata."""
    non_ascii = len(re.findall(r"[^\x00-\x7f]", text))
    ascii_chars = len(text) - non_ascii
    return max(1, non_ascii + math.ceil(ascii_chars / 4))


def validate_provider_url(protocol: str, base_url: str, model: str | None = None) -> str:
    """Validate a configured endpoint before the server makes an outbound call."""
    try:
        parts = urlsplit(base_url.strip())
        hostname = (parts.hostname or "").lower().rstrip(".")
        port = parts.port  # Also validates malformed ports.
    except ValueError as exc:
        raise ValueError("AI 服务地址格式无效") from exc
    if protocol not in {"openai-responses", "openai-compatible", "anthropic", "google-gemini"}:
        raise ValueError("暂不支持该 AI 接口协议")
    if not hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("AI 服务地址必须是无账号信息、无查询参数的基础 URL")
    local_names = {"localhost", "127.0.0.1", "::1"}
    is_local = hostname in local_names or hostname.endswith(".localhost")
    if is_local and parts.scheme != "http":
        raise ValueError("本机 AI 服务仅允许通过 HTTP loopback 地址连接")
    if parts.scheme != "https" and not (parts.scheme == "http" and is_local):
        raise ValueError("远程 AI 服务必须使用 HTTPS；HTTP 仅允许本机 localhost")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is not None:
        if not address.is_global and not address.is_loopback:
            raise ValueError("AI 服务地址不能指向内网或保留 IP")
    if hostname in {"metadata.google.internal", "169.254.169.254"} or hostname.endswith((".local", ".internal", ".lan", ".home")):
        raise ValueError("AI 服务地址不能指向本地网络或云元数据服务")
    path = parts.path.rstrip("/")
    if protocol == "anthropic":
        if path.endswith("/v1/messages"):
            path = path[:-len("/messages")]
        if not path.endswith("/v1"):
            path = f"{path}/v1"
        path = f"{path}/messages"
    elif protocol == "openai-responses":
        if path.endswith("/responses"):
            pass
        else:
            path = f"{path}/responses"
    elif protocol == "google-gemini":
        if "/models/" in path and path.endswith(":generateContent"):
            pass
        else:
            model_path = (model or "model").strip()
            if model_path.startswith("models/"):
                model_path = model_path[len("models/"):]
            path = f"{path}/models/{model_path}:generateContent"
    else:
        if path.endswith("/chat/completions"):
            pass
        else:
            path = f"{path}/chat/completions"
    return urlunsplit((parts.scheme, parts.netloc, path or "/", "", ""))


async def ensure_public_dns(hostname: str, port: int | None, scheme: str) -> None:
    """Prevent custom provider URLs from resolving to a private network target."""
    if hostname in {"localhost", "127.0.0.1", "::1"} or hostname.endswith(".localhost"):
        return
    try:
        records = await asyncio.get_running_loop().getaddrinfo(
            hostname, port or (443 if scheme == "https" else 80), type=socket.SOCK_STREAM,
        )
    except OSError as exc:
        raise ProviderCallError("无法解析 AI 服务地址，请检查 Base URL", 502) from exc
    addresses = {record[4][0] for record in records}
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ProviderCallError("AI 服务地址解析到了内网或保留地址，已阻止连接", 502)


async def request_completion(
    *, protocol: str, base_url: str, model: str, api_key: str, provider: str | None = None,
    system_prompt: str, user_prompt: str, with_usage: bool = False,
) -> str | CompletionResult:
    endpoint = validate_provider_url(protocol, base_url, model)
    url_parts = urlsplit(base_url.strip())
    await ensure_public_dns(url_parts.hostname or "", url_parts.port, url_parts.scheme)
    headers = {"Content-Type": "application/json"}
    if protocol == "anthropic":
        headers.update({"x-api-key": api_key, "anthropic-version": "2023-06-01"})
        body = {
            "model": model,
            "max_tokens": 1800,
            "temperature": 0.2,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
    elif protocol == "openai-responses":
        headers["Authorization"] = f"Bearer {api_key}"
        body = {
            "model": model,
            "instructions": system_prompt,
            "input": user_prompt,
            "max_output_tokens": 1800,
            "store": False,
        }
    elif protocol == "google-gemini":
        headers["x-goog-api-key"] = api_key
        body = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1800},
        }
    else:
        headers["Authorization"] = f"Bearer {api_key}"
        body = {
            "model": model,
            "max_tokens": 1800,
            "temperature": 0.2,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        # DeepSeek V4 defaults to high-effort thinking. This application shows
        # only the final answer, never hidden reasoning_content, and its
        # bounded output budget can be consumed before a final answer appears.
        # Ask DeepSeek for a direct text answer on the compatible chat API.
        if protocol == "openai-compatible" and provider == "deepseek":
            body["thinking"] = {"type": "disabled"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0), follow_redirects=False) as client:
            response = await client.post(endpoint, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise ProviderCallError("AI 服务响应超时，请稍后重试", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError("无法连接 AI 服务，请检查地址和网络", 502) from exc
    if response.status_code < 200 or response.status_code >= 300:
        raise ProviderCallError(f"AI 服务商返回 HTTP {response.status_code}", 502)
    try:
        payload = response.json()
        usage = payload.get("usage") if isinstance(payload, dict) else None
        usage = usage if isinstance(usage, dict) else {}
        if protocol == "anthropic":
            answer = _extract_text(payload.get("content", []))
            input_tokens = usage.get("input_tokens")
            output_tokens = usage.get("output_tokens")
        elif protocol == "openai-responses":
            answer = _extract_text(payload.get("output_text"))
            if not answer:
                answer = _extract_text(payload.get("output", []))
            input_tokens = usage.get("input_tokens")
            output_tokens = usage.get("output_tokens")
        elif protocol == "google-gemini":
            candidates = payload.get("candidates", [])
            content = candidates[0].get("content", {}) if candidates else {}
            parts = content.get("parts", []) if isinstance(content, dict) else []
            answer = _extract_text(parts, include_thoughts=False)
            usage = payload.get("usageMetadata", {}) or {}
            input_tokens = usage.get("promptTokenCount")
            output_tokens = usage.get("candidatesTokenCount")
        else:
            choice = payload["choices"][0]
            message = choice.get("message", {}) or {}
            answer = _extract_text(message.get("content"))
            if not answer:
                # A few OpenAI-compatible gateways expose completion-style
                # output as choices[].text even on their chat endpoint.
                answer = _extract_text(choice.get("text"))
            input_tokens = usage.get("prompt_tokens")
            output_tokens = usage.get("completion_tokens")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise ProviderCallError("AI 服务返回内容无法识别，请检查协议和模型配置", 502) from exc
    if not isinstance(answer, str) or not answer.strip():
        if protocol == "openai-compatible" and provider == "deepseek":
            raise ProviderCallError("DeepSeek 没有返回最终答复，请在模型设置中测试连接并核对 API 余额和模型权限", 502)
        raise ProviderCallError("AI 服务没有返回最终文本，请检查模型配置、输出限制或服务商状态", 502)
    answer = answer.strip()
    if not with_usage:
        return answer
    reported_input = isinstance(input_tokens, int) and input_tokens >= 0
    reported_output = isinstance(output_tokens, int) and output_tokens >= 0
    input_count = input_tokens if reported_input else estimate_tokens(system_prompt + "\n" + user_prompt)
    output_count = output_tokens if reported_output else estimate_tokens(answer)
    return CompletionResult(
        answer=answer,
        input_tokens=input_count,
        output_tokens=output_count,
        total_tokens=input_count + output_count,
        usage_estimated=not (reported_input and reported_output),
    )
