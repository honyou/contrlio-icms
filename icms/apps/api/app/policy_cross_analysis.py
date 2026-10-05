"""Validation and normalization for AI cross-policy and workflow reviews."""

from __future__ import annotations

import json
import re
from typing import Any


def normalize_cross_analysis(
    answer: str,
    policy_texts: dict[str, str],
    processes: dict[str, dict],
) -> dict[str, Any]:
    """Keep only structured findings grounded in the submitted source set."""
    parsed = _parse_json(answer)
    if not isinstance(parsed, dict):
        return {
            "summary": "模型没有生成可读取的结构化报告，请重新分析。",
            "overall_severity": "unknown", "conflicts": [], "quick_wins": [],
            "open_questions": [], "format_warning": "未保存无法校验来源的模型原始输出。",
        }

    conflicts = []
    for raw in parsed.get("conflicts", [])[:16] if isinstance(parsed.get("conflicts"), list) else []:
        if not isinstance(raw, dict):
            continue
        refs = []
        seen_refs: set[tuple[str, str]] = set()
        for value in raw.get("source_refs", []) if isinstance(raw.get("source_refs"), list) else []:
            if not isinstance(value, dict):
                continue
            source_type = value.get("source_type")
            if source_type not in ("policy", "process"):
                continue
            source_id = str(value.get("source_id", ""))
            key = (source_type, source_id)
            if key in seen_refs:
                continue
            if source_type == "policy" and source_id in policy_texts:
                refs.append({"source_type": "policy", "source_id": source_id})
                seen_refs.add(key)
            elif source_type == "process" and source_id in processes:
                refs.append({"source_type": "process", "source_id": source_id})
                seen_refs.add(key)
        if not refs:
            continue

        evidence = []
        for value in raw.get("evidence", []) if isinstance(raw.get("evidence"), list) else []:
            if not isinstance(value, dict):
                continue
            source_type = value.get("source_type")
            if source_type not in ("policy", "process"):
                continue
            source_id = str(value.get("source_id", ""))
            excerpt = _limited_text(value.get("excerpt"), 360)
            source = policy_texts.get(source_id) if source_type == "policy" else (
                _flatten_text(processes.get(source_id, {})) if source_type == "process" and source_id in processes else None
            )
            if source is None or not excerpt or _compact(excerpt) not in _compact(source):
                continue
            evidence.append({"source_type": source_type, "source_id": source_id, "excerpt": excerpt})

        conflicts.append({
            "title": _limited_text(raw.get("title"), 180) or "待核实的一致性问题",
            "conflict_type": raw.get("conflict_type") if isinstance(raw.get("conflict_type"), str) and raw.get("conflict_type") in {
                "policy_policy", "policy_process", "process_process", "policy_gap", "process_gap"
            } else "policy_policy",
            "severity": raw.get("severity") if isinstance(raw.get("severity"), str) and raw.get("severity") in {"high", "medium", "low"} else "medium",
            "confidence": raw.get("confidence") if isinstance(raw.get("confidence"), str) and raw.get("confidence") in {"high", "medium", "low"} else "low",
            "source_refs": refs,
            "evidence": evidence[:4],
            "conflict_reason": _limited_text(raw.get("conflict_reason"), 1800),
            "risk": _limited_text(raw.get("risk"), 1800),
            "recommendation": _limited_text(raw.get("recommendation"), 2000),
            "suggested_resolution": _limited_text(raw.get("suggested_resolution"), 2000),
        })

    return {
        "summary": _limited_text(parsed.get("summary"), 4000) or "未生成总体结论。",
        "overall_severity": parsed.get("overall_severity") if isinstance(parsed.get("overall_severity"), str) and parsed.get("overall_severity") in {"high", "medium", "low", "unknown"} else "unknown",
        "conflicts": conflicts,
        "quick_wins": [_limited_text(value, 500) for value in parsed.get("quick_wins", [])[:8] if isinstance(value, str)] if isinstance(parsed.get("quick_wins"), list) else [],
        "open_questions": [_limited_text(value, 500) for value in parsed.get("open_questions", [])[:8] if isinstance(value, str)] if isinstance(parsed.get("open_questions"), list) else [],
        "format_warning": None,
    }


def _parse_json(answer: str) -> Any:
    candidate = answer.strip().lstrip("\ufeff")
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE)
    try:
        parsed = json.loads(candidate)
        return json.loads(parsed) if isinstance(parsed, str) else parsed
    except (TypeError, ValueError):
        start = candidate.find("{")
        end = _matching_object_end(candidate, start) if start >= 0 else None
        if end is None:
            return None
        try:
            return json.loads(candidate[start:end + 1])
        except ValueError:
            return None


def _matching_object_end(value: str, start: int) -> int | None:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(value)):
        char = value[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    return None


def _limited_text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join([*(str(key) for key in value.keys()), *(_flatten_text(item) for item in value.values())])
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return str(value) if value is not None else ""
