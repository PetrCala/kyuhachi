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
  'home.routes': 'Routes',
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
  'challengeProgress.newChallenge': 'New Challenge',
  'challengeRules.title': 'Rules',
  'challengeRules.rulesHeading': 'Challenge Rules',
  'challengeRules.tiersHeading': 'Tier Conditions',
  'challengeRules.condition.minVisits_one': 'Visit at least {{count}} eligible onsen',
  'challengeRules.condition.minVisits_other': 'Visit at least {{count}} eligible onsens',
  'challengeRules.condition.maxFasterVisits.none': 'No shortcuts (no faster transport)',
  'challengeRules.condition.maxFasterVisits.limit_one':
    'Use a faster mode at most {{count}} time',
  'challengeRules.condition.maxFasterVisits.limit_other':
    'Use a faster mode at most {{count}} times',
  'challengeRules.condition.maxCalendarDays_one': 'Finish within {{count}} calendar day',
  'challengeRules.condition.maxCalendarDays_other': 'Finish within {{count}} calendar days',
  'challengeRules.conditionUnknown': '{{type}}: {{value}}',

  // challenge type picker
  'challengeNew.title': 'Choose a Challenge',
  'challengeNew.heading': 'Which challenge will you take on?',
  'challengeNew.hint': 'Tap a challenge to see its tiers and rules, then start.',

  // challenge list / switcher
  'challengeList.title': 'Challenges',
  'challengeList.hint': 'Tap a challenge to make it active.',
  'challengeList.active': 'Active',
  'challengeList.delete': 'Delete',
  'challengeList.deleteTitle': 'Delete challenge?',
  'challengeList.deleteMessage': 'This permanently deletes "{{name}}" and all its visits.',
  'challengeList.deleteConfirm': 'Delete',
  'challengeList.cancel': 'Cancel',
  'challengeList.errorDelete': 'Failed to delete challenge',
  'challengeList.errorSwitch': 'Failed to switch challenge',

  // routes (import + management)
  'routes.title': 'Routes',
  'routes.import': 'Import route',
  'routes.importing': 'Importing…',
  'routes.empty': 'No routes yet. Import a .gpx, .kml, or .tcx file to get started.',
  'routes.metaWithDistance': '{{points}} points · {{km}} km',
  'routes.metaPointsOnly': '{{points}} points',
  'routes.rename': 'Rename',
  'routes.renameTitle': 'Rename route',
  'routes.renameMessage': 'Enter a new name for this route.',
  'routes.renameConfirm': 'Save',
  'routes.delete': 'Delete',
  'routes.deleteTitle': 'Delete route?',
  'routes.deleteMessage': 'This permanently deletes "{{name}}".',
  'routes.deleteConfirm': 'Delete',
  'routes.cancel': 'Cancel',
  'routes.errorRename': 'Failed to rename route',
  'routes.errorDelete': 'Failed to delete route',
  'routes.importErrorTitle': 'Import failed',
  'routes.importErrorFormat': 'Unsupported file type. Choose a .gpx, .kml, or .tcx file.',
  'routes.importErrorNoTrack': 'No track found in this file.',
  'routes.importErrorParse': 'Couldn’t read this file. It may be corrupted or not a valid GPS track.',

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
