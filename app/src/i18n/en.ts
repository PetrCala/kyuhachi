const en = {
  // common (shared error chrome — see src/lib/firebase-errors.ts)
  'common.errorTitle': 'Error',
  'common.errorGeneric': 'Something went wrong. Please try again.',
  'common.errorNetwork': 'Network error. Check your connection and try again.',
  'common.errorSessionExpired':
    'Your session may have expired. Please sign out and back in, then try again.',
  'common.errorInvalidCredentials': 'Incorrect email or password.',
  'common.errorInvalidEmail': 'That email address is invalid.',
  'common.errorEmailInUse': 'That email address is already in use.',
  'common.errorWeakPassword': 'Password must be at least 6 characters.',
  'common.errorTooManyRequests': 'Too many attempts. Please try again later.',

  // sign-in
  'signIn.title': 'Kyushu 88 Onsen',
  'signIn.alertFailedSignIn': 'Sign in failed',
  'signIn.alertFailedCreate': 'Account creation failed',
  'signIn.errorNoAppleToken': 'Could not get an identity token from Apple.',
  'signIn.divider': 'or',
  'signIn.emailPlaceholder': 'Email',
  'signIn.passwordPlaceholder': 'Password',
  'signIn.submitSignIn': 'Sign in',
  'signIn.submitCreate': 'Create account',
  'signIn.toggleToCreate': "Don't have an account? Create one",
  'signIn.toggleToSignIn': 'Already have an account? Sign in',

  // tabs (bottom navigation)
  'tabs.home': 'Home',
  'tabs.map': 'Map',
  'tabs.onsens': 'Onsens',
  'tabs.more': 'More',

  // home
  'home.title': 'Kyuhachi',

  // map
  'map.title': 'Map',
  'map.recenter': 'Show my location',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.locationDeniedTitle': 'Location access needed',
  'map.locationDeniedMessage':
    'Enable location access for Kyuhachi in Settings to see where you are on the map.',
  'map.locationError': 'Could not find your location. Please try again.',
  'map.simulatedLocation': 'Simulated location',

  // onsen list
  'onsenList.title': 'Onsen List',
  'onsenList.searchPlaceholder': 'Search onsens...',
  'onsenList.sectionCount': '{{visited}}/{{total}}',
  'onsenList.nearYouTitle': 'Near you',
  'onsenList.distanceKm': '{{km}} km',
  'onsenList.prefectureUnknown': 'Other',
  'onsenList.emptySearch': 'No onsens matching "{{query}}"',
  'onsenList.emptyData': 'No onsen data',

  // challenge
  'challenge.startTitle': 'Start Your Challenge',
  'challenge.startDescription':
    'Visit 88 of the eligible hot springs across Kyushu to complete the challenge.',
  'challenge.startButton': 'Start Challenge',
  'challenge.startingButton': 'Starting...',
  'challenge.nameLabel': 'Challenge name (optional)',
  'challenge.errorLoad': 'Failed to load challenge type',
  'challenge.errorCreate': 'Failed to create challenge',
  'challenge.errorNoEligibleOnsens':
    'This challenge has no eligible onsens yet. Please try again later.',

  // home (challenge state)
  'home.progress': '{{visited}}/{{total}}',
  'home.noChallenge': 'No active challenge',
  'home.startChallenge': 'Start Challenge',
  'home.recordVisit': 'Record a visit',
  'home.recentVisits.title': 'Recent visits',
  'home.recentVisits.seeAll': 'See all',
  'home.recentVisits.empty': 'No visits yet',

  // visits (full history + feed cards)
  'visits.title': 'All visits',
  'visits.empty': 'No visits yet',
  'visits.today': 'Today',
  'visits.yesterday': 'Yesterday',
  'visits.daysAgo': '{{count}}d ago',
  'visits.durationMinutes': '{{count}} min',

  // more (settings tab)
  'more.title': 'More',
  'more.challenges': 'Challenges',
  'more.routes': 'Routes',
  'more.preferences': 'Preferences',
  'more.stats': 'Stats',
  'more.statsBadge': 'Soon',
  'more.account': 'Account',
  'more.signOut': 'Sign out',
  'more.language': 'Language',

  // preferences
  'preferences.title': 'Preferences',
  'preferences.showNearby': 'Show nearby onsens',
  'preferences.showNearbyHint':
    'Shows a section at the top of the onsen list with springs near your current location.',
  'preferences.radiusTitle': 'Distance (km)',
  'preferences.radiusHint': 'Onsens within {{km}} km of you appear in the “Near you” section.',

  // challenge progress
  'challengeProgress.title': 'Challenge Progress',
  'challengeProgress.progressHeading': 'Progress',
  'challengeProgress.howTiers': 'How tiers work',
  'challengeProgress.recordVisitTitle': 'Record a visit',
  'challengeProgress.visited': 'Visited',
  'challengeProgress.notVisited': 'Not visited',
  'challengeProgress.tiers': 'Tiers',
  'challengeProgress.tierEligible': 'Eligible',
  'challengeProgress.tierNotEligible': 'Not yet',
  'challengeProgress.tierCurrent': 'Current',
  'challengeProgress.newChallenge': 'New Challenge',
  'challengeProgress.routeHeading': 'Route',
  'challengeProgress.noRoute': 'No route selected',
  'challengeProgress.selectRoute': 'Select route',
  'challengeProgress.changeRoute': 'Change',
  'challengeProgress.clearRoute': 'Clear',
  'challengeProgress.viewRouteOnMap': 'View on map',
  'challengeProgress.errorRoute': 'Failed to update the challenge route',
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

  // challenge-type content (app-owned; keyed by the Firestore type id, with the
  // published Firestore value as a fallback for unknown/new ids). See
  // src/lib/challenge-i18n.ts and scripts/seed-challenge-type.ts.
  'challengeTier.gold': 'Gold',
  'challengeTier.silver': 'Silver',
  'challengeTier.bronze': 'Bronze',
  'challengeType.commonRule1': 'Visit hot springs from the eligible list of about 155 onsens.',
  'challengeType.commonRule2': 'Visiting the same onsen more than once still counts as one.',
  'challengeType.commonRule3': 'There is no deadline to finish.',
  'challengeType.kyushu-88.name': 'Car Challenge',
  'challengeType.kyushu-88.description':
    'Tour the Kyushu 88 hot springs with no restriction on how you travel.',
  'challengeType.kyushu-88.rule': 'There are no restrictions on how you travel.',
  'challengeType.kyushu-88.summary.gold': 'Reach all 88 onsens',
  'challengeType.kyushu-88.summary.silver': 'Reach 66 or more onsens',
  'challengeType.kyushu-88.summary.bronze': 'Reach 44 or more onsens',
  'challengeType.kyushu-88-public.name': 'Public Transport Challenge',
  'challengeType.kyushu-88-public.description':
    'Tour the Kyushu 88 hot springs by public transport, bicycle, or on foot. Using a car affects your tier.',
  'challengeType.kyushu-88-public.rule':
    'Travel mainly by public transport, bicycle, or on foot. Using a car costs you the higher tiers.',
  'challengeType.kyushu-88-public.summary.gold': 'Reach all 88 onsens without using a car',
  'challengeType.kyushu-88-public.summary.silver':
    'Reach 66 or more onsens, using a car at most 4 times',
  'challengeType.kyushu-88-public.summary.bronze':
    'Reach 44 or more onsens, using a car at most 8 times',
  'challengeType.kyushu-88-bicycle.name': 'Bicycle Challenge',
  'challengeType.kyushu-88-bicycle.description':
    'Tour the Kyushu 88 hot springs by bicycle (and on foot).',
  'challengeType.kyushu-88-bicycle.rule':
    'Travel mainly by bicycle or on foot. Using anything faster costs you the higher tiers.',
  'challengeType.kyushu-88-bicycle.summary.gold': 'Reach all 88 onsens by bicycle or on foot only',
  'challengeType.kyushu-88-bicycle.summary.silver':
    'Reach 66 or more onsens, using a faster mode at most 4 times',
  'challengeType.kyushu-88-bicycle.summary.bronze':
    'Reach 44 or more onsens, using a faster mode at most 8 times',
  'challengeType.kyushu-88-walk.name': 'Walking Challenge',
  'challengeType.kyushu-88-walk.description':
    'Tour the Kyushu 88 hot springs on foot only — the toughest challenge.',
  'challengeType.kyushu-88-walk.rule':
    'Travel on foot only. Using anything faster costs you the higher tiers.',
  'challengeType.kyushu-88-walk.summary.gold': 'Reach all 88 onsens on foot only',
  'challengeType.kyushu-88-walk.summary.silver':
    'Reach 66 or more onsens, using a faster mode at most 4 times',
  'challengeType.kyushu-88-walk.summary.bronze':
    'Reach 44 or more onsens, using a faster mode at most 8 times',

  // challenge list / switcher
  'challengeList.title': 'Challenges',
  'challengeList.hint': 'Tap a challenge to make it active.',
  'challengeList.active': 'Active',
  'challengeList.makeActive': 'Make active',
  'challengeList.moreActions': 'More actions',
  'challengeList.rename': 'Rename',
  'challengeList.renameTitle': 'Rename challenge',
  'challengeList.renameMessage': 'Enter a new name for this challenge.',
  'challengeList.renameConfirm': 'Save',
  'challengeList.errorRename': 'Failed to rename challenge',
  'challengeList.delete': 'Delete',
  'challengeList.deleteTitle': 'Delete challenge?',
  'challengeList.deleteMessage': 'This permanently deletes "{{name}}" and all its visits.',
  'challengeList.deleteConfirm': 'Delete',
  'challengeList.cancel': 'Cancel',
  'challengeList.errorDelete': 'Failed to delete challenge',
  'challengeList.errorSwitch': 'Failed to switch challenge',
  'challengeList.tierMarkerLabel': '{{tier}} tier completed',

  // routes (import + management)
  'routes.title': 'Routes',
  'routes.selectTitle': 'Select a Route',
  'routes.selectHint': 'Tap a route to follow it in this challenge.',
  'routes.errorAttach': 'Failed to update the challenge route',
  'routes.import': 'Import route',
  'routes.importing': 'Importing…',
  'routes.empty': 'No routes yet. Import a .gpx, .kml, or .tcx file to get started.',
  'routes.metaWithDistance': '{{points}} points · {{km}} km',
  'routes.metaPointsOnly': '{{points}} points',
  'routes.moreActions': 'More actions',
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
  'routes.importErrorSave': 'Couldn’t save the route. Check your connection and try again.',

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
  'onsenDetail.editTitle': 'Edit visit',
  'onsenDetail.editDetails': 'Edit details',
  'onsenDetail.removeVisit': 'Remove visit',
  'onsenDetail.removing': 'Removing...',
  'onsenDetail.removeTitle': 'Remove visit?',
  'onsenDetail.removeMessage': "This permanently removes your visit and any photo. This can't be undone.",
  'onsenDetail.removeConfirm': 'Remove',
  'onsenDetail.errorRemove': 'Failed to remove visit',
  'onsenDetail.showHours': 'Show weekly hours',
  'onsenDetail.hideHours': 'Hide weekly hours',
  'onsenDetail.closed': 'Closed',
  'onsenDetail.day.monday': 'Monday',
  'onsenDetail.day.tuesday': 'Tuesday',
  'onsenDetail.day.wednesday': 'Wednesday',
  'onsenDetail.day.thursday': 'Thursday',
  'onsenDetail.day.friday': 'Friday',
  'onsenDetail.day.saturday': 'Saturday',
  'onsenDetail.day.sunday': 'Sunday',
} as const;

export default en;
