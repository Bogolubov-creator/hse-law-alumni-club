import json
from importlib.resources import files
from pathlib import Path


def shared_data(name):
    resource = files("club_api").joinpath(name)
    if resource.is_file():
        return json.loads(resource.read_text(encoding="utf-8"))
    source = Path(__file__).resolve().parents[2] / "data" / name
    return json.loads(source.read_text(encoding="utf-8"))
