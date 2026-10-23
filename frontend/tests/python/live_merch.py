import json
import os
from pathlib import Path

from playwright.sync_api import expect


def merch_publication(office, visitor, request, headers, name, directory):
    evidence = Path(os.environ.get("E2E_MERCH_EVIDENCE_DIR", directory)) / ("merch-" + name)
    evidence.mkdir(parents=True, exist_ok=True)
    before = request.get("/api/admin/products", headers=headers)
    assert before.status == 200
    original_ids = {row["id"] for row in before.json()}
    stages = []
    title = "Тестовое худи клуба " + name
    description = "Тестовая позиция для проверки публикации, изменения и удаления."
    images = ["/assets/merch-hoodie.webp"]
    variants = [
        {"sku": "qa-M-" + name, "size": "M", "color": "Графит", "stock": 3},
        {"sku": "qa-L-" + name, "size": "L", "color": "Графит", "stock": 2},
    ]
    office.goto("/admin/products")
    office.get_by_text("Создать запись", exact=True).click()
    form = office.locator('form[data-api="/admin/products"]')
    for key, value in {
        "title": title,
        "category": "Одежда",
        "price": "129900",
        "stock": "5",
        "description": description,
    }.items():
        form.locator(f'[name="{key}"]').fill(value)
    form.locator('[name="images"]').fill(json.dumps(images))
    form.locator('[name="variants_json"]').fill(json.dumps(variants))
    form.locator('[name="status"]').select_option("draft")
    with office.expect_response(
        lambda response: response.url.endswith("/api/admin/products") and response.request.method == "POST"
    ) as created:
        form.get_by_role("button", name="Создать", exact=True).click()
    assert created.value.status == 200
    record = created.value.json()
    endpoint = "/admin/products/" + record["id"]
    product_path = "/merch/" + record["slug"]
    row = office.locator(".office-record").filter(has=office.get_by_role("heading", name=title, exact=True))
    expect(row).to_contain_text("Черновик")
    office.reload()
    expect(row).to_be_visible()
    office.screenshot(path=str(evidence / "01-draft.png"), full_page=True)
    assert all(item["id"] != record["id"] for item in visitor.request.get("/api/products").json())
    visitor.goto("/merch")
    expect(visitor.get_by_role("heading", name=title, exact=True)).to_have_count(0)
    assert visitor.goto(product_path).status == 404
    stages.append({"step": "create_draft", "status": created.value.status, "hidden_from_guest": True})

    row.get_by_text("Редактировать", exact=True).click()
    form = row.locator("form")
    expect(form.locator('[name="price"]')).to_have_value("129900")
    assert json.loads(form.locator('[name="images"]').input_value()) == images
    assert json.loads(form.locator('[name="variants_json"]').input_value()) == variants
    form.locator('[name="status"]').select_option("published")
    with office.expect_response(
        lambda response: response.url.endswith("/api" + endpoint) and response.request.method == "PATCH"
    ) as published:
        form.get_by_role("button", name="Сохранить", exact=True).click()
    assert published.value.status == 200
    expect(row).to_contain_text("Опубликовано")
    visitor.goto("/merch")
    card = visitor.locator(".merch-card").filter(has=visitor.get_by_role("heading", name=title, exact=True))
    expect(card).to_be_visible()
    expect(card.locator(".site-price")).to_have_text("1 299 ₽")
    card.get_by_role("link", name="Подробнее", exact=True).click()
    expect(visitor.locator("#main h1")).to_have_text(title)
    expect(visitor.locator(".merch-product__description")).to_contain_text(description)
    image = visitor.locator("img[data-merch-image]")
    image.evaluate("node => node.decode()")
    assert image.evaluate("node => node.naturalWidth > 0")
    visitor.get_by_label("Размер и цвет").select_option(variants[0]["sku"])
    visitor.screenshot(path=str(evidence / "02-published.png"), full_page=True)
    stages.append({"step": "publish", "status": published.value.status, "guest_price_kopecks": 129900})

    office.reload()
    row.get_by_text("Редактировать", exact=True).click()
    form = row.locator("form")
    form.locator('[name="stock"]').fill("-1")
    with office.expect_response(
        lambda response: response.url.endswith("/api" + endpoint) and response.request.method == "PATCH"
    ) as invalid:
        form.get_by_role("button", name="Сохранить", exact=True).click()
    assert invalid.value.status == 400
    expect(form.locator("[data-error]")).to_be_visible()
    saved = next(
        item for item in request.get("/api/admin/products", headers=headers).json() if item["id"] == record["id"]
    )
    assert saved["stock"] == 5
    updated_title = title + " – обновлено"
    updated_description = description + " Описание изменено через панель офиса."
    variants[0]["stock"], variants[1]["stock"] = 4, 3
    for key, value in {
        "title": updated_title,
        "price": "159900",
        "stock": "7",
        "description": updated_description,
    }.items():
        form.locator(f'[name="{key}"]').fill(value)
    form.locator('[name="variants_json"]').fill(json.dumps(variants))
    with office.expect_response(
        lambda response: response.url.endswith("/api" + endpoint) and response.request.method == "PATCH"
    ) as edited:
        form.get_by_role("button", name="Сохранить", exact=True).click()
    assert edited.value.status == 200
    row = office.locator(".office-record").filter(has=office.get_by_role("heading", name=updated_title, exact=True))
    expect(row).to_be_visible()
    office.reload()
    row.get_by_text("Редактировать", exact=True).click()
    form = row.locator("form")
    expect(form.locator('[name="price"]')).to_have_value("159900")
    expect(form.locator('[name="stock"]')).to_have_value("7")
    assert json.loads(form.locator('[name="images"]').input_value()) == images
    assert json.loads(form.locator('[name="variants_json"]').input_value()) == variants
    office.screenshot(path=str(evidence / "03-editor-saved.png"), full_page=True)
    saved = next(
        item for item in request.get("/api/admin/products", headers=headers).json() if item["id"] == record["id"]
    )
    assert saved["price"] == 159900 and saved["stock"] == 7 and saved["slug"] == record["slug"]
    assert saved["description"] == updated_description
    visitor.reload()
    expect(visitor.locator("#main h1")).to_have_text(updated_title)
    expect(visitor.locator(".merch-product__summary>.site-price")).to_have_text("1 599 ₽")
    expect(visitor.locator(".merch-product__description")).to_contain_text(updated_description)
    visitor.screenshot(path=str(evidence / "03-edited.png"), full_page=True)
    stages.append(
        {
            "step": "edit",
            "status": edited.value.status,
            "invalid_stock_status": invalid.value.status,
            "price_kopecks": saved["price"],
            "stock": saved["stock"],
            "images_preserved": saved["images"] == images,
            "variants": saved["variants_json"],
        }
    )

    office.once("dialog", lambda dialog: dialog.dismiss())
    row.get_by_role("button", name="Удалить", exact=True).click()
    expect(row).to_be_visible()
    assert any(item["id"] == record["id"] for item in request.get("/api/admin/products", headers=headers).json())
    office.once("dialog", lambda dialog: dialog.accept())
    with office.expect_response(
        lambda response: response.url.endswith("/api" + endpoint) and response.request.method == "DELETE"
    ) as deleted:
        row.get_by_role("button", name="Удалить", exact=True).click()
    assert deleted.value.status == 200
    expect(row).to_have_count(0)
    office.reload()
    expect(office.locator(".site-office")).to_be_visible()
    expect(row).to_have_count(0)
    if not original_ids:
        expect(office.locator("[data-office-count]")).to_contain_text("Показано: 0")
    office.screenshot(path=str(evidence / "04-deleted.png"), full_page=True)
    remaining = request.get("/api/admin/products", headers=headers).json()
    assert {item["id"] for item in remaining} == original_ids
    assert all(item["id"] != record["id"] for item in visitor.request.get("/api/products").json())
    visitor.goto("/merch")
    expect(visitor.get_by_role("heading", name=updated_title, exact=True)).to_have_count(0)
    assert visitor.goto(product_path).status == 404
    assert visitor.request.post("/api/admin/products", data={"title": "Недоступная запись"}).status == 401
    assert visitor.request.patch("/api" + endpoint, data={"title": "Недоступное изменение"}).status == 401
    assert visitor.request.delete("/api" + endpoint).status == 401
    assert office.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert visitor.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    stages.append(
        {"step": "delete", "status": deleted.value.status, "guest_detail_status": 404, "other_products_preserved": True}
    )
    (evidence / "verification.json").write_text(
        json.dumps(
            {"device": name, "id": record["id"], "slug": record["slug"], "stages": stages}, ensure_ascii=False, indent=2
        )
    )
