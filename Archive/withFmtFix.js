const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withMLKit = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // 1. Fix iOS deployment target for ML Kit
      contents = contents.replace(
        /platform :ios, podfile_properties\['ios.deploymentTarget'\] \|\| '.*'/,
        "platform :ios, '15.5'"
      );

      // 2. MLKit does not support arm64 simulator natively.
      // We must exclude arm64 on simulator and disable ONLY_ACTIVE_ARCH so Xcode builds for x86_64 (Rosetta).
      const patch = `
    # ── FIX MLKIT FOR APPLE SILICON SIMULATORS (ROSETTA) ──
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings["ARCHS[sdk=iphonesimulator*]"] = "x86_64"
        config.build_settings["VALID_ARCHS[sdk=iphonesimulator*]"] = "x86_64"
        config.build_settings["ONLY_ACTIVE_ARCH"] = "NO"
      end
    end
    main_project_path = File.join(__dir__, 'FinanceFlow.xcodeproj')
    main_project = Xcodeproj::Project.open(main_project_path)
    main_project.build_configurations.each do |config|
      config.build_settings["ARCHS[sdk=iphonesimulator*]"] = "x86_64"
      config.build_settings["VALID_ARCHS[sdk=iphonesimulator*]"] = "x86_64"
      config.build_settings["ONLY_ACTIVE_ARCH"] = "NO"
    end
    main_project.save
    # ────────────────────────────────────────────────────────
`;
      contents = contents.replace(/post_install do \|installer\|/, "post_install do |installer|\n" + patch);

      const postIntegratePatch = `
post_integrate do |installer|
  # Fix fmt consteval bug directly in source since it ignores compiler flags
  fmt_base_h = File.join(installer.sandbox.root, 'fmt/include/fmt/base.h')
  if File.exist?(fmt_base_h)
    fmt_text = File.read(fmt_base_h)
    fmt_new = fmt_text.gsub(/#  define FMT_USE_CONSTEVAL 1/, "#  define FMT_USE_CONSTEVAL 0")
    File.write(fmt_base_h, fmt_new)
  end
end
`;
      contents = contents + "\n" + postIntegratePatch;

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};

module.exports = withMLKit;
