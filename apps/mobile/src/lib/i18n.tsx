import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Lang, OrderStatus } from './types';

const ar = {
  appName: 'عوافي',
  tagline: 'اطلب أدويتك من الصيدلية: استلام، توصيل، أو توصيل مستعجل',
  navHome: 'الرئيسية',
  navBrowse: 'تصفح',
  navCart: 'السلة',
  navOrders: 'طلباتي',
  navAccount: 'حسابي',
  searchPlaceholder: 'ابحث عن دواء أو منتج',
  categories: 'الأقسام',
  allCategories: 'الكل',
  offers: 'عروض الصيدليات',
  safetyNotice: 'المعلومات في التطبيق إرشادية ولا تغني عن استشارة الصيدلي أو الطبيب.',
  fromPrice: 'ابتداءً من',
  omr: 'ر.ع',
  rxRequired: 'يتطلب وصفة طبية',
  compareOffers: 'قارن الأسعار بين الصيدليات',
  inStock: 'متوفر',
  outOfStock: 'غير متوفر',
  addToCart: 'أضف إلى السلة',
  added: 'تمت الإضافة',
  usage: 'طريقة الاستخدام',
  replaceCartTitle: 'تغيير الصيدلية؟',
  replaceCartBody: 'سلتك تحتوي منتجات من صيدلية أخرى. الطلب الواحد يكون من صيدلية واحدة. هل تريد إفراغ السلة والبدء من هذه الصيدلية؟',
  replace: 'نعم، ابدأ من جديد',
  cancel: 'إلغاء',
  emptyCart: 'سلتك فارغة',
  browseNow: 'تصفح المنتجات',
  pharmacy: 'الصيدلية',
  subtotal: 'المجموع',
  deliveryFee: 'رسوم التوصيل',
  total: 'الإجمالي',
  checkout: 'إتمام الطلب',
  remove: 'حذف',
  rxNoteCart: 'في سلتك منتج يتطلب وصفة. ستُطلب منك صورة الوصفة بعد إرسال الطلب.',
  loginTitle: 'تسجيل الدخول',
  loginSubtitle: 'أدخل رقم هاتفك العُماني وسنرسل لك رمز تحقق.',
  phone: 'رقم الهاتف',
  sendCode: 'أرسل الرمز',
  code: 'رمز التحقق',
  verify: 'تحقق',
  invalidPhone: 'أدخل رقماً عُمانياً من 8 أرقام',
  loginRequired: 'سجّل الدخول للمتابعة',
  logout: 'تسجيل الخروج',
  language: 'اللغة',
  switchLang: 'English',
  deliveryAddress: 'عنوان التوصيل',
  addressLabel: 'اسم العنوان (مثال: المنزل)',
  addressDetails: 'المنطقة، الشارع، رقم المنزل، علامة مميزة',
  savedAddresses: 'عناوين محفوظة',
  newAddress: 'عنوان جديد',
  paymentMethod: 'طريقة الدفع',
  cashOnDelivery: 'الدفع عند الاستلام',
  placeOrder: 'أرسل الطلب',
  orderFailed: 'تعذر إرسال الطلب، حاول مرة أخرى.',
  noOrders: 'لا توجد طلبات بعد',
  orderNumber: 'طلب رقم',
  status: 'الحالة',
  uploadRx: 'ارفع صورة الوصفة',
  rxUploaded: 'تم رفع الوصفة، بانتظار مراجعة الصيدلي',
  rxNeeded: 'هذا الطلب يحتاج وصفة طبية قبل تجهيزه.',
  cancelOrder: 'إلغاء الطلب',
  cancelReason: 'تم الإلغاء من قبل العميل',
  timeline: 'تتبع الطلب',
  loading: 'جارٍ التحميل…',
  loadError: 'تعذر التحميل. تحقق من الاتصال.',
  retry: 'إعادة المحاولة',
  partnerNote: 'صاحب صيدلية؟ سجّل صيدليتك من لوحة الشركاء.',
  devBanner: 'نسخة تطوير — بيانات تجريبية فقط',
  pickupAt: 'الاستلام من الصيدلية',
  payAtPharmacy: 'الدفع في الصيدلية عند الاستلام',
  pickupHowTo: 'ستصلك رسالة عندما يصبح طلبك جاهزاً. اعرض رمز الاستلام على الصيدلي وادفع عند الاستلام.',
  pickupCode: 'رمز الاستلام',
  showCodeAtCounter: 'اعرض هذا الرمز على الصيدلي عند الاستلام. لا تشاركه مع أحد.',
  readyForPickupNotice: 'طلبك جاهز! توجّه إلى الصيدلية لاستلامه.',
  bringPrescription: 'أحضر الوصفة الأصلية معك عند الاستلام إذا طلبها الصيدلي.',
  navDeliveries: 'توصيلاتي',
  driverTitle: 'طلبات التوصيل',
  noDeliveries: 'لا توجد طلبات توصيل حالياً',
  pickupFrom: 'الاستلام من',
  collectCash: 'المبلغ المطلوب تحصيله',
  openMap: 'الخريطة',
  callCustomer: 'اتصل بالعميل',
  markDelivered: 'تم التسليم',
  waitForPharmacy: 'بانتظار تجهيز الطلب في الصيدلية',
  howToReceive: 'كيف تريد استلام طلبك؟',
  optPickup: 'استلام من الصيدلية',
  optDelivery: 'توصيل عادي',
  optUrgent: 'توصيل مستعجل',
  freeLabel: 'مجاناً',
  urgentNote: 'أولوية في التجهيز والتوصيل. رسوم أعلى.',
  urgentNotOffered: 'هذه الصيدلية لا تقدم التوصيل المستعجل حالياً',
  urgentBadge: 'مستعجل',
  contactUs: 'تواصل معنا',
  callUs: 'اتصال',
  whatsappUs: 'واتساب',
};

type Dict = typeof ar;

const en: Dict = {
  appName: 'Awafy',
  tagline: 'Order from the pharmacy: collect, delivery or urgent delivery',
  navHome: 'Home',
  navBrowse: 'Browse',
  navCart: 'Cart',
  navOrders: 'Orders',
  navAccount: 'Account',
  searchPlaceholder: 'Search medicines and products',
  categories: 'Categories',
  allCategories: 'All',
  offers: 'Pharmacy offers',
  safetyNotice: 'Information in this app is guidance only and does not replace advice from your pharmacist or doctor.',
  fromPrice: 'From',
  omr: 'OMR',
  rxRequired: 'Prescription required',
  compareOffers: 'Compare prices across pharmacies',
  inStock: 'In stock',
  outOfStock: 'Out of stock',
  addToCart: 'Add to cart',
  added: 'Added',
  usage: 'How to use',
  replaceCartTitle: 'Switch pharmacy?',
  replaceCartBody: 'Your cart has items from another pharmacy. Each order comes from one pharmacy. Empty the cart and start with this pharmacy?',
  replace: 'Yes, start over',
  cancel: 'Cancel',
  emptyCart: 'Your cart is empty',
  browseNow: 'Browse products',
  pharmacy: 'Pharmacy',
  subtotal: 'Subtotal',
  deliveryFee: 'Delivery fee',
  total: 'Total',
  checkout: 'Checkout',
  remove: 'Remove',
  rxNoteCart: 'Your cart has a prescription item. You will be asked for a photo of the prescription after placing the order.',
  loginTitle: 'Log in',
  loginSubtitle: 'Enter your Omani mobile number and we will text you a code.',
  phone: 'Mobile number',
  sendCode: 'Send code',
  code: 'Verification code',
  verify: 'Verify',
  invalidPhone: 'Enter an 8-digit Omani number',
  loginRequired: 'Log in to continue',
  logout: 'Log out',
  language: 'Language',
  switchLang: 'العربية',
  deliveryAddress: 'Delivery address',
  addressLabel: 'Address name (e.g. Home)',
  addressDetails: 'Area, street, house number, landmark',
  savedAddresses: 'Saved addresses',
  newAddress: 'New address',
  paymentMethod: 'Payment method',
  cashOnDelivery: 'Cash on delivery',
  placeOrder: 'Place order',
  orderFailed: 'Could not place the order. Please try again.',
  noOrders: 'No orders yet',
  orderNumber: 'Order',
  status: 'Status',
  uploadRx: 'Upload prescription photo',
  rxUploaded: 'Prescription uploaded, waiting for pharmacist review',
  rxNeeded: 'This order needs a prescription before it can be prepared.',
  cancelOrder: 'Cancel order',
  cancelReason: 'Cancelled by customer',
  timeline: 'Order tracking',
  loading: 'Loading…',
  loadError: 'Could not load. Check your connection.',
  retry: 'Try again',
  partnerNote: 'Own a pharmacy? Register it from the partner dashboard.',
  devBanner: 'Development build — test data only',
  pickupAt: 'Collect from the pharmacy',
  payAtPharmacy: 'Pay at the pharmacy when you collect',
  pickupHowTo: 'We will notify you when your order is ready. Show your pickup code to the pharmacist and pay at collection.',
  pickupCode: 'Pickup code',
  showCodeAtCounter: 'Show this code to the pharmacist when you collect. Do not share it with anyone.',
  readyForPickupNotice: 'Your order is ready! Head to the pharmacy to collect it.',
  bringPrescription: 'Bring the original prescription with you if the pharmacist asks for it.',
  navDeliveries: 'Deliveries',
  driverTitle: 'Delivery jobs',
  noDeliveries: 'No deliveries right now',
  pickupFrom: 'Pick up from',
  collectCash: 'Cash to collect',
  openMap: 'Map',
  callCustomer: 'Call customer',
  markDelivered: 'Mark delivered',
  waitForPharmacy: 'Waiting for the pharmacy to prepare the order',
  howToReceive: 'How would you like to receive your order?',
  optPickup: 'Collect from pharmacy',
  optDelivery: 'Normal delivery',
  optUrgent: 'Urgent delivery',
  freeLabel: 'Free',
  urgentNote: 'Prepared and delivered first. Higher fee.',
  urgentNotOffered: 'This pharmacy does not offer urgent delivery right now',
  urgentBadge: 'Urgent',
  contactUs: 'Contact us',
  callUs: 'Call',
  whatsappUs: 'WhatsApp',
};

export const statusLabels: Record<Lang, Record<OrderStatus, string>> = {
  ar: {
    awaiting_prescription: 'بانتظار الوصفة',
    placed: 'تم الإرسال',
    accepted: 'قبلته الصيدلية',
    preparing: 'قيد التجهيز',
    ready_for_pickup: 'جاهز للاستلام',
    collected: 'تم الاستلام',
    out_for_delivery: 'في الطريق إليك',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي',
  },
  en: {
    awaiting_prescription: 'Awaiting prescription',
    placed: 'Placed',
    accepted: 'Accepted by pharmacy',
    preparing: 'Being prepared',
    ready_for_pickup: 'Ready for pickup',
    collected: 'Collected',
    out_for_delivery: 'On the way',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
};

export type TKey = keyof Dict;
const dictionaries: Record<Lang, Dict> = { ar, en };
const LANG_KEY = 'awafy.lang';

function readLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(LANG_KEY);
    return saved === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

type I18nValue = {
  lang: Lang;
  t: (key: TKey) => string;
  setLang: (lang: Lang) => void;
  /** Picks the Arabic or English field of a database row, falling back to Arabic. */
  pick: (arText: string | null | undefined, enText: string | null | undefined) => string;
  money: (omr: number) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      globalThis.localStorage?.setItem(LANG_KEY, next);
    } catch {
      // storage unavailable; preference lasts for this session only
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key) => dictionaries[lang][key],
      pick: (arText, enText) => (lang === 'en' && enText ? enText : (arText ?? '')),
      money: (omr) => `${Number(omr).toFixed(3)} ${dictionaries[lang].omr}`,
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
