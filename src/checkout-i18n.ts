export const checkoutStrings = {
  title: { en: "Cashier Checkout", ar: "الدفع والتحصيل" },
  subtitle: { en: "Stories Resto Cafe", ar: "ستوريز ريستو كافيه" },
  pinPlaceholder: { en: "Enter PIN", ar: "أدخل الرمز" },
  wrongPin: { en: "Wrong PIN", ar: "رمز خاطئ" },
  unlock: { en: "Unlock", ar: "دخول" },
  table: { en: "Table", ar: "طاولة" },
  orders: { en: "orders", ar: "طلبات" },
  order: { en: "order", ar: "طلب" },
  noOrders: { en: "No orders", ar: "لا توجد طلبات" },
  total: { en: "Total", ar: "الإجمالي" },
  loading: { en: "Loading...", ar: "جارٍ التحميل..." },
  loadError: { en: "Failed to load", ar: "فشل التحميل" },
  refresh: { en: "Refresh", ar: "تحديث" },
  logout: { en: "Lock", ar: "قفل" },
  backToTables: { en: "Back to tables", ar: "العودة للطاولات" },
  customer: { en: "Customer", ar: "العميل" },
  notes: { en: "Notes", ar: "ملاحظات" },
  time: { en: "Time", ar: "الوقت" },
  recent: { en: "Last hour", ar: "آخر ساعة" },
  items: { en: "items", ar: "عناصر" },
  qty: { en: "Qty", ar: "الكمية" },
  price: { en: "Price", ar: "السعر" },
  waiter: { en: "Waiter", ar: "النادل" },
  emptyCart: { en: "No orders for this table", ar: "لا توجد طلبات لهذه الطاولة" },
  emptyCartHint: {
    en: "This table is clear and ready for new guests.",
    ar: "هذه الطاولة فارغة وجاهزة لاستقبال الضيوف.",
  },
  markPaid: { en: "Mark paid", ar: "تم الدفع" },
  paid: { en: "Paid", ar: "مدفوع" },
  connectionLost: { en: "Connection lost — reconnecting...", ar: "فُقد الاتصال — جارٍ إعادة الاتصال..." },
} as const

export function t(key: keyof typeof checkoutStrings, lang: "en" | "ar"): string {
  return checkoutStrings[key][lang]
}
