import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeIdLengthForNewRegistration,
  isEmployeeIdFormat,
  isEmployeeIdValidForExistingStore,
  isEmployeeIdValidForNewRegistration,
} from "./employee-id";

test("Kosai uses nine digits for new registrations", () => {
  assert.equal(employeeIdLengthForNewRegistration("kosai"), 9);
  assert.equal(isEmployeeIdValidForNewRegistration("123456789", "kosai"), true);
  assert.equal(isEmployeeIdValidForNewRegistration("12345678", "kosai"), false);
});

test("other stores keep eight-digit employee numbers", () => {
  assert.equal(isEmployeeIdValidForNewRegistration("12345678", "terajima"), true);
  assert.equal(isEmployeeIdValidForNewRegistration("123456789", "terajima"), false);
});

test("login accepts only eight or nine digit input", () => {
  assert.equal(isEmployeeIdFormat("12345678"), true);
  assert.equal(isEmployeeIdFormat("123456789"), true);
  assert.equal(isEmployeeIdFormat("1234567"), false);
});

test("legacy eight-digit Kosai employees remain usable", () => {
  assert.equal(isEmployeeIdValidForExistingStore("12345678", "kosai"), true);
  assert.equal(isEmployeeIdValidForExistingStore("123456789", "kosai"), true);
  assert.equal(isEmployeeIdValidForExistingStore("123456789", "hamakita"), false);
});
