Pod::Spec.new do |s|
  s.name           = 'LocalSearch'
  s.version        = '1.0.0'
  s.summary        = 'MKLocalSearch wrapper for the finder feature'
  s.description    = 'Searches Apple Maps points of interest near a region for the in-app finder.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
