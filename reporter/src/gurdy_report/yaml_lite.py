"""Restricted YAML loader. Maps, lists, scalars. No tags, anchors, or merge.

The reporter has no runtime dependencies on purpose. This reads the subset
``control_map.yaml`` actually uses so a templating or YAML library cannot
stand between a ledger and a claim about it.
"""

from __future__ import annotations


class YAMLError(ValueError):
    """The document is not in the subset this loader accepts."""


def load(text: str) -> object:
    lines = _lines(text)
    if not lines:
        raise YAMLError("empty document")
    value, next_i = _parse_block(lines, 0, lines[0][0])
    if next_i != len(lines):
        indent, content, no = lines[next_i]
        raise YAMLError(f"line {no}: leftover content at indent {indent}: {content}")
    return value


def _lines(text: str) -> list[tuple[int, str, int]]:
    out: list[tuple[int, str, int]] = []
    for no, raw in enumerate(text.splitlines(), 1):
        if "\t" in raw:
            raise YAMLError(f"line {no}: tabs are not allowed")
        stripped = _strip_comment(raw).rstrip()
        if not stripped.strip():
            continue
        indent = len(stripped) - len(stripped.lstrip(" "))
        out.append((indent, stripped.strip(), no))
    return out


def _strip_comment(raw: str) -> str:
    out: list[str] = []
    quote = ""
    escape = False
    for ch in raw:
        if quote:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\" and quote == '"':
                escape = True
            elif ch == quote:
                quote = ""
            continue
        if ch in ('"', "'"):
            quote = ch
            out.append(ch)
            continue
        if ch == "#":
            break
        out.append(ch)
    if quote:
        raise YAMLError("unterminated quoted string")
    return "".join(out)


def _parse_block(
    lines: list[tuple[int, str, int]], i: int, indent: int
) -> tuple[object, int]:
    if i >= len(lines):
        raise YAMLError("expected a nested value")
    if lines[i][0] < indent:
        raise YAMLError(f"line {lines[i][2]}: expected indent {indent}")
    if lines[i][1].startswith("- "):
        return _parse_seq(lines, i, indent)
    return _parse_map(lines, i, indent)


def _parse_map(
    lines: list[tuple[int, str, int]], i: int, indent: int
) -> tuple[dict, int]:
    result: dict = {}
    while i < len(lines):
        ind, content, no = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise YAMLError(f"line {no}: unexpected indent {ind}")
        if content.startswith("- "):
            raise YAMLError(f"line {no}: sequence entry where a mapping key was expected")
        key, _, rest = content.partition(":")
        key = key.strip()
        if not key or rest == content:
            raise YAMLError(f"line {no}: expected 'key:'")
        rest = rest.strip()
        if rest:
            result[key] = _scalar(rest)
            i += 1
            continue
        if i + 1 >= len(lines) or lines[i + 1][0] <= indent:
            result[key] = {}
            i += 1
            continue
        child, i = _parse_block(lines, i + 1, lines[i + 1][0])
        result[key] = child
    return result, i


def _parse_seq(
    lines: list[tuple[int, str, int]], i: int, indent: int
) -> tuple[list, int]:
    result: list = []
    while i < len(lines):
        ind, content, no = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise YAMLError(f"line {no}: unexpected indent {ind}")
        if not content.startswith("- "):
            raise YAMLError(f"line {no}: expected a sequence entry")
        body = content[2:].strip()
        if not body:
            raise YAMLError(f"line {no}: empty sequence entry")
        if ":" in body and not body.startswith(("'", '"')):
            key, _, rest = body.partition(":")
            item: dict = {key.strip(): _scalar(rest.strip()) if rest.strip() else {}}
            i += 1
            while i < len(lines) and lines[i][0] > indent and not lines[i][1].startswith("- "):
                nested_indent = lines[i][0]
                extra, i = _parse_map(lines, i, nested_indent)
                overlap = set(item) & set(extra)
                if overlap:
                    raise YAMLError(f"line {no}: duplicated key {sorted(overlap)[0]}")
                item.update(extra)
            result.append(item)
            continue
        result.append(_scalar(body))
        i += 1
    return result, i


def _scalar(text: str) -> object:
    if text in ("true", "false"):
        return text == "true"
    if text in ("null", "~"):
        return None
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'"):
        inner = text[1:-1]
        if text[0] == '"':
            return bytes(inner, "utf-8").decode("unicode_escape")
        return inner
    if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
        return int(text)
    return text
