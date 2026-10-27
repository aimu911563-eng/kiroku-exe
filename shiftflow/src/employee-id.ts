export function employeeIdLengthForNewRegistration(storeId: string) {
  return storeId === "kosai" ? 9 : 8;
}

export function isEmployeeIdFormat(value: string) {
  return /^\d{8,9}$/.test(value);
}

export function isEmployeeIdValidForNewRegistration(value: string, storeId: string) {
  return new RegExp(`^\\d{${employeeIdLengthForNewRegistration(storeId)}}$`).test(value);
}

// 湖西の既存8桁データは継続利用できるようにする。
export function isEmployeeIdValidForExistingStore(value: string, storeId: string) {
  return storeId === "kosai" ? /^\d{8,9}$/.test(value) : /^\d{8}$/.test(value);
}
