import type en from './en';

const ja: Record<keyof typeof en, string> = {
  // sign-in
  'signIn.title': '九州八十八湯',
  'signIn.alertFailedSignIn': 'サインインに失敗しました',
  'signIn.alertFailedCreate': 'アカウント作成に失敗しました',
  'signIn.divider': 'または',
  'signIn.emailPlaceholder': 'メールアドレス',
  'signIn.passwordPlaceholder': 'パスワード',
  'signIn.submitSignIn': 'サインイン',
  'signIn.submitCreate': 'アカウント作成',
  'signIn.toggleToCreate': 'アカウントをお持ちでない方はこちら',
  'signIn.toggleToSignIn': 'すでにアカウントをお持ちの方はこちら',

  // home
  'home.title': 'Kyuhachi',
  'home.onsenList': '温泉一覧',
  'home.map': '地図',
  'home.signOut': 'サインアウト',

  // map
  'map.title': '地図',

  // onsen list
  'onsenList.title': '温泉一覧',
  'onsenList.searchPlaceholder': '温泉を検索…',
  'onsenList.emptySearch': '「{{query}}」に一致する温泉はありません',
  'onsenList.emptyData': '温泉データがありません',

  // onsen detail
  'onsenDetail.notFound': '温泉が見つかりませんでした',
  'onsenDetail.archived': '廃止',
  'onsenDetail.labelAddress': '住所',
  'onsenDetail.labelPhone': '電話',
  'onsenDetail.labelFee': '料金',
  'onsenDetail.labelSpringQuality': '泉質',
  'onsenDetail.labelHours': '営業時間',
} as const;

export default ja;
