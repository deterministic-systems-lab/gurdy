"""Load policy/controls.json for classify and pack.py.

This file is the mapper half of the pack: Cedar globs and named shell
commands live in controls.json so the pack author does not edit classify.py and
the adapter author does not edit pack.cedar by hand.
"""

from __future__ import annotations

import fnmatch
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from root import repo_root

# First-word wrappers so `sudo curl` / `/usr/bin/wget` still hit an alias.
_WRAPPERS = {
    "sudo",
    "env",
    "command",
    "nice",
    "nohup",
    "time",
    "stdbuf",
    "busybox",
}

ROOT = repo_root()
CONTROLS_PATH = ROOT / "policy" / "controls.json"

_URL_IN_CMD = re.compile(r"https?://[^\s;|&`'\"<>]+", re.IGNORECASE)


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    return json.loads(CONTROLS_PATH.read_text(encoding="utf-8"))


def reload() -> dict[str, Any]:
    load.cache_clear()
    return load()


def save(doc: dict[str, Any]) -> None:
    CONTROLS_PATH.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    load.cache_clear()


def path_matches_globs(path: str, globs: list[str]) -> bool:
    path = path.strip()
    if len(path) > 1:
        path = path.rstrip("/")
    if not path:
        return False
    for glob in globs:
        if fnmatch.fnmatch(path, glob):
            return True
        # Cedar like "*/.ssh/*" should also match a bare ~/.ssh/id_rsa after expand.
        if glob.startswith("*/") and fnmatch.fnmatch(path, glob[2:]):
            return True
    return False


def credential_globs() -> list[str]:
    return [e["glob"] for e in load().get("credential_paths") or [] if e.get("glob")]


def write_globs() -> list[str]:
    return [e["glob"] for e in load().get("write_paths") or [] if e.get("glob")]


def is_credential_path(path: str) -> bool:
    return path_matches_globs(path, credential_globs())


def destructive_shell_re() -> re.Pattern[str]:
    names: list[str] = []
    for e in load().get("destructive_tools") or []:
        if not e.get("shell"):
            continue
        value = str(e.get("value") or "")
        if e.get("op") == "eq":
            names.append(re.escape(value))
        elif e.get("op") == "like" and value.endswith("*"):
            names.append(re.escape(value[:-1]) + r"\w*")
        elif value:
            names.append(re.escape(value.rstrip("*")))
    names.sort(key=len, reverse=True)
    if not names:
        names = ["rm"]
    return re.compile(
        r"(?:^|[;&|\n]\s*)(" + "|".join(names) + r")\b",
        re.IGNORECASE,
    )


def shell_aliases() -> list[dict[str, Any]]:
    return list(load().get("shell_aliases") or [])


def _shell_leaders(command: str) -> list[str]:
    """Basename of each simple-command's first real word (after sudo/env)."""
    leaders: list[str] = []
    for chunk in re.split(r"[;&|\n]", command):
        toks = chunk.split()
        i = 0
        while i < len(toks) and "=" in toks[i] and not toks[i].startswith("-"):
            i += 1
        while i < len(toks):
            name = Path(toks[i]).name.lower()
            if name == "env":
                i += 1
                while i < len(toks) and (
                    toks[i].startswith("-") or ("=" in toks[i] and not toks[i].startswith("="))
                ):
                    i += 1
                continue
            if name in _WRAPPERS:
                i += 1
                while i < len(toks) and toks[i].startswith("-"):
                    i += 1
                continue
            leaders.append(Path(toks[i]).name)
            break
    return leaders


def alias_for_command(command: str) -> dict[str, Any] | None:
    """First matching named shell command (curl, wget, /usr/bin/nc, sudo curl)."""
    aliases = {
        str(a.get("command") or "").strip().lower(): a
        for a in shell_aliases()
        if a.get("command")
    }
    for word in _shell_leaders(command):
        hit = aliases.get(word.lower())
        if hit:
            return hit
    return None


def first_url(command: str) -> str:
    m = _URL_IN_CMD.search(command)
    return m.group(0) if m else ""


def forbid_tool_names() -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for alias in shell_aliases():
        if not alias.get("forbid"):
            continue
        tool = str(alias.get("tool") or "").strip().lower()
        if tool and tool not in seen:
            seen.add(tool)
            names.append(tool)
    return names
