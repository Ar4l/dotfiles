import os
import shutil
import sys
from importlib.resources import files


def main() -> None:
    script = str(files(__name__) / "gcp-rescale")
    bash = shutil.which("bash") or "/bin/bash"
    # uv/pipx guarantee an interpreter for this wrapper but do not put it on
    # PATH for child processes — hand it to the script explicitly.
    os.environ.setdefault("GCP_RESCALE_PYTHON", sys.executable)
    os.execv(bash, [bash, script, *sys.argv[1:]])
