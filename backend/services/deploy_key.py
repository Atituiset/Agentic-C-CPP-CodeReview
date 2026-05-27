"""Generate and manage the backend's SSH deploy key pair."""
import os
from pathlib import Path

DEPLOY_KEY_DIR = Path.home() / ".opencode" / "keys"
PRIVATE_KEY_PATH = DEPLOY_KEY_DIR / "deploy_key"
PUBLIC_KEY_PATH = DEPLOY_KEY_DIR / "deploy_key.pub"


def ensure_deploy_key() -> str:
    """Generate Ed25519 deploy key pair if not exists. Return public key string."""
    if PUBLIC_KEY_PATH.exists():
        return PUBLIC_KEY_PATH.read_text().strip()

    DEPLOY_KEY_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)

    # Generate using ssh-keygen for compatibility with asyncssh
    os.system(
        f'ssh-keygen -t ed25519 -f {PRIVATE_KEY_PATH} -N "" '
        f'-C "opencode-deploy@{os.uname().nodename}" 2>/dev/null'
    )
    os.chmod(PRIVATE_KEY_PATH, 0o600)

    if not PUBLIC_KEY_PATH.exists():
        raise RuntimeError("Failed to generate deploy key pair")

    return PUBLIC_KEY_PATH.read_text().strip()


def get_private_key_path() -> Path:
    """Return path to deploy private key."""
    return PRIVATE_KEY_PATH


def get_public_key() -> str:
    """Return deploy public key string."""
    return ensure_deploy_key()
