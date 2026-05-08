from __future__ import annotations

from backend.app.models import ResumeProfile


DEFAULT_PROFILE = ResumeProfile(
    target_titles=(
        "software engineer intern",
        "software developer intern",
        "technology intern",
        "graduate developer",
        "junior developer",
        "systems development engineer",
    ),
    preferred_locations=(
        "sydney",
        "nsw",
        "remote",
        "australia",
    ),
    skills=(
        "python",
        "sql",
        "c",
        "git",
        "github",
        "linux",
        "docker",
        "data structures",
        "algorithms",
        "database",
        "computer networks",
        "embedded",
        "stm32",
        "testing",
        "technical reporting",
    ),
    strong_keywords=(
        "software",
        "developer",
        "intern",
        "graduate",
        "technology",
        "systems",
        "python",
        "sql",
    ),
    stretch_keywords=(
        "ai",
        "cloud",
        "aws",
        "fastapi",
        "react",
        "typescript",
    ),
)
