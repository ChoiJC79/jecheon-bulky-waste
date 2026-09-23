import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OFFICE_ITEM_CATALOG,
  OFFICE_QUICK_ITEMS,
  ORDINANCE_SOURCE,
  catalogHasPayableItem,
  findPayableItem,
  buildCustomCartItem,
  matchExcludedRoute,
  payableItemCount,
  searchPayableItems
} from "../office-catalog.js";

test("조례 별표 1 수거 품목은 쇼파·장농·책상 수수료를 따른다", () => {
  assert.match(ORDINANCE_SOURCE.title, /별표 1/);
  assert.match(ORDINANCE_SOURCE.revised, /2022/);
  assert.equal(findPayableItem("쇼파").options[1][0], "2~3인용");
  assert.equal(findPayableItem("쇼파").options[1][1], 5000);
  assert.equal(findPayableItem("소파").name, "쇼파");
  assert.equal(findPayableItem("장롱").options[0][1], 5000);
  assert.equal(findPayableItem("책상").options.find((row) => row[0] === "일반책상")[1], 5000);
  assert.equal(findPayableItem("침대 매트리스").options[0][1], 5000);
  assert.ok(payableItemCount() > 60);
  assert.equal(OFFICE_QUICK_ITEMS[0].name, "쇼파");
  assert.ok(OFFICE_ITEM_CATALOG.some((category) => category.id === "living"));
});

test("폐가전·재활용은 수거 목록에 넣지 않고 다른 경로만 안내한다", () => {
  assert.equal(catalogHasPayableItem("냉장고"), false);
  assert.equal(catalogHasPayableItem("세탁기"), false);
  assert.equal(catalogHasPayableItem("텔레비전"), false);
  assert.equal(catalogHasPayableItem("투명 페트병"), false);
  const fridge = matchExcludedRoute("냉장고");
  assert.equal(fridge.kind, "ewaste");
  assert.match(fridge.guide.title, /폐가전/);
  assert.match(fridge.guide.steps[0], /1599-0903/);
  assert.deepEqual(fridge.ordinanceFees[0], ["300ℓ미만", 4000]);
  assert.equal(matchExcludedRoute("김치냉장고").name, "냉장고");
  assert.equal(matchExcludedRoute("공사장").kind, "other");
  assert.ok(searchPayableItems("냉장고").length === 0);
});

test("수기 입력은 마스터 목록에 없는 품목도 이름·규격·수량·수수료만으로 만든다", () => {
  const missing = "접이식 원목 책상";
  assert.equal(catalogHasPayableItem(missing), false);
  const result = buildCustomCartItem({
    name: missing,
    option: "유사 일반책상",
    fee: "5,000",
    quantity: 2
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.item, {
    name: missing,
    option: "유사 일반책상",
    fee: 5000,
    quantity: 2,
    custom: true
  });
  assert.match(buildCustomCartItem({ name: "", fee: 1000 }).error, /품목명/);
  assert.match(buildCustomCartItem({ name: "기타", fee: "abc" }).error, /수수료/);
});

test("전화 접수 화면은 조례 검색과 수기 입력을 제공한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const intake = await readFile(new URL("../office-intake.js", import.meta.url), "utf8");
  assert.match(html, /id="intake-item-search"/);
  assert.match(html, /id="intake-custom-name"/);
  assert.match(html, /id="intake-custom-fee"/);
  assert.match(html, /id="intake-add-custom"/);
  assert.match(html, /목록에 없으면 수기 입력/);
  assert.match(intake, /addCustomCartItem/);
  assert.match(intake, /item\.custom/);
});
