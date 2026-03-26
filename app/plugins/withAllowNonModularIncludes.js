const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# withAllowNonModularIncludes';

/**
 * Two-part fix for @react-native-firebase + use_frameworks: "static":
 *
 * 1. pre_install: Force RNFB pods to build as static *libraries* (not static
 *    frameworks). Static libraries have no module boundary, so React headers
 *    are included textually and macros like RCT_EXPORT_MODULE propagate.
 *    Without this, the Clang module system swallows the macros and the
 *    compiler sees RCT_EXPORT_MODULE() as an undeclared identifier.
 *
 * 2. post_install: Allow non-modular includes inside any remaining framework
 *    modules (belt-and-suspenders for other pods that may import React headers).
 */
module.exports = function withAllowNonModularIncludes(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) {
        return config;
      }

      const preInstallSnippet = [
        `# ${MARKER}`,
        'pre_install do |installer|',
        '  installer.pod_targets.each do |pod|',
        "    if pod.name.start_with?('RNFB')",
        '      def pod.build_type',
        '        Pod::BuildType.static_library',
        '      end',
        '    end',
        '  end',
        'end',
      ].join('\n');

      const postInstallSnippet = [
        `  ${MARKER}`,
        '  installer.pods_project.targets.each do |target|',
        '    target.build_configurations.each do |build_config|',
        "      build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
        '    end',
        '  end',
      ].join('\n');

      // Inject pre_install block before the first 'target' or 'use_frameworks!' line
      contents = contents.replace(
        /(use_frameworks!)/,
        `${preInstallSnippet}\n\n$1`
      );

      // Inject into existing post_install, or append a new one
      if (/post_install do \|installer\|/.test(contents)) {
        contents = contents.replace(
          /(post_install do \|installer\|)/,
          `$1\n${postInstallSnippet}`
        );
      } else {
        contents += `\npost_install do |installer|\n${postInstallSnippet}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
