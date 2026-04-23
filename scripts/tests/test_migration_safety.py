"""Tests for scripts/check-migration-safety.py."""

from __future__ import annotations

import importlib.util
import pathlib
import subprocess

import pytest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts/check-migration-safety.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_migration_safety", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


check_migration_safety = load_module()


def test_is_schema_impact_path_accepts_repository_and_db_paths():
    assert check_migration_safety.is_schema_impact_path(
        "app/server/src/infra/v2/prescriptions.repository.js"
    )
    assert check_migration_safety.is_schema_impact_path(
        "app/server/src/infra/db/run-migrations.js"
    )
    assert check_migration_safety.is_schema_impact_path(
        "app/server/src/infra/db/migrations/20260203_phase2_tables.js"
    )


def test_is_schema_impact_path_rejects_non_schema_paths():
    assert not check_migration_safety.is_schema_impact_path("app/server/src/core/v2/audit.service.js")
    assert not check_migration_safety.is_schema_impact_path("app/client/src/App.jsx")


def test_require_no_migration_exception_rejects_missing_rationale():
    pr_body = "- [x] Migration impact reviewed: no schema migration required\n"
    with pytest.raises(SystemExit):
        check_migration_safety.require_no_migration_exception(pr_body)


def test_require_no_migration_exception_accepts_checkbox_and_reason():
    pr_body = """
- [x] Migration impact reviewed: no schema migration required

Migration rationale: repository-only refactor, no schema shape change
"""
    check_migration_safety.require_no_migration_exception(pr_body)


def test_require_destructive_exception_accepts_ticket_and_rationale():
    pr_body = """
- [x] Destructive migration exception approved

Migration exception ticket: CHG-1234
Migration exception rationale: coordinated maintenance window with rollback script
"""
    check_migration_safety.require_destructive_exception(
        pr_body,
        ["app/server/src/infra/db/migrations/20260411_cleanup.js:10: table.dropColumn('legacy_field');"],
    )


def test_destructive_findings_detects_drop_column(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch):
    repo_root = tmp_path
    migration_path = repo_root / "app/server/src/infra/db/migrations/20260411_cleanup.js"
    migration_path.parent.mkdir(parents=True, exist_ok=True)
    migration_path.write_text(
        "exports.up = async function (knex) {\n"
        "  await knex.schema.alterTable('patients', (table) => {\n"
        "    table.dropColumn('legacy_field');\n"
        "  });\n"
        "};\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(check_migration_safety, "REPO_ROOT", repo_root)
    monkeypatch.setattr(check_migration_safety, "MIGRATIONS_DIR", migration_path.parent)

    findings = check_migration_safety.destructive_findings(
        ["app/server/src/infra/db/migrations/20260411_cleanup.js"]
    )

    assert findings == [
        "app/server/src/infra/db/migrations/20260411_cleanup.js:3: table.dropColumn('legacy_field');"
    ]


def test_repository_change_requires_migration_review_ignores_query_builder_syntax_only(
    monkeypatch: pytest.MonkeyPatch,
):
    diff_output = """diff --git a/app/server/src/infra/v2/exportJobs.repository.js b/app/server/src/infra/v2/exportJobs.repository.js
@@ -1 +1 @@
-    const row = await withSchema(trx)('export_jobs').where({ id }).first();
+    const row = await withSchema(trx).from('export_jobs').where({ id }).first();
"""

    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(args=args[0], returncode=0, stdout=diff_output, stderr="")

    monkeypatch.setattr(check_migration_safety.subprocess, "run", fake_run)

    assert not check_migration_safety.repository_change_requires_migration_review(
        "app/server/src/infra/v2/exportJobs.repository.js",
        "origin/main",
        "HEAD",
    )


def test_repository_change_requires_migration_review_flags_schema_token_delta(
    monkeypatch: pytest.MonkeyPatch,
):
    diff_output = """diff --git a/app/server/src/infra/v2/exportJobs.repository.js b/app/server/src/infra/v2/exportJobs.repository.js
@@ -1 +1 @@
-      .where({ idempotency_key: idempotencyKey })
+      .where({ export_request_key: idempotencyKey })
"""

    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(args=args[0], returncode=0, stdout=diff_output, stderr="")

    monkeypatch.setattr(check_migration_safety.subprocess, "run", fake_run)

    assert check_migration_safety.repository_change_requires_migration_review(
        "app/server/src/infra/v2/exportJobs.repository.js",
        "origin/main",
        "HEAD",
    )
