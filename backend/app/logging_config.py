"""
Structured logging module for SentiStock AI backend.
Provides JSON and structured string formatting with contextual metadata
such as timestamp, log level, request_id, module name, and execution metrics.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any, Dict


class StructuredFormatter(logging.Formatter):
    """
    Formatter that converts LogRecord objects into structured JSON strings
    with contextual metadata.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include extra attributes if passed in extra={}
        for key, val in record.__dict__.items():
            if key not in (
                "args", "asctime", "created", "exc_info", "exc_text", "filename",
                "funcName", "levelname", "levelno", "lineno", "module", "msecs",
                "msg", "name", "pathname", "process", "processName", "relativeCreated",
                "stack_info", "thread", "threadName", "message"
            ):
                log_data[key] = val

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logging(level: str = "INFO") -> logging.Logger:
    """
    Configures root and app loggers with structured output.
    """
    app_logger = logging.getLogger("sentistock")
    app_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    if not app_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(getattr(logging, level.upper(), logging.INFO))
        formatter = StructuredFormatter(datefmt="%Y-%m-%dT%H:%M:%S%z")
        handler.setFormatter(formatter)
        app_logger.addHandler(handler)
        app_logger.propagate = False

    return app_logger


logger = setup_logging()
