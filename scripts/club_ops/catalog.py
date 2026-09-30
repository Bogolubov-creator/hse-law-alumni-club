import asyncio
import json
import math
import re
from importlib.resources import files
from pathlib import Path
from types import SimpleNamespace

import httpx

from club_api.core.models import slugify
from club_api.modules.catalog.sync import ACTUAL_URL, ALL_URL, DOCUMENTS, collect, label, map_item
from club_ops.bootstrap import OperatorError

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "packages/shared/src/dpo-catalog.json"


def read_catalog():
    resource = files("club_ops").joinpath("data/catalog.json")
    return json.loads(
        resource.read_text(encoding="utf-8") if resource.is_file() else CATALOG.read_text(encoding="utf-8")
    )


def retain_copy(incoming, previous):
    if not previous or not incoming.get("hse_id") or previous.get("hse_id") != incoming["hse_id"]:
        return incoming
    return {
        **incoming,
        **{
            key: previous[key]
            for key in ("description", "tagline", "audience", "results", "advantages")
            if previous.get(key) is not None
        },
    }


def to_bot(program):
    keywords = [program[key] for key in ("description", "tagline") if program.get(key)]
    for module in program.get("modules") or []:
        keywords.extend([module["title"], *module.get("points", [])])
    return {
        "id": program.get("hse_id") or program["slug"],
        "title": program["title"],
        "url": "/dpo/" + program["slug"],
        "sphere": program["direction"],
        "type": "ПП" if "переподготов" in program.get("document", "") else "ПК",
        "format": program["format"],
        "formatLabel": program["format"],
        "price": math.floor(program["price"] / 100 + 0.5),
        "duration": program.get("duration"),
        "start": "Старт: " + program["dates"]["start"] if program.get("dates") else None,
        "startIso": None,
        "keywords": keywords,
    }


def write_catalog(programs):
    if not CATALOG.is_file():
        raise OperatorError("Импорт каталога запускается из checkout репозитория")
    programs.sort(key=lambda program: program["title"].casefold().replace("ё", "е"))
    for path, data in (
        (CATALOG, programs),
        (ROOT / "frontend/public/content/bot-catalog.json", {"programs": [to_bot(program) for program in programs]}),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)


def map_program(raw, index, photos):
    card = map_item(raw)
    if not card:
        raise OperatorError("Источник содержит некорректную программу")
    id, title, type = card["hseId"], card["title"], card["type"]
    price = raw.get("educationPricing") if raw.get("educationPricing") is not None else raw.get("discountPrice", 0)
    if not isinstance(price, int | float) or not math.isfinite(price) or price < 0 or price * 100 > 9007199254740991:
        raise OperatorError("Некорректная цена программы")
    slug = re.sub(r"\.html?$", "", (index.get("url") or "").removeprefix("programs/"), flags=re.I).strip()
    slug = slug or slugify(title) + "-" + id
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", slug):
        raise OperatorError("Некорректный адрес программы")
    result = {
        "slug": slug,
        "title": title,
        "direction": index.get("sphere") or label(raw.get("type")) or type,
        "format": card["format"],
        "duration": card["duration"] or "уточняется",
        "price": math.floor(price + 0.5) * 100,
        "document": DOCUMENTS[type],
        "enrollment": "nonactual" if raw.get("locked") is True else "actual",
        "cover": None,
        "hse_id": id,
    }
    start = card["start"]
    if start:
        result["dates"] = {"start": start.removesuffix(" г.")}
    for key, value in {
        "description": raw.get("about") or raw.get("tagline"),
        "tagline": raw.get("tagline"),
        "source_url": raw.get("url"),
        "audience": (raw.get("audience") or {}).get("items"),
        "results": raw.get("results"),
        "advantages": raw.get("advantages"),
    }.items():
        if value:
            result[key] = value.strip() if isinstance(value, str) else value
    modules = [
        {"title": str(module["title"]), "hours": module.get("hours") or 0, "points": module.get("topics") or []}
        for module in raw.get("modules") or []
        if module.get("title")
    ]
    if modules:
        result["modules"] = modules
    teachers = []
    for teacher in raw.get("teachers") or []:
        if not teacher.get("name"):
            continue
        role = (teacher.get("about") or "Преподаватель").strip()
        item = {"name": teacher["name"], "role": role if len(role) <= 480 else role[:479].rstrip() + "…"}
        if teacher["name"] in photos:
            item["photo"] = photos[teacher["name"]]
        teachers.append(item)
    if teachers:
        result["teachers"] = teachers
    return result


def safe_relative(value):
    value = value.lstrip("/")
    if (
        not value
        or any(part in (".", "..", "") for part in value.split("/"))
        or not re.fullmatch(r"[A-Za-z0-9_./-]+", value)
    ):
        raise OperatorError("Некорректный путь изображения в источнике")
    return value


async def fetch_bytes(client, url, *, optional=False):
    async with client.stream("GET", url) as response:
        if optional and response.status_code == 404:
            return None
        if not response.is_success:
            raise OperatorError(f"Источник импорта завершился с HTTP {response.status_code}")
        parts, size = [], 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > 16 * 1024 * 1024:
                raise OperatorError("Ответ источника превышает 16 MiB")
            parts.append(chunk)
        return b"".join(parts)


async def import_catalog(values):
    repo = values.get("DPO_MIRROR_REPO", "itspecR/dpo-pravo-hse")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise OperatorError("Некорректный DPO_MIRROR_REPO")
    base = "https://raw.githubusercontent.com/" + repo + "/main/"
    previous = {program.get("hse_id"): program for program in read_catalog()}
    async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
        catalog = json.loads(await fetch_bytes(client, base + ".catalog-data.json"))
        index = {
            str(program["id"]): program
            for program in json.loads(await fetch_bytes(client, base + "content/programs-index.json"))["programs"]
        }
        if len(catalog.get("programs", [])) < 3:
            raise OperatorError("Источник вернул менее трёх программ; импорт отменён")
        photos = {}
        for name, relative in (catalog.get("teacherPhotos") or {}).items():
            relative = safe_relative(relative)
            filename = Path(relative).name
            if not re.search(r"\.(?:jpg|jpeg|png|webp)$", filename, re.I):
                raise OperatorError("Некорректный тип фото преподавателя")
            data = await fetch_bytes(client, base + relative, optional=True)
            if data:
                path = ROOT / "frontend/public/assets/teachers" / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(path.write_bytes, data)
                photos[name] = "/assets/teachers/" + filename
        programs = []
        for raw in catalog["programs"]:
            id = str(raw.get("id", ""))
            if not re.fullmatch(r"[0-9]+", id):
                raise OperatorError("Некорректный идентификатор программы")
            program = retain_copy(map_program(raw, index.get(id, {}), photos), previous.get(id))
            if raw.get("image"):
                relative = safe_relative(raw["image"])
                ext = "webp" if relative.lower().endswith(".webp") else "jpg"
                data = await fetch_bytes(client, base + relative, optional=True)
                if data:
                    path = ROOT / "frontend/public/assets/programs" / (id + "." + ext)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    await asyncio.to_thread(path.write_bytes, data)
                    program["cover"] = "/assets/programs/" + path.name
                thumb = await fetch_bytes(client, base + "images/programs/thumbs/" + id + ".jpg", optional=True)
                if thumb:
                    path = ROOT / "frontend/public/assets/programs/thumbs" / (id + ".jpg")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    await asyncio.to_thread(path.write_bytes, thumb)
            programs.append(program)
        write_catalog(programs)
    print(f"Каталог импортирован: {len(programs)} программ")


async def refresh_enrollment(values):
    async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
        state = SimpleNamespace(client=client)
        actual, all_cards = (
            await collect(state, values.get("HSE_DPO_URL") or ACTUAL_URL),
            await collect(state, values.get("HSE_DPO_ALL_URL") or ALL_URL),
        )
    if len(actual) < 3 or len(all_cards) < len(actual):
        raise OperatorError("Источник вернул неполный каталог; обновление отменено")
    actual_ids = {card["hseId"] for card in actual}
    all_ids = {card["hseId"] for card in all_cards}
    programs = read_catalog()
    existing_ids, slugs = {program.get("hse_id") for program in programs}, {program["slug"] for program in programs}
    for program in programs:
        if program.get("hse_id"):
            program["enrollment"] = "actual" if program["hse_id"] in actual_ids & all_ids else "nonactual"
    for card in all_cards:
        if card["hseId"] in existing_ids:
            continue
        slug = slugify(card["title"].split(" / ")[0])
        if card["hseId"] not in slug:
            slug += "-" + card["hseId"]
        while slug in slugs:
            slug += "-x"
        slugs.add(slug)
        program = {
            "slug": slug,
            "title": card["title"].split(" / ")[0].strip(),
            "direction": card["category"] or "Право",
            "format": card["format"],
            "duration": card["duration"] or "уточняется",
            "price": card["priceKop"],
            "document": DOCUMENTS[card["type"]],
            "enrollment": "actual" if card["hseId"] in actual_ids else "nonactual",
            "source_url": card["url"],
            "hse_id": card["hseId"],
            "cover": None,
        }
        if card["start"]:
            program["dates"] = {"start": card["start"]}
        programs.append(program)
    write_catalog(programs)
    print(f"Набор обновлён: {len(programs)} программ, актуальных {len(actual_ids)}")
