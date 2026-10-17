export const calculateTotals = (cart, outlet) => {
  let subtotal = 0;
  let tax = 0;

  const linePricing = {};

  cart.forEach(item => {
    const base = item.unit_price * item.quantity;
    const itemTax = (base * item.tax_percentage) / 100;

    subtotal += base;
    tax += itemTax;

    linePricing[item.line_id] = {
      final_amount: base + itemTax
    };
  });

  return {
    subtotal,
    totalTax: tax,
    grandTotal: Math.round(subtotal + tax),
    linePricing
  };
};