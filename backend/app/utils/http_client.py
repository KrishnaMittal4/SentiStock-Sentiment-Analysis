"""
Resilient HTTP client helper for SentiStock AI backend.
Provides granular timeout configuration, request retries with exponential
backoff and random jitter, and structured logging for API calls.
"""

from __future__ import annotations

import random
import time
from typing import Any, Callable, Dict, Optional

import httpx

from ..config import get_settings
from ..logging_config import logger

settings = get_settings()


def get_httpx_timeout() -> httpx.Timeout:
    """Returns standard granular timeout limits."""
    return httpx.Timeout(
        timeout=settings.http_timeout_seconds,
        connect=settings.http_connect_timeout_seconds,
        read=settings.http_timeout_seconds,
        write=settings.http_timeout_seconds,
    )


def execute_with_retry(
    request_func: Callable[[], httpx.Response],
    max_retries: Optional[int] = None,
    backoff_factor: Optional[float] = None,
    service_name: str = "HTTPClient",
) -> httpx.Response:
    """
    Executes a synchronous HTTP request function with retry logic and exponential backoff.
    Retries on network timeouts, connection errors, rate limits (429), and server errors (5xx).
    """
    retries = max_retries if max_retries is not None else settings.http_max_retries
    factor = backoff_factor if backoff_factor is not None else settings.http_backoff_factor

    last_exception: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        try:
            response = request_func()
            
            # Retry on 429 rate limit or 5xx server errors
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < retries:
                    jitter = random.uniform(0.05, 0.25)
                    sleep_time = (factor * (2 ** (attempt - 1))) + jitter
                    logger.warning(
                        f"[{service_name}] Request returned HTTP {response.status_code}. "
                        f"Retrying attempt {attempt}/{retries} in {sleep_time:.2f}s..."
                    )
                    time.sleep(sleep_time)
                    continue

            return response

        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_exception = exc
            if attempt < retries:
                jitter = random.uniform(0.05, 0.25)
                sleep_time = (factor * (2 ** (attempt - 1))) + jitter
                logger.warning(
                    f"[{service_name}] Request failed with network error/timeout: {exc}. "
                    f"Retrying attempt {attempt}/{retries} in {sleep_time:.2f}s..."
                )
                time.sleep(sleep_time)
            else:
                logger.error(
                    f"[{service_name}] Request failed after {retries} retries: {exc}"
                )
                raise exc

    if last_exception:
        raise last_exception
    
    # Final fallback execution if reached without returning
    return request_func()


async def async_execute_with_retry(
    async_request_func: Callable[[], Any],
    max_retries: Optional[int] = None,
    backoff_factor: Optional[float] = None,
    service_name: str = "AsyncHTTPClient",
) -> httpx.Response:
    """
    Executes an asynchronous HTTP request function with retry logic and exponential backoff.
    """
    import asyncio

    retries = max_retries if max_retries is not None else settings.http_max_retries
    factor = backoff_factor if backoff_factor is not None else settings.http_backoff_factor

    last_exception: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        try:
            response = await async_request_func()
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < retries:
                    jitter = random.uniform(0.05, 0.25)
                    sleep_time = (factor * (2 ** (attempt - 1))) + jitter
                    logger.warning(
                        f"[{service_name}] Async request returned HTTP {response.status_code}. "
                        f"Retrying attempt {attempt}/{retries} in {sleep_time:.2f}s..."
                    )
                    await asyncio.sleep(sleep_time)
                    continue

            return response

        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_exception = exc
            if attempt < retries:
                jitter = random.uniform(0.05, 0.25)
                sleep_time = (factor * (2 ** (attempt - 1))) + jitter
                logger.warning(
                    f"[{service_name}] Async request failed with network error/timeout: {exc}. "
                    f"Retrying attempt {attempt}/{retries} in {sleep_time:.2f}s..."
                )
                await asyncio.sleep(sleep_time)
            else:
                logger.error(
                    f"[{service_name}] Async request failed after {retries} retries: {exc}"
                )
                raise exc

    if last_exception:
        raise last_exception

    return await async_request_func()
