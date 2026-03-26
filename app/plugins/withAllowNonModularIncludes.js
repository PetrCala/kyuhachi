const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# withAllowNonModularIncludes';

/**
 * Adds ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES to all pod targets.
 * Required when useFrameworks: "static" is set and @react-native-firebase is used,
 * because RNFB headers import React headers non-modularly.
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

      const snippet = [
        `  ${MARKER}`,
        '  installer.pods_project.targets.each do |target|',
        '    target.build_configurations.each do |build_config|',
        "      build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
        '    end',
        '  end',
      ].join('\n');

      if (/post_install do \|installer\|/.test(contents)) {
        contents = contents.replace(
          /(post_install do \|installer\|)/,
          `$1\n${snippet}`
        );
      } else {
        contents += `\npost_install do |installer|\n${snippet}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
