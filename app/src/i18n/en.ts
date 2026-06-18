const en = {
  // sign-in
  'signIn.title': 'Kyushu 88 Onsen',
  'signIn.alertFailedSignIn': 'Sign in failed',
  'signIn.alertFailedCreate': 'Account creation failed',
  'signIn.divider': 'or',
  'signIn.emailPlaceholder': 'Email',
  'signIn.passwordPlaceholder': 'Password',
  'signIn.submitSignIn': 'Sign in',
  'signIn.submitCreate': 'Create account',
  'signIn.toggleToCreate': "Don't have an account? Create one",
  'signIn.toggleToSignIn': 'Already have an account? Sign in',

  // home
  'home.title': 'Kyuhachi',
  'home.onsenList': 'Onsen List',
  'home.map': 'Map',
  'home.signOut': 'Sign out',

  // map
  'map.title': 'Map',

  // onsen list
  'onsenList.title': 'Onsen List',
  'onsenList.searchPlaceholder': 'Search onsens...',
  'onsenList.emptySearch': 'No onsens matching "{{query}}"',
  'onsenList.emptyData': 'No onsen data',

  // challenge
  'challenge.startTitle': 'Start Your Challenge',
  'challenge.startDescription':
    'Visit 88 of the eligible hot springs across Kyushu to complete the challenge.',
  'challenge.startButton': 'Start Challenge',
  'challenge.startingButton': 'Starting...',
  'challenge.defaultName': 'My Challenge',
  'challenge.errorLoad': 'Failed to load challenge type',
  'challenge.errorCreate': 'Failed to create challenge',

  // home (challenge state)
  'home.progress': '{{visited}}/{{total}}',
  'home.noChallenge': 'No active challenge',
  'home.startChallenge': 'Start Challenge',

  // challenge progress
  'challengeProgress.title': 'Challenge Progress',
  'challengeProgress.visited': 'Visited',
  'challengeProgress.notVisited': 'Not visited',
  'challengeProgress.tiers': 'Tiers',
  'challengeProgress.tierEligible': 'Eligible',
  'challengeProgress.tierNotEligible': 'Not yet',
  'challengeProgress.claimTier': 'Claim {{tier}}',
  'challengeProgress.claimedTier': 'Claimed: {{tier}}',
  'challengeProgress.upgradeTier': 'Upgrade to {{tier}}',
  'challengeRules.title': 'Rules',
  'challengeRules.rulesHeading': 'Challenge Rules',
  'challengeRules.tiersHeading': 'Tier Conditions',
  'challengeRules.condition.minVisits_one': 'Visit at least {{count}} eligible onsen',
  'challengeRules.condition.minVisits_other': 'Visit at least {{count}} eligible onsens',
  'challengeRules.condition.maxTransportUses.none': 'Do not use motorized transport',
  'challengeRules.condition.maxTransportUses.limit_one':
    'Use motorized transport at most {{count}} time',
  'challengeRules.condition.maxTransportUses.limit_other':
    'Use motorized transport at most {{count}} times',
  'challengeRules.condition.maxCalendarDays_one': 'Finish within {{count}} calendar day',
  'challengeRules.condition.maxCalendarDays_other': 'Finish within {{count}} calendar days',
  'challengeRules.conditionUnknown': '{{type}}: {{value}}',

  // onsen detail (visit)
  'onsenDetail.notFound': 'Onsen not found',
  'onsenDetail.archived': 'Archived',
  'onsenDetail.labelAddress': 'Address',
  'onsenDetail.labelPhone': 'Phone',
  'onsenDetail.labelFee': 'Admission Fee',
  'onsenDetail.labelSpringQuality': 'Spring Quality',
  'onsenDetail.labelHours': 'Business Hours',
  'onsenDetail.markVisited': 'Mark as Visited',
  'onsenDetail.visited': 'Visited ✓',
  'onsenDetail.labelNotes': 'Notes',
  'onsenDetail.labelRating': 'Rating',
  'onsenDetail.labelWaterTemp': 'Water Temp',
  'onsenDetail.labelDuration': 'Duration',
  'onsenDetail.labelTransport': 'Transport',
  'onsenDetail.transport.foot': 'On foot',
  'onsenDetail.transport.bicycle': 'Bicycle',
  'onsenDetail.transport.public': 'Public transit',
  'onsenDetail.transport.car': 'Car',
  'onsenDetail.saveButton': 'Save',
  'onsenDetail.saving': 'Saving...',
  'onsenDetail.notesPlaceholder': 'How was your visit?',
  'onsenDetail.waterTempPlaceholder': 'e.g. 42°C',
  'onsenDetail.durationPlaceholder': 'minutes',
  'onsenDetail.addPhoto': 'Add Photo',
  'onsenDetail.takePhoto': 'Take Photo',
  'onsenDetail.chooseFromLibrary': 'Choose from Library',
  'onsenDetail.uploading': 'Uploading...',
  'onsenDetail.cancel': 'Cancel',
} as const;

export default en;
