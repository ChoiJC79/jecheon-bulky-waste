from pathlib import Path
from playwright.sync_api import sync_playwright

output = Path("/tmp/jecheon-bulky-waste.png")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://127.0.0.1:4173", wait_until="networkidle")

    page.get_by_role("button", name="가전제품").click()
    page.get_by_role("button", name="냉장고 규격 선택").click()
    page.locator("#item-option").select_option("1")
    page.get_by_role("button", name="신고 목록에 추가").click()
    assert "8,000원" in page.locator("#total-fee").inner_text()

    page.locator("#address").fill("제천시 의림대로 00")
    page.locator("#address-detail").fill("101동 출입구 옆 분리수거장")
    page.get_by_role("radio", name="계좌이체").check()
    page.get_by_role("button", name="신고 내용 확인하기").click()
    assert "계좌이체 방식으로 신고 내용을 확인합니다" in page.locator("#form-message").inner_text()

    page.screenshot(path=str(output), full_page=True)
    browser.close()

print(output)
