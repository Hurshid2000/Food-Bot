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

module.exports = { getToday, formatDate, formatPrice, formatOrderStatus, formatNutrition };
