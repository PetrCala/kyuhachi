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
} as const;

export default en;
