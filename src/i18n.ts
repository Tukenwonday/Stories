import type { Lang } from "./types"

export const strings = {
  currency: { en: "NIS", ar: "شيكل" },
  tagline: { en: "Resto Cafe", ar: "ريستو كافيه" },
  table: { en: "Table", ar: "طاولة" },
  search: { en: "Search the menu", ar: "ابحث في القائمة" },
  loadingMenu: { en: "Loading menu...", ar: "جاري تحميل القائمة..." },
  retry: { en: "Try again", ar: "إعادة المحاولة" },
  noItems: { en: "No items.", ar: "لا توجد عناصر." },
  loadError: {
    en: "Something went wrong while loading the menu.",
    ar: "حدث خطأ أثناء تحميل القائمة.",
  },
  invalidLink: { en: "Invalid table link", ar: "رابط الطاولة غير صالح" },
  invalidLinkHint: {
    en: "This link isn't linked to a table. Please scan the QR code placed on your table.",
    ar: "هذا الرابط غير مرتبط بأي طاولة. يرجى مسح رمز QR الموجود على طاولتك.",
  },
  add: { en: "Add", ar: "أضف" },
  addToOrder: { en: "Add to order", ar: "أضف إلى الطلب" },
  viewCart: { en: "View Cart", ar: "عرض السلة" },
  items: { en: "items", ar: "عناصر" },
  item: { en: "item", ar: "عنصر" },
  yourOrder: { en: "Your Order", ar: "طلبك" },
  emptyCart: { en: "Your cart is empty", ar: "سلتك فارغة" },
  emptyCartHint: {
    en: "Browse the menu and add something delicious.",
    ar: "تصفح القائمة وأضف شيئًا لذيذًا.",
  },
  subtotal: { en: "Subtotal", ar: "المجموع الفرعي" },
  total: { en: "Total", ar: "الإجمالي" },
  customerName: { en: "Your name", ar: "اسمك" },
  customerNamePlaceholder: { en: "e.g. Sara", ar: "مثال: سارة" },
  payment: { en: "Payment", ar: "الدفع" },
  payWaiter: { en: "Pay at Table", ar: "الدفع على الطاولة" },
  payWaiterHint: { en: "Cash or card with your waiter", ar: "نقدًا أو ببطاقة مع النادل" },
  placeOrder: { en: "Place Order", ar: "تأكيد الطلب" },
  placing: { en: "Placing order…", ar: "جارٍ إرسال الطلب…" },
  orderPlaced: { en: "Order placed!", ar: "تم إرسال الطلب!" },
  orderPlacedHint: {
    en: "Your order has been sent to the kitchen. A waiter will be with you shortly.",
    ar: "تم إرسال طلبك إلى المطبخ. سيأتي النادل إليك قريبًا.",
  },
  newOrder: { en: "Start a new order", ar: "ابدأ طلبًا جديدًا" },
  required: { en: "Required", ar: "مطلوب" },
  optional: { en: "Optional", ar: "اختياري" },
  chooseOne: { en: "Choose one", ar: "اختر واحدًا" },
  chooseAny: { en: "Choose any", ar: "اختر ما تريد" },
  nameError: { en: "Please enter your name", ar: "الرجاء إدخال اسمك" },
  demoNote: {
    en: "Demo mode — connect Supabase to save orders.",
    ar: "الوضع التجريبي — اربط Supabase لحفظ الطلبات.",
  },
} as const

export function t(key: keyof typeof strings, lang: Lang): string {
  return strings[key][lang]
}
