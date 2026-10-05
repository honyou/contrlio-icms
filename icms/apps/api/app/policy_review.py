"""Regulation context selection and validation for AI policy reviews."""

from __future__ import annotations

import json
import re
from typing import Any


GENERAL_LAW_IDS = {"company-law", "personal-info", "data-security", "accounting-law"}
MAX_REVIEW_REGULATIONS = 15


def select_review_regulations(library: dict, policy_text: str) -> list[dict]:
    """Select a small, company-industry-scoped set from the curated law index."""
    industry = library.get("current_industry_key", "general-enterprise")
    normalized = policy_text.casefold()
    scored: list[tuple[int, int, dict]] = []
    for order, law in enumerate(library.get("regulations", [])):
        if law.get("country_code", "CN") != library.get("current_country_code", "CN"):
            continue
        if industry not in law.get("industry_keys", []):
            continue
        phrases = [law.get("title", ""), law.get("category", ""), law.get("summary", "")]
        phrases.extend(law.get("process_tags", []))
        phrases.extend(law.get("obligations", []))
        matches = sum(1 for phrase in phrases if len(phrase.strip()) >= 2 and phrase.casefold() in normalized)
        score = matches * 5
        if law.get("id") in GENERAL_LAW_IDS:
            score += 2
        # Prefer industry-specific references when document wording is sparse.
        if len(law.get("industry_keys", [])) < len(library.get("industries", [])):
            score += 1
        scored.append((score, -order, law))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [row[2] for row in scored[:MAX_REVIEW_REGULATIONS]]


def normalize_policy_analysis(answer: str, laws: list[dict], policy_text: str) -> dict[str, Any]:
    """Validate model output and resolve citations only to known index entries."""
    law_by_id = {str(law["id"]): law for law in laws}
    parsed = _parse_json(answer)
    recovered = False
    if not isinstance(parsed, dict):
        parsed = _recover_partial_json(answer)
        recovered = isinstance(parsed, dict)
    if not isinstance(parsed, dict):
        structured = answer.lstrip().startswith(("{", "```json", "```JSON"))
        return {
            "summary": "模型没有生成完整报告，请重新分析。" if structured else "AI 返回了文字内容，请按下方报告人工阅读。",
            "overall_severity": "unknown",
            "findings": [],
            "positive_controls": [],
            "open_questions": [],
            # Keep genuine prose available, but never show broken JSON as a code dump.
            "raw_report": None if structured else answer[:20_000],
            "format_warning": "模型输出未能完整解析，建议重新分析；法规来源仍以本地法规索引为准。",
        }

    findings = []
    for item in parsed.get("findings", [])[:12] if isinstance(parsed.get("findings"), list) else []:
        if not isinstance(item, dict):
            continue
        excerpt = _limited_text(item.get("policy_excerpt"), 500)
        if excerpt and _compact(excerpt) not in _compact(policy_text):
            excerpt = ""
        ids = item.get("law_ids", [])
        if not isinstance(ids, list):
            ids = []
        citations = [
            {"id": law_id, "title": law_by_id[law_id]["title"], "authority": law_by_id[law_id]["authority"],
             "source_url": law_by_id[law_id]["source_url"], "scope_note": law_by_id[law_id]["scope_note"]}
            for law_id in dict.fromkeys(str(value) for value in ids)
            if law_id in law_by_id
        ]
        findings.append({
            "title": _limited_text(item.get("title"), 180) or "待核实风险点",
            "severity": item.get("severity") if item.get("severity") in {"high", "medium", "low"} else "medium",
            "policy_excerpt": excerpt,
            "risk": _limited_text(item.get("risk"), 1600),
            "regulatory_gap": _limited_text(item.get("regulatory_gap"), 1600),
            "recommendation": _limited_text(item.get("recommendation"), 2000),
            "confidence": item.get("confidence") if item.get("confidence") in {"high", "medium", "low"} else "low",
            "law_references": citations,
        })

    raw_positive = parsed.get("positive_controls", [])
    raw_questions = parsed.get("open_questions", [])
    return {
        "summary": _limited_text(parsed.get("summary"), 4000) or "未生成总体结论。",
        "overall_severity": parsed.get("overall_severity") if parsed.get("overall_severity") in {"high", "medium", "low", "unknown"} else "unknown",
        "findings": findings,
        "positive_controls": [_limited_text(value, 500) for value in raw_positive[:8] if isinstance(value, str)] if isinstance(raw_positive, list) else [],
        "open_questions": [_limited_text(value, 500) for value in raw_questions[:8] if isinstance(value, str)] if isinstance(raw_questions, list) else [],
        "raw_report": None,
        "format_warning": "模型输出未完整结束，已整理可识别内容；如需完整报告，建议重新分析。" if recovered else None,
    }


def _parse_json(answer: str) -> Any:
    candidate = answer.strip().lstrip("\ufeff")
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE)
    try:
        parsed = json.loads(candidate)
        return json.loads(parsed) if isinstance(parsed, str) else parsed
    except (TypeError, ValueError):
        pass

    # Providers sometimes add a short preamble or trailing text. Extract the
    # first complete JSON object without letting braces inside strings confuse it.
    start = candidate.find("{")
    if start < 0:
        return None
    end = _matching_object_end(candidate, start)
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


def _recover_partial_json(answer: str) -> dict[str, Any] | None:
    """Recover complete top-level fields and findings from a truncated JSON answer."""
    candidate = answer.strip().lstrip("\ufeff")
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
    recovered: dict[str, Any] = {}
    summary = _partial_string_property(candidate, "summary")
    severity = _partial_string_property(candidate, "overall_severity")
    if summary is not None:
        recovered["summary"] = summary
    if severity is not None:
        recovered["overall_severity"] = severity
    findings = _complete_objects_in_array(candidate, "findings")
    if findings:
        recovered["findings"] = findings
    if not recovered:
        return None
    recovered.setdefault("findings", [])
    recovered.setdefault("positive_controls", [])
    recovered.setdefault("open_questions", [])
    return recovered


def _partial_string_property(value: str, key: str) -> str | None:
    match = re.search(r'"' + re.escape(key) + r'"\s*:\s*"', value)
    if not match:
        return None
    start = match.end() - 1
    escaped = False
    for index in range(start + 1, len(value)):
        char = value[index]
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == '"':
            try:
                return json.loads(value[start:index + 1])
            except ValueError:
                return None
    return None


def _complete_objects_in_array(value: str, key: str) -> list[dict[str, Any]]:
    match = re.search(r'"' + re.escape(key) + r'"\s*:\s*\[', value)
    if not match:
        return []
    array_start = match.end()
    depth = 0
    object_start: int | None = None
    in_string = False
    escaped = False
    objects: list[dict[str, Any]] = []
    for index in range(array_start, len(value)):
        char = value[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                object_start = index
            depth += 1
        elif char == "}" and depth:
            depth -= 1
            if depth == 0 and object_start is not None:
                try:
                    item = json.loads(value[object_start:index + 1])
                except ValueError:
                    item = None
                if isinstance(item, dict):
                    objects.append(item)
                object_start = None
        elif char == "]" and depth == 0:
            break
    return objects


def _limited_text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", value)
