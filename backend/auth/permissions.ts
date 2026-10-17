export const ROLE_PERMISSIONS = {
  owner: {
    all: true,
  },
  admin: {
    invite_staff: true,
    manage_orders: true,
    "sale.edit": true,
    "sale.delete": true,
    "sale.override_price": true,
    view_reports: true,
    manage_menu: true,
  },
  manager: {
    manage_orders: true,
    "sale.edit": true,
    view_reports: true,
  },
  staff: {
    manage_orders: true,
  },
}
