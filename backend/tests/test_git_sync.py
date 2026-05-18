import pytest
from unittest.mock import patch, MagicMock
from backend.services.git_sync import (
    get_head_commit,
    get_changes_since,
    get_all_cpp_files,
    get_cpp_file_count,
    get_changed_cpp_files,
)


class TestGetHeadCommit:
    @patch("backend.services.git_sync._run_git")
    def test_get_head_commit_success(self, mock_run_git):
        mock_run_git.return_value = "abc123def456\n"
        result = get_head_commit(".")
        assert result == "abc123def456"
        mock_run_git.assert_called_once_with(["rev-parse", "HEAD"], cwd=".")

    @patch("backend.services.git_sync._run_git")
    def test_get_head_commit_failure(self, mock_run_git):
        from subprocess import CalledProcessError
        mock_run_git.side_effect = CalledProcessError(1, "git")
        result = get_head_commit(".")
        assert result is None


class TestGetChangesSince:
    @patch("backend.services.git_sync._run_git")
    def test_get_changes_since_with_base(self, mock_run_git):
        # First call: name-status
        # Second call: stat
        mock_run_git.side_effect = [
            "A\tnew_file.c\nM\tmodified_file.cpp\nD\tdeleted_file.h\n",
            "new_file.c | 10 ++++++-----\nmodified_file.cpp | 5 ++---\n",
        ]
        result = get_changes_since(".", "base_commit")
        assert result["added_files"] == 1
        assert result["modified_files"] == 1
        assert result["deleted_files"] == 1
        assert result["added_file_list"] == ["new_file.c"]
        assert result["modified_file_list"] == ["modified_file.cpp"]
        assert result["deleted_file_list"] == ["deleted_file.h"]
        assert result["changed_lines"] == 16  # 6+ + 5- from first file, 2+ + 3- from second

    @patch("backend.services.git_sync._run_git")
    def test_get_changes_since_no_base(self, mock_run_git):
        result = get_changes_since(".", None)
        assert result["added_files"] == 0
        assert result["modified_files"] == 0
        assert result["deleted_files"] == 0
        assert result["changed_lines"] == 0
        mock_run_git.assert_not_called()

    @patch("backend.services.git_sync._run_git")
    def test_get_changes_since_git_failure(self, mock_run_git):
        from subprocess import CalledProcessError
        mock_run_git.side_effect = CalledProcessError(1, "git")
        result = get_changes_since(".", "base_commit")
        assert result["added_files"] == 0
        assert result["modified_files"] == 0
        assert result["deleted_files"] == 0


class TestGetAllCppFiles:
    @patch("pathlib.Path.rglob")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.is_dir")
    def test_get_all_cpp_files(self, mock_is_dir, mock_exists, mock_rglob):
        # Create mock path objects
        def make_mock_path(name, parts):
            p = MagicMock()
            p.name = name
            p.parts = parts
            p.relative_to.return_value = p
            p.__str__ = lambda self: name
            return p

        mock_paths = [
            make_mock_path("test.c", ("src", "test.c")),
            make_mock_path("test.cpp", ("src", "test.cpp")),
            make_mock_path("test.h", ("include", "test.h")),
            make_mock_path("build.o", ("build", "build.o")),  # Should be skipped
        ]
        mock_rglob.return_value = mock_paths[:3]  # build.o excluded by extension
        mock_exists.return_value = True
        mock_is_dir.return_value = True

        with patch("backend.services.git_sync.Path") as MockPath:
            MockPath.return_value.resolve.return_value = MockPath.return_value
            MockPath.return_value.rglob = mock_rglob
            result = get_all_cpp_files(".")
            assert len(result) == 3
            assert "test.c" in result
            assert "test.cpp" in result
            assert "test.h" in result


class TestGetCppFileCount:
    @patch("backend.services.git_sync.get_all_cpp_files")
    def test_get_cpp_file_count(self, mock_get_all):
        mock_get_all.return_value = ["a.c", "b.cpp", "c.h"]
        assert get_cpp_file_count(".") == 3


class TestGetChangedCppFiles:
    @patch("backend.services.git_sync._run_git")
    def test_get_changed_cpp_files(self, mock_run_git):
        mock_run_git.return_value = "src/file.c\nsrc/file.py\nsrc/file.cpp\n"
        result = get_changed_cpp_files(".", "base_commit")
        assert result == ["src/file.c", "src/file.cpp"]
        mock_run_git.assert_called_once()
