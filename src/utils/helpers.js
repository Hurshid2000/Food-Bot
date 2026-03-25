function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}

function formatPrice(price) {
  return `${Number(price).toLocaleString('ru-RU')} сум`;
}

function formatOrderStatus(status) {
  const map = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    cooking: 'Готовится',
    ready: 'Готов',
    delivered: 'Доставлен',
    cancelled: 'Отменён'
  };
  return map[status] || status;
}

function formatNutrition(item) {
  const parts = [];
  if (item.calories) parts.push(`${item.calories} ккал`);
  if (item.proteins) parts.push(`Б: ${item.proteins}г`);
  if (item.fats) parts.push(`Ж: ${item.fats}г`);
  if (item.carbs) parts.push(`У: ${item.carbs}г`);
  return parts.length ? parts.join(' | ') : '';
}

function getNextWorkdays(count = 3) {
  const days = [];
  const d = new Date();
  while (days.length < count) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      days.push(d.toISOString().split('T')[0]);
    }
  }
  return days;
}

function isWorkday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

function isTodayWorkday() {
  return isWorkday(getToday());
}

module.exports = { getToday, formatDate, formatPrice, formatOrderStatus, formatNutrition, getNextWorkdays, isWorkday, isTodayWorkday };
