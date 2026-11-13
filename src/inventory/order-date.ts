export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isOrderDate(dateKey: string, orderDays: number[], extraOrderDates: string[] = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T12:00:00`);
  return !Number.isNaN(date.getTime()) && (orderDays.includes(date.getDay()) || extraOrderDates.includes(dateKey));
}

export function nextOrderDate(orderDays: number[], extraOrderDates: string[] = [], start = new Date()) {
  const date = new Date(start);
  for (let index = 0; index < 370; index += 1) {
    const key = localDateKey(date);
    if (orderDays.includes(date.getDay()) || extraOrderDates.includes(key)) return key;
    date.setDate(date.getDate() + 1);
  }
  return localDateKey(start);
}
