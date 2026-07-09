export function summarizeScrapSales(items = []) {
  const totalWeightKg = items.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byCategoryMap = new Map();

  for (const item of items) {
    const key = item.category_id;
    const current = byCategoryMap.get(key) || {
      categoryId: key,
      category: item.category || null,
      itemCount: 0,
      totalWeightKg: 0,
      totalAmount: 0
    };
    current.itemCount += 1;
    current.totalWeightKg += Number(item.weight_kg || 0);
    current.totalAmount += Number(item.amount || 0);
    byCategoryMap.set(key, current);
  }

  return {
    itemCount: items.length,
    totalWeightKg: Number(totalWeightKg.toFixed(4)),
    totalAmount: Number(totalAmount.toFixed(2)),
    averagePricePerKg: totalWeightKg > 0 ? Number((totalAmount / totalWeightKg).toFixed(4)) : 0,
    byCategory: [...byCategoryMap.values()].map((item) => ({
      ...item,
      totalWeightKg: Number(item.totalWeightKg.toFixed(4)),
      totalAmount: Number(item.totalAmount.toFixed(2))
    }))
  };
}
