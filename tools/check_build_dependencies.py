#!/usr/bin/env python3
"""Fail closed when a Python build import lacks an installed/pinned requirement.

Read-only preflight: parses all tools/*.py imports, verifies third-party modules
are declared in requirements-build.txt and importable. It does not contact any
Supabase API, deploy a site, or modify source files.
"""
from __future__ import annotations

import ast
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'tools'
REQUIREMENTS = ROOT / 'requirements-build.txt'
# Distribution name differs from the import name.
DIST_BY_IMPORT = {'bs4': 'beautifulsoup4'}


def requirement_names(path: Path) -> set[str]:
    installed = set()
    for number, raw in enumerate(path.read_text('utf-8').splitlines(), 1):
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        match = re.fullmatch(r'([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+-]+)', line)
        if not match:
            raise ValueError(f'{path.name}:{number}: pin packages using name==version')
        name = match.group(1).lower().replace('_', '-')
        if name in installed:
            raise ValueError(f'Duplicate dependency: {name}')
        installed.add(name)
    return installed


def check() -> bool:
    failures = []
    if not REQUIREMENTS.is_file():
        print('FAIL | Missing requirements-build.txt', file=sys.stderr)
        return False
    try:
        declared = requirement_names(REQUIREMENTS)
    except (OSError, ValueError) as exc:
        print('FAIL | Invalid Python requirements: ' + str(exc), file=sys.stderr)
        return False
    scripts = sorted(TOOLS.glob('*.py'))
    if not scripts:
        print('FAIL | No Python build tools found', file=sys.stderr)
        return False
    seen_external = set()
    for script in scripts:
        try:
            tree = ast.parse(script.read_text('utf-8'), filename=script.name)
        except (OSError, SyntaxError) as exc:
            failures.append(f'{script.name}: invalid Python source: {exc}')
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and not node.level:
                modules = [node.module] if node.module else []
            else:
                continue
            for module in modules:
                name = module.split('.', 1)[0]
                if name in sys.stdlib_module_names or name in sys.builtin_module_names:
                    continue
                if (TOOLS / f'{name}.py').is_file() or (TOOLS / name / '__init__.py').is_file():
                    continue
                seen_external.add(name)
    for module in sorted(seen_external):
        distribution = DIST_BY_IMPORT.get(module)
        if distribution is None:
            failures.append(f'{module}: unknown third-party import; add distribution mapping and pin')
            continue
        if distribution not in declared:
            failures.append(f'{module}: missing {distribution} pin in requirements-build.txt')
            continue
        try:
            spec = importlib.util.find_spec(module)
        except (ImportError, ValueError) as exc:
            failures.append(f'{module}: unavailable: {exc}')
        else:
            if spec is None:
                failures.append(f'{module}: ModuleNotFoundError (required by Python build)')
    # Actual import catches broken/transitively missing installations that
    # importlib.util.find_spec alone would not detect.
    if 'bs4' in seen_external and not failures:
        try:
            from bs4 import BeautifulSoup
            if BeautifulSoup('<p>AESH</p>', 'html.parser').p.text != 'AESH':
                failures.append('BeautifulSoup parse smoke test failed')
        except (ImportError, AttributeError) as exc:
            failures.append(f'BeautifulSoup cannot import/parse: {exc}')
    if failures:
        for failure in failures:
            print('FAIL | ' + failure, file=sys.stderr)
        return False
    print('PASS | Audited', len(scripts), 'Python tools;',
          'external imports:', ', '.join(sorted(seen_external)) or '(none)')
    print('PASS | Declared third-party imports resolve; BeautifulSoup import/parse works')
    return True


if __name__ == '__main__':
    sys.exit(0 if check() else 1)
