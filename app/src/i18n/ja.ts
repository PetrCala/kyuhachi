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

  // challenge
  'challenge.startTitle': 'チャレンジを始めよう',
  'challenge.startDescription':
    '九州各地の対象温泉の中から88箇所を訪問して、チャレンジを達成しましょう。',
  'challenge.startButton': 'チャレンジ開始',
  'challenge.startingButton': '作成中...',
  'challenge.defaultName': 'マイチャレンジ',
  'challenge.errorLoad': 'チャレンジタイプの読み込みに失敗しました',
  'challenge.errorCreate': 'チャレンジの作成に失敗しました',

  // home (challenge state)
  'home.progress': '{{visited}}/{{total}}',
  'home.noChallenge': 'チャレンジ未開始',
  'home.startChallenge': 'チャレンジ開始',

  // challenge progress
  'challengeProgress.title': 'チャレンジ進捗',
  'challengeProgress.visited': '訪問済み',
  'challengeProgress.notVisited': '未訪問',
  'challengeProgress.tiers': '称号',
  'challengeProgress.tierEligible': '達成',
  'challengeProgress.tierNotEligible': '未達成',
  'challengeProgress.claimTier': '{{tier}}を申請',
  'challengeProgress.claimedTier': '取得済み: {{tier}}',
  'challengeProgress.upgradeTier': '{{tier}}にアップグレード',
  'challengeRules.title': 'ルール',
  'challengeRules.rulesHeading': 'チャレンジルール',
  'challengeRules.tiersHeading': '称号条件',
  'challengeRules.condition.minVisits_one': '対象温泉を{{count}}箇所以上訪問',
  'challengeRules.condition.minVisits_other': '対象温泉を{{count}}箇所以上訪問',
  'challengeRules.condition.maxFasterVisits.none': 'ショートカット（より速い移動手段）なし',
  'challengeRules.condition.maxFasterVisits.limit_one': 'より速い移動手段の利用は{{count}}回まで',
  'challengeRules.condition.maxFasterVisits.limit_other': 'より速い移動手段の利用は{{count}}回まで',
  'challengeRules.condition.maxCalendarDays_one': '{{count}}日以内に達成',
  'challengeRules.condition.maxCalendarDays_other': '{{count}}日以内に達成',
  'challengeRules.conditionUnknown': '{{type}}: {{value}}',

  // onsen detail (visit)
  'onsenDetail.notFound': '温泉が見つかりませんでした',
  'onsenDetail.archived': '廃止',
  'onsenDetail.labelAddress': '住所',
  'onsenDetail.labelPhone': '電話',
  'onsenDetail.labelFee': '料金',
  'onsenDetail.labelSpringQuality': '泉質',
  'onsenDetail.labelHours': '営業時間',
  'onsenDetail.markVisited': '訪問済みにする',
  'onsenDetail.visited': '訪問済み ✓',
  'onsenDetail.labelNotes': 'メモ',
  'onsenDetail.labelRating': '評価',
  'onsenDetail.labelWaterTemp': '湯温',
  'onsenDetail.labelDuration': '滞在時間',
  'onsenDetail.labelTransport': '交通手段',
  'onsenDetail.transport.foot': '徒歩',
  'onsenDetail.transport.bicycle': '自転車',
  'onsenDetail.transport.public': '公共交通機関',
  'onsenDetail.transport.car': '車',
  'onsenDetail.saveButton': '保存',
  'onsenDetail.saving': '保存中...',
  'onsenDetail.notesPlaceholder': '訪問の感想を書きましょう',
  'onsenDetail.waterTempPlaceholder': '例: 42°C',
  'onsenDetail.durationPlaceholder': '分',
  'onsenDetail.addPhoto': '写真を追加',
  'onsenDetail.takePhoto': '写真を撮る',
  'onsenDetail.chooseFromLibrary': 'ライブラリから選択',
  'onsenDetail.uploading': 'アップロード中...',
  'onsenDetail.cancel': 'キャンセル',
} as const;

export default ja;
