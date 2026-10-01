import json
import sys


def check(config):
    services = config["services"]
    if services["api"].get("ports"):
        raise ValueError("API не должен публиковать порт на хосте")
    if any(str(services[name]["environment"]["SEED_DEMO"]).lower() != "false" for name in ("api", "bootstrap")):
        raise ValueError("SEED_DEMO должен быть выключен в рабочем примере")
    if services["api"]["environment"]["APP_ENV"] != services["bootstrap"]["environment"]["APP_ENV"]:
        raise ValueError("API и bootstrap должны использовать одинаковый APP_ENV")
    print("Compose: порт API закрыт, демоданные отключены, APP_ENV согласован")


if __name__ == "__main__":
    check(json.load(sys.stdin))
