import assert from "node:assert/strict";
import test from "node:test";
import { submissionMessages } from "./submission-messages";

test("submission messages include the formatted total", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 12), 40 * 60, "");
  assert.equal(result.hoursText, "40時間");
  assert.match(result.total, /40時間/);
  assert.ok(result.greeting.length > 0);
});

test("half hours are formatted without decimal rounding", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 22), 45 * 60 + 30, "");
  assert.equal(result.hoursText, "45時間30分");
  assert.match(result.total, /45時間30分/);
});

test("zero hours receive a dedicated supportive message", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 12), 0, "");
  assert.equal(result.hoursText, "0時間");
  assert.match(result.total, /(勤務希望なし|お休み|勤務なし|0時間|シフトなし|希望なし)/);
});

test("midnight through 4:59 uses late-night messages", () => {
  assert.equal(submissionMessages(new Date(2026, 8, 30, 0, 0), 0, "").period, "lateNight");
  assert.equal(submissionMessages(new Date(2026, 8, 30, 4, 59), 0, "").period, "lateNight");
  assert.equal(submissionMessages(new Date(2026, 8, 30, 5, 0), 0, "").period, "morning");
});

test("test-related comments receive an encouragement", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 9), 8 * 60, "来週は模試があります");
  assert.ok(result.keyword);
  assert.match(result.keyword ?? "", /(テスト|試験|模試|勉強)/);
});

test("ordinary comments do not get a keyword response", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "特になし");
  assert.equal(result.keyword, null);
});

test("travel comments receive a travel message", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "家族旅行に行きます");
  assert.ok(result.keyword);
});

test("leisure comments receive an event message", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "ライブに行きます");
  assert.ok(result.keyword);
});

test("school events receive an encouragement", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "文化祭の準備があります");
  assert.ok(result.keyword);
});

test("birthdays receive a celebration", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "誕生日なので休みたいです");
  assert.ok(result.keyword);
});

test("only one keyword message is shown when categories overlap", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "誕生日に旅行します");
  assert.ok(result.keyword);
  assert.equal(typeof result.keyword, "string");
});

test("health comments receive a calm message without decorative emoji", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "体調不良で病院に行きます");
  assert.ok(result.keyword);
  assert.doesNotMatch(result.keyword ?? "", /[🎉🎊🔥✨🎂✈️🎤]/u);
});

test("bereavement takes priority over travel and stays subdued", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "法事のため実家へ帰省します");
  assert.ok(result.keyword);
  assert.doesNotMatch(result.keyword ?? "", /[🎉🎊🔥✨🎂✈️🎤]/u);
  assert.match(result.keyword ?? "", /(承知|ご連絡|ご事情|ご家族|大切|予定|こちら)/);
});

test("health takes priority over family errands", () => {
  const result = submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, "家族を病院へ送迎します");
  assert.ok(result.keyword);
  assert.match(result.keyword ?? "", /(体調|お大事|休|通院|診察|治療|療養|身体|予定|回復)/);
});

test("study, career, competition, life events, family and rest are detected", () => {
  const comments = ["卒論があります", "就活の面接です", "発表会です", "引っ越しです", "家族の用事です", "寝不足なので休みたいです"];
  for (const comment of comments) {
    assert.ok(submissionMessages(new Date(2026, 8, 30, 18), 20 * 60, comment).keyword, comment);
  }
});
