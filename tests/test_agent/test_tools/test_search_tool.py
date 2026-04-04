"""Tests for search_tool — verifies empty-result behavior and content joining."""
import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJyb2xlIjoic2VydmljZV9yb2xlIn0"
    ".fake_sig_for_tests_only",
)
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fakedb")
os.environ.setdefault("OPENAI_API_KEY", "sk-fake-key-for-tests")

from unittest.mock import patch
import pytest

from app.agent.tools.search_tool import make_search_tool


def test_search_tool_returns_empty_string_when_no_results():
    """Tool must return '' (not a Spanish string) when search_knowledge returns []."""
    make_search_tool.cache_clear()
    with patch("app.agent.tools.search_tool.search_knowledge", return_value=[]):
        tool = make_search_tool("tenant-empty-1")
        result = tool.invoke({"query": "precio"})
    assert result == ""


def test_search_tool_returns_empty_string_not_spanish_fallback():
    """No Spanish fallback message should appear when results are empty."""
    make_search_tool.cache_clear()
    with patch("app.agent.tools.search_tool.search_knowledge", return_value=[]):
        tool = make_search_tool("tenant-empty-2")
        result = tool.invoke({"query": "precio"})
    assert "No se encontró" not in result


def test_search_tool_joins_content_when_results_present():
    """Results must be joined with the separator '\\n\\n---\\n\\n'."""
    make_search_tool.cache_clear()
    fake_results = [
        {"content": "A", "source_filename": "a.pdf", "similarity": 0.9},
        {"content": "B", "source_filename": "b.pdf", "similarity": 0.8},
    ]
    with patch("app.agent.tools.search_tool.search_knowledge", return_value=fake_results):
        tool = make_search_tool("tenant-results-1")
        result = tool.invoke({"query": "precio"})
    assert result == "A\n\n---\n\nB"
